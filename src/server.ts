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

  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // ─── REST ──────────────────────────────────────────────────────────────────

  app.get('/api/agents', (_req, res) => {
    res.json(orchestrator.listAgents());
  });

  app.get('/api/pipeline', (_req, res) => {
    res.json(orchestrator.getPipeline());
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
    const { task, priority, context, mode, startFrom, involveAgents } = req.body as {
      task: string;
      priority?: string;
      context?: string;
      mode?: 'pipeline' | 'direct';
      startFrom?: AgentRole;
      involveAgents?: AgentRole[];
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
        mode,
        startFrom,
        involveAgents,
      });
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // ─── Socket.IO ────────────────────────────────────────────────────────────

  const chatHistories = new Map<string, Anthropic.MessageParam[]>();

  io.on('connection', (socket) => {
    socket.emit('vault:stats', orchestrator.getVaultStats());
    socket.emit('agents:list', orchestrator.listAgents());
    socket.emit('pipeline:definition', orchestrator.getPipeline());

    socket.on('task:submit', async (data: { task: string; priority?: string; context?: string; mode?: 'pipeline' | 'direct'; startFrom?: AgentRole; involveAgents?: AgentRole[] }) => {
      if (!data.task?.trim()) return;
      try {
        await orchestrator.process({
          task: data.task,
          priority: (data.priority ?? 'medium') as 'low' | 'medium' | 'high' | 'urgent',
          context: data.context,
          mode: data.mode ?? 'pipeline',
          startFrom: data.startFrom,
          involveAgents: data.involveAgents,
        });
      } catch (err) {
        socket.emit('error', { message: err instanceof Error ? err.message : String(err) });
      }
    });

    socket.on('chat:message', async (data: { role: AgentRole; message: string }) => {
      if (!data.message?.trim() || !data.role) return;

      const historyKey = `${socket.id}-${data.role}`;
      const history = chatHistories.get(historyKey) ?? [];

      try {
        socket.emit('agent:typing', { role: data.role });
        const response = await orchestrator.chatWithAgent(data.role, data.message, history);
        history.push({ role: 'user', content: data.message });
        history.push({ role: 'assistant', content: response });
        chatHistories.set(historyKey, history.slice(-20));
        socket.emit('chat:response', { role: data.role, message: response });
      } catch (err) {
        socket.emit('error', { message: err instanceof Error ? err.message : String(err) });
      }
    });

    socket.on('disconnect', () => {
      for (const key of chatHistories.keys()) {
        if (key.startsWith(socket.id)) chatHistories.delete(key);
      }
    });
  });

  // ─── Repassa eventos do Orchestrator → Socket.IO ──────────────────────────

  orchestrator.on('log',              (d) => io.emit('log', { ...d, timestamp: new Date().toISOString() }));
  orchestrator.on('task:start',       (d) => io.emit('task:start', d));
  orchestrator.on('task:done',        (d) => { io.emit('task:done', d); io.emit('vault:stats', orchestrator.getVaultStats()); });
  orchestrator.on('pipeline:start',   (d) => io.emit('pipeline:start', d));
  orchestrator.on('pipeline:stage',   (d) => io.emit('pipeline:stage', d));
  orchestrator.on('pipeline:done',    (d) => io.emit('pipeline:done', d));
  orchestrator.on('agent:start',      (d) => io.emit('agent:start', d));
  orchestrator.on('agent:done',       (d) => io.emit('agent:done', d));
  orchestrator.on('agent:error',      (d) => io.emit('agent:error', d));
  orchestrator.on('agent:rejected',   (d) => io.emit('agent:rejected', d));
  orchestrator.on('note:created',     (d) => io.emit('note:created', d));
  orchestrator.on('vault:stats',      (d) => io.emit('vault:stats', d));

  httpServer.listen(PORT, () => {
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║  Dattu Core Team — Escritório Virtual        ║`);
    console.log(`║  http://localhost:${PORT}                      ║`);
    console.log(`╚══════════════════════════════════════════════╝\n`);
  });
}

main().catch((err) => {
  console.error('[FATAL]', err instanceof Error ? err.message : err);
  process.exit(1);
});
