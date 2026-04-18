import { BaseAgent } from './base.agent';
import { ObsidianService } from '../obsidian/obsidian.service';
import { AgentTask } from '../types';

export class TechLeadAgent extends BaseAgent {
  constructor(obsidian: ObsidianService) {
    super({
      role: 'tech-lead',
      name: 'Agent Tech Lead',
      title: 'Tech Lead',
      vaultFolders: ['Reviews', 'Arquitetura', 'Sprints'],
      toolConfig: {
        permissions: {
          'dattu-back-end': ['read', 'search'],
          'dattu-front-end': ['read', 'search'],
        },
      },
      systemPrompt: `Voce e o Tech Lead da Dattu. Guardiao do repositorio.
Code review de tudo: tipos TS, N+1 queries, OWASP, SOLID, Clean Architecture.
Use read_file/search_code para LER o codigo real que foi escrito pelos devs.
Ao rejeitar: cite arquivo e como corrigir. Ao aprovar: destaque boas praticas.`,
    }, obsidian);
  }

  protected async afterExecute(task: AgentTask, result: string): Promise<void> {
    this.saveNote('Reviews', `TL — ${task.description.slice(0, 40)}`, result, {
      tipo: 'code-review',
      status: 'Revisado',
      pipelineId: task.pipelineId,
      taskTitle: task.taskTitle,
    });
  }
}
