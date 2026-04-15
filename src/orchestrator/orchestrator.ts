import Anthropic from '@anthropic-ai/sdk';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { ObsidianService } from '../obsidian/obsidian.service';
import { HRAgent } from '../agents/hr.agent';
import { CreativeAgent } from '../agents/creative.agent';
import { StrategyAgent } from '../agents/strategy.agent';
import { MeetingsAgent } from '../agents/meetings.agent';
import { DocumentsAgent } from '../agents/documents.agent';
import { BaseAgent } from '../agents/base.agent';
import {
  AgentRole,
  AgentTask,
  OrchestratorRequest,
  OrchestratorResult,
  TaskPriority,
} from '../types';

interface RoutingDecision {
  agents: AgentRole[];
  taskType: string;
  reasoning: string;
}

export class Orchestrator extends EventEmitter {
  private readonly client: Anthropic;
  private readonly obsidian: ObsidianService;
  private readonly agents: Map<AgentRole, BaseAgent> = new Map();
  private readonly model: string;

  constructor(obsidian: ObsidianService) {
    super();
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.obsidian = obsidian;
    this.model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

    this.agents.set('hr', new HRAgent(obsidian));
    this.agents.set('creative', new CreativeAgent(obsidian));
    this.agents.set('strategy', new StrategyAgent(obsidian));
    this.agents.set('meetings', new MeetingsAgent(obsidian));
    this.agents.set('documents', new DocumentsAgent(obsidian));
  }

  // ─── Ponto de entrada principal ───────────────────────────────────────────

  async process(request: OrchestratorRequest): Promise<OrchestratorResult> {
    const taskId = uuidv4();

    this.emit('log', { level: 'info', message: `Nova tarefa: "${request.task}"` });
    this.emit('task:start', { taskId, task: request.task, priority: request.priority ?? 'medium' });

    const routing = await this.routeTask(request);

    this.emit('log', {
      level: 'info',
      message: `Roteando para: ${routing.agents.join(', ')} — ${routing.reasoning}`,
    });
    this.emit('task:routed', { taskId, agents: routing.agents, reasoning: routing.reasoning });

    const results: string[] = [];
    const notesCreated: string[] = [];

    for (const agentRole of routing.agents) {
      const agent = this.agents.get(agentRole);
      if (!agent) continue;

      this.emit('agent:start', { taskId, role: agentRole, name: agent.name });
      this.emit('log', { level: 'info', message: `[${agent.name}] Trabalhando...` });

      const task: AgentTask = {
        id: uuidv4(),
        type: routing.taskType,
        description: request.task,
        priority: request.priority ?? 'medium',
        status: 'in_progress',
        assignedTo: agentRole,
        context: request.context ? { description: request.context } : undefined,
        createdAt: new Date().toISOString(),
      };

      try {
        const result = await agent.execute(task);
        results.push(`## ${agent.name}\n${result}`);
        this.emit('agent:done', { taskId, role: agentRole, name: agent.name, result });
        this.emit('log', { level: 'success', message: `[${agent.name}] Concluído.` });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.emit('agent:error', { taskId, role: agentRole, name: agent.name, error: msg });
        this.emit('log', { level: 'error', message: `[${agent.name}] Erro: ${msg}` });
        results.push(`## ${agent.name}\nErro: ${msg}`);
      }
    }

    const summary = await this.synthesize(request.task, results);

    const orchestrationNote = this.obsidian.writeNote(
      `_sistema/Tarefa-${taskId.slice(0, 8)}`,
      [
        `# Tarefa Orquestrada\n`,
        `**ID:** ${taskId}`,
        `**Data:** ${new Date().toLocaleDateString('pt-BR')}`,
        `**Solicitação:** ${request.task}`,
        `**Agentes:** ${routing.agents.join(', ')}`,
        `**Raciocínio:** ${routing.reasoning}`,
        `\n## Resumo\n${summary}`,
        `\n## Resultados por Agente\n${results.join('\n\n---\n\n')}`,
      ].join('\n'),
      {
        tipo: 'tarefa-orquestrada',
        agentes: routing.agents.join(', '),
        prioridade: request.priority ?? 'medium',
      },
    );

    notesCreated.push(orchestrationNote.path);

    const finalResult: OrchestratorResult = {
      taskId,
      summary,
      agentsInvolved: routing.agents,
      notesCreated,
      decisions: this.extractDecisions(results),
      nextSteps: this.extractNextSteps(results),
    };

    this.emit('task:done', finalResult);
    this.emit('note:created', { path: orchestrationNote.path, folder: '_sistema' });
    this.emit('log', { level: 'success', message: `Tarefa concluída. ${notesCreated.length} nota(s) salva(s) no vault.` });

    return finalResult;
  }

  // ─── Roteamento inteligente ────────────────────────────────────────────────

