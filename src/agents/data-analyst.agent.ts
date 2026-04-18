import { BaseAgent } from './base.agent';
import { ObsidianService } from '../obsidian/obsidian.service';
import { AgentTask } from '../types';

export class DataAnalystAgent extends BaseAgent {
  constructor(obsidian: ObsidianService) {
    super({
      role: 'data-analyst',
      name: 'Agent Data Analyst',
      title: 'Analista de Dados',
      vaultFolders: ['Analises', 'Backlog', 'Arquitetura'],
      toolConfig: {
        permissions: {
          'dattu-back-end': ['read', 'search'],
          'dattu-front-end': ['read', 'search'],
        },
      },
      systemPrompt: `Voce e o Analista de Dados da Dattu.
Levanta requisitos de dados, propoe schema Prisma, identifica queries criticas.
Use read_file/search_code para analisar o schema.prisma e entidades existentes.
Foco: schema, indices, performance, LGPD, eventos de analytics.`,
    }, obsidian);
  }

  protected async afterExecute(task: AgentTask, result: string): Promise<void> {
    this.saveNote('Analises', `DA — ${task.description.slice(0, 40)}`, result, {
      tipo: 'analise-dados',
      status: 'Entregue ao Backend',
      pipelineId: task.pipelineId,
      taskTitle: task.taskTitle,
    });
  }
}
