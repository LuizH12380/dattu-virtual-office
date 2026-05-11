---
criado: 2026-04-29
atualizado: 2026-04-29
agente: dev-frontend
cargo: DEV Frontend Senior
tipo: implementacao-frontend
status: Aguardando Review UX
pipelineId: undefined
taskTitle: undefined
---

Tenho contexto suficiente. Vou agora produzir o plano arquitetural completo.

---

# Plano Arquitetural — Audit Log Dattu CRM

## Diagnóstico do contexto atual

**O que já existe que importa:**
- `request.user` populado pelo `AuthGuard` com `{ id, email, accountId, membershipId, role }` — contexto perfeito para captura
- Roles já mapeados (0, 1, 2, 4) via `MembershipRoleGuard` — base para controle de acesso ao log
- BullMQ + Redis já operacional com 3 workers ativos — infraestrutura de fila disponível sem custo adicional
- `PrismaService` global disponível em todos os módulos
- `logData: Json?` em `LeadCompany` — indica que log ad-hoc já foi tentado inline, sinal de que a dor existe

**O que NÃO existe ainda:**
- Nenhum modelo `AuditLog` no schema
- Nenhum interceptor/decorator de captura transversal
- Nenhuma UI de visualização de log
- Nenhuma política de retenção

---

## Decisão Arquitetural Central

**Fire-and-forget via BullMQ** — o request não espera o log ser gravado. A ação do usuário é registrada na fila assincronamente. Razão: latência zero no path crítico. Trade-off aceito: log pode chegar com delay de milissegundos a segundos — aceitável para auditoria (não é tempo real de negócio).

**NÃO usar Prisma Middleware** (`$use`) — ele não tem acesso ao contexto HTTP (quem fez, de qual IP, qual rota). Captura sem contexto é log inútil.

**NÃO usar Event Emitter síncrono** — acoplamento forte, mesma thread, mata performance em endpoints com alto volume (ex: preenchimento de formulário).

---

## Schema Proposto

```prisma
model AuditLog {
  id          Int      @id @default(autoincrement())
  accountId   Int
  actorId     Int?             // userId — null se ação sistêmica
  actorRole   Int?             // snapshot do role no momento
  membershipId Int?
  
  action      String           // ex: "lead.created", "activity.deleted"
  entity      String           // ex: "LeadCompany", "FluxActivity"
  entityId    Int?             // id do registro afetado
  
  before      Json?            // snapshot antes (UPDATE/DELETE)
  after       Json?            // snapshot depois (CREATE/UPDATE)
  
  ipAddress   String?
  userAgent   String?
  
  createdAt   DateTime @default(now())

  account     Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@index([accountId, createdAt])
  @@index([accountId, entity, entityId])
  @@index([accountId, actorId])
  @@map("audit_log")
}
```

**Por que `before`/`after` como `Json?` e não colunas separadas:**
- Entidades têm schemas diferentes — normalizar seria inviável
- Permite diff visual na UI sem lógica extra
- Trade-off: não é queryável field-a-field — aceitável pois auditoria não precisa de `WHERE before->>'name' = 'x'`

**Por que `entityId` como `Int?` e não FK tipada:**
- Polimorfismo — um único modelo serve `LeadCompany`, `FluxActivity`, `Task`, etc.
- FK tipada exigiria um modelo por entidade ou tabela polimórfica com cascades complexos

---

## Convenção de Nomenclatura de Actions

```
{entidade}.{verbo}

lead.created
lead.updated
lead.deleted
lead.transferred          // transferência de vendedor
activity.created
activity.completed
activity.deleted
form.submitted
catalog_item.created
catalog_item.updated
membership.role_changed
board.card_moved
template.executed
```

---

## Ponto de Captura — Onde Chamar

**NÃO** um interceptor global automático — captura cega demais, sem `before`/`after` real, vaza endpoints internos irrelevantes.

**SIM** — Chamada explícita no use-case/service, após a operação com sucesso:

```typescript
// Padrão de uso nos services
await this.auditQueue.enqueue({
  accountId,
  actorId,
  action: 'lead.created',
  entity: 'LeadCompany',
  entityId: created.id,
  after: created,
  ipAddress: req.ip,
});
```

**Por que explícito e não AOP/Decorator:**
- Controle granular do `before`/`after` — o interceptor não sabe o que mudou
- Evita logar operações de read (GET não tem valor de auditoria)
- Mais fácil de testar unitariamente
- Trade-off: requer disciplina do dev para não esquecer — mitigado com PR checklist

---

## Arquitetura da Fila

```
Controller → Service/UseCase → AuditLogQueue.enqueue()
                                      ↓
                              BullMQ (audit-log-queue)
                                      ↓
                              AuditLogWorker → PrismaService.auditLog.create()
```

```typescript
// src/queues/audit-log/audit-log.queue.service.ts
@Injectable()
export class AuditLogQueueService {
  constructor(@InjectQueue('audit-log-queue') private queue: Queue) {}

  async enqueue(payload: AuditLogJobPayload) {
    await this.queue.add('audit-log', payload, {
      removeOnComplete: true,
      removeOnFail: 1000,      // mantém últimos 1000 falhos para debug
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
  }
}
```

---

## Retenção de Dados

