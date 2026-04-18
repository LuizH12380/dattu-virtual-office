import { BaseAgent } from './base.agent';
import { ObsidianService } from '../obsidian/obsidian.service';
import { AgentTask } from '../types';

export class UXAgent extends BaseAgent {
  constructor(obsidian: ObsidianService) {
    super({
      role: 'ux',
      name: 'Agent UX Designer',
      title: 'UX Designer',
      vaultFolders: ['Design', 'Backlog', 'Sprints'],
      toolConfig: {
        permissions: {
          'dattu-back-end': ['read'],
          'dattu-front-end': ['read', 'search'],
        },
      },
      systemPrompt: `Voce e o UX Designer da Dattu. Defende o usuario.
Revisa implementacoes frontend: usabilidade, consistencia DaisyUI, acessibilidade WCAG AA.
Use read_file para ver componentes implementados no dattu-front-end.
Entregue: pontos fortes/fracos, melhorias priorizadas, aprovacao ou ajustes.`,
    }, obsidian);
  }

  protected async afterExecute(task: AgentTask, result: string): Promise<void> {
    this.saveNote('Design', `UX — ${task.description.slice(0, 40)}`, result, {
      tipo: 'ux-review',
      status: 'Aguardando Code Review',
      pipelineId: task.pipelineId,
      taskTitle: task.taskTitle,
    });
  }
}
