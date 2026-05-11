---
criado: 2026-04-29
atualizado: 2026-04-29
agente: devops
cargo: DevOps Engineer
tipo: deploy-log
status: Executado
pipelineId: undefined
taskTitle: undefined
---

Tenho tudo que preciso. Análise completa feita. Agora entrego o plano arquitetural completo.

---

# 📋 Plano Arquitetural — Audit Log Dattu CRM

## Contexto confirmado (via leitura do código)

- **Auth**: JWT com `userId`, `accountId`, `membershipId`, `role` (0/1/2/4) no request — contexto rico disponível em todo guard
- **Roles mapeados**: `0=viewer`, `1=member`, `2=manager`, `4=super-admin` (via `MembershipRoleGuard` + `SuperAdminGuard`)
- **Entidades críticas existentes**: `Account`, `Membership`, `LeadCompany`, `FluxActivity`, `Task`, `BoardsCard`, `FluxResponse`, `CatalogItem`, `TemplateExecution`
- **Infra disponível**: BullMQ + Redis (já operacional com 4 filas), PrismaService singleton, WebSocket (WsModule), padrão use-case por módulo
- **Sem AuditLog hoje**: `LeadCompany.logData` é Json? solto — não é estruturado, não é sistêmico
- **Migrations**: estrutura saudável, 24 migrations, Prisma 6.7

---

## Decisão Arquitetural Central

**Padrão escolhido: Write-behind assíncrono via BullMQ + tabela própria no PostgreSQL.**

| Trade-off | Decisão | Motivo |
|---|---|---|
| Síncrono vs. Assíncrono | **Assíncrono (BullMQ)** | Não adiciona latência ao request crítico |
| DB próprio vs. append no registro | **Tabela `audit_log` dedicada** | Imutável, indexável, não polui schema das entidades |
| Interceptor vs. Decorator vs. Use-case | **Decorator `@Audit()` + Interceptor** | Opt-in explícito, sem risco de capturar ruído |
| Retenção: hard delete vs. soft | **Soft com TTL por plan** | Compliance futuro sem re-migration |
| Visualização: endpoint próprio vs. embedded | **Módulo `audit-log` próprio** | Separação de responsabilidade, permissão granular |

---

## Schema Prisma — `AuditLog`

```prisma
model AuditLog {
  id           Int      @id @default(autoincrement())
  accountId    Int
  actorId      Int      // userId (User)
  membershipId Int?     // membership do ator
  role         Int?     // role no momento da ação
  action       String   // "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "EXPORT" | "VIEW_SENSITIVE"
  entity       String   // "Task" | "LeadCompany" | "FluxActivity" | "BoardsCard" | "CatalogItem" | "Membership"
  entityId     String   // id da entidade afetada (String para cobrir Int e UUID futuros)
  before       Json?    // snapshot anterior (apenas campos alterados)
  after        Json?    // snapshot posterior (apenas campos alterados)
  ip           String?
  userAgent    String?
  metadata     Json?    // dados extras livres por contexto
  createdAt    DateTime @default(now())

  account      Account    @relation(fields: [accountId], references: [id])

  @@index([accountId, entity, createdAt])
  @@index([accountId, actorId, createdAt])
  @@index([accountId, action, createdAt])
  @@map("audit_log")
}
```

> **`before`/`after` são diffs, nunca row completo** — evita LGPD/dados sensíveis e mantém payload pequeno.

---

## Arquitetura de Captura — Fluxo

```
Controller (action) 
  → @Audit({ action: 'UPDATE', entity: 'Task' })  ← decorator opt-in
      → AuditInterceptor (captura req.user + before/after)
          → AuditQueueService.enqueue(payload)    ← fire-and-forget
              → BullMQ: 'audit-log-queue'
                  → AuditLogWorker
                      → prisma.auditLog.create()
```

**Pontos de captura por entidade:**

| Entidade | Ações auditadas |
|---|---|
| Auth | `LOGIN`, `LOGOUT`, `RESET_PASSWORD`, `OTP_VERIFY` |
| LeadCompany | `CREATE`, `UPDATE`, `DELETE`, `ASSIGN_SALESMAN` |
| Task | `CREATE`, `UPDATE`, `DELETE`, `STATUS_CHANGE` |
| FluxActivity | `CREATE`, `UPDATE`, `DONE`, `DELETE` |
| BoardsCard | `MOVE` (posição/coluna), `CREATE`, `DELETE` |
| Membership | `INVITE`, `ROLE_CHANGE`, `REMOVE` |
| CatalogItem | `CREATE`, `UPDATE`, `DELETE` |
| TemplateExecution | `GENERATE`, `SEND` |
| Subscription/Billing | `PLAN_CHANGE`, `PAYMENT_CONFIRMED` |

---

## Plano Faseado

### FASE 1 — MVP (2 semanas)

