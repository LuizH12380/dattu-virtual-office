---
criado: 2026-04-16
atualizado: 2026-04-16
agente: ux
cargo: UX Designer
tipo: ux-review
status: Aguardando Code Review
---

# Revisão UX — BLOQ-01: Auth httpOnly Cookie
**Revisor:** UX Designer — Dattu
**Data:** 16/04/2026
**Branch:** `feature/auth-httpcookie-bloq01`

---

## ⚠️ Nota Preliminar

O output do agente anterior foi **cortado** — o `LoginForm.tsx` está incompleto (a implementação para após `aria-invalid={Boolean(errors`). A revisão será feita com base no que foi entregue, sinalizando onde há lacunas.

---

## 1. Análise de UX da Implementação

### ✅ Pontos Fortes

| # | Ponto | Motivo |
|---|-------|--------|
| 1 | `aria-live="assertive"` no alerta de erro da API | Anuncia erro imediatamente para leitores de tela |
| 2 | `aria-invalid` + `aria-describedby` nos campos | Associação semântica correta entre campo e mensagem de erro |
| 3 | Campos desabilitados durante submit (`disabled={isLoggingIn}`) | Previne double-submit; feedback correto de estado |
| 4 | `noValidate` no form | Delega validação ao RHF, mantendo UX consistente |
| 5 | `autoComplete` nos campos | Melhora UX com gerenciadores de senha e autofill |
| 6 | Proteção de open redirect no `useLogin` | Não é UX direto, mas evita experiência de segurança degradada |
| 7 | Mensagens de erro contextualizadas por status HTTP | Usuário recebe feedback específico (401 ≠ 500 ≠ 429) |
| 8 | `mode: 'onBlur'` no RHF | Valida ao sair do campo — equilibrio entre feedback antecipado e não-invasivo |

### ❌ Pontos Fracos / Friction Points

| # | Problema | Impacto |
|---|----------|---------|
| 1 | **Sem `SessionExpiredToast`** — componente referenciado mas não implementado no output | Não é possível revisar |
| 2 | **Sem toggle "mostrar/ocultar senha"** | Friction alto — usuário não consegue conferir o que digitou |
| 3 | **Sem feedback visual de loading no botão** — implementação cortada, não confirma se há spinner | Usuário não sabe se o click foi registrado |
| 4 | **Sem link "Esqueci minha senha"** na tela de login | Rota `/forgot-password` existe no middleware, mas não aparece no form |
| 5 | **Logo via `<img>` sem fallback** | Quebra silenciosamente se SVG falhar — sem estado de erro visual |
| 6 | **`reset()` antes de `login()`** limpa o erro, mas não há animação de transição | Troca abrupta do estado de erro para loading |
| 7 | **`card-body gap-6`** pode ser insuficiente em telas muito pequenas (< 360px) | Densidade pode comprimir os elementos |
| 8 | **Validação de senha com `min(8)`** no login é equivocada — login deve aceitar qualquer senha e deixar o backend retornar 401 | False negatives bloqueiam usuário com senha antiga/migrada |

---

## 2. Melhorias de Usabilidade Priorizadas

### 🔴 P1 — Bloqueadores de Entrega

```
P1.1 — Botão de submit DEVE ter estado de loading visível
       Spec: spinner DaisyUI + texto "Entrando..." + disabled
       Sem isso: usuário pressiona múltiplas vezes achando que não funcionou

P1.2 — Toggle de visibilidade da senha
       Spec: ícone eye/eye-off à direita do input; aria-label dinâmico
       "Mostrar senha" / "Ocultar senha"
       type alterna entre 'password' e 'text'

P1.3 — Remover validação min(8) do schema Yup para o campo senha no LOGIN
       Mantém apenas required()
       Razão: autenticação valida credenciais, não força de senha
```

### 🟡 P2 — Alta Importância

```
P2.1 — Link "Esqueci minha senha" abaixo do campo de senha
       Alinhado à direita (padrão de mercado)
       href="/forgot-password"

P2.2 — SessionExpiredToast deve ser implementado e revisado
       Estado: aparece apenas se sessionStorage tem 'auth_redirect_reason'
       Auto-dismiss: 6 segundos
       Role: "status" (não assertive — não é crítico)
       Posição: topo da tela, z-50

P2.3 — Autofocus no campo de email ao montar o componente
       useEffect ou atributo autoFocus
       Reduz um clique no fluxo de login
```

### 🟢 P3 — Nice-to-Have

```
P3.1 — Animação de shake no card ao receber erro de credenciais
       CSS keyframe simples; reforça feedback sem ser invasivo

P3.2 — Contador de tentativas visível ao receber 429
       "Aguarde X segundos" com countdown (se o backend retornar Retry-After)

P3.3 — "Lembrar e-mail" com localStorage (não senha)
       Pré-preenche campo email na próxima visita
```

---

## 3. Especificação de Estados do Componente

### `LoginForm` — Máquina de Estados

