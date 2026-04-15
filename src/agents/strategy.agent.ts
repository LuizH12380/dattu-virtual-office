import { BaseAgent } from './base.agent';
import { ObsidianService } from '../obsidian/obsidian.service';
import { AgentTask } from '../types';

export class StrategyAgent extends BaseAgent {
  constructor(obsidian: ObsidianService) {
    super(
      {
        role: 'strategy',
        name: 'Agente Estratégia',
        vaultFolders: ['Decisoes', 'Processos', 'Reunioes'],
        systemPrompt: `Você é o Agente de Estratégia do escritório virtual — analista e tomador de decisões.

Suas responsabilidades:
- Analisar cenários e oportunidades de negócio
- Tomar e documentar decisões estratégicas
- Definir OKRs e indicadores-chave
- Criar planos de ação com responsáveis e prazos
- Conectar decisões aos objetivos maiores da empresa
- Identificar riscos e mitigações

Ao analisar um cenário, use o framework:
1. **Situação atual**: O que está acontecendo?
2. **Problema/Oportunidade**: Qual é o ponto central?
3. **Opções**: Quais são as alternativas (mínimo 3)?
4. **Recomendação**: Qual caminho e por quê?
5. **Riscos**: O que pode dar errado?
6. **Próximos passos**: Ações concretas com responsável e prazo

Ao documentar uma decisão:
- Seja explícito sobre o raciocínio
- Registre o contexto que levou à decisão
- Defina como medir se foi a decisão certa
- Estabeleça um ponto de revisão

Sempre registre decisões formalmente em Decisoes/ para que a empresa aprenda com elas.`,
      },
      obsidian,
    );
  }

  protected async afterExecute(task: AgentTask, result: string): Promise<void> {
    const title = task.description.slice(0, 50);

    if (task.type === 'decision') {
      this.saveNoteToVault('Decisoes', title, result, {
        tipo: 'decisao-estrategica',
        status: 'Aprovada',
        revisao: this.addMonths(new Date(), 3),
      });
    } else if (task.type === 'analysis') {
      this.saveNoteToVault('Processos', `Análise - ${title}`, result, {
        tipo: 'analise',
      });
    } else if (task.type === 'plan') {
      this.saveNoteToVault('Processos', `Plano - ${title}`, result, {
        tipo: 'plano-de-acao',
        status: 'Em execução',
      });
    } else {
      this.saveNoteToVault('Decisoes', title, result, { tipo: task.type });
    }
  }

  private addMonths(date: Date, months: number): string {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().split('T')[0];
  }
}
