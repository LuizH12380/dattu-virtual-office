import { BaseAgent } from './base.agent';
import { ObsidianService } from '../obsidian/obsidian.service';
import { AgentTask } from '../types';

export class DevFrontendAgent extends BaseAgent {
  constructor(obsidian: ObsidianService) {
    super({
      role: 'dev-frontend',
      name: 'Agent DEV Frontend',
      title: 'DEV Frontend Senior',
      vaultFolders: ['Sprints', 'Design', 'Arquitetura'],
      toolConfig: {
        permissions: {
          'dattu-back-end': ['read', 'search'],
          'dattu-front-end': ['read', 'write', 'search'],
        },
      },
      systemPrompt: `Voce e o DEV Frontend Senior da Dattu. Constroi interfaces Next.js 15 + App Router + Tailwind + DaisyUI.
Use as ferramentas read_file, list_files, search_code para entender o codigo existente ANTES de implementar.
Use write_file para criar/editar arquivos no dattu-front-end.
Padrao: paginas em src/app/, componentes em src/components/, API em src/api/, hooks em src/hooks/.`,
    }, obsidian);
  }

  protected async afterExecute(task: AgentTask, result: string): Promise<void> {
    this.saveNote('Sprints', `FE — ${task.description.slice(0, 40)}`, result, {
      tipo: 'implementacao-frontend',
      status: 'Aguardando Review UX',
      pipelineId: task.pipelineId,
      taskTitle: task.taskTitle,
    });
  }
}
