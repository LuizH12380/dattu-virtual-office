import Anthropic from '@anthropic-ai/sdk';
import { ObsidianService } from '../obsidian/obsidian.service';
import { AgentRole, AgentTask, VaultNote } from '../types';

export interface AgentConfig {
  role: AgentRole;
  name: string;
  systemPrompt: string;
  vaultFolders: string[];
  model?: string;
}

export abstract class BaseAgent {
  protected readonly client: Anthropic;
  protected readonly obsidian: ObsidianService;
  protected readonly config: AgentConfig;
  protected readonly model: string;
  protected readonly companyName: string;

  constructor(config: AgentConfig, obsidian: ObsidianService) {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.obsidian = obsidian;
    this.config = config;
    this.model = config.model || process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
    this.companyName = process.env.COMPANY_NAME || 'Empresa';
  }

  get role(): AgentRole {
    return this.config.role;
  }

  get name(): string {
    return this.config.name;
  }

  // ─── Execução principal ────────────────────────────────────────────────────

  async execute(task: AgentTask): Promise<string> {
    const context = this.buildContext(task);
    const messages = this.buildMessages(task, context);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: this.buildSystemPrompt(),
      messages,
    });

    const result = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('\n');

    await this.afterExecute(task, result);
    return result;
  }

  // ─── Conversa com streaming (para CLI interativo) ──────────────────────────

  async chat(userMessage: string, history: Anthropic.MessageParam[] = []): Promise<string> {
    const contextSummary = this.obsidian.buildContextSummary(this.config.vaultFolders);

    const systemWithContext = `${this.buildSystemPrompt()}

## Contexto Atual do Vault
${contextSummary || 'Vault ainda sem conteúdo registrado.'}`;

    process.stdout.write(`\n[${this.name}] `);

    let fullText = '';
    const stream = await this.client.messages.stream({
      model: this.model,
      max_tokens: 2048,
      system: systemWithContext,
      messages: [...history, { role: 'user', content: userMessage }],
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        process.stdout.write(event.delta.text);
        fullText += event.delta.text;
      }
    }

    process.stdout.write('\n');
    return fullText;
  }

  // ─── Hooks que subclasses podem sobrescrever ───────────────────────────────

  protected async afterExecute(task: AgentTask, result: string): Promise<void> {
    // Subclasses implementam: salvar nota no vault, criar links, etc.
  }

  protected loadVaultContext(): string {
    return this.obsidian.buildContextSummary(this.config.vaultFolders);
  }

  protected readAgentProfile(): string {
    const profilePath = `_sistema/Agente-${this.toTitleCase(this.config.role)}`;
    const note = this.obsidian.readNote(profilePath);
    return note?.content ?? '';
  }

  // ─── Builders internos ─────────────────────────────────────────────────────

  private buildSystemPrompt(): string {
    return `${this.config.systemPrompt}

## Empresa
Você trabalha para **${this.companyName}**.

## Data atual
${new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

## Diretrizes gerais
- Responda sempre em português brasileiro
- Seja conciso, direto e orientado a ação
- Ao tomar decisões, explique o raciocínio brevemente
- Use formatação Markdown quando útil
- Se criar um documento/nota, indique o caminho no vault no final da resposta`;
  }

  private buildContext(task: AgentTask): string {
    const vaultContext = this.loadVaultContext();
    const taskContext = task.context
      ? `\n## Contexto adicional da tarefa\n${JSON.stringify(task.context, null, 2)}`
      : '';

    return `## Contexto do Vault\n${vaultContext || 'Sem histórico ainda.'}${taskContext}`;
  }

  private buildMessages(
    task: AgentTask,
    context: string,
  ): Anthropic.MessageParam[] {
    return [
      {
        role: 'user',
        content: `${context}\n\n## Tarefa\n${task.description}`,
      },
    ];
  }

  protected saveNoteToVault(
    folder: string,
    title: string,
    content: string,
    frontmatter?: Record<string, unknown>,
  ): VaultNote {
    const filename = this.toFilename(title);
    const notePath = `${folder}/${filename}`;
    return this.obsidian.writeNote(notePath, content, {
      agente: this.config.role,
      ...frontmatter,
    });
  }

  protected toFilename(title: string): string {
    const date = new Date().toISOString().split('T')[0];
    const slug = title
      .toLowerCase()
      .replace(/[áàãâä]/g, 'a')
      .replace(/[éèêë]/g, 'e')
      .replace(/[íìîï]/g, 'i')
      .replace(/[óòõôö]/g, 'o')
      .replace(/[úùûü]/g, 'u')
      .replace(/[ç]/g, 'c')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 50);
    return `${date}-${slug}.md`;
  }

  private toTitleCase(str: string): string {
    const map: Record<string, string> = {
      hr: 'RH',
      creative: 'Criativo',
      strategy: 'Estrategia',
      meetings: 'Reunioes',
      documents: 'Documentos',
    };
    return map[str] ?? str;
  }
}
