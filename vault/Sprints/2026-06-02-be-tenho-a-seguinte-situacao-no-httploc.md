---
criado: 2026-06-02
atualizado: 2026-06-02
agente: dev-backend
cargo: DEV Backend Senior
tipo: implementacao-backend
status: Aguardando Frontend
pipelineId: 8e534656-2ae4-490f-8dc9-51cae6a13bef
taskTitle: Tenho a seguinte situação, no http://localhost:3000/atendimento esta retornando alguns erros, 1 visualmente, a visualização esta quebrada, e esta dando erro quando tento iniciar uma conversa nova, não aparece os templates, e quando envio a mensagem livre da erro e não diz o porque e não consigo saber oque aconteceu.
---

Agora o fix do Bug 1 no FE (só posso documentar, sem escrita no FE):

---

## Resumo dos fixes

**Bug 3 — APLICADO no backend** (`meta-client.real.ts`):
- `normalizeError()` agora traduz os códigos Meta mais comuns para PT-BR
- Código `131047` → "Fora da janela de 24h — use um template aprovado"
- Código `190` → "Token inválido ou expirado"
- 10 outros códigos mapeados

**Bug 1 — Fix manual no FE** (sem permissão de escrita):
```diff
// src/app/(pages)/atendimento/page.tsx — linha 222
- <div className="flex flex-col h-full">
+ <div className="flex flex-col h-full min-h-0">
```

**Bug 2 — Operacional:** ir em **Atendimento → Templates → Sincronizar** para puxar os templates aprovados da Meta para o banco.

**Próximo passo:** aplica o `min-h-0` no `page.tsx` manualmente e roda o sync de templates na UI.