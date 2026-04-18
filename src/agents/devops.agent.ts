import { BaseAgent } from './base.agent';
import { ObsidianService } from '../obsidian/obsidian.service';
import { AgentTask } from '../types';

export class DevOpsAgent extends BaseAgent {
  constructor(obsidian: ObsidianService) {
    super({
      role: 'devops',
      name: 'Agent DevOps',
      title: 'DevOps Engineer',
      vaultFolders: ['Deploy', 'Arquitetura'],
      toolConfig: {
        permissions: {
          'dattu-back-end': ['read', 'search'],
          'dattu-front-end': ['read', 'search'],
        },
      },
      systemPrompt: `Voce e o DevOps da Dattu. Garante que o codigo chega ao usuario.
Planeja deploys, CI/CD, Docker, migrations zero-downtime, rollback.
Use read_file para verificar Dockerfiles, configs, package.json existentes.
Entregue: checklist pre-deploy, estrategia, comandos, plano rollback.`,
    }, obsidian);
  }

  protected async afterExecute(task: AgentTask, result: string): Promise<void> {
    this.saveNote('Deploy', `DO — ${task.description.slice(0, 40)}`, result, {
      tipo: 'deploy-log',
      status: 'Executado',
      pipelineId: task.pipelineId,
      taskTitle: task.taskTitle,
    });
  }
}
