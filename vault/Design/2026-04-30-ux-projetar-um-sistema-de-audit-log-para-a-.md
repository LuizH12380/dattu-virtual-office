---
criado: 2026-04-30
atualizado: 2026-04-30
agente: ux
cargo: UX Designer
tipo: ux-review
status: Aguardando Code Review
pipelineId: undefined
taskTitle: undefined
---

Tenho contexto suficiente. Conheço o design system, os padrões de página, a estrutura de navegação e os componentes reutilizáveis. Vou entregar a revisão UX + o plano de UX para o Audit Log.

---

# Revisão UX — Plano de Interface: Audit Log Dattu CRM

## Diagnóstico do design system atual

O sistema tem padrões consolidados que o Audit Log **deve seguir obrigatoriamente**:

**Padrões identificados:**
- Páginas de lista = `section.rounded-2xl.border.border-base-300/60.bg-base-100.p-6.shadow-sm`
- Filtros = grid de labels com `rounded-xl border border-base-300/50 bg-base-200/30 p-3`
- Linhas de item = cards `rounded-2xl` com hover `border-primary/30`
- Header = `<PagesHeaderComponent title="..." buttons={[...]} />`
- Paginação = `<PaginatorComponent />` (skip/take, não radio buttons do ManagerPage — esse está fora do padrão)
- Empty state = ícone centralizado + texto `text-base-content/60`
- Skeleton loading = `animate-pulse` com `bg-base-300/60` (padrão do NotificationsPage)
- Cores semânticas: `text-success`, `text-error`, `text-warning`, `text-info` — nunca hardcoded hex

**Inconsistência detectada:** `ManagerPage` usa radio buttons para paginação em vez do `PaginatorComponent` — não replicar isso.

---

## Decisão de arquitetura UX

### Onde vive o Audit Log no menu?

```
ManagerMenu → novo MenuGroup "Auditoria" (FiShield)
  └─ /audit-log  →  "Registro de Auditoria"  (RxActivityLog já existente)
```

**Visibilidade:** `user.admin || user.role === 4` (SuperAdmin only no MVP). Role 2 (Gestor) pode ter acesso READ-ONLY na fase 2.

---

## MVP — Fase 1: Página `/audit-log`

### Estrutura da página (segue padrão Activities/Notifications)

```
<PagesHeaderComponent title="Registro de Auditoria" subtitle="Histórico de ações do sistema" />

<section> ← Filtros (padrão filter card)
  grid 4 colunas:
  - [Ator]     select → memberships
  - [Recurso]  select → LEAD | USER | BOARD | TASK | MEMBERSHIP | ACCOUNT
  - [Ação]     select → CREATE | UPDATE | DELETE | LOGIN | EXPORT
  - [De / Até] DatePickerInput (já existe no Activities)
  + [Buscar] btn gradiente (cópia fiel do Activities)
  + [Limpar]  btn-ghost

<section> ← Lista de eventos (cards, não table)
  Cada card:
  ┌─────────────────────────────────────────────────────┐
  │ [icon-ação]  AÇÃO · RECURSO          timestamp      │
  │              "Nome do Ator"                          │
  │              Descrição curta do evento               │
  │              [Ver detalhes →]                        │
  └─────────────────────────────────────────────────────┘

<PaginatorComponent /> ← padrão
```

### Mapeamento visual de ações (semântica de cor do sistema)

```ts
const ACTION_CONFIG = {
  CREATE: { icon: FiPlus,     colorClass: "text-success", bgClass: "bg-success/10" },
  UPDATE: { icon: FiEdit2,    colorClass: "text-info",    bgClass: "bg-info/10"    },
  DELETE: { icon: FiTrash2,   colorClass: "text-error",   bgClass: "bg-error/10"   },
  LOGIN:  { icon: FiLogIn,    colorClass: "text-primary", bgClass: "bg-primary/10" },
  EXPORT: { icon: FiDownload, colorClass: "text-warning", bgClass: "bg-warning/10" },
} satisfies Record<AuditAction, ActionConfig>
```

> ⚠️ **Nunca usar hex hardcoded.** Usar tokens DaisyUI (`text-success`, `bg-error/10`). O Activities tem `bg-gradient-to-r from-[#4C1D95]` no botão de busca — isso é aceitável apenas nesse botão pois replica o padrão existente, mas não deve se espalhar.

### Card de evento — estrutura JSX modelo

```tsx
<div className="bg-base-100 rounded-2xl border border-base-300/60 p-5
                hover:border-primary/30 transition-all group cursor-pointer"
     onClick={() => openDetailDrawer(event)}>

  <div className="flex flex-col md:flex-row md:items-start gap-4">

    {/* Ícone semântico */}
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                     ${ACTION_CONFIG[event.action].bgClass}`}>
      <ActionIcon className={`${ACTION_CONFIG[event.action].colorClass} text-lg`} />
    </div>

    {/* Conteúdo */}
    <div className="flex-1 min-w-0">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        {/* badge de ação — DaisyUI badge, não px-3 py-1 custom */}
        <span className={`badge badge-sm ${ACTION_BADGE[event.action]}`}>
          {event.action}
        </span>
        <span className="text-xs text-base-content/40 uppercase tracking-widest">
          {event.resource}
        </span>
      </div>
      <p className="text-sm font-semibold text-base-content
                    group-hover:text-primary transition-colors">
        {event.actorName}
      </p>
      <p className="text-xs text-base-content/60 mt-0.5 line-clamp-2">
        {event.description}
      </p>
      <p className="text-xs text-base-content/35 mt-1">
        {formatDate(event.createdAt, true)}
      </p>
    </div>

    {/* Ação */}
    <button className="btn btn-sm btn-ghost gap-1 shrink-0 self-start">
      <FiEye size={14} /> Ver
    </button>
  </div>