| Plano | Retenção | Estratégia |
|---|---|---|
| MVP | 90 dias | Cron job semanal — `DELETE WHERE createdAt < now() - 90d` |
| Fase 2 | Por plano de subscription | Lógica vinculada ao `Subscription.plan` |
| Fase 3 | Arquivamento frio | Exportar para S3 antes de deletar |

**Script de purge — MVP:**
```typescript
// src/workers/audit-log/audit-log-purge.worker.ts
// Roda via BullMQ Cron ou pg_cron
await prisma.auditLog.deleteMany({
  where: { createdAt: { lt: subDays(new Date(), 90) } }
});
```

---

## API de Visualização

```
GET /v1/audit-log?
  accountId (do token)
  entity=LeadCompany
  entityId=42
  actorId=7
  from=2026-01-01
  to=2026-04-29
  take=20
  skip=0
```

**Resposta:**
```json
{
  "data": [
    {
      "id": 1,
      "action": "lead.updated",
      "entity": "LeadCompany",
      "entityId": 42,
      "actor": { "id": 7, "name": "João Silva" },
      "before": { "status": 0 },
      "after": { "status": 1 },
      "createdAt": "2026-04-29T14:22:00Z"
    }
  ],
  "total": 148
}
```

**Permissões de acesso à API:**
- Role `0` (owner) e `1` (admin): acesso total — todos os logs da account
- Role `2` (manager): logs apenas dos seus subordinados (`actorId IN memberships gerenciadas`)
- Role `4` (salesman): apenas os próprios logs (`actorId = req.user.id`)
- Role `-1` (super-admin Dattu): acesso cross-account — guard separado

---

## Plano Faseado

### FASE 1 — MVP (Sprints 1-2) 🔴 PRIORIDADE MÁXIMA

**Objetivo:** infra de captura funcionando, sem UI ainda.

**Entregáveis:**
1. Migration: model `AuditLog` no Prisma
2. `AuditLogQueueService` + `AuditLogWorker`
3. Captura nos 5 endpoints de maior risco:
   - `lead.deleted` (DeleteFluxActivityUseCase)
   - `lead.transferred` (TransferLeadMembershipUseCase)
   - `activity.completed` (marcação doneAt)
   - `catalog_item.created/updated` (CatalogController)
   - `membership.role_changed`
4. Endpoint `GET /v1/audit-log` com filtros básicos (sem UI)
5. Purge cron: 90 dias

**Critério de aceite:** conseguir responder "quem deletou esse lead?" em < 5 segundos.

---

### FASE 2 — Cobertura Ampliada (Sprints 3-4) 🟡

**Objetivo:** cobrir todas as entidades críticas de negócio.

**Entregáveis:**
1. Captura em: `form.submitted`, `board.card_moved`, `template.executed`, `task.created/completed`
2. `AuditLogDecorator` para simplificar chamada nos services (reduz boilerplate)
3. `before`/`after` diff automático para UPDATE — helper `diffObjects(before, after)` que filtra campos não alterados
4. Retenção vinculada ao plano de subscription
5. **UI básica** — página `/admin/audit-log` com tabela filtrable

---

### FASE 3 — Observabilidade Avançada (Sprint 5+) 🟢

**Objetivo:** produto de auditoria completo, diferencial comercial.

**Entregáveis:**
1. Timeline visual por lead — componente na página do lead mostrando histórico de ações
2. Exportação CSV dos logs (para compliance)
3. Alertas de anomalia — ex: "5 leads deletados em 10 minutos pelo mesmo usuário" → notificação ao owner
4. Arquivamento frio S3 antes do purge (logs comprimidos por mês)
5. Integração com `Notification` existente para alertas in-app

---

## Trade-offs Documentados

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| BullMQ assíncrono | Gravação síncrona | Zero latência no path crítico |
| Captura explícita | Prisma Middleware `$use` | Sem contexto HTTP no middleware |
| Captura explícita | NestJS Interceptor global | Sem `before`/`after` real, loga GETs |
| Modelo polimórfico único | Um modelo por entidade | Complexidade desnecessária para o volume |
| `Json?` para before/after | Colunas tipadas por entidade | Inviável com 15+ entidades diferentes |
| PostgreSQL | Elasticsearch / ClickHouse | Volume atual não justifica infra separada; revisitar a 1M+ rows |
| 90 dias retenção | Retenção infinita | Custo de storage + LGPD (dados de comportamento de usuário) |

---

## Riscos e Mitigações

**Risco 1:** Volume de logs explodindo o PostgreSQL
- **Mitigação:** índice composto `(accountId, createdAt)`, purge semanal, particionar tabela por mês se ultrapassar 5M rows

**Risco 2:** Worker falhando e log se perdendo (silenciosamente)
- **Mitigação:** `removeOnFail: 1000` — mantém jobs falhos visíveis; alertar no `onFailed` do worker para o sistema de notificações

**Risco 3:** `before` snapshot desatualizado (race condition em concurrent updates)
- **Mitigação:** capturar `before` dentro da transação Prisma, não antes dela

**Risco 4:** PII nos snapshots (emails, CPF nas respostas de formulário)
- **Mitigação:** Fase 1 deve ter lista de campos banidos do snapshot (ex: `password`, `key`). Fase 3: criptografia seletiva de campos sensíveis

---

## Próximo Passo Imediato

Iniciar **Fase 1** — criar a migration do `AuditLog` + `AuditLogQueueService` + `AuditLogWorker` + captura nos 5 endpoints prioritários. Confirma para eu implementar?