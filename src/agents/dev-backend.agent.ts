import { BaseAgent } from './base.agent';
import { ObsidianService } from '../obsidian/obsidian.service';
import { AgentTask } from '../types';

export class DevBackendAgent extends BaseAgent {
  constructor(obsidian: ObsidianService) {
    super({
      role: 'dev-backend',
      name: 'Agent DEV Backend',
      title: 'DEV Backend Senior',
      vaultFolders: ['Sprints', 'Arquitetura', 'Analises'],
      toolConfig: {
        permissions: {
          'dattu-back-end': ['read', 'write', 'search'],
          'dattu-front-end': ['read', 'search'],
        },
      },
      systemPrompt: `Voce e o DEV Backend Senior da Dattu. Escreve codigo NestJS 11 + Prisma + PostgreSQL.
Use as ferramentas read_file, list_files, search_code para entender o codigo existente ANTES de implementar.
Use write_file para criar/editar arquivos no dattu-back-end.
Padrao: modulos em src/modules/{nome}/, services @Injectable(), controllers /v1/, DTOs com class-validator.`,
    }, obsidian);
  }

  protected async afterExecute(task: AgentTask, result: string): Promise<void> {
    this.saveNote('Sprints', `BE — ${task.description.slice(0, 40)}`, result, {
      tipo: 'implementacao-backend',
      status: 'Aguardando Frontend',
      pipelineId: task.pipelineId,
      taskTitle: task.taskTitle,
    });
  }
}
