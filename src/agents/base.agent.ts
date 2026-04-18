import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { ObsidianService } from '../obsidian/obsidian.service';
import { AgentRole, AgentTask, AgentDecision, VaultNote, AgentToolConfig, ProjectName } from '../types';

export interface AgentConfig {
  role: AgentRole;
  name: string;
  title: string;
  systemPrompt: string;
  vaultFolders: string[];
  model?: string;
  toolConfig?: AgentToolConfig;
}

// Project root paths
const PROJECT_ROOTS: Record<ProjectName, string> = {
  'dattu-back-end': path.resolve(process.cwd(), '..', 'dattu-back-end'),
  'dattu-front-end': path.resolve(process.cwd(), '..', 'dattu-front-end'),
};

// Tool definitions for Anthropic API
const CODE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description: 'Ler conteudo de um arquivo do projeto. Retorna o conteudo do arquivo (max 500 linhas).',
    input_schema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', enum: ['dattu-back-end', 'dattu-front-end'], description: 'Projeto alvo' },
        path: { type: 'string', description: 'Caminho relativo do arquivo, ex: src/app.module.ts' },
      },
      required: ['project', 'path'],
    },
  },
  {
    name: 'list_files',
    description: 'Listar arquivos e pastas de um diretorio do projeto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', enum: ['dattu-back-end', 'dattu-front-end'] },
        path: { type: 'string', description: 'Caminho do diretorio, ex: src/modules' },
      },
      required: ['project'],
    },
  },
  {
    name: 'write_file',
    description: 'Criar ou sobrescrever um arquivo no projeto. Use com cuidado.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', enum: ['dattu-back-end', 'dattu-front-end'] },
        path: { type: 'string', description: 'Caminho relativo do arquivo' },
        content: { type: 'string', description: 'Conteudo completo do arquivo' },
      },
      required: ['project', 'path', 'content'],
    },
  },
  {
    name: 'search_code',
    description: 'Buscar texto em arquivos do projeto (grep). Retorna linhas que contem o texto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', enum: ['dattu-back-end', 'dattu-front-end'] },
        query: { type: 'string', description: 'Texto ou regex para buscar' },
        file_pattern: { type: 'string', description: 'Glob pattern, ex: **/*.ts (opcional)' },
      },
      required: ['project', 'query'],
    },
  },
];

export abstract class BaseAgent {
  protected readonly client: Anthropic;
  protected readonly obsidian: ObsidianService;
  protected readonly config: AgentConfig;
  protected readonly model: string;
  protected readonly companyName: string;
  public active = true;

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

  // ─── Execucao com tool_use ────────────────────────────────────────────────

