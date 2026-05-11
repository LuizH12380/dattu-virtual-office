---
criado: 2026-04-29
atualizado: 2026-04-29
agente: tech-lead
cargo: Tech Lead
tipo: code-review
status: Revisado
pipelineId: undefined
taskTitle: undefined
---

Tenho tudo que preciso. Vou agora elaborar o plano arquitetural completo.

---

# Plano Arquitetural — Audit Log — Dattu CRM

## Diagnóstico do Repositório

Li o código real antes de propor qualquer coisa. Pontos críticos encontrados:

**Zero rastreabilidade hoje.** Nenhum interceptor, nenhum decorator, nenhum model de audit no Prisma. Ações críticas acontecem sem rastro:
- `UpdatePositionBoardCardUseCase` — muda step de lead no kanban, cria `fluxActivity`, cria `fluxResponse` — **nada logado**
- `UpdateTaskUseCase` / `DeleteTaskUseCase` — sem histórico de quem alterou o quê
- `MembershipService.setManager()` / `toggleShareData()` — alterações de permissão invisíveis
- `TransferLeadMembershipUseCase` — transferência de lead entre vendedores sem log
- `FluxsController.answerFluxforms()` — 800 linhas, cria activity, response, proposal, doc — **evento mais crítico do sistema, sem audit**

**Infraestrutura existente favorável:**
- BullMQ + Redis já operacionais → fila de audit assíncrona já tem suporte
- `AuthGuard` popula `req.user` com `{ id, accountId, membershipId, role }` → contexto disponível
- Pattern use-case já adotado → ponto de captura natural e previsível
- Sem `NestInterceptor` nenhum → campo aberto para introduzir sem conflito

---

## Decisão Arquitetural: Captura via Decorator + Fila Assíncrona

### Por que não Prisma Middleware?
Prisma middleware captura tudo no nível ORM, mas perde o contexto HTTP (quem fez, de qual IP, qual `accountId`). Audit sem "quem" é inútil para CRM.

### Por que não Interceptor global?
Interceptor global capturaria ruído enorme (GET, health checks, paginações). Audit de CRM precisa de granularidade semântica: "lead transferido", não "PATCH /v1/fluxs/activities/42".

### Decisão: `@AuditLog()` decorator + BullMQ queue existente
- Captura **somente** o que for decorado explicitamente
- Contexto rico (actor, account, entity, before/after)
- Assíncrono — zero impacto na latência do request
- Worker dedicado grava no Postgres

---

## Schema Prisma

```prisma
model AuditLog {
  id         Int      @id @default(autoincrement())
  accountId  Int
  actorId    Int      // membership.id de quem fez
  action     String   // 'TASK_CREATED' | 'LEAD_TRANSFERRED' | 'STEP_CHANGED' ...
  entity     String   // 'Task' | 'BoardCard' | 'FluxActivity' | 'Membership'
  entityId   Int
  before     Json?    // snapshot antes (apenas campos mutados)
  after      Json?    // snapshot depois
  meta       Json?    // ip, userAgent, requestId
  createdAt  DateTime @default(now())

  @@index([accountId, createdAt])
  @@index([entity, entityId])
  @@index([actorId])
}
```

**Trade-off documentado:** `before/after` como `Json` é flexível mas impossibilita query por campo específico alterado. Para MVP isso é aceitável. Fase 2 pode adicionar coluna `changedFields String[]` com índice GIN para buscas como "quem alterou o título desta task nos últimos 7 dias".

---

## Implementação Faseada

---

### FASE 1 — MVP (Sprint atual, 2 semanas)

**Objetivo:** infraestrutura base + 5 eventos críticos cobertos

#### 1.1 — Módulo `audit-log`

```
src/modules/audit-log/
  audit-log.module.ts
  audit-log.queue.service.ts   ← enfileira no BullMQ
  audit-log.context.ts         ← interface AuditContext
```