  private async routeTask(request: OrchestratorRequest): Promise<RoutingDecision> {
    if (request.involveAgents && request.involveAgents.length > 0) {
      return {
        agents: request.involveAgents,
        taskType: 'custom',
        reasoning: 'Agentes especificados manualmente',
      };
    }

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      system: `Você é um orquestrador de agentes de IA. Analise a tarefa e decida quais agentes devem executá-la.

Agentes disponíveis:
- hr: Recursos Humanos (contratar, demitir, onboarding, cultura, time)
- creative: Design e Conteúdo (briefs, copy, conceitos criativos, campanhas)
- strategy: Estratégia (análises, decisões, planos, OKRs, prioridades)
- meetings: Reuniões (pauta, ata, follow-up, retrospectiva)
- documents: Documentos (organização, busca, processos, síntese)

Responda SOMENTE com JSON no formato:
{
  "agents": ["agent1", "agent2"],
  "taskType": "tipo_da_tarefa",
  "reasoning": "motivo em português"
}

Tipos de tarefa válidos: hire, fire, onboarding, brief, concept, copy, decision, analysis, plan, meeting, ata, agenda, retro, process, search, summary, idea, general`,
      messages: [
        {
          role: 'user',
          content: `Tarefa: ${request.task}${request.context ? `\nContexto: ${request.context}` : ''}`,
        },
      ],
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');

      const parsed = JSON.parse(jsonMatch[0]) as RoutingDecision;
      const validRoles: AgentRole[] = ['hr', 'creative', 'strategy', 'meetings', 'documents'];
      parsed.agents = parsed.agents.filter((a) => validRoles.includes(a as AgentRole)) as AgentRole[];
      if (parsed.agents.length === 0) parsed.agents = ['documents'];

      return parsed;
    } catch {
      return {
        agents: ['documents'],
        taskType: 'general',
        reasoning: 'Fallback: não foi possível determinar agentes específicos',
      };
    }
  }

  // ─── Síntese final ────────────────────────────────────────────────────────

  private async synthesize(task: string, results: string[]): Promise<string> {
    if (results.length === 1) {
      return results[0].replace(/^## .+\n/, '').slice(0, 800);
    }

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      system: 'Você é um orquestrador. Sintetize os resultados dos agentes em um resumo executivo conciso. Responda em português.',
      messages: [
        {
          role: 'user',
          content: `Tarefa original: ${task}\n\nResultados:\n${results.join('\n\n---\n\n')}`,
        },
      ],
    });

    return response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');
  }

  // ─── Extratores ───────────────────────────────────────────────────────────

  private extractDecisions(results: string[]): string[] {
    const combined = results.join('\n');
    const decisions: string[] = [];
    for (const line of combined.split('\n')) {
      const lower = line.toLowerCase();
      if (
        lower.includes('decisão:') ||
        lower.includes('decidimos') ||
        lower.includes('aprovado:')
      ) {
        decisions.push(line.replace(/^[-*#\s]+/, '').trim());
      }
    }
    return decisions.slice(0, 5);
  }

  private extractNextSteps(results: string[]): string[] {
    const combined = results.join('\n');
    const steps: string[] = [];
    const lines = combined.split('\n');
    let inNextSteps = false;

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.includes('próximos passos') || lower.includes('next steps')) {
        inNextSteps = true;
        continue;
      }
      if (inNextSteps && (line.startsWith('##') || line.startsWith('#'))) {
        inNextSteps = false;
      }
      if (inNextSteps && (line.startsWith('-') || line.startsWith('*') || /^\d+\./.test(line))) {
        steps.push(line.replace(/^[-*\d.\s]+/, '').trim());
      }
    }

    return steps.slice(0, 5);
  }

  // ─── Chat com agente específico ───────────────────────────────────────────

  async chatWithAgent(
    agentRole: AgentRole,
    message: string,
    history: Anthropic.MessageParam[] = [],
  ): Promise<string> {
    const agent = this.agents.get(agentRole);
    if (!agent) throw new Error(`Agente "${agentRole}" não encontrado`);

    this.emit('agent:start', { role: agentRole, name: agent.name, taskId: 'chat' });
    const response = await agent.chat(message, history);
    this.emit('agent:done', { role: agentRole, name: agent.name, taskId: 'chat' });

    return response;
  }

  getAgent(role: AgentRole): BaseAgent | undefined {
    return this.agents.get(role);
  }

  listAgents(): { role: AgentRole; name: string }[] {
    return [...this.agents.entries()].map(([role, agent]) => ({
      role,
      name: agent.name,
    }));
  }

  getVaultStats(): Record<string, number> {
    const folders = ['Decisoes', 'Time', 'Reunioes', 'Criativos', 'Processos', 'Ideias'];
    const stats: Record<string, number> = {};
    for (const folder of folders) {
      stats[folder] = this.obsidian.listNotes(folder).length;
    }
    return stats;
  }

  // ─── Reunião entre agentes ────────────────────────────────────────────────

  async holdMeeting(topic: string, participants: AgentRole[]): Promise<OrchestratorResult> {
    this.emit('log', { level: 'info', message: `Iniciando reunião: "${topic}"` });

    const agendaResult = await this.process({
      task: `Crie uma pauta para reunião sobre: ${topic}`,
      priority: 'high' as TaskPriority,
      involveAgents: ['meetings'],
    });

    const contributions: string[] = [];
    for (const role of participants) {
      const agent = this.agents.get(role);
      if (!agent) continue;

      const task: AgentTask = {
        id: uuidv4(),
        type: 'meeting',
        description: `Reunião sobre: ${topic}\n\nPauta:\n${agendaResult.summary}`,
        priority: 'high',
        status: 'in_progress',
        assignedTo: role,
        createdAt: new Date().toISOString(),
      };

      this.emit('agent:start', { role, name: agent.name, taskId: 'meeting' });
      const contribution = await agent.execute(task);
      contributions.push(`### Perspectiva do ${agent.name}\n${contribution}`);
      this.emit('agent:done', { role, name: agent.name, taskId: 'meeting' });
    }

    return this.process({
      task: `Registre a ata da reunião sobre "${topic}" com as contribuições:\n\n${contributions.join('\n\n---\n\n')}`,
      priority: 'high',
      involveAgents: ['meetings'],
    });
  }
}
