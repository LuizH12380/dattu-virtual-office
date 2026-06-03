---
criado: 2026-06-02
atualizado: 2026-06-02
agente: data-analyst
cargo: Analista de Dados
tipo: analise-dados
status: Entregue ao Backend
pipelineId: 8e534656-2ae4-490f-8dc9-51cae6a13bef
taskTitle: Tenho a seguinte situação, no http://localhost:3000/atendimento esta retornando alguns erros, 1 visualmente, a visualização esta quebrada, e esta dando erro quando tento iniciar uma conversa nova, não aparece os templates, e quando envio a mensagem livre da erro e não diz o porque e não consigo saber oque aconteceu.
---

Diagnóstico completo. Código real lido. Confirmo o que o histórico mapeou — com os detalhes exatos do estado atual.

---

## ✅ 3 bugs confirmados — 1 PR, execução imediata

---

### Bug 1 — Layout quebrado (CRÍTICO)

**Causa real:** `mainSection.tsx` tem `overflow-y-auto h-full` — a `<main>` absorve todo o scroll, impedindo o `flex flex-col h-full` do `page.tsx` funcionar. O `layout.tsx` também envolve `children` num `<div>` sem `flex flex-col`.

**Fix `mainSection.tsx`:**
```tsx
// linha 16 — ANTES:
<main className="flex-1 p-2 overflow-y-auto overflow-x-hidden h-full">

// DEPOIS:
<main className="flex-1 overflow-hidden flex flex-col min-h-0">
```
> ⚠️ `p-2` removido — adicionar `p-2` nas pages que dependiam (dashboard, leads, etc.).

**Fix `layout.tsx`:**
```tsx
// ANTES:
<div className="pb-16 md:pb-0">{children}</div>

// DEPOIS:
<div className="pb-16 md:pb-0 flex-1 flex flex-col min-h-0 overflow-hidden">{children}</div>
```

---

### Bug 2 — Templates vazios sem feedback

**Causa real:** `listTemplates({ whatsappAccountId, onlyApproved: true })` está correto. O select simplesmente fica vazio sem orientação ao usuário. Adicionar logo após o `<select>` de template em `StartConversationModal.tsx`:

```tsx
{templates.length === 0 && whatsappAccountId ? (
  <p className="text-xs text-warning mt-1">
    Nenhum template aprovado. Vá em{" "}
    <a href="/atendimento/templates" className="link link-primary">
      Atendimento → Templates
    </a>{" "}
    e clique em <strong>Sincronizar</strong>.
  </p>
) : null}
```

---

### Bug 3 — Erro de envio ilegível

**Causa real:** `safeRequest.ts` linha 12 — `error.response?.data?.message` pode ser **array** vindo do class-validator do NestJS (ex: `["phone must be a valid phone number"]`). O `throw new Error(array)` vira `"[object Object]"`.

**Fix `safeRequest.ts`:**
```ts
// ANTES:
const message =
  error.response?.data?.message ||
  error.response?.data?.error ||
  "Erro na requisição";
throw new Error(message);

// DEPOIS:
const raw =
  error.response?.data?.message ||
  error.response?.data?.error ||
  "Erro na requisição";
const message = Array.isArray(raw) ? raw.join(", ") : String(raw);
throw new Error(message);
```

---

**Próximo passo:** FE abre 1 PR com 4 arquivos (`mainSection.tsx`, `layout.tsx`, `StartConversationModal.tsx`, `safeRequest.ts`) + screenshot de `/atendimento`, `/dashboard` e `/leads` antes do merge para validar remoção do `p-2`.