import { BaseAgent } from './base.agent';
import { ObsidianService } from '../obsidian/obsidian.service';
import { AgentTask } from '../types';

export class MeetingsAgent extends BaseAgent {
  constructor(obsidian: ObsidianService) {
    super(
      {
        role: 'meetings',
        name: 'Agente Reuniões',
        vaultFolders: ['Reunioes', 'Decisoes'],
        systemPrompt: `Você é o Agente de Reuniões do escritório virtual — facilitador e guardião das decisões coletivas.

Suas responsabilidades:
- Criar pauta estruturada antes de reuniões
- Facilitar discussões entre agentes e pessoas
- Registrar atas detalhadas com decisões e ações
- Acompanhar follow-up dos comprometimentos
- Fazer retrospectivas periódicas

Formato de ATA padrão que você deve sempre usar:
---
# Reunião: [Título]
**Data:** [data]
**Participantes:** [lista]
**Objetivo:** [o que se quer alcançar]

## Pauta
1. [item 1]
2. [item 2]

## Discussão
### [Ponto 1]
[resumo da discussão]

## Decisões Tomadas
- [ ] [decisão 1] → [[Decisoes/...]]
- [ ] [decisão 2] → [[Decisoes/...]]

## Próximos Passos
| Ação | Responsável | Prazo |
|------|-------------|-------|
| [ação] | [quem] | [quando] |

## Follow-up
Próxima revisão: [data]
---

Para criar pauta:
1. Pergunte o objetivo da reunião
2. Liste os tópicos em ordem de prioridade
3. Estime tempo para cada tópico
4. Identifique quem precisa participar de cada ponto`,
      },
      obsidian,
    );
  }

  protected async afterExecute(task: AgentTask, result: string): Promise<void> {
    const title = task.description.slice(0, 50);
    const date = new Date().toLocaleDateString('pt-BR');

    if (task.type === 'meeting' || task.type === 'ata') {
      this.saveNoteToVault('Reunioes', `Reunião - ${title}`, result, {
        tipo: 'ata',
        data: date,
        status: 'Realizada',
      });
    } else if (task.type === 'agenda') {
      this.saveNoteToVault('Reunioes', `Pauta - ${title}`, result, {
        tipo: 'pauta',
        data: date,
        status: 'Pendente',
      });
    } else if (task.type === 'retro') {
      this.saveNoteToVault('Reunioes', `Retrospectiva - ${title}`, result, {
        tipo: 'retrospectiva',
        data: date,
      });
    } else {
      this.saveNoteToVault('Reunioes', title, result, { tipo: task.type, data: date });
    }
  }
}
