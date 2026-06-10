import { ObsidianService } from '../obsidian/obsidian.service';
import { ClaudeCodeClient, LlmMessage, LlmResponse } from '../llm/claude-code.client';
import { AgentRole, AgentTask, AgentDecision, VaultNote, AgentToolConfig } from '../types';

export interface AgentConfig {
  role: AgentRole;
  name: string;
  title: string;
  systemPrompt: string;
  vaultFolders: string[];
  model?: string;
  toolConfig?: AgentToolConfig;
}

export abstract class BaseAgent {
  protected readonly client: ClaudeCodeClient;
  protected readonly obsidian: ObsidianService;
  protected readonly config: AgentConfig;
  protected readonly companyName: string;
  public active = true;

  constructor(config: AgentConfig, obsidian: ObsidianService) {
    this.client = new ClaudeCodeClient();
    this.obsidian = obsidian;
    this.config = config;
    this.companyName = process.env.COMPANY_NAME || 'Dattu';
  }

  get role(): AgentRole { return this.config.role; }
  get name(): string { return this.config.name; }
  get title(): string { return this.config.title; }

  // ─── Execução (cérebro = Claude Code headless, sem API paga) ───────────────

  async execute(task: AgentTask): Promise<string> {
    const messages: LlmMessage[] = this.buildMessages(task);

    const response: LlmResponse = await this.client.messages.create({
      system: this.buildSystemPrompt(),
      messages,
    });

    const result = this.textOf(response);
    await this.afterExecute(task, result);
    return result;
  }

  // ─── Aprovação ──────────────────────────────────────────────────────────────

  async review(context: string, previousOutput: string): Promise<AgentDecision> {
    const response = await this.client.messages.create({
      system: `${this.buildSystemPrompt()}\n\nResponda SOMENTE em JSON: {"approved":true|false,"reasoning":"...","feedback":"..."}`,
      messages: [
        { role: 'user', content: `Contexto:\n${context}\n\nOutput:\n${previousOutput}\n\nRevise.` },
      ],
    });

    const text = this.textOf(response);
    try {
      const json = text.match(/\{[\s\S]*\}/)?.[0];
      return JSON.parse(json!) as AgentDecision;
    } catch {
      return { approved: true, reasoning: 'Aprovado (parse error)' };
    }
  }

  // ─── Chat ─────────────────────────────────────────────────────────────────

  async chat(userMessage: string, history: LlmMessage[] = []): Promise<string> {
    const contextSummary = this.obsidian.buildContextSummary(this.config.vaultFolders);
    const sys = `${this.buildSystemPrompt()}\n\n## Vault\n${contextSummary || 'Vazio.'}`;

    const response = await this.client.messages.create({
      system: sys,
      messages: [...history, { role: 'user', content: userMessage }],
    });

    return this.textOf(response);
  }

  // ─── Hooks ────────────────────────────────────────────────────────────────

  protected async afterExecute(_task: AgentTask, _result: string): Promise<void> {}

  protected loadVaultContext(): string {
    return this.obsidian.buildContextSummary(this.config.vaultFolders);
  }

  // ─── Builders ─────────────────────────────────────────────────────────────

  private textOf(response: LlmResponse): string {
    return response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
  }

  protected buildSystemPrompt(): string {
    return `${this.config.systemPrompt}

## Contexto
- Empresa: **${this.companyName}** (CRM SaaS B2B — NestJS backend, Next.js frontend)
- Stack: NestJS, Next.js, TypeScript, PostgreSQL/Prisma, Redis/BullMQ, Tailwind CSS
- Repos: dattu-back-end, dattu-front-end
- Voce e um agente do escritorio virtual da Dattu; o usuario e o Luiz (Diretor de Desenvolvimento). Daniel e o fundador/dono.

## Formato de resposta
Seja CONCISO. Max 30 linhas. Sem tabelas decorativas. Direto ao ponto:
1. Decisao/acao (2-3 linhas)
2. Codigo ou referencia se necessario
3. Proximo passo (1 linha)`;
  }

  private buildMessages(task: AgentTask): LlmMessage[] {
    const vaultContext = this.loadVaultContext();
    const prev = task.previousOutput ? `\n\n## Agente anterior\n${task.previousOutput}` : '';
    return [
      { role: 'user', content: `## Vault\n${vaultContext || 'Vazio.'}${prev}\n\n## Tarefa\n${task.description}` },
    ];
  }

  protected saveNote(folder: string, title: string, content: string, frontmatter?: Record<string, unknown>): VaultNote {
    const filename = this.toFilename(title);
    return this.obsidian.writeNote(`${folder}/${filename}`, content, {
      agente: this.config.role,
      cargo: this.config.title,
      ...frontmatter,
    });
  }

  protected toFilename(title: string): string {
    const date = new Date().toISOString().split('T')[0];
    const slug = title
      .toLowerCase()
      .replace(/[áàãâä]/g, 'a').replace(/[éèêë]/g, 'e')
      .replace(/[íìîï]/g, 'i').replace(/[óòõôö]/g, 'o')
      .replace(/[úùûü]/g, 'u').replace(/[ç]/g, 'c')
      .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 50);
    return `${date}-${slug}.md`;
  }
}
