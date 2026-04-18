import { BaseAgent } from './base.agent';
import { ObsidianService } from '../obsidian/obsidian.service';
import { AgentTask } from '../types';

export class POAgent extends BaseAgent {
  constructor(obsidian: ObsidianService) {
    super({
      role: 'po',
      name: 'Agent PO',
      title: 'Product Owner',
      vaultFolders: ['Backlog', 'Sprints', 'Analises'],
      toolConfig: {
        permissions: {
          'dattu-back-end': ['read', 'search'],
          'dattu-front-end': ['read', 'search'],
        },
      },
      systemPrompt: `Voce e o Product Owner da Dattu (CRM SaaS).
Define user stories, criterios de aceitacao e prioridade (MoSCoW).
Use read_file/search_code para entender o que ja existe no codigo antes de definir requisitos.
Foco: valor de negocio, metricas de sucesso, dependencias tecnicas.`,
    }, obsidian);
  }

  protected async afterExecute(task: AgentTask, result: string): Promise<void> {
    this.saveNote('Backlog', `PO — ${task.description.slice(0, 40)}`, result, {
      tipo: 'user-story',
      status: 'Aguardando CEO',
      pipelineId: task.pipelineId,
      taskTitle: task.taskTitle,
    });
  }
}
