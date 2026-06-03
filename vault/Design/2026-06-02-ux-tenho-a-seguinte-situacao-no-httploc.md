---
criado: 2026-06-02
atualizado: 2026-06-02
agente: ux
cargo: UX Designer
tipo: ux-review
status: Aguardando Code Review
pipelineId: 8e534656-2ae4-490f-8dc9-51cae6a13bef
taskTitle: Tenho a seguinte situação, no http://localhost:3000/atendimento esta retornando alguns erros, 1 visualmente, a visualização esta quebrada, e esta dando erro quando tento iniciar uma conversa nova, não aparece os templates, e quando envio a mensagem livre da erro e não diz o porque e não consigo saber oque aconteceu.
---

Tenho tudo. Diagnóstico completo.

---

## ✅ Revisão UX — `/atendimento` — 3 bugs, análise direta

---

### 🔴 Bug 1 — Layout quebrado *(visual)*

**Causa:** `MainSectionComponent` tem `overflow-hidden` + `flex-col` + `min-h-0` ✅, mas o wrapper `isFullHeight` no `layout.tsx` **já está correto** (`flex flex-col h-full min-h-0`). O problema real é que o próprio `page.tsx` usa `<div className="flex flex-col h-full">` **sem `min-h-0`** na raiz — em flex containers, sem `min-h-0` o filho ignora o limite do pai e estoura.

**Fix — `page.tsx` linha 1 do return:**
```tsx
// ❌ antes
<div className="flex flex-col h-full">

// ✅ depois
<div className="flex flex-col h-full min-h-0">
```

---

### 🟡 Bug 2 — Templates não aparecem ao iniciar conversa

**Causa:** `StartConversationModal` carrega templates **só após `whatsappAccountId` ser definido**. Se houver apenas 1 conta ativa ela é pré-selecionada, mas se houver 0 ou o `listTemplates` retornar vazio, o usuário só vê `"Nenhum template aprovado encontrado"` com um link para sincronizar — **sem feedback de carregamento visível no select** (o spinner está sobreposto, mas o `select` fica desabilitado sem mensagem clara).

**Além disso:** `TemplatePickerModal` (dentro de conversa aberta) quando templates = 0, exibe `"Nenhum template aprovado. Vá em Configurações e sincronize."` — sem link clicável, sem ação direta. Inconsistência de tom com o `StartConversationModal` que tem link.

**Fix `TemplatePickerModal.tsx` ~linha 70:**
```tsx
// ❌ antes
<p className="p-4 text-sm text-base-content/60">
  Nenhum template aprovado. Vá em Configurações e sincronize.
</p>

// ✅ depois
<div className="p-4 space-y-2">
  <p className="text-sm text-base-content/60">
    Nenhum template aprovado encontrado.
  </p>
  <a href="/atendimento/templates" className="btn btn-sm btn-outline btn-primary w-full">
    Ir para Templates → Sincronizar
  </a>
</div>
```

---

### 🔴 Bug 3 — Erro mudo ao enviar mensagem livre

**Causa:** O `handleSend` em `page.tsx` **já foi corrigido** — tem `toast.error(errMsg)` com mensagem real do `err.message`. Porém o `sendMessage` do service pode lançar um erro genérico sem mensagem legível dependendo de como o `api client` trata erros 4xx/5xx. O usuário vê `"Erro ao enviar mensagem"` sem contexto.

**Verificação necessária no service:**
```ts
// Confirmar que o client interceptor relança err.response.data.message
// Se não, o catch genérico em handleSend sempre cai no fallback
```

**Fix recomendado em `handleSend`:**
```tsx
} catch (err) {
  const errMsg =
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message
    ?? (err instanceof Error ? err.message : "Erro ao enviar mensagem");
  toast.error(errMsg, { id: "whatsapp-send-message", duration: 6000 });
}
```

---

## Pontos Fortes
- `min-h-0` na cadeia `MainSection → layout wrapper` está correto — o problema é isolado no `page.tsx`
- Feedback de loading nos templates com spinner sobreposto no select: criativo, funciona
- Toast com `id` fixo evita duplicação: padrão correto aplicado em todo o arquivo
- `StartConversationModal` tem aviso de janela 24h em texto livre: excelente orientação contextual

## Decisão
**Aprovado com 3 ajustes obrigatórios antes de ir pra produção.** Bug 1 e Bug 3 são regressões que bloqueiam uso. Bug 2 é UX degradado mas não bloqueia.

**Próximo passo:** FE aplica os 3 fixes em 1 PR único — Bug 1 (1 linha), Bug 2 (link no TemplatePickerModal), Bug 3 (extração de `response.data.message` no catch).