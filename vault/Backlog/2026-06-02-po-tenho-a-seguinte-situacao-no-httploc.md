---
criado: 2026-06-02
atualizado: 2026-06-02
agente: po
cargo: Product Owner
tipo: user-story
status: Aguardando CEO
pipelineId: 8e534656-2ae4-490f-8dc9-51cae6a13bef
taskTitle: Tenho a seguinte situação, no http://localhost:3000/atendimento esta retornando alguns erros, 1 visualmente, a visualização esta quebrada, e esta dando erro quando tento iniciar uma conversa nova, não aparece os templates, e quando envio a mensagem livre da erro e não diz o porque e não consigo saber oque aconteceu.
---

Diagnóstico confirmado. Todos os 3 bugs estão exatamente onde o histórico apontou. Aqui está a decisão final como PO:

---

## ✅ Decisão: 3 User Stories — execução imediata, 1 PR único

---

### US-01 · Layout quebrado em `/atendimento` — **MUST**
**Como** atendente, **quero** que a tela de atendimento ocupe a altura correta, **para** que lista e chat sejam usáveis sem scroll duplo.

**Causa real confirmada:**
- `mainSection.tsx` tem `h-full` + `overflow-y-auto` — conflita com o `flex flex-col h-full` da page
- O wrapper `<div className="pb-16 md:pb-0">` em `layout.tsx` quebra a propagação de altura

**Fix cirúrgico (menor risco, não afeta outras páginas):**
```tsx
// layout.tsx — trocar o wrapper existente:
<div className="pb-16 md:pb-0 h-full flex flex-col min-h-0">{children}</div>

// mainSection.tsx — substituir a <main>:
<main className="flex-1 overflow-hidden flex flex-col min-h-0">
```
> ⚠️ Validar visualmente em `/leads`, `/dashboard` após o fix — o `overflow-y-auto` removido pode impactar pages sem scroll próprio.

**AC:** Sidebar de conversas e thread de mensagens scrollam independentemente sem barra dupla.

---

### US-02 · Templates vazios sem feedback — **MUST**
**Como** atendente, **quero** saber por que o select de templates está vazio, **para** não ficar bloqueado sem entender o motivo.

**Causa real confirmada:** `StartConversationModal` faz `listTemplates({ onlyApproved: true })` → retorna `[]` → `<select>` mostra apenas "Selecione um template", sem nenhuma orientação.

**Fix — adicionar após o `<select>` de templates:**
```tsx
{templates.length === 0 && whatsappAccountId ? (
  <p className="text-xs text-warning mt-1">
    Nenhum template aprovado encontrado. Vá em{" "}
    <a href="/atendimento/templates" className="link link-primary">
      Atendimento → Templates
    </a>{" "}
    e clique em <strong>Sincronizar</strong>.
  </p>
) : null}
```

**AC:** Quando `templates.length === 0` e conta selecionada, mensagem orientativa aparece abaixo do select.

---

### US-03 · Erro de envio sem mensagem legível — **MUST**
**Como** atendente, **quero** ver a mensagem de erro real ao falhar um envio, **para** saber se é problema de janela 24h, template inválido etc.

**Causa real confirmada:** `safeRequest.ts` linha 10 — quando NestJS retorna `message` como **array** (validação class-validator), o `throw new Error(message)` gera `"[object Object]"`.

**Fix em `src/lib/safeRequest.ts`:**
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

**AC:** Toast de erro exibe texto legível em 100% dos casos, incluindo arrays de validação.

---

## Prioridade e escopo

| # | Arquivo | Impacto | Esforço |
|---|---------|---------|---------|
| US-01 | `mainSection.tsx` + `layout.tsx` | Alto | 15min |
| US-02 | `StartConversationModal.tsx` | Médio | 5min |
| US-03 | `safeRequest.ts` | Alto (global) | 5min |

**Métricas de sucesso:** zero reports de "tela quebrada" ou "erro sem mensagem" em `/atendimento` após deploy.

**Próximo passo:** FE abre 1 PR com os 3 fixes, inclui screenshot de `/atendimento`, `/leads` e `/dashboard` para validar regressão no layout.