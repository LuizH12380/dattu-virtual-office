---
criado: 2026-04-29
atualizado: 2026-04-29
agente: dev-backend
cargo: DEV Backend Senior
tipo: implementacao-backend
status: Aguardando Frontend
pipelineId: undefined
taskTitle: undefined
---

Tenho contexto suficiente. Vou agora produzir o plano arquitetural completo.

---

# Plano Arquitetural — Audit Log Dattu CRM

## Diagnóstico do contexto atual

**O que já existe que importa:**
- **Auth:** JWT com `userId`, `accountId`, `membershipId`, `role` disponíveis em todo request via `AuthGuard`
- **BullMQ + Redis:** infra de fila já operacional (3 queues ativas: billing, geocoding, task-reminder)
- **Prisma + PostgreSQL:** ORM principal, schema com `Account`, `Membership`, `User` como âncoras naturais de auditoria
- **Módulos de domínio:** leads, fluxs, boards, tasks, catalog, memberships — todos são alvos de auditoria
- **Workers:** padrão `Processor + WorkerHost` já estabelecido — reusável para o worker de audit

**O que NÃO existe (gaps):**
- Nenhum model de audit no schema
- Nenhum interceptor/decorator de captura transversal
- Nenhuma fila dedicada a audit
- Nenhuma interface de visualização

---

## Decisões Arquiteturais Fundamentais

### 1. Onde capturar?

**Decisão: Interceptor NestJS + Decorator opt-in, NÃO Prisma Middleware**

| Opção | Prós | Contras |
|---|---|---|
| **NestJS Interceptor** ✅ | Contexto HTTP completo (userId, IP, userAgent); fácil opt-in por controller | Não captura jobs/workers automaticamente |
| Prisma Middleware | Captura toda mutação DB | Sem contexto de usuário; captura ruído interno (system jobs) |
| Database Triggers | Zero overhead app | Sem contexto HTTP; manutenção complexa |

O interceptor tem acesso ao `request.user` do `AuthGuard` — que já carrega `userId`, `accountId`, `membershipId`, `role`. É o fit perfeito.

### 2. Escopo de entidades auditadas (MVP)

Somente ações com **impacto de negócio real e risco de disputa**:

```
AUDITÁVEIS (MVP):
  - leads         → criação, vínculo a account, atualização de contato
  - flux_activity → criação, mudança de step (pipeline move), conclusão
  - memberships   → criação, alteração de role, desativação
  - boards        → criação, movimentação de card entre colunas
  - tasks         → criação, conclusão, reatribuição
  - catalog_item  → criação, atualização de preço, desativação
  - auth          → login, logout (session displacement já existe)

FORA DO MVP (Fase 2+):
  - flux_form, flux_response (volume alto, valor baixo)
  - ai_conversation (privacidade)
  - dashboard queries (sem mutação)
```

### 3. Schema do Audit Log

**Decisão: Tabela única polimórfica com `entityType` + `entityId`**

Trade-off: simplicidade de query vs. ausência de FK real. Justificativa: FK para múltiplas tabelas exigiria tabela de junção ou Prisma Union — over-engineering no MVP. O campo `entityType` é nossa "chave semântica".

```prisma
// prisma/schema.prisma — NOVO MODEL

model AuditLog {
  id          Int      @id @default(autoincrement())
  // Quem
  accountId   Int
  userId      Int?     // null = ação de sistema (worker/job)
  membershipId Int?
  // O quê
  action      String   // "lead.created", "task.completed", "member.role_changed"
  entityType  String   // "LeadCompany", "Task", "Membership", etc.
  entityId    Int
  // Contexto
  before      Json?    // snapshot antes (para updates)
  after       Json?    // snapshot depois
  metadata    Json?    // dados extras: IP, userAgent, stepName, etc.
  // Quando
  createdAt   DateTime @default(now())

  // Relações
  account     Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)
  user        User?    @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([accountId, entityType, entityId])
  @@index([accountId, action])
  @@index([accountId, createdAt])
  @@index([userId])
  @@map("audit_log")
}
```

**Por que `before`/`after` em JSON e não colunas individuais?**
Cada entidade tem campos distintos. JSON evita 20 tabelas de audit separadas. Custo: queries de diff são feitas na aplicação, não no SQL — aceitável para o volume atual.

**Por que `userId` nullable?**
Jobs do BullMQ (billing, geocoding) podem precisar logar ações de sistema sem usuário. `null` indica origem automatizada.

### 4. Ponto de captura — Arquitetura em Camadas

```
HTTP Request
    │
    ▼
AuthGuard          ← userId/accountId/role já disponíveis
    │
    ▼
AuditInterceptor   ← captura DEPOIS da execução (response)
    │              ← lê @Audit() decorator para saber action/entityType
    ▼
Controller → Service → Prisma
    │
    ▼
AuditQueueService  ← dispara job assíncrono (NÃO bloqueia response)
    │
    ▼
BullMQ audit-queue
    │
    ▼
AuditWorker        ← escreve no PostgreSQL
```