</div>
```

### Drawer de detalhes (não modal)

O modal (`<dialog>`) é adequado para confirmações destrutivas (`deleteConfirmationModal`). Para visualização de detalhe rico → usar `Sheet` (já existe em `src/components/ui/sheet.tsx`).

```
<Sheet side="right" size="md">
  ┌─────────────────────────────────┐
  │ [X]  Detalhe do Evento          │
  │─────────────────────────────────│
  │ Ator:      João Silva           │
  │ Ação:      UPDATE               │
  │ Recurso:   LEAD #482            │
  │ Data/hora: 29/04/2026 14:23:01  │
  │ IP:        189.x.x.x            │
  │─────────────────────────────────│
  │ ANTES          DEPOIS           │
  │ status: novo   status: ganho    │
  │ valor: 0       valor: 5.000     │
  └─────────────────────────────────┘
```

O diff antes/depois é o diferencial de UX — exibe apenas campos alterados. Layout `grid-cols-2` com `bg-base-200/40 rounded-xl p-3`.

---

## Acessibilidade WCAG AA — checklist para implementação

| Item | Implementação obrigatória |
|---|---|
| Badges de ação | Não confiar apenas na cor. Adicionar texto ("CREATE", "DELETE") |
| Ícones de ação | `aria-label` no `<div>` do ícone: `aria-label="Ação: DELETE"` |
| Linhas clicáveis | `role="button"` + `tabIndex={0}` + `onKeyDown` (Enter/Space) |
| Filtros | `<label>` wrapping `<select>` (padrão já correto nas outras páginas) |
| Loading state | `aria-busy="true"` na section + skeleton (padrão do Notifications) |
| Sheet/Drawer | `role="dialog"` + `aria-labelledby` + focus trap + `Esc` fecha |
| Contraste | Tokens DaisyUI garantem AA em light e dark — nunca hardcoded |

**Problema existente a não replicar:** `paginator.tsx` tem `text-white` hardcoded (linha `<span className="font-semibold text-white">`). No dark theme isso quebra o contraste. No Audit Log usar `text-base-content` em vez de `text-white`.

---

## Roadmap faseado — UX

### MVP (Fase 1) — `/audit-log` básico
- [x] Entrada no sidebar (admin only)
- [x] Filtros: ator, recurso, ação, período
- [x] Lista de cards com ícone semântico
- [x] Sheet de detalhe (sem diff)
- [x] Skeleton + empty state
- [x] Paginação com `PaginatorComponent`

### Fase 2 — Diff visual
- [ ] Diff antes/depois no Sheet (grid-cols-2)
- [ ] Destaque de campos alterados (`text-warning font-semibold`)
- [ ] Filtro por role (Role 2 Gestor com acesso limitado ao próprio time)

### Fase 3 — Exportação e alertas
- [ ] Botão "Exportar CSV" no `PagesHeaderComponent` (variant `info`)
- [ ] Badge de contagem de eventos críticos (DELETE/EXPORT) no menu
- [ ] Filtro "apenas ações críticas" toggle (padrão do `unreadOnly` do Notifications)

---

## Pontos fortes do sistema atual (o que preservar)

1. **Filter card pattern** — consistente em Activities, Notifications, Manager. Replicar exatamente.
2. **Skeleton loading** — `animate-pulse` do Notifications é o melhor padrão, usar como referência.
3. **Empty state** — ícone + texto é simples e funciona. Padronizado em todas as páginas.
4. **SidebarTooltip** — já lida com collapsed mode. Novo item de menu funciona de graça.
5. **Sheet.tsx** — já existe, não criar modal customizado para detalhes.

## Pontos frágeis (não replicar no Audit Log)

1. `text-white` hardcoded no `paginator.tsx` — quebra dark mode.
2. Radio-button pagination no `ManagerPage` — usar `PaginatorComponent`.
3. `bg-gradient-to-r from-[#4C1D95]` hardcoded no botão de busca — aceitável como exceção estética mas não escalar.
4. `document.getElementById("showActivityModal")` no Activities — padrão imperative frágil. No Audit Log usar estado React + prop `open` no Sheet.
5. `confirm()` nativo no `handleDeleteActivity` — bloqueia a thread e não tem estilo. Usar `DeleteConfirmationModal` já existente.

---

## Veredicto

**Aprovado para início de implementação** com as diretrizes acima.

**Próximo passo:** FE implementa `/audit-log` seguindo o card pattern do `activities/page.tsx` + Sheet do `sheet.tsx` + sidebar entry no `managerMenu.tsx` restrita a `user.admin`.