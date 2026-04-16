import Anthropic from '@anthropic-ai/sdk';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { ObsidianService } from '../obsidian/obsidian.service';
import { POAgent } from '../agents/po.agent';
import { CEOAgent } from '../agents/ceo.agent';
import { TechLeadAgent } from '../agents/tech-lead.agent';
import { DevBackendAgent } from '../agents/dev-backend.agent';
import { DevFrontendAgent } from '../agents/dev-frontend.agent';
import { UXAgent } from '../agents/ux.agent';
import { DevOpsAgent } from '../agents/devops.agent';
import { DataAnalystAgent } from '../agents/data-analyst.agent';
import { BaseAgent } from '../agents/base.agent';
import {
  AgentRole,
  AgentTask,
  OrchestratorRequest,
  OrchestratorResult,
  PipelineRun,
  WorkflowStageStatus,
} from '../types';
import {
  DATTU_PIPELINE,
  buildPipelineRun,
  formatPipelineProgress,
  getStage,
} from '../workflow/pipeline';

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

    this.agents.set('po', new POAgent(obsidian));
    this.agents.set('ceo', new CEOAgent(obsidian));
    this.agents.set('data-analyst', new DataAnalystAgent(obsidian));
    this.agents.set('dev-backend', new DevBackendAgent(obsidian));
    this.agents.set('dev-frontend', new DevFrontendAgent(obsidian));
    this.agents.set('ux', new UXAgent(obsidian));
    this.agents.set('tech-lead', new TechLeadAgent(obsidian));
    this.agents.set('devops', new DevOpsAgent(obsidian));
  }

  // ─── Ponto de entrada principal ───────────────────────────────────────────

  async process(request: OrchestratorRequest): Promise<OrchestratorResult> {
    const taskId = uuidv4();

    this.emit('log', { level: 'info', message: `Nova solicitação: "${request.task}"` });

    if (request.mode === 'direct' && request.involveAgents?.length) {
      return this.runDirect(taskId, request);
    }

    return this.runPipeline(taskId, request);
  }

  // ─── Modo Pipeline: PO → CEO → ... → DevOps ───────────────────────────────

  private async runPipeline(taskId: string, request: OrchestratorRequest): Promise<OrchestratorResult> {
    const pipeline = buildPipelineRun(taskId, request.task, request.priority ?? 'medium', request.startFrom);
    const notesCreated: string[] = [];
    let previousOutput = request.context ?? '';
    let currentAgentRole: AgentRole | undefined = pipeline.currentStage;

    this.emit('pipeline:start', { taskId, pipeline });
    this.emit('task:start', { taskId, task: request.task, priority: request.priority ?? 'medium' });

    while (currentAgentRole) {
      const stage = getStage(currentAgentRole);
      if (!stage) break;

      const agent = this.agents.get(currentAgentRole);
      if (!agent) { currentAgentRole = stage.next; continue; }

      this.updateStageStatus(pipeline, currentAgentRole, 'active');
      this.emit('pipeline:stage', { taskId, stage: currentAgentRole, label: stage.label, pipeline });
      this.emit('agent:start', { taskId, role: currentAgentRole, name: agent.name });
      this.emit('log', { level: 'working', message: `[${agent.name}] — ${stage.label}` });

      const task: AgentTask = {
        id: uuidv4(),
        type: currentAgentRole,
        description: request.task,
        priority: request.priority ?? 'medium',
        status: 'in_progress',
        assignedTo: currentAgentRole,
        pipelineId: taskId,
        previousOutput,
        context: request.context ? { description: request.context } : undefined,
        createdAt: new Date().toISOString(),
      };

      try {
        const output = await agent.execute(task);
        previousOutput = output;

        // Agentes que podem aprovar/rejeitar fazem review explícito
        if (stage.canApprove) {
          this.emit('log', { level: 'info', message: `[${agent.name}] Analisando para aprovação...` });
          const decision = await agent.review(request.task, output);

          if (!decision.approved) {
            this.updateStageStatus(pipeline, currentAgentRole, 'rejected');
            this.emit('agent:rejected', { taskId, role: currentAgentRole, name: agent.name, feedback: decision.feedback });
            this.emit('log', { level: 'error', message: `[${agent.name}] REJEITADO: ${decision.feedback ?? decision.reasoning}` });

            // Volta ao agente de rejeição com o feedback
            if (stage.rejectBackTo) {
              const backAgent = this.agents.get(stage.rejectBackTo);
              if (backAgent) {
                this.emit('log', { level: 'info', message: `Voltando para ${backAgent.name} com feedback...` });
                previousOutput = `FEEDBACK DE REJEIÇÃO (${agent.name}):\n${decision.feedback}\n\nOutput anterior:\n${previousOutput}`;
                currentAgentRole = stage.rejectBackTo;
                continue;
              }
            }
            break;
          }

          this.emit('log', { level: 'success', message: `[${agent.name}] APROVADO: ${decision.reasoning}` });
        }

        this.updateStageStatus(pipeline, currentAgentRole, 'done');
        this.emit('agent:done', { taskId, role: currentAgentRole, name: agent.name, output });
        this.emit('log', { level: 'success', message: `[${agent.name}] Concluído.` });

        // Avança para o próximo estágio
        currentAgentRole = stage.next;

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const safeRole = currentAgentRole as AgentRole;
        this.updateStageStatus(pipeline, safeRole, 'pending');
        this.emit('agent:error', { taskId, role: safeRole, name: agent.name, error: msg });
        this.emit('log', { level: 'error', message: `[${agent.name}] Erro: ${msg}` });
        break;
      }
    }

    pipeline.completedAt = new Date().toISOString();
    this.emit('pipeline:done', { taskId, pipeline });

    // Salva resumo do pipeline no vault
    const summaryNote = this.obsidian.writeNote(
      `_sistema/Pipeline-${taskId.slice(0, 8)}`,
      [
        `# Pipeline: ${request.task}`,
        `**ID:** ${taskId}`,
        `**Data:** ${new Date().toLocaleDateString('pt-BR')}`,
        `**Prioridade:** ${request.priority ?? 'medium'}`,
        `\n## Progresso\n\`\`\`\n${formatPipelineProgress(pipeline)}\n\`\`\``,
        `\n## Output Final\n${previousOutput}`,
      ].join('\n'),
      { tipo: 'pipeline-run', prioridade: request.priority ?? 'medium' },
    );

    notesCreated.push(summaryNote.path);
    this.emit('note:created', { path: summaryNote.path });
    this.emit('task:done', { taskId, summary: previousOutput.slice(0, 500), pipeline });
    this.emit('vault:stats', this.getVaultStats());

    return {
      taskId,
      summary: previousOutput.slice(0, 800),
      agentsInvolved: pipeline.stages.filter(s => s.status !== 'pending').map(s => s.agent),
      notesCreated,
      decisions: [],
      nextSteps: [],
      pipeline,
    };
  }

  // ─── Modo Direto: agentes específicos sem pipeline ─────────────────────────

  private async runDirect(taskId: string, request: OrchestratorRequest): Promise<OrchestratorResult> {
    const roles = request.involveAgents ?? [];
    const notesCreated: string[] = [];
    const results: string[] = [];

    this.emit('task:start', { taskId, task: request.task, priority: request.priority ?? 'medium' });

    for (const role of roles) {
      const agent = this.agents.get(role);
      if (!agent) continue;

      this.emit('agent:start', { taskId, role, name: agent.name });
      this.emit('log', { level: 'working', message: `[${agent.name}] Executando...` });

      const task: AgentTask = {
        id: uuidv4(),
        type: 'direct',
        description: request.task,
        priority: request.priority ?? 'medium',
        status: 'in_progress',
        assignedTo: role,
        context: request.context ? { description: request.context } : undefined,
        createdAt: new Date().toISOString(),
      };

      try {
        const output = await agent.execute(task);
        results.push(`## ${agent.name}\n${output}`);
        this.emit('agent:done', { taskId, role, name: agent.name });
        this.emit('log', { level: 'success', message: `[${agent.name}] Concluído.` });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.emit('agent:error', { taskId, role, name: agent.name, error: msg });
        this.emit('log', { level: 'error', message: `[${agent.name}] Erro: ${msg}` });
      }
    }

    const summary = results.join('\n\n---\n\n').slice(0, 800);
    this.emit('task:done', { taskId, summary });
    this.emit('vault:stats', this.getVaultStats());

    return { taskId, summary, agentsInvolved: roles, notesCreated, decisions: [], nextSteps: [] };
  }

  // ─── Pipeline state helper ────────────────────────────────────────────────

  private updateStageStatus(pipeline: PipelineRun, agent: AgentRole, status: WorkflowStageStatus): void {
    const stage = pipeline.stages.find((s) => s.agent === agent);
    if (stage) {
      stage.status = status;
      if (status === 'active') {
        stage.startedAt = new Date().toISOString();
        pipeline.currentStage = agent;
      }
      if (status === 'done' || status === 'rejected') {
        stage.completedAt = new Date().toISOString();
      }
    }
  }

  // ─── Chat direto com agente ───────────────────────────────────────────────

  async chatWithAgent(role: AgentRole, message: string, history: Anthropic.MessageParam[] = []): Promise<string> {
    const agent = this.agents.get(role);
    if (!agent) throw new Error(`Agente "${role}" não encontrado`);

    this.emit('agent:start', { role, name: agent.name, taskId: 'chat' });
    const response = await agent.chat(message, history);
    this.emit('agent:done', { role, name: agent.name, taskId: 'chat' });

    return response;
  }

  // ─── Público ──────────────────────────────────────────────────────────────

  getAgent(role: AgentRole): BaseAgent | undefined {
    return this.agents.get(role);
  }

  listAgents(): { role: AgentRole; name: string; title: string }[] {
    return [...this.agents.entries()].map(([role, agent]) => ({
      role,
      name: agent.name,
      title: agent.title,
    }));
  }

  getPipeline(): typeof DATTU_PIPELINE {
    return DATTU_PIPELINE;
  }

  getVaultStats(): Record<string, number> {
    const folders = ['Backlog', 'Decisoes', 'Analises', 'Sprints', 'Design', 'Reviews', 'Arquitetura', 'Deploy'];
    const stats: Record<string, number> = {};
    for (const folder of folders) {
      stats[folder] = this.obsidian.listNotes(folder).length;
    }
    return stats;
  }
}