```
┌─────────────┐    submit     ┌──────────────┐
│    IDLE      │ ──────────── ▶│   LOADING    │
│             │               │              │
│ Campos ativos│               │ Campos disab.│
│ Botão ativo │               │ Spinner btn  │
└─────────────┘               └──────┬───────┘
        ▲                            │
        │         ┌──────────────────┤
        │         │                  │
        │    onError             onSuccess
        │         │                  │
        │         ▼                  ▼
        │  ┌──────────────┐   ┌─────────────┐
        │  │    ERROR      │   │   SUCCESS   │
        │  │               │   │             │
        │  │ Alert visível │   │ Redirect    │
        │  │ Campos ativos │   │ (sem estado │
        │  │ reset() disp. │   │  visual)    │
        └──│               │   └─────────────┘
   reset() └──────────────┘
```

### Tabela de Estados por Elemento

| Elemento | `idle` | `loading` | `error` | `success` |
|----------|--------|-----------|---------|-----------|
| Input email | enabled | **disabled** | enabled, `input-error` se inválido | — |
| Input password | enabled | **disabled** | enabled | — |
| Botão submit | `btn-primary` | `btn-primary loading` + "Entrando..." | `btn-primary` | — |
| Alert de erro | hidden | hidden | **visible** + mensagem | hidden |
| Toggle senha | visible | **disabled** | visible | — |

### Estados do `SessionExpiredToast`

```
HIDDEN     → sessionStorage sem 'auth_redirect_reason'
VISIBLE    → sessionStorage com valor; auto-dismiss 6s
DISMISSED  → usuário fechou manualmente OU timer expirou
             → remove item do sessionStorage
```

---

## 4. Microinterações Sugeridas

```css
/* Shake no card ao receber erro 401/422 */
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%       { transform: translateX(-6px); }
  40%       { transform: translateX(6px); }
  60%       { transform: translateX(-4px); }
  80%       { transform: translateX(4px); }
}

.card-shake {
  animation: shake 0.4s ease-in-out;
}
```

```tsx
// Botão com estado de loading — spec mínima
<button
  type="submit"
  disabled={isLoggingIn}
  className={`btn btn-primary w-full ${isLoggingIn ? 'loading' : ''}`}
  aria-busy={isLoggingIn}
>
  {isLoggingIn ? 'Entrando...' : 'Entrar'}
</button>
```

```tsx
// Toggle de visibilidade da senha — spec mínima
const [showPassword, setShowPassword] = useState(false);

<div className="relative">
  <input
    type={showPassword ? 'text' : 'password'}
    /* ...outros props */
  />
  <button
    type="button"
    onClick={() => setShowPassword(prev => !prev)}
    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
    className="absolute right-3 top-1/2 -translate-y-1/2 text-base-content/50 hover:text-base-content"
    tabIndex={0}
  >
    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
  </button>
</div>
```

```tsx
// Alert de erro com transição suave
<div
  role="alert"
  aria-live="assertive"
  className="alert alert-error transition-all duration-200 ease-in-out"
>
```

---

## 5. Considerações de Acessibilidade (WCAG AA)

| Critério | Status | Ação Necessária |
|----------|--------|----------------|
| **1.4.3** Contraste de texto | ✅ DaisyUI dark garante ≥ 4.5:1 em `base-content` | Validar `text-error` no tema customizado |
| **1.3.1** Info e Relações | ✅ `label[for]` + `aria-describedby` implementados | — |
| **2.1.1** Teclado | ✅ Todos inputs nativos | Validar tab order: email → password → toggle → submit → forgot-password |
| **2.1.2** Sem armadilha de foco | ✅ Sem modals no fluxo | — |
| **3.3.1** Identificação de erro | ✅ `aria-invalid` + mensagem associada | — |
| **3.3.2** Labels ou instruções | ✅ Labels explícitas com `for` | — |
| **4.1.3** Mensagens de status | ⚠️ **Parcial** | `SessionExpiredToast` precisa de `role="status"` e não `role="alert"` (não é urgente) |
| **2.4.3** Ordem de foco | ⚠️ **A validar** | Toggle de senha inserido com `tabIndex={0}` precisa estar na ordem correta |
| **1.4.4** Redimensionar texto | ✅ Unidades relativas via Tailwind | — |
| **2.5.3** Label no nome | ⚠️ **Atenção** | Botão submit precisa de texto visível (não só ícone) durante loading — spec acima já contempla |

---

## 6. Decisão: Aprovação para Code Review

```
┌─────────────────────────────────────────────────────────────┐
│  STATUS: ⛔ NÃO APROVADO — AJUSTES P1 OBRIGATÓRIOS          │
└─────────────────────────────────────────────────────────────┘
```

### Ajustes obrigatórios antes do Code Review

- [ ] **P1.1** — Implementar estado de loading no botão submit (spinner + "Entrando..." + `aria-busy`)
- [ ] **P1.2** — Implementar toggle de visibilidade da senha com `aria-label` dinâmico
- [ ] **P1.3** — Remover `min(8)` do schema Yup no campo senha do **login** (mantém apenas `required()`)
- [ ] **Completar** o `LoginForm.tsx` — output foi cortado, não é possível confirmar o botão submit
- [ ] **Entregar** `SessionExpiredToast.tsx` para revisão

### Ajustes recomendados (podem ir em PR separado)

- [ ] **P2.1** — Link "Esqueci minha senha"
- [ ] **P2.3** — `autoFocus` no campo email

---

**Dependência de outro agente:** ✅ Sim
Após correção dos itens P1, o componente completo deve retornar ao **UX Designer** para revisão final antes de seguir para o **Tech Lead** (Code Review).