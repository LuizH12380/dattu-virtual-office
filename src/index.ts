import 'dotenv/config';
import * as readline from 'readline';
import Anthropic from '@anthropic-ai/sdk';
import { ObsidianService } from './obsidian/obsidian.service';
import { Orchestrator } from './orchestrator/orchestrator';
import { AgentRole, OrchestratorRequest } from './types';

// ─── Validação de ambiente ─────────────────────────────────────────────────

function validateEnv(): void {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('\n[ERRO] ANTHROPIC_API_KEY não configurada.');
    console.error('Copie .env.example para .env e adicione sua chave.\n');
    process.exit(1);
  }
}

// ─── UI helpers ────────────────────────────────────────────────────────────

function printBanner(): void {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║          ESCRITÓRIO VIRTUAL — ${(process.env.COMPANY_NAME ?? 'Dattu').padEnd(26)}║
║          Powered by Claude + Obsidian                    ║
╚══════════════════════════════════════════════════════════╝
`);
}

function printHelp(): void {
  console.log(`
Comandos disponíveis:
  /tarefa <descrição>          → Orquestra automaticamente entre agentes
  /reunião <tema>              → Realiza reunião entre todos os agentes
  /chat <agente>               → Conversa direta com um agente
  /buscar <termo>              → Busca no vault do Obsidian
  /agentes                     → Lista os agentes disponíveis
  /vault                       → Mostra resumo do vault
  /ajuda                       → Mostra esta mensagem
  /sair                        → Encerra o escritório

Agentes: hr | creative | strategy | meetings | documents

Exemplos:
  /tarefa Contratar um desenvolvedor fullstack
  /tarefa Criar campanha de lançamento do produto X
  /tarefa Decidir entre migrar para microserviços ou monolito
  /reunião Planejamento do Q3
  /chat strategy
  /buscar onboarding
`);
}

function printResult(result: { taskId: string; summary: string; agentsInvolved: AgentRole[]; notesCreated: string[]; nextSteps: string[] }): void {
  console.log('\n' + '─'.repeat(60));
  console.log(`[Resultado — Tarefa ${result.taskId.slice(0, 8)}]`);
  console.log(`Agentes: ${result.agentsInvolved.join(', ')}`);
  if (result.notesCreated.length > 0) {
    console.log(`Notas criadas no vault: ${result.notesCreated.length}`);
  }
  if (result.nextSteps.length > 0) {
    console.log('\nPróximos passos:');
    result.nextSteps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  }
  console.log('─'.repeat(60) + '\n');
}

// ─── REPL principal ────────────────────────────────────────────────────────

async function startREPL(orchestrator: Orchestrator, obsidian: ObsidianService): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\n[Escritório] ',
  });

  const chatHistories = new Map<AgentRole, Anthropic.MessageParam[]>();
  let chatMode: AgentRole | null = null;

  printHelp();
  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    try {
      // ── Modo chat com agente específico ────────────────────────────────
      if (chatMode) {
        if (input === '/sair' || input === '/exit') {
          chatMode = null;
          console.log('\n[Sistema] Saindo do modo chat. De volta ao escritório.\n');
          rl.setPrompt('\n[Escritório] ');
          rl.prompt();
          return;
        }

        const history = chatHistories.get(chatMode) ?? [];
        const response = await orchestrator.chatWithAgent(chatMode, input, history);

        history.push({ role: 'user', content: input });
        history.push({ role: 'assistant', content: response });
        chatHistories.set(chatMode, history.slice(-20)); // Mantém últimas 20 mensagens

        rl.prompt();
        return;
      }

      // ── Comandos do escritório ──────────────────────────────────────────
      if (input.startsWith('/chat ')) {
        const role = input.slice(6).trim() as AgentRole;
        const validRoles: AgentRole[] = ['hr', 'creative', 'strategy', 'meetings', 'documents'];
        if (!validRoles.includes(role)) {
          console.log(`\nAgente inválido. Use: ${validRoles.join(', ')}`);
        } else {
          chatMode = role;
          const agentName = orchestrator.getAgent(role)?.name ?? role;
          rl.setPrompt(`\n[${agentName}] `);
          console.log(`\n[Sistema] Modo chat com ${agentName}. Digite /sair para voltar.\n`);
        }

      } else if (input.startsWith('/tarefa ')) {
        const task = input.slice(8).trim();
        const request: OrchestratorRequest = { task, priority: 'medium' };
        const result = await orchestrator.process(request);
        printResult(result);

      } else if (input.startsWith('/reunião ') || input.startsWith('/reuniao ')) {
        const topic = input.replace(/^\/reuni[ãa]o\s+/, '').trim();
        const result = await orchestrator.holdMeeting(topic, ['strategy', 'hr', 'creative']);
        printResult(result);

      } else if (input.startsWith('/buscar ')) {
        const query = input.slice(8).trim();
        const notes = obsidian.searchNotes(query);
        if (notes.length === 0) {
          console.log(`\nNenhuma nota encontrada para: "${query}"\n`);
        } else {
          console.log(`\nEncontradas ${notes.length} notas para "${query}":`);
          notes.slice(0, 10).forEach((n) => {
            console.log(`  • ${n.path}`);
          });
          console.log();
        }

      } else if (input === '/agentes') {
        console.log('\nAgentes disponíveis:');
        orchestrator.listAgents().forEach(({ role, name }) => {
          console.log(`  [${role}] ${name}`);
        });
        console.log();

      } else if (input === '/vault') {
        const summary = obsidian.buildContextSummary(
          ['Decisoes', 'Reunioes', 'Time', 'Criativos', 'Processos', 'Ideias'],
          2,
        );
        console.log('\n' + (summary || 'Vault ainda vazio. Use /tarefa para começar!') + '\n');

      } else if (input === '/ajuda' || input === '/help') {
        printHelp();

      } else if (input === '/sair' || input === '/exit') {
        console.log('\n[Escritório] Encerrando. Até logo!\n');
        rl.close();
        process.exit(0);

      } else if (!input.startsWith('/')) {
        // Texto livre → vai para o orquestrador
        const result = await orchestrator.process({ task: input, priority: 'medium' });
        printResult(result);

      } else {
        console.log(`\nComando desconhecido: ${input}. Use /ajuda para ver os comandos.\n`);
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n[ERRO] ${msg}\n`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

// ─── Modo batch via args ───────────────────────────────────────────────────

async function runBatch(orchestrator: Orchestrator, task: string): Promise<void> {
  const args = process.argv.slice(2);
  const priorityArg = args.find((a) => a.startsWith('--priority='));
  const priority = (priorityArg?.split('=')[1] ?? 'medium') as OrchestratorRequest['priority'];

  const result = await orchestrator.process({ task, priority });

  console.log('\n' + '─'.repeat(60));
  console.log('RESULTADO:');
  console.log(result.summary);
  console.log('─'.repeat(60));
  console.log('Agentes:', result.agentsInvolved.join(', '));
  console.log('Notas criadas:', result.notesCreated.length);
  if (result.nextSteps.length > 0) {
    console.log('Próximos passos:', result.nextSteps.join('; '));
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  validateEnv();
  printBanner();

  const obsidian = new ObsidianService();
  const orchestrator = new Orchestrator(obsidian);

  const args = process.argv.slice(2);
  const taskArg = args.find((a) => a.startsWith('--task='));

  if (taskArg) {
    const task = taskArg.split('=').slice(1).join('=');
    await runBatch(orchestrator, task);
  } else {
    await startREPL(orchestrator, obsidian);
  }
}

main().catch((err) => {
  console.error('[FATAL]', err instanceof Error ? err.message : err);
  process.exit(1);
});