**Objetivo**: infraestrutura funcionando + entidades de maior risco auditadas.

**Entregas:**
1. Migration `audit_log` table + relation em `Account`
2. `AuditLogModule` com:
   - `AuditQueueService` (enqueue)
   - `AuditLogWorker` (consumer BullMQ)
   - `AuditLogRepository` (prisma)
3. `@Audit()` decorator + `AuditInterceptor`
4. Captura em: **Auth** (login/reset), **Task** (CRUD + status), **Membership** (invite/role/remove)
5. Endpoint `GET /v1/audit-log` — somente role `4` (super-admin)

**Não entrar no MVP:**
- Visualização no frontend
- Filtros avançados
- Retenção/TTL automático

---

### FASE 2 — Cobertura Core (3 semanas)

**Objetivo**: cobrir entidades de negócio críticas + acesso gerencial.

**Entregas:**
1. Captura em: `LeadCompany`, `FluxActivity`, `BoardsCard`, `CatalogItem`, `TemplateExecution`
2. Endpoint `GET /v1/audit-log` liberado para role `2` (manager) — **somente no próprio `accountId`**
3. Filtros: `entity`, `actorId`, `dateFrom`, `dateTo`, `action`, paginação
4. Frontend: página `/settings/audit-log` (role `4`) e aba no perfil do lead (`entity=LeadCompany&entityId=X`)

---

### FASE 3 — Retenção + Compliance (2 semanas)

**Objetivo**: operação sustentável em escala + controle por plano.

**Entregas:**
1. Campo `retentionDays` por `Account` (ou vinculado ao `Subscription`)
2. BullMQ scheduled job: `AuditRetentionWorker` — roda toda madrugada, soft-delete ou purge de registros expirados
3. Exportação: `GET /v1/audit-log/export` → CSV/XLSX (via `xlsx` já instalado) — somente role `4`
4. Ofuscamento automático de campos sensíveis (`password`, `token`, `key`) antes de gravar `before`/`after`

---

### FASE 4 — Roadmap Futuro (sem data)

- Webhook de audit para integrações externas (SIEM, Datadog)
- Dashboard de anomalias (ex: N ações em X minutos pelo mesmo ator → alerta)
- Assinatura criptográfica dos registros (imutabilidade verificável)
- Separação de storage: registros >90 dias migrados para S3 (já instalado via `@aws-sdk`)

---

## Estrutura de Pastas Proposta

```
src/modules/audit-log/
├── audit-log.module.ts
├── audit-log.controller.ts        ← GET /v1/audit-log
├── dto/
│   ├── create-audit-log.dto.ts
│   └── query-audit-log.dto.ts
├── use-cases/
│   ├── find-all-audit-logs.use-case.ts
│   └── export-audit-logs.use-case.ts
├── repository/
│   └── audit-log.repository.ts
└── services/
    └── audit-queue.service.ts

src/queues/audit-log/
└── audit-log.queue.service.ts

src/workers/audit-log/
└── audit-log.worker.ts

src/shared/presentation/decorators/
└── audit.decorator.ts             ← @Audit({ action, entity })

src/shared/presentation/interceptors/
└── audit.interceptor.ts           ← captura before/after + enfileira
```

---

## Checklist Pré-Implementação

```
[ ] Alinhar com dev: campos sensíveis a ofuscar (ex: password, token, key, intakeApiKey)
[ ] Definir retenção default por plano (sugestão: Free=30d, Pro=90d, Enterprise=365d)
[ ] Confirmar: audit de VIEW_SENSITIVE é necessário no MVP? (captura leitura de dados sensíveis)
[ ] Adicionar 'audit-log-queue' no BullModule.registerQueue do app.module.ts
[ ] Adicionar relação auditLogs em Account no schema
[ ] Confirmar: Account.relation → cascade behavior em delete (manter logs? sugestão: sim, restrict delete)
[ ] Validar com produto: quais entidades são obrigatórias para compliance vs. nice-to-have
```

---

## Trade-offs Documentados

| Decisão | Alternativa Rejeitada | Motivo da rejeição |
|---|---|---|
| BullMQ async | Síncrono no use-case | Latência no request crítico, risco de falha dupla |
| Decorator opt-in | Interceptor global | Global captura ruído (GETs irrelevantes), difícil filtrar |
| Tabela própria | `logData` Json em cada entidade | Não indexável, não consultável de forma cruzada, violação SRP |
| `before`/`after` como diff | Row completo snapshotado | Volume enorme, risco de gravar dados sensíveis em texto |
| Relação com `Account` (não `Membership`) | Relação direta com `User` | `User` pode sair da conta; `accountId` garante isolamento multi-tenant |

---

**Próximo passo**: aprovar o schema + lista de entidades MVP e eu entrego os arquivos de implementação da Fase 1 prontos para PR.