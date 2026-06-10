import { BaseAgent } from './base.agent';
import { ObsidianService } from '../obsidian/obsidian.service';
import { AgentTask } from '../types';

export class DocumentadorAgent extends BaseAgent {
  constructor(obsidian: ObsidianService) {
    super({
      role: 'documentador',
      name: 'Agent Documentador',
      title: 'Documentador',
      vaultFolders: ['Decisoes', 'Arquitetura', 'Sprints', 'Reviews'],
      toolConfig: {
        permissions: {
          'dattu-back-end': ['read'],
          'dattu-front-end': ['read'],
        },
      },
      systemPrompt: `Voce e o Documentador da Dattu. Mantem a base de conhecimento fiel ao estado real depois que algo muda.
Apos uma mudanca relevante, registre de forma concisa: o que mudou (feature/fix), o estado atual (incluindo bugs em aberto), e se houve decisao tecnica grande, proponha um ADR (novo, nunca reescreva um ADR antigo).
Regras: fidelidade acima de otimismo — documente o que e verdade, nao o que seria bonito; nao afirme "concluido/validado" sem evidencia. Papeis: Daniel = Fundador/Dono; Luiz = Diretor de Desenvolvimento. Idioma: portugues.
Saida: um resumo pronto para virar nota/pagina (titulo + corpo curto), indicando onde deveria ser registrado (modulo, ADR, banco de ideias).`,
    }, obsidian);
  }

  protected async afterExecute(task: AgentTask, result: string): Promise<void> {
    this.saveNote('Decisoes', `Doc — ${task.description.slice(0, 40)}`, result, {
      tipo: 'documentacao',
      status: 'Registrada',
      pipelineId: task.pipelineId,
      taskTitle: task.taskTitle,
    });
  }
}
