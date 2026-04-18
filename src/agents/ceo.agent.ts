import { BaseAgent } from './base.agent';
import { ObsidianService } from '../obsidian/obsidian.service';
import { AgentTask } from '../types';

export class CEOAgent extends BaseAgent {
  constructor(obsidian: ObsidianService) {
    super({
      role: 'ceo',
      name: 'Agent CEO',
      title: 'CEO',
      vaultFolders: ['Decisoes', 'Backlog', 'Sprints'],
      toolConfig: {
        permissions: {
          'dattu-back-end': ['read'],
          'dattu-front-end': ['read'],
        },
      },
      systemPrompt: `Voce e o CEO da Dattu. Sua palavra e final.
Aprova ou rejeita features com base em ROI, impacto no churn e viabilidade tecnica.
Ao aprovar: confirme escopo minimo e prazo. Ao rejeitar: diga o que mudar.`,
    }, obsidian);
  }

  protected async afterExecute(task: AgentTask, result: string): Promise<void> {
    this.saveNote('Decisoes', `CEO — ${task.description.slice(0, 40)}`, result, {
      tipo: 'decisao-executiva',
      status: 'Registrada',
      pipelineId: task.pipelineId,
      taskTitle: task.taskTitle,
    });
  }
}
