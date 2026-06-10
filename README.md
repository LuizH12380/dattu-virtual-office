# Dattu — Escritório Virtual

Escritório virtual com bonecos pixel-art: 10 agents de IA (PO, CEO, Tech Lead, UX, DevOps, Data Analyst, Dev Backend, Dev Frontend, Revisor, Documentador) que trabalham numa sala visual, reagindo em tempo real (🟡 trabalhando / 🟢 pronto / 🔴 erro), com feed, chat por agente, kanban e grafo do vault.

## Cérebro: Claude Code (sem API paga)

O "cérebro" dos agents é o **Claude Code em modo headless** (`claude -p`), coberto pela sua **assinatura** — **não usa a API paga** nem precisa de `ANTHROPIC_API_KEY`. Cada agent roda com seu papel injetado via `--system-prompt-file` e isolado do `CLAUDE.md` do projeto (`--setting-sources user`). Ver `src/llm/claude-code.client.ts`.

> Pré-requisito: ter o **Claude Code** instalado e logado (`claude` no PATH). Teste: `claude -p "oi"`.

## Como rodar

```bash
npm install
npm run web      # sobe o servidor em http://localhost:3050
```

Abra **http://localhost:3050** no navegador. Você verá a sala com os 10 bonecos.

- **Chat com um agent:** clique no boneco → escreva → ele responde no papel.
- **Pipeline completo:** envie uma tarefa na UI → os bonecos acendem em sequência (PO → ... → Documentador), o feed enche, e as notas são salvas no `vault/`.

## CLI (alternativa ao navegador)

```bash
npm run office   # modo terminal interativo
```

## Como funciona (resumo técnico)

- `server.ts` — express + socket.io; serve o `public/index.html` e expõe `/api/task`, `/api/agents` etc. Emite eventos socket (`agent:start`, `agent:done`...) que o front usa para animar os bonecos. **O front não muda quando o cérebro muda.**
- `orchestrator.ts` — roda o pipeline (PO→CEO→DataAnalyst→DevBackend→DevFrontend→UX→Revisor→TechLead→DevOps→Documentador) ou modo direto; CEO e Tech Lead podem rejeitar e devolver.
- `agents/*.agent.ts` — cada papel (system prompt + pasta do vault).
- `llm/claude-code.client.ts` — o adapter que fala com o `claude -p` (prompt do usuário via stdin, papel via arquivo temporário).
- `obsidian/obsidian.service.ts` — lê/escreve as notas no `vault/` (Obsidian).

## Trade-offs (honestos)

- **Por passo, não streaming:** o balão/feed aparece quando o agent termina o passo (não palavra-por-palavra).
- **Performance:** cada passo leva ~5–30s (cold start + inferência do Claude Code). Um pipeline de 10 agents pode levar alguns minutos — o status "trabalhando" cobre a espera.
- **Sob comando, não 24/7:** os agents agem quando você envia uma tarefa na UI; não há autonomia em segundo plano.
- **Não editam código nos repos** nesta versão (produzem texto: planos, decisões, reviews). Fazer bonecos editarem o código real é um passo futuro.

## Variáveis de ambiente (`.env`, todas opcionais)

- `PORT` (default 3050) · `COMPANY_NAME` (default Dattu) · `OBSIDIAN_VAULT_PATH` (vazio = `./vault/`)
- `CLAUDE_BIN` (default `claude`) · `CLAUDE_TIMEOUT_MS` (default 120000)