**Por que assíncrono via fila?**
- Response ao usuário NÃO espera o INSERT do audit (latência zero adicionada)
- Retry automático do BullMQ em caso de falha de DB
- Worker pode ser escalado independente da API

**Trade-off:** logs não são instantaneamente visíveis (delay de ~100ms–1s). Aceitável para CRM; inaceitável para sistemas financeiros regulados. Para Dattu, OK no MVP.

### 5. Retenção

| Tier | Período | Estratégia |
|---|---|---|
| Hot (PostgreSQL) | 90 dias | Tabela principal com índice por `createdAt` |
| Warm (arquivo JSON/S3) | 1 ano | Job mensal exporta + deleta do Postgres |
| Cold | Descarte | Sem requisito regulatório por ora |

**Job de retenção:** `AuditRetentionWorker` via BullMQ, roda mensal. Deleta `WHERE createdAt < NOW() - INTERVAL '90 days'` após exportar para S3 (Fase 2).

MVP: apenas retenção de 90 dias no Postgres. Sem exportação ainda.

### 6. Permissões de visualização

```
role 1 (vendedor)    → vê APENAS seus próprios logs (where userId = self)
role 2 (manager)     → vê logs da sua equipe (shareDataWithManagers=true)
role 3 (admin/owner) → vê todos os logs da account
super-admin          → vê qualquer account (guard existente: super-admin.guard.ts)
```

Filtros obrigatórios: `accountId` sempre scoped pelo JWT — nunca exposto sem.

---

## Plano de Implementação Faseado

### FASE 0 — Fundação (Semana 1) ✅ Prioridade Máxima

**Entregáveis:**
1. Migration Prisma com `AuditLog` model + 4 índices
2. `AuditModule` em `src/modules/audit/`
3. `AuditQueueService` + `audit-queue` no BullMQ
4. `AuditWorker` que persiste no Postgres
5. `@Audit()` decorator (metadata de action/entityType)
6. `AuditInterceptor` global (opt-in via decorator)
7. Registro no `AppModule`

**Estrutura de arquivos:**
```
src/modules/audit/
  audit.module.ts
  audit.controller.ts        ← GET /v1/audit (fase 1)
  audit.service.ts           ← query service
  decorators/
    audit.decorator.ts       ← @Audit({ action, entityType })
  interceptors/
    audit.interceptor.ts     ← captura pós-execução
  dto/
    query-audit.dto.ts       ← filtros de listagem

src/queues/audit/
  audit.queue.service.ts

src/workers/audit/
  audit.worker.ts
```

**Quais módulos instrumentar primeiro:**
```
Prioridade 1 (Fase 0): auth.login, membership.create/role_change, catalog_item.price_change
Prioridade 2 (Fase 1): flux_activity.step_change, task.create/complete
Prioridade 3 (Fase 2): leads, boards, flux_response
```

### FASE 1 — API de Consulta (Semana 2)

**Entregáveis:**
1. `GET /v1/audit` com filtros: `entityType`, `action`, `userId`, `from`, `to`, `page`, `limit`
2. Autorização por role (vendedor vê só os seus)
3. Resposta paginada com snapshot `before`/`after`

```typescript
// Exemplo de response
{
  data: [{
    id: 1,
    action: "member.role_changed",
    entityType: "Membership",
    entityId: 42,
    before: { role: 1 },
    after: { role: 2 },
    metadata: { ip: "189.x.x.x", changedBy: "admin@dattu.com" },
    createdAt: "2026-04-29T14:00:00Z",
    user: { name: "Carlos Lima", email: "carlos@dattu.com" }
  }],
  total: 247,
  page: 1,
  limit: 20
}
```

### FASE 2 — Instrumentação Completa + Retenção (Semana 3-4)

**Entregáveis:**
1. Todos os módulos de domínio instrumentados com `@Audit()`
2. Diff automático `before`/`after` para updates (helper `diffObjects`)
3. Job de retenção mensal (deleta >90 dias)
4. Audit de ações de sistema (workers logam via `AuditQueueService` diretamente, sem HTTP context)

### FASE 3 — Dashboard Frontend (Sprint seguinte)

**Entregáveis:**
1. Página `/audit` no Next.js com timeline visual
2. Filtros por usuário/entidade/período
3. Expandir registro para ver before/after diff colorido
4. Export CSV (admin only)

---

## Implementação MVP — Código Completo Fase 0

Confirme para eu escrever os arquivos agora. Vou implementar na sequência:

```
1. prisma/schema.prisma       ← add AuditLog model
2. migration SQL
3. audit.decorator.ts
4. audit.interceptor.ts
5. audit.queue.service.ts
6. audit.worker.ts
7. audit.module.ts
8. app.module.ts              ← registrar tudo
9. Instrumentar auth.service  ← primeiro ponto de captura real
```

**Próximo passo:** diga `implementar Fase 0` e eu escrevo todos os arquivos na ordem acima — schema, fila, worker, interceptor e primeiro ponto de captura (auth.login).