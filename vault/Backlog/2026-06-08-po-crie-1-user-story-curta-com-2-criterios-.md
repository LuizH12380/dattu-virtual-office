---
criado: 2026-06-08
atualizado: 2026-06-08
agente: po
cargo: Product Owner
tipo: user-story
status: Aguardando CEO
pipelineId: undefined
taskTitle: undefined
---

## User Story — Renovação automática de assinatura

**História:**
Como cliente com assinatura mensal ativa, quero que minha assinatura seja renovada automaticamente ao fim do ciclo, para manter o acesso sem ação manual.

**Critérios de aceitação:**
1. **Dado** uma assinatura ativa cujo ciclo vence hoje, **quando** o job de renovação executar, **então** um novo período é criado (data fim +1 mês) e o status permanece `ATIVA` — registrando a renovação em log/histórico.
2. **Dado** uma assinatura marcada para cancelamento (`cancel_at_period_end`), **quando** o ciclo vencer, **então** a renovação **não** ocorre e o status muda para `CANCELADA`.

**Prioridade:** Must Have (MoSCoW) — core do modelo recorrente já aprovado (Pedido/Catálogo, Fase 1).
**Métrica de sucesso:** % de renovações processadas sem falha (meta ≥ 99%) e churn involuntário < 1%.
**Dependência técnica:** job agendado (BullMQ/Redis) + idempotência por ciclo para evitar renovação duplicada.

**Próximo passo:** confirmo se já existe entidade `Assinatura` no `dattu-back-end` (busco no código) antes de detalhar tasks técnicas — quer que eu verifique?