  async execute(task: AgentTask): Promise<string> {
    const messages: Anthropic.MessageParam[] = this.buildMessages(task);
    const tools = this.getAvailableTools();

    let response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: this.buildSystemPrompt(),
      messages,
      ...(tools.length > 0 ? { tools } : {}),
    });

    // Tool-use loop: Claude pode pedir ferramentas varias vezes
    while (response.stop_reason === 'tool_use') {
      const toolBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const tb of toolBlocks) {
        const result = this.executeTool(tb.name, tb.input as Record<string, string>);
        toolResults.push({ type: 'tool_result', tool_use_id: tb.id, content: result });
      }

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });

      response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: this.buildSystemPrompt(),
        messages,
        ...(tools.length > 0 ? { tools } : {}),
      });
    }

    const result = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    await this.afterExecute(task, result);
    return result;
  }

  // ─── Tool permissions & execution ─────────────────────────────────────────

  private getAvailableTools(): Anthropic.Tool[] {
    const tc = this.config.toolConfig;
    if (!tc) return [];

    const available: Anthropic.Tool[] = [];
    const hasAnyRead = Object.values(tc.permissions).some((p) => p.includes('read'));
    const hasAnyWrite = Object.values(tc.permissions).some((p) => p.includes('write'));
    const hasAnySearch = Object.values(tc.permissions).some((p) => p.includes('search'));

    if (hasAnyRead) {
      available.push(CODE_TOOLS.find((t) => t.name === 'read_file')!);
      available.push(CODE_TOOLS.find((t) => t.name === 'list_files')!);
    }
    if (hasAnyWrite) available.push(CODE_TOOLS.find((t) => t.name === 'write_file')!);
    if (hasAnySearch || hasAnyRead) available.push(CODE_TOOLS.find((t) => t.name === 'search_code')!);

    return available;
  }

  private executeTool(name: string, input: Record<string, string>): string {
    try {
      const project = input.project as ProjectName;
      const tc = this.config.toolConfig;
      if (!tc) return 'Erro: sem permissao de ferramentas';

      const perms = tc.permissions[project] || [];
      const root = PROJECT_ROOTS[project];
      if (!root || !fs.existsSync(root)) return `Erro: projeto ${project} nao encontrado em ${root}`;

      switch (name) {
        case 'read_file': {
          if (!perms.includes('read')) return 'Erro: sem permissao de leitura neste projeto';
          const filePath = path.join(root, input.path);
          if (!filePath.startsWith(root)) return 'Erro: caminho invalido';
          if (!fs.existsSync(filePath)) return `Arquivo nao encontrado: ${input.path}`;
          const content = fs.readFileSync(filePath, 'utf-8');
          const lines = content.split('\n');
          if (lines.length > 500) return lines.slice(0, 500).join('\n') + `\n... (truncado, ${lines.length} linhas total)`;
          return content;
        }
        case 'list_files': {
          if (!perms.includes('read')) return 'Erro: sem permissao de leitura';
          const dirPath = path.join(root, input.path || '');
          if (!dirPath.startsWith(root)) return 'Erro: caminho invalido';
          if (!fs.existsSync(dirPath)) return `Diretorio nao encontrado: ${input.path || '/'}`;
          const entries = fs.readdirSync(dirPath, { withFileTypes: true })
            .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist')
            .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
            .slice(0, 100);
          return entries.join('\n');
        }
        case 'write_file': {
          if (!perms.includes('write')) return 'Erro: sem permissao de escrita neste projeto';
          const writePath = path.join(root, input.path);
          if (!writePath.startsWith(root)) return 'Erro: caminho invalido';
          const dir = path.dirname(writePath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(writePath, input.content, 'utf-8');
          return `Arquivo escrito: ${input.path} (${input.content.length} bytes)`;
        }
        case 'search_code': {
          if (!perms.includes('read') && !perms.includes('search')) return 'Erro: sem permissao de busca';
          const pattern = input.file_pattern || '*.ts';
          try {
            const result = execSync(
              `grep -rn --include="${pattern}" "${input.query}" .`,
              { cwd: root, maxBuffer: 1024 * 1024, timeout: 10000 },
            ).toString();
            const lines = result.split('\n').slice(0, 30);
            return lines.join('\n') + (result.split('\n').length > 30 ? '\n... (mais resultados)' : '');
          } catch {
            return 'Nenhum resultado encontrado.';
          }
        }
        default:
          return `Ferramenta desconhecida: ${name}`;
      }
    } catch (err) {
      return `Erro na ferramenta: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // ─── Aprovacao ────────────────────────────────────────────────────────────

  async review(context: string, previousOutput: string): Promise<AgentDecision> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: `${this.buildSystemPrompt()}\n\nResponda SOMENTE em JSON: {"approved":true|false,"reasoning":"...","feedback":"..."}`,
      messages: [
        { role: 'user', content: `Contexto:\n${context}\n\nOutput:\n${previousOutput}\n\nRevise.` },
      ],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    try {
      const json = text.match(/\{[\s\S]*\}/)?.[0];
      return JSON.parse(json!) as AgentDecision;
    } catch {
      return { approved: true, reasoning: 'Aprovado (parse error)' };
    }
  }

  // ─── Chat ─────────────────────────────────────────────────────────────────

  async chat(userMessage: string, history: Anthropic.MessageParam[] = []): Promise<string> {
    const contextSummary = this.obsidian.buildContextSummary(this.config.vaultFolders);
    const sys = `${this.buildSystemPrompt()}\n\n## Vault\n${contextSummary || 'Vazio.'}`;

    let fullText = '';
    const stream = await this.client.messages.stream({
      model: this.model,
      max_tokens: 2048,
      system: sys,
      messages: [...history, { role: 'user', content: userMessage }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullText += event.delta.text;
      }
    }
    return fullText;
  }

  // ─── Hooks ────────────────────────────────────────────────────────────────

  protected async afterExecute(_task: AgentTask, _result: string): Promise<void> {}

  protected loadVaultContext(): string {
    return this.obsidian.buildContextSummary(this.config.vaultFolders);
  }

  // ─── Builders ─────────────────────────────────────────────────────────────

  protected buildSystemPrompt(): string {
    return `${this.config.systemPrompt}

## Contexto
- Empresa: **${this.companyName}** (CRM SaaS — NestJS backend, Next.js 15 frontend)
- Stack: NestJS 11, Next.js 15, TypeScript, PostgreSQL/Prisma, Redis/BullMQ, Tailwind CSS
- Repos: dattu-back-end, dattu-front-end
- Data: ${new Date().toLocaleDateString('pt-BR')}

## Formato de resposta
Seja CONCISO. Max 30 linhas. Sem tabelas decorativas. Direto ao ponto:
1. Decisao/acao (2-3 linhas)
2. Codigo ou referencia se necessario
3. Proximo passo (1 linha)`;
  }

  private buildMessages(task: AgentTask): Anthropic.MessageParam[] {
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
