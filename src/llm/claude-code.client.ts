import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

let seq = 0;

/**
 * Cliente que usa o Claude Code em modo headless (`claude -p`) como "cérebro"
 * dos agents — em vez da API paga da Anthropic. O uso é coberto pela assinatura
 * do Claude Code (sem ANTHROPIC_API_KEY).
 *
 * Expõe a MESMA superfície mínima que o base.agent.ts consumia da SDK Anthropic
 * (`messages.create` retornando `{ content:[{type:'text',text}], stop_reason }`),
 * para que a troca seja transparente.
 */

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CreateParams {
  system?: string;
  messages: LlmMessage[];
  max_tokens?: number;
}

export interface LlmTextBlock {
  type: 'text';
  text: string;
}

export interface LlmResponse {
  content: LlmTextBlock[];
  stop_reason: 'end_turn';
}

// Raiz do projeto Dattu (pasta acima do virtual-office) — dá ao claude -p
// acesso ao CLAUDE.md e aos repositórios ao rodar.
const DATTU_ROOT = path.resolve(process.cwd(), '..');
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const RUN_TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MS ?? 120_000);

interface ClaudeJsonResult {
  type: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  [k: string]: unknown;
}

/**
 * Roda `claude -p <userPrompt>` com o papel do agent injetado como system prompt
 * REAL (--system-prompt). Usa --setting-sources user para NÃO carregar o
 * CLAUDE.md do projeto (que sequestraria o agent, fazendo-o agir como "gerente
 * do escritório" em vez do papel específico).
 * Rejeita em timeout, exit code != 0, ou is_error no payload.
 */
function runClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Prompt do usuário vai via STDIN (evita o inferno de escape de shell no
    // Windows, que quebrava args longos com espaços/acentos no primeiro espaço).
    // System prompt (papel do agent) vai via arquivo temporário (--system-prompt-file),
    // também para não passar texto longo como argumento.
    // --setting-sources user: NÃO carrega o CLAUDE.md do projeto (que sequestraria
    // o agent para o papel de "gerente do escritório").
    const args = ['-p', '--output-format', 'json', '--setting-sources', 'user'];

    let sysFile: string | null = null;
    if (systemPrompt.trim()) {
      sysFile = path.join(os.tmpdir(), `dvo-sys-${process.pid}-${seq++}.txt`);
      fs.writeFileSync(sysFile, systemPrompt, 'utf-8');
      args.push('--system-prompt-file', sysFile);
    }

    const cleanup = () => { if (sysFile) { try { fs.unlinkSync(sysFile); } catch { /* ignore */ } } };

    const child = spawn(
      CLAUDE_BIN,
      args,
      { cwd: DATTU_ROOT, shell: process.platform === 'win32' },
    );

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let finished = false;

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill();
      cleanup();
      reject(new Error(`claude -p excedeu ${RUN_TIMEOUT_MS}ms`));
    }, RUN_TIMEOUT_MS);

    // Envia o prompt do usuário pelo stdin e fecha
    child.stdin.write(userPrompt);
    child.stdin.end();

    // Acumula os chunks como Buffer e só decodifica como UTF-8 no fim. Decodificar
    // por chunk (d.toString()) corrompe caracteres multibyte (—, acentos, emojis)
    // quando o stream os parte entre dois chunks — origem do mojibake nas notas.
    child.stdout.on('data', (d: Buffer) => { stdoutChunks.push(d); });
    child.stderr.on('data', (d: Buffer) => { stderrChunks.push(d); });

    child.on('error', (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      cleanup();
      reject(new Error(`Falha ao iniciar o Claude Code (${CLAUDE_BIN}): ${err.message}`));
    });

    child.on('close', (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      cleanup();

      const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
      const stderr = Buffer.concat(stderrChunks).toString('utf-8');

      if (code !== 0) {
        reject(new Error(`claude -p saiu com código ${code}: ${stderr.slice(0, 500)}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout) as ClaudeJsonResult;
        if (parsed.is_error) {
          reject(new Error(`Claude Code retornou erro: ${parsed.result ?? 'desconhecido'}`));
          return;
        }
        resolve((parsed.result ?? '').trim());
      } catch (err) {
        // Fallback: se não veio JSON válido, usa o stdout cru
        const raw = stdout.trim();
        if (raw) { resolve(raw); return; }
        reject(new Error(`Resposta do Claude Code não é JSON válido: ${(err as Error).message}`));
      }
    });
  });
}

/** Junta o histórico de mensagens num único prompt de usuário (sem o system). */
function buildUserPrompt(messages: LlmMessage[]): string {
  if (messages.length === 1) return messages[0].content;
  return messages
    .map((m) => {
      const tag = m.role === 'assistant' ? 'ASSISTENTE' : 'USUÁRIO';
      return `[${tag}]\n${m.content}`;
    })
    .join('\n\n');
}

export class ClaudeCodeClient {
  readonly messages = {
    create: async (params: CreateParams): Promise<LlmResponse> => {
      const text = await runClaude(params.system ?? '', buildUserPrompt(params.messages));
      return { content: [{ type: 'text', text }], stop_reason: 'end_turn' };
    },
  };
}
