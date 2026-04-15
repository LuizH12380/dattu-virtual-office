import { BaseAgent } from './base.agent';
import { ObsidianService } from '../obsidian/obsidian.service';
import { AgentTask } from '../types';

export class DocumentsAgent extends BaseAgent {
  constructor(obsidian: ObsidianService) {
    super(
      {
        role: 'documents',
        name: 'Agente Documentos',
        vaultFolders: ['Processos', 'Time', 'Criativos', 'Decisoes', 'Reunioes', 'Ideias'],
        systemPrompt: `Você é o Agente de Documentos do escritório virtual — guardião e organizador do conhecimento.

Suas responsabilidades:
- Organizar e categorizar documentos no vault
- Criar e manter processos documentados
- Buscar e sintetizar informações do vault
- Garantir que o conhecimento seja recuperável
- Criar conexões entre notas relacionadas
- Manter o índice central atualizado

Princípios que você segue:
1. **Tudo deve ser encontrável**: Use nomenclatura consistente e tags
2. **Links são neurônios**: Sempre conecte notas relacionadas com [[links]]
3. **Contexto importa**: Documente o "porquê" além do "como"
4. **Versione implicitamente**: Use datas nos nomes dos arquivos
5. **Sintetize regularmente**: Crie sumários de grandes volumes de informação

Ao organizar documentos:
- Sugira a pasta correta baseado no conteúdo
- Adicione frontmatter com metadados relevantes
- Crie links bidirecionais entre notas relacionadas
- Identifique e elimine duplicidades

Ao buscar informações:
- Sempre cite as fontes (caminhos dos arquivos)
- Sintetize em vez de apenas listar
- Identifique gaps de conhecimento
- Sugira o que deveria ser documentado`,
      },
      obsidian,
    );
  }

  protected async afterExecute(task: AgentTask, result: string): Promise<void> {
    const title = task.description.slice(0, 50);

    if (task.type === 'process') {
      this.saveNoteToVault('Processos', title, result, {
        tipo: 'processo',
        status: 'Ativo',
        versao: '1.0',
      });
    } else if (task.type === 'search' || task.type === 'summary') {
      this.saveNoteToVault('Processos', `Síntese - ${title}`, result, {
        tipo: 'sintese',
      });
    } else if (task.type === 'idea') {
      this.saveNoteToVault('Ideias', title, result, {
        tipo: 'ideia',
        status: 'Aberta',
      });
    } else {
      this.saveNoteToVault('Processos', title, result, { tipo: task.type });
    }
  }

  async searchAndSynthesize(query: string): Promise<string> {
    const results = this.obsidian.searchNotes(query);

    if (results.length === 0) {
      return `Nenhuma nota encontrada no vault para: "${query}"`;
    }

    const noteSummaries = results
      .slice(0, 10)
      .map((n) => `### [[${n.filename.replace('.md', '')}]]\n${n.content.slice(0, 300)}...`)
      .join('\n\n');

    const synthesis = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: `Você é um assistente especializado em síntese de conhecimento corporativo.
               Responda em português brasileiro de forma concisa e estruturada.`,
      messages: [
        {
          role: 'user',
          content: `Sintetize as seguintes notas do vault relacionadas a "${query}":\n\n${noteSummaries}`,
        },
      ],
    });

    return synthesis.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');
  }
}
