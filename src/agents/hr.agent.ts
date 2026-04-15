import { BaseAgent } from './base.agent';
import { ObsidianService } from '../obsidian/obsidian.service';
import { AgentTask } from '../types';

export class HRAgent extends BaseAgent {
  constructor(obsidian: ObsidianService) {
    super(
      {
        role: 'hr',
        name: 'Agente RH',
        vaultFolders: ['Time', 'Decisoes'],
        systemPrompt: `Você é o Agente de Recursos Humanos do escritório virtual.

Suas responsabilidades:
- Conduzir processos seletivos e formalizar contratações
- Registrar desligamentos com contexto e aprendizados
- Criar planos de onboarding personalizados
- Avaliar fit cultural e competências
- Manter perfis detalhados de cada colaborador
- Documentar políticas e cultura da empresa

Ao contratar alguém:
1. Crie um perfil completo em Time/
2. Defina plano de onboarding (30/60/90 dias)
3. Registre a decisão em Decisoes/ com justificativa

Ao desligar alguém:
1. Atualize o perfil em Time/ com status "Desligado"
2. Documente os motivos e aprendizados em Decisoes/
3. Crie checklist de offboarding

Ao fazer reunião de time:
1. Liste pontos de atenção individuais
2. Sugira ações de desenvolvimento
3. Registre em Reunioes/`,
      },
      obsidian,
    );
  }

  protected async afterExecute(task: AgentTask, result: string): Promise<void> {
    if (task.type === 'hire') {
      await this.registerHiring(task, result);
    } else if (task.type === 'fire') {
      await this.registerFiring(task, result);
    } else if (task.type === 'onboarding') {
      await this.registerOnboarding(task, result);
    } else {
      this.saveNoteToVault('Time', task.description, result, { tipo: task.type });
    }
  }

  private async registerHiring(task: AgentTask, result: string): Promise<void> {
    const candidateName = (task.context?.['name'] as string) ?? 'Candidato';

    this.saveNoteToVault('Time', `Contratação - ${candidateName}`, result, {
      tipo: 'contratacao',
      colaborador: candidateName,
      status: 'Ativo',
    });

    this.saveNoteToVault(
      'Decisoes',
      `Decisão de Contratação - ${candidateName}`,
      `# Decisão: Contratar ${candidateName}\n\n**Tomada por:** Agente RH\n**Data:** ${new Date().toLocaleDateString('pt-BR')}\n\n## Justificativa\n${result}\n\n## Links relacionados\n- [[Time/Contratação - ${candidateName}]]`,
      { tipo: 'decisao-rh', impacto: 'time' },
    );
  }

  private async registerFiring(task: AgentTask, result: string): Promise<void> {
    const collaboratorName = (task.context?.['name'] as string) ?? 'Colaborador';

    this.saveNoteToVault(
      'Decisoes',
      `Desligamento - ${collaboratorName}`,
      `# Desligamento: ${collaboratorName}\n\n**Data:** ${new Date().toLocaleDateString('pt-BR')}\n\n## Contexto e Aprendizados\n${result}`,
      { tipo: 'desligamento', colaborador: collaboratorName },
    );
  }

  private async registerOnboarding(task: AgentTask, result: string): Promise<void> {
    const collaboratorName = (task.context?.['name'] as string) ?? 'Novo Colaborador';

    this.saveNoteToVault(
      'Processos',
      `Onboarding - ${collaboratorName}`,
      result,
      { tipo: 'onboarding', colaborador: collaboratorName, status: 'Em andamento' },
    );
  }
}