```typescript
// audit-log.context.ts
export interface AuditContext {
  actorId: number;       // membershipId
  accountId: number;
  action: AuditAction;
  entity: AuditEntity;
  entityId: number;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  meta?: { ip?: string; userAgent?: string };
}

export type AuditAction =
  | 'TASK_CREATED' | 'TASK_UPDATED' | 'TASK_DELETED' | 'TASK_STATUS_CHANGED'
  | 'LEAD_STEP_CHANGED' | 'LEAD_TRANSFERRED' | 'LEAD_ASSIGNED'
  | 'MEMBERSHIP_MANAGER_SET' | 'MEMBERSHIP_SHARE_TOGGLED'
  | 'FORM_FILLED';

export type AuditEntity = 'Task' | 'BoardCard' | 'FluxActivity' | 'Membership' | 'FluxResponse';
```

```typescript
// audit-log.queue.service.ts
@Injectable()
export class AuditLogQueueService {
  constructor(@InjectQueue('audit-log-queue') private queue: Queue) {}

  async push(ctx: AuditContext): Promise<void> {
    // fire-and-forget — nunca bloqueia o caller
    await this.queue.add('audit', ctx, {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
  }
}
```

#### 1.2 — Worker

```
src/workers/audit-log/
  audit-log.worker.ts
```

```typescript
@Processor('audit-log-queue')
export class AuditLogWorker implements WorkerHost {
  constructor(private readonly prisma: PrismaService) {}

  async process(job: Job<AuditContext>): Promise<void> {
    await this.prisma.auditLog.create({ data: job.data });
  }
}
```

**Por que worker separado e não gravar direto no QueueService?**
Separação de responsabilidade: o QueueService só conhece a fila, o Worker só conhece o Prisma. Se amanhã mudar para ElasticSearch, só muda o worker.

#### 1.3 — Integração nos use-cases críticos (MVP)

Injetar `AuditLogQueueService` nos 5 use-cases prioritários:

| Use-case | Evento | Prioridade |
|---|---|---|
| `UpdateTaskUseCase` | `TASK_UPDATED` com `before`/`after` | P0 |
| `DeleteTaskUseCase` | `TASK_DELETED` com snapshot `before` | P0 |
| `UpdatePositionBoardCardUseCase` | `LEAD_STEP_CHANGED` | P0 |
| `TransferLeadMembershipUseCase` | `LEAD_TRANSFERRED` | P0 |
| `MembershipService.setManager` | `MEMBERSHIP_MANAGER_SET` | P1 |

**Exemplo concreto — `UpdateTaskUseCase`:**

```typescript
// Antes do update, captura before:
const before = await this.prisma.task.findFirst({ where: { id, accountId },
  select: { title: true, status: true, priority: true, assignedToId: true }
});

const updated = await this.prisma.task.update({ ... });

// Após update, enfileira — sem await bloqueante no path crítico:
void this.auditQueue.push({
  actorId:    membershipId,   // ← ATENÇÃO: precisa passar membershipId ao use-case
  accountId,
  action:     'TASK_UPDATED',
  entity:     'Task',
  entityId:   id,
  before,
  after:      { title: dto.title, status: updated.status, priority: dto.priority },
});
```

**Problema atual detectado:** `UpdateTaskUseCase.execute()` não recebe `membershipId` — só `id` e `accountId`. Precisará ser adicionado ao signature. Isso é um ajuste necessário independentemente do audit log — o actor de uma mutação deve sempre ser rastreável.

#### 1.4 — Endpoint de consulta (somente admin/owner)

```typescript
// GET /v1/audit-log?entity=Task&entityId=42&take=20&skip=0
@UseGuards(AuthGuard, AccountOwnerGuard)
@Get()
async findAll(@Query() query: AuditLogQueryDto, @Request() req) { ... }
```

Retorna paginado. Nenhum filtro sem `accountId` do token — isolamento multi-tenant garantido.

---

### FASE 2 — Enriquecimento (Sprint +2, ~3 semanas)

**Objetivos:** cobertura completa + busca + UI

