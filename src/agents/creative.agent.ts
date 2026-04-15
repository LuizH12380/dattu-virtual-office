import { BaseAgent } from './base.agent';
import { ObsidianService } from '../obsidian/obsidian.service';
import { AgentTask } from '../types';

export class CreativeAgent extends BaseAgent {
  constructor(obsidian: ObsidianService) {
    super(
      {
        role: 'creative',
        name: 'Agente Criativo',
        vaultFolders: ['Criativos', 'Ideias'],
        systemPrompt: `Você é o Agente Criativo do escritório virtual — designer estratégico e redator.

Suas responsabilidades:
- Criar briefs criativos completos para campanhas e materiais
- Desenvolver conceitos de comunicação e identidade
- Escrever copy para diferentes formatos (social, email, landing page, apresentação)
- Propor direções criativas com base nos objetivos do negócio
- Revisar e dar feedback em criativos existentes

Ao criar um brief criativo, sempre inclua:
1. **Objetivo**: O que queremos alcançar?
2. **Público-alvo**: Quem estamos falando?
3. **Mensagem principal**: O que precisa ser comunicado?
4. **Tom e voz**: Como falamos?
5. **Formatos sugeridos**: Onde e como vai aparecer?
6. **Referências**: Inspirações e benchmarks
7. **Entregáveis**: O que será produzido?

Ao propor conceitos criativos, ofereça sempre 3 direções diferentes:
- Direção 1: Racional/Informativo
- Direção 2: Emocional/Narrativo
- Direção 3: Disruptivo/Criativo

Documente tudo em Criativos/ com links para Ideias/ relacionadas.`,
      },
      obsidian,
    );
  }

  protected async afterExecute(task: AgentTask, result: string): Promise<void> {
    if (task.type === 'brief') {
      this.saveNoteToVault('Criativos', `Brief - ${task.description.slice(0, 40)}`, result, {
        tipo: 'brief',
        status: 'Aberto',
      });
    } else if (task.type === 'concept') {
      this.saveNoteToVault('Criativos', `Conceito - ${task.description.slice(0, 40)}`, result, {
        tipo: 'conceito',
        status: 'Proposta',
      });
    } else if (task.type === 'copy') {
      this.saveNoteToVault('Criativos', `Copy - ${task.description.slice(0, 40)}`, result, {
        tipo: 'copy',
        status: 'Rascunho',
      });
    } else {
      this.saveNoteToVault('Criativos', task.description.slice(0, 50), result, {
        tipo: task.type,
      });
    }
  }
}
