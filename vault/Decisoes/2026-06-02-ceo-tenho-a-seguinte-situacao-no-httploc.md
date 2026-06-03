---
criado: 2026-06-02
atualizado: 2026-06-02
agente: ceo
cargo: CEO
tipo: decisao-executiva
status: Registrada
pipelineId: 8e534656-2ae4-490f-8dc9-51cae6a13bef
taskTitle: Tenho a seguinte situação, no http://localhost:3000/atendimento esta retornando alguns erros, 1 visualmente, a visualização esta quebrada, e esta dando erro quando tento iniciar uma conversa nova, não aparece os templates, e quando envio a mensagem livre da erro e não diz o porque e não consigo saber oque aconteceu.
---

Diagnóstico completo. Código real lido. Confirmo o que o PO mapeou — com um detalhe importante no Bug 1 que o histórico errou.

---

## ✅ APROVADO — 3 fixes, 1 PR, execução imediata

---

### Bug 1 — Layout quebrado (CRÍTICO)

O `mainSection.tsx` usa `overflow-y-auto h-full` — isso faz a `<main>` scrollar inteira, impedindo o flex interno do `/atendimento` de funcionar. A `page.tsx` já está correta com `flex flex-col h-full` e `flex-1 min-h-0` em todos os filhos. O problema é só no `mainSection` + o wrapper `pb-16`.

**Fix em `mainSection.tsx`:**
```tsx
// ANTES:
<main className="flex-1 p-2 overflow-y-auto overflow-x-hidden h-full">

// DEPOIS:
<main className="flex-1 overflow-hidden overflow-x-hidden flex flex-col min-h-0">
```

**Fix em `layout.tsx`:**
```tsx
// ANTES:
<div className="pb-16 md:pb-0">{children}</div>

// DEPOIS:
<div className="pb-16 md:pb-0 flex-1 flex flex-col min-h-0 overflow-hidden">{children}</div>
```

> ⚠️ O `p-2` do `mainSection` foi removido — validar visualmente todas as pages (dashboard, leads, etc.) que dependiam desse padding. Adicionar `p-2` diretamente nessas pages se necessário.

---

### Bug 2 — Templates vazios sem feedback

`StartConversationModal` já tem o `useEffect` correto com `listTemplates({ onlyApproved: true })`. O select simplesmente fica vazio sem orientação. Fix logo após o `<select>` de template:

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

`safeRequest.ts` linha 12 — `message` pode ser array vindo do class-validator do NestJS.

```ts
// DEPOIS (substituir o bloco AxiosError):
const raw =
  error.response?.data?.message ||
  error.response?.data?.error ||
  "Erro na requisição";
const message = Array.isArray(raw) ? raw.join(", ") : String(raw);
throw new Error(message);
```

---

**Próximo passo:** FE abre 1 PR com os 3 arquivos (`mainSection.tsx`, `layout.tsx`, `StartConversationModal.tsx`, `safeRequest.ts`), screenshot de `/atendimento`, `/dashboard` e `/leads` antes do merge.