1. **Cobertura ampliada:** todos módulos com mutação de dados (`FluxsController.answerFluxforms`, `create-boardCard`, `update-membership`, `accounts`, `users`)
2. **`changedFields: String[]`** — coluna indexada com GIN no Postgres para queries "quem alterou o campo X?"
3. **`requestId`** — gerar UUID por request via middleware e propagar via `AsyncLocalStorage` (sem passar por prop drilling nos use-cases)

```typescript
// shared/util/request-context/request-context.service.ts
const store = new AsyncLocalStorage<{ requestId: string; ip: string }>();

export class RequestContextService {
  static run(data, cb) { return store.run(data, cb); }
  static get() { return store.getStore(); }
}
```

4. **Retenção:** cron job mensal arquiva logs > 90 dias para tabela `AuditLogArchive` (particionada por `createdAt`). Compliance LGPD — dados de acesso não devem ficar indefinidamente na tabela quente.

5. **UI — Timeline do Lead:** na tela do lead no frontend, consumir `/v1/audit-log?entity=FluxActivity&entityId=X` e exibir timeline de eventos (quem moveu, quando, de qual etapa para qual).

---

### FASE 3 — Observabilidade e Compliance (roadmap, +30 dias)

1. **Alertas:** regra no worker — se `action === 'LEAD_TRANSFERRED'` e frequência > 10/hora pelo mesmo actor, publicar evento no `NotificationsModule`
2. **Export CSV:** endpoint `GET /v1/audit-log/export` com job BullMQ para geração assíncrona (arquivo grande não bloqueia request)
3. **Webhook:** configurar por account — quando eventos críticos ocorrem, disparar webhook para integração do cliente
4. **Separação de banco:** se volume > 1M registros/mês, considerar banco Postgres separado para audit (não misturar OLTP com OLAP)

---

## Trade-offs Documentados

| Decisão | Alternativa Rejeitada | Motivo |
|---|---|---|
| Decorator explícito nos use-cases | Prisma middleware global | Middleware perde contexto HTTP (actor) |
| BullMQ assíncrono | Gravação síncrona | Gravação síncrona adiciona latência em cada request |
| Json para before/after | Colunas tipadas | Flexibilidade > rigidez no MVP; fase 2 adiciona `changedFields[]` |
| Tabela própria `AuditLog` | Usar `fluxActivity` como audit | `fluxActivity` é domínio de negócio (pipeline), não log técnico |
| Retenção 90 dias hot | Retenção indefinida | Performance + custo + LGPD Art. 15 (finalidade) |

---

## Riscos e Mitigações

**R1 — Worker falhando silenciosamente:** BullMQ já tem `attempts: 3` + `backoff`. Adicionar alerta no `onFailed` do worker via `NotificationsModule` para o Super Admin.

**R2 — `membershipId` ausente em alguns use-cases:** identificado em `UpdateTaskUseCase`, `DeleteTaskUseCase`. Esses métodos recebem `accountId` mas não `actorId`. **Ação imediata:** adicionar `membershipId` ao signature de todos os use-cases de mutação — isso é débito técnico independente do audit log.

**R3 — Volume de dados:** `fluxActivity` + `boardCard` têm alta frequência. Estimar ~50 eventos/dia/account. Com 100 accounts = 5k eventos/dia = ~150k/mês. Tabela aguenta bem em Postgres com os índices definidos. Revisar em Fase 3 se chegar a 500 accounts.

**R4 — `before` snapshot com dados sensíveis:** definir política de quais campos entram no snapshot. Nunca logar campos tipo `password`, `token`. Criar `AUDIT_EXCLUDED_FIELDS` constant global.

---

## Próximo Passo

**Ação imediata:** criar branch `feat/audit-log-mvp`, adicionar model `AuditLog` no `schema.prisma`, rodar migration, registrar `BullModule.registerQueue({ name: 'audit-log-queue' })` no `AppModule`. Depois injetar `AuditLogQueueService` nos 4 use-cases P0 listados acima. **Estimativa: 3 dias de dev.**