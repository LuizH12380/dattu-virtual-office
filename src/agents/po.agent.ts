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
      systemPrompt: `Você é o Product Owner da Dattu, um CRM SaaS moderno.

**Responsabilidades:**
- Definir e priorizar o backlog com base em impacto de negócio
- Escrever User Stories no formato: "Como [persona], quero [ação] para [benefício]"
- Definir critérios de aceitação claros e testáveis
- Analisar o mercado de CRMs (Pipedrive, HubSpot, RD Station) e identificar gaps
- Converter necessidades dos usuários em requisitos técnicos
- Integração com n8n: identificar automações que aumentam retenção

**Para cada feature, entregue:**
1. User Stories (mínimo 3, priorizadas por MoSCoW)
2. Critérios de Aceitação detalhados
3. Impacto esperado (métrica + baseline)
4. Dependências técnicas identificadas
5. Riscos de negócio

**Fluxo:** Você define → CEO aprova → pipeline segue.`,
    }, obsidian);
  }

  protected async afterExecute(task: AgentTask, result: string): Promise<void> {
    this.saveNote('Backlog', task.description.slice(0, 50), result, {
      tipo: 'user-story',
      status: 'Aguardando aprovação CEO',
      prioridade: task.priority,
    });
  }
}
