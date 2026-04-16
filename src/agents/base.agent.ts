import Anthropic from '@anthropic-ai/sdk';
import { ObsidianService } from '../obsidian/obsidian.service';
import { AgentRole, AgentTask, AgentDecision, VaultNote } from '../types';

export interface AgentConfig {
  role: AgentRole;
  name: string;
  title: string;
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
    this.companyName = process.env.COMPANY_NAME || 'Dattu';
  }

  get role(): AgentRole { return this.config.role; }
  get name(): string { return this.config.name; }
  get title(): string { return this.config.title; }

  // ─── Execução de tarefa ───────────────────────────────────────────────────

  async execute(task: AgentTask): Promise<string> {
    const messages = this.buildMessages(task);

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

  // ─── Aprovação (agentes que podem bloquear o pipeline) ────────────────────

  async review(context: string, previousOutput: string): Promise<AgentDecision> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: `${this.buildSystemPrompt()}

Você está fazendo uma revisão/aprovação. Responda SOMENTE em JSON:
{
  "approved": true | false,
  "reasoning": "sua análise em português",
  "feedback": "o que precisa mudar (se rejeitado)"
}`,
      messages: [
        {
          role: 'user',
          content: `Contexto da tarefa:\n${context}\n\nOutput para revisar:\n${previousOutput}\n\nRevise e decida se aprova ou rejeita.`,
        },
      ],
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');

    try {
      const json = text.match(/\{[\s\S]*\}/)?.[0];
      return JSON.parse(json!) as AgentDecision;
    } catch {
      return { approved: true, reasoning: 'Aprovado (parse error — seguindo em frente)' };
    }
  }

  // ─── Chat interativo com streaming ───────────────────────────────────────

  async chat(userMessage: string, history: Anthropic.MessageParam[] = []): Promise<string> {
    const contextSummary = this.obsidian.buildContextSummary(this.config.vaultFolders);
    const systemWithContext = `${this.buildSystemPrompt()}\n\n## Contexto Atual do Vault\n${contextSummary || 'Sem histórico ainda.'}`;

    process.stdout.write(`\n[${this.name}] `);
    let fullText = '';

    const stream = await this.client.messages.stream({
      model: this.model,
      max_tokens: 2048,
      system: systemWithContext,
      messages: [...history, { role: 'user', content: userMessage }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        process.stdout.write(event.delta.text);
        fullText += event.delta.text;
      }
    }

    process.stdout.write('\n');
    return fullText;
  }

  // ─── Hooks para subclasses ────────────────────────────────────────────────

  protected async afterExecute(task: AgentTask, result: string): Promise<void> {
    // Subclasses sobrescrevem para salvar no vault
  }

  protected loadVaultContext(): string {
    return this.obsidian.buildContextSummary(this.config.vaultFolders);
  }

  // ─── Builders ─────────────────────────────────────────────────────────────

  protected buildSystemPrompt(): string {
    return `${this.config.systemPrompt}

## Contexto
- Empresa: **${this.companyName}** (CRM SaaS — NestJS backend, Next.js 15 frontend)
- Stack: NestJS 11, Next.js 15, TypeScript, PostgreSQL/Prisma, Redis/BullMQ, Tailwind CSS
- Repositórios: dattu-back-end, dattu-front-end, MinhaReceitaAPI (Go)
- Data: ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

## Diretrizes
- Responda sempre em português brasileiro
- Seja direto, técnico e orientado a entrega
- Use Markdown para formatar respostas
- Ao final de cada resposta, indique se há dependência de outro agente`;
  }

  private buildMessages(task: AgentTask): Anthropic.MessageParam[] {
    const vaultContext = this.loadVaultContext();
    const previousCtx = task.previousOutput
      ? `\n\n## Output do Agente Anterior\n${task.previousOutput}`
      : '';

    return [
      {
        role: 'user',
        content: `## Contexto do Vault\n${vaultContext || 'Sem histórico ainda.'}${previousCtx}\n\n## Tarefa\n${task.description}`,
      },
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
