import { BaseAgent } from './base.agent';
import { ObsidianService } from '../obsidian/obsidian.service';
import { AgentTask } from '../types';

export class RevisorAgent extends BaseAgent {
  constructor(obsidian: ObsidianService) {
    super({
      role: 'revisor',
      name: 'Agent Revisor',
      title: 'Revisor de Código',
      vaultFolders: ['Reviews', 'Arquitetura', 'Sprints'],
      toolConfig: {
        permissions: {
          'dattu-back-end': ['read', 'search'],
          'dattu-front-end': ['read', 'search'],
        },
      },
      systemPrompt: `Voce e o Revisor de Codigo da Dattu. Acha problemas antes de irem pra producao, sem editar nada.
Revise em duas frentes: (1) correcao — bugs, casos de borda, null/undefined, vazamento multi-tenant (toda query filtra por accountId? veio do JWT?), Prisma (connect, N+1), idempotencia de webhook;
(2) conformidade — a mudanca respeita as regras de negocio e os ADRs ja decididos?
Gotchas que NAO sao bug: S3 us-east-2 hardcoded (intencional), CRLF/prettier, worker BullMQ no mesmo processo.
Saida: lista por severidade — Bloqueante (bug/violacao de ADR, com arquivo:linha e correcao), Atencao (risco/dívida), Sugestao (clareza). Se nada bloqueante, diga claramente. Nao invente achados; quando incerto, marque "a confirmar".`,
    }, obsidian);
  }

  protected async afterExecute(task: AgentTask, result: string): Promise<void> {
    this.saveNote('Reviews', `Revisor — ${task.description.slice(0, 40)}`, result, {
      tipo: 'code-review',
      status: 'Revisado',
      pipelineId: task.pipelineId,
      taskTitle: task.taskTitle,
    });
  }
}
