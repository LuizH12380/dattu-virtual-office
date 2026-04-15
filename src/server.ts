import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { ObsidianService } from './obsidian/obsidian.service';
import { Orchestrator } from './orchestrator/orchestrator';
import { AgentRole } from './types';

const PORT = Number(process.env.PORT ?? 3001);

function validateEnv(): void {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[ERRO] ANTHROPIC_API_KEY não configurada no .env');
    process.exit(1);
  }
}

async function main(): Promise<void> {
  validateEnv();

  const app = express();
  const httpServer = createServer(app);
  const io = new SocketIO(httpServer, { cors: { origin: '*' } });

  const obsidian = new ObsidianService();
  const orchestrator = new Orchestrator(obsidian);

  // ─── Servir frontend estático ──────────────────────────────────────────────
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // ─── REST endpoints ────────────────────────────────────────────────────────

  app.get('/api/agents', (_req, res) => {
    res.json(orchestrator.listAgents());
  });

  app.get('/api/vault/stats', (_req, res) => {
    res.json(orchestrator.getVaultStats());
  });

  app.get('/api/vault/notes/:folder', (req, res) => {
    const notes = obsidian.listNotes(req.params.folder).slice(0, 20).map((n) => ({
      path: n.path,
      filename: n.filename,
      frontmatter: n.frontmatter,
      preview: n.content.replace(/^---[\s\S]*?---\n/, '').slice(0, 200),
      updatedAt: n.updatedAt,
    }));
    res.json(notes);
  });

  app.post('/api/task', async (req, res) => {
    const { task, priority, context } = req.body as {
      task: string;
      priority?: string;
      context?: string;
    };

    if (!task?.trim()) {
      res.status(400).json({ error: 'Campo "task" é obrigatório' });
      return;
    }

    try {
      const result = await orchestrator.process({
        task,
        priority: (priority ?? 'medium') as 'low' | 'medium' | 'high' | 'urgent',
        context,
      });
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/meeting', async (req, res) => {
    const { topic, participants } = req.body as {
      topic: string;
      participants?: AgentRole[];
    };

    if (!topic?.trim()) {
      res.status(400).json({ error: 'Campo "topic" é obrigatório' });
      return;
    }

    try {
      const result = await orchestrator.holdMeeting(
        topic,
        participants ?? ['strategy', 'hr', 'creative'],
      );
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // ─── Socket.IO — chat em tempo real ───────────────────────────────────────

  const chatHistories = new Map<string, Anthropic.MessageParam[]>();

  io.on('connection', (socket) => {
    // Envia estado inicial
    socket.emit('vault:stats', orchestrator.getVaultStats());
    socket.emit('agents:list', orchestrator.listAgents());

    socket.on('task:submit', async (data: { task: string; priority?: string; context?: string }) => {
      if (!data.task?.trim()) return;

      try {
        await orchestrator.process({
          task: data.task,
          priority: (data.priority ?? 'medium') as 'low' | 'medium' | 'high' | 'urgent',
          context: data.context,
        });
        // Atualiza stats do vault após tarefa
        socket.emit('vault:stats', orchestrator.getVaultStats());
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        socket.emit('error', { message: msg });
      }
    });

    socket.on('meeting:start', async (data: { topic: string; participants?: AgentRole[] }) => {
      if (!data.topic?.trim()) return;

      try {
        await orchestrator.holdMeeting(
          data.topic,
          data.participants ?? ['strategy', 'hr', 'creative'],
        );
        socket.emit('vault:stats', orchestrator.getVaultStats());
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        socket.emit('error', { message: msg });
      }
    });

    socket.on('chat:message', async (data: { role: AgentRole; message: string; sessionId: string }) => {
      if (!data.message?.trim() || !data.role) return;

      const historyKey = `${socket.id}-${data.role}`;
      const history = chatHistories.get(historyKey) ?? [];

      try {
        socket.emit('agent:typing', { role: data.role });

        let fullResponse = '';
        // Streaming via agent.chat (já faz o stream internamente, aqui capturamos o resultado)
        const response = await orchestrator.chatWithAgent(data.role, data.message, history);
        fullResponse = response;

        history.push({ role: 'user', content: data.message });
        history.push({ role: 'assistant', content: fullResponse });
        chatHistories.set(historyKey, history.slice(-20));

        socket.emit('chat:response', { role: data.role, message: fullResponse });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        socket.emit('error', { message: msg });
      }
    });

    socket.on('disconnect', () => {
      // Limpa histórico do cliente
      for (const key of chatHistories.keys()) {
        if (key.startsWith(socket.id)) chatHistories.delete(key);
      }
    });
  });

  // ─── Repassa eventos do Orchestrator para Socket.IO ───────────────────────

  orchestrator.on('log', (data) => {
    io.emit('log', { ...data, timestamp: new Date().toISOString() });
  });

  orchestrator.on('task:start', (data) => io.emit('task:start', data));
  orchestrator.on('task:routed', (data) => io.emit('task:routed', data));
  orchestrator.on('task:done', (data) => {
    io.emit('task:done', data);
    io.emit('vault:stats', orchestrator.getVaultStats());
  });

  orchestrator.on('agent:start', (data) => io.emit('agent:start', data));
  orchestrator.on('agent:done', (data) => io.emit('agent:done', data));
  orchestrator.on('agent:error', (data) => io.emit('agent:error', data));
  orchestrator.on('note:created', (data) => io.emit('note:created', data));

  // ─── Inicia servidor ───────────────────────────────────────────────────────

  httpServer.listen(PORT, () => {
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║  Escritório Virtual — ${(process.env.COMPANY_NAME ?? 'Dattu').padEnd(21)}║`);
    console.log(`║  http://localhost:${PORT}                      ║`);
    console.log(`╚══════════════════════════════════════════════╝\n`);
  });
}

main().catch((err) => {
  console.error('[FATAL]', err instanceof Error ? err.message : err);
  process.exit(1);
});
