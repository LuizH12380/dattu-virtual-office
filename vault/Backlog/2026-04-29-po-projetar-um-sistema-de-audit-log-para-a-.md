---
criado: 2026-04-29
atualizado: 2026-04-29
agente: po
cargo: Product Owner
tipo: user-story
status: Aguardando CEO
pipelineId: undefined
taskTitle: undefined
---

Tenho tudo que preciso. Análise completa concluída. Aqui está o plano:

---

# 📋 Audit Log — Plano de Implementação Faseado

## Diagnóstico do estado atual

**Zero infraestrutura de audit existe hoje.** Achados críticos:
- `PrismaService` é um `PrismaClient` puro — sem middleware, sem hooks, sem soft-capture
- Nenhum `Interceptor` NestJS registrado em lugar algum (`app.module.ts` confirmado)
- `AuthGuard` já injeta `{ userId, membershipId, accountId, role }` no `request.user` — **contexto pronto para uso**
- Roles definidas: `0=viewer, 1=seller, 2=manager, 4=super-admin`
- BullMQ + Redis já em produção (workers: billing, geocoding, task-reminder, board-column) — **infraestrutura de fila disponível**
- Módulos com mutações críticas sem rastreio: `fluxActivity` (transfer de leads, mudança de step), `boardsCard` (movimentação kanban), `task` (update/status), `membership` (set-manager, toggle-share)
- `fluxActivity` já tem campo `details: string` — proto-audit manual e não estruturado

---

## Decisão arquitetural: Abordagem híbrida em 2 camadas

**Camada 1 — NestJS `AuditInterceptor`** (captura HTTP sincronamente, grava via fila)
**Camada 2 — `Prisma Middleware`** (captura operações diretas no banco para eventos internos/workers)

**Por que fila e não gravação direta?**
- Audit log nunca deve bloquear a request do usuário
- Workers já existem → padrão estabelecido no projeto
- Permite retry em caso de falha de DB

**Trade-off documentado:**
| Opção | Pro | Contra |
|---|---|---|
| Interceptor HTTP | Simples, contexto rico (IP, user-agent) | Não captura workers/jobs |
| Prisma Middleware | Captura tudo, incluindo jobs | Sem contexto HTTP, AsyncLocalStorage necessário |
| **Híbrido (escolhido)** | Cobertura total, sem bloquear request | Complexidade moderada de implementação |

---

## Schema Prisma — Tabela `AuditLog`

```prisma
model AuditLog {
  id          Int      @id @default(autoincrement())
  // QUEM
  accountId   Int
  membershipId Int?
  userId      Int?
  role        Int?
  // O QUÊ
  action      String   // "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "TRANSFER" | "MOVE_CARD"
  entity      String   // "Task" | "FluxActivity" | "BoardsCard" | "Membership" | "User" | "Auth"
  entityId    String?  // ID do recurso afetado (string para suportar qualquer PK)
  // CONTEXTO
  metadata    Json?    // { before: {...}, after: {...}, changedFields: [...] }
  ipAddress   String?
  userAgent   String?
  source      String   @default("http")  // "http" | "worker" | "system"
  // QUANDO
  createdAt   DateTime @default(now())

  @@index([accountId, createdAt(sort: Desc)])
  @@index([accountId, entity])
  @@index([accountId, membershipId])
  @@index([entity, entityId])
}
```

**Decisão de retenção:** 90 dias no tier Starter, 365 dias no tier Pro/Enterprise (limpar via job agendado).

**Decisão de `metadata`:** Gravamos `before/after` apenas para `UPDATE` e campos não-sensíveis. Campos `password`, `passwordHash` são blocklist explícita no serviço.

---

## Plano Faseado

---

### 🟢 FASE 1 — MVP (Must Have) — Sprint 1-2

**Objetivo:** Capturar os eventos de maior risco de negócio com mínimo esforço.

#### US-001 — Infraestrutura base do Audit Log

```
Como engenheiro da Dattu
Quero uma tabela AuditLog, um serviço e uma fila dedicada
Para que todos os eventos críticos possam ser gravados sem bloquear requests
```

**Critérios de aceitação:**
- [ ] Migration Prisma cria `AuditLog` com todos os campos do schema acima
- [ ] `AuditLogService.emit(event: AuditEvent)` adiciona job na fila `audit-log-queue`
- [ ] `AuditLogWorker` consome a fila e persiste no banco com retry de 3x
- [ ] Campos `password`, `token`, `passwordHash` são removidos de `metadata` por blocklist
- [ ] `AuditLogModule` é global e injetável em qualquer módulo

**Prioridade:** Must Have
**Estimativa:** 3 dias

---

#### US-002 — Captura de eventos de autenticação

```
Como gerente de conta
Quero ver quem fez login, de qual IP e quando
Para detectar acessos suspeitos à minha conta
```

**Ponto de captura:** `AuthService.login()` e `AuthService.signup()`

**Critérios de aceitação:**
- [ ] Login bem-sucedido gera `{ action: "LOGIN", entity: "Auth", source: "http" }` com IP e user-agent
- [ ] Signup gera `{ action: "CREATE", entity: "Auth" }` com accountId recém-criado
- [ ] Falhas de login (senha errada, sessão deslocada) geram `{ action: "LOGIN_FAILED" }` — sem bloquear o `UnauthorizedException`
- [ ] IP extraído do header `x-forwarded-for` com fallback para `req.socket.remoteAddress`

**Prioridade:** Must Have
**Estimativa:** 1 dia

---

#### US-003 — Captura de movimentação de leads (FluxActivity)

```
Como gerente
Quero saber quando um lead mudou de etapa, para quem foi transferido e por quem
Para garantir rastreabilidade do pipeline comercial
```

**Pontos de captura:**
- `TransferLeadMembershipUseCase.execute()`
- `UpdateStepFluxActivityUseCase.execute()`
- `UpdatePositionBoardCardUseCase.execute()` (mudança de stepId)

**Critérios de aceitação:**
- [ ] Transferência de lead gera `{ action: "TRANSFER", entity: "FluxActivity", metadata: { leadCompanyId, fromMembershipId, toMembershipId } }`
- [ ] Mudança de step gera `{ action: "MOVE_STEP", entity: "FluxActivity", metadata: { leadCompanyId, fromStepId, toStepId } }`
- [ ] Movimentação de card no Kanban gera `{ action: "MOVE_CARD", entity: "BoardsCard", metadata: { fromColumnId, toColumnId, position } }`
- [ ] `membershipId` do ator é sempre gravado (vem do contexto AsyncLocalStorage quando não há request HTTP)

**Prioridade:** Must Have
**Estimativa:** 2 dias

---

#### US-004 — Captura de mutações em Membership

```
Como dono da conta
Quero saber quando um usuário teve seu gestor alterado ou suas permissões mudadas
Para ter controle sobre a hierarquia da equipe
```

**Pontos de captura:** `MembershipService.setManager()`, `MembershipService.toggleShareData()`, `MembershipService.update()`

**Critérios de aceitação:**
- [ ] `setManager` gera `{ action: "UPDATE", entity: "Membership", metadata: { changedFields: ["managerId"], before: {managerId: X}, after: {managerId: Y} } }`
- [ ] `toggleShareData` gera audit com `changedFields: ["shareDataWithManagers"]`
- [ ] Apenas roles `2` (manager) e `4` (super-admin) podem consultar audit de membership

**Prioridade:** Must Have
**Estimativa:** 1 dia

---

#### US-005 — Captura de Tasks

```
Como gerente
Quero ver o histórico de alterações de tarefas
Para saber quem mudou status, prioridade ou responsável
```

**Ponto de captura:** `UpdateTaskUseCase.execute()` e `updateStatus()`

**Critérios de aceitação:**
- [ ] Update de task gera `{ action: "UPDATE", entity: "Task", metadata: { changedFields: [...], before: {...}, after: {...} } }`
- [ ] `before` é populado fazendo `findFirst` antes do `update` (já existente no use-case)
- [ ] Mudança de status `→ DONE/CANCELLED` gera evento específico `{ action: "CLOSE_TASK" }`

**Prioridade:** Must Have
**Estimativa:** 1 dia

---

### 🟡 FASE 2 — Visualização (Should Have) — Sprint 3

#### US-006 — API de consulta do Audit Log

```
Como gerente ou admin
Quero consultar o histórico de ações da minha conta via API
Para auditar comportamentos e investigar incidentes
```

**Endpoint:** `GET /v1/audit-log?accountId=&entity=&membershipId=&action=&from=&to=&take=&skip=`

**Critérios de aceitação:**
- [ ] Rota protegida por `AuthGuard` + validação de role `>= 2` (manager)
- [ ] Filtragem por `entity`, `action`, `membershipId`, `dateRange`
- [ ] Retorna paginado `{ data: AuditLog[], total: number }`
- [ ] `super-admin` (role=4) pode consultar qualquer `accountId`; manager só vê o próprio `accountId`
- [ ] Campo `metadata` retornado apenas para role `>= 2`
- [ ] Resposta cacheável por 30s no Redis (chave por `accountId + queryHash`)

**Prioridade:** Should Have
**Estimativa:** 2 dias

---

#### US-007 — Tela de Audit Log no Frontend

```
Como gerente
Quero uma tela de histórico de atividades no CRM
Para consultar quem fez o quê e quando, sem precisar de acesso ao banco
```

**Rota frontend:** `/manager/audit-log` (alinhado com `/manager` já existente)

**Critérios de aceitação:**
- [ ] Tabela com colunas: `Data/Hora | Usuário | Ação | Entidade | ID | IP`
- [ ] Filtros: período (date range picker), entidade, usuário/membro
- [ ] Ícone de badge colorido por `action` (CREATE=verde, UPDATE=azul, DELETE=vermelho, LOGIN=cinza)
- [ ] Click na linha expande `metadata` em JSON viewer colapsável
- [ ] Paginação server-side (take/skip)
- [ ] Acessível apenas para role `manager` e `super-admin` (validado no middleware Next.js já existente)
- [ ] Loading skeleton durante fetch
- [ ] Export CSV dos resultados filtrados (client-side, max 500 registros)

**Prioridade:** Should Have
**Estimativa:** 3 dias

---

### 🔵 FASE 3 — Retenção & Compliance (Could Have) — Sprint 4+

#### US-008 — Job de retenção e limpeza

```
Como sistema
Quero apagar registros de audit log mais antigos que o limite do plano
Para não inflar o banco e garantir conformidade com política de dados
```

**Critérios de aceitação:**
- [ ] Worker `AuditRetentionWorker` roda via BullMQ com cron `0 3 * * *` (3h da manhã)
- [ ] Starter: deleta registros com `createdAt < now() - 90 dias`
- [ ] Pro/Enterprise: deleta registros com `createdAt < now() - 365 dias`
- [ ] Retenção determinada pela `subscription.planId` da conta
- [ ] Job é idempotente e processa em batches de 1.000 registros para não travar o banco
- [ ] Log do job gravado em tabela `SystemLog` (separada de AuditLog)

**Prioridade:** Could Have
**Estimativa:** 2 dias

---

#### US-009 — AuditInterceptor HTTP global (cobertura total)

```
Como engenheiro
Quero um Interceptor NestJS global que capture automaticamente TODOS os endpoints mutadores
Para não depender de injeção manual em cada use-case
```

**Critérios de aceitação:**
- [ ] Interceptor registrado como `APP_INTERCEPTOR` no `AppModule`
- [ ] Captura apenas métodos `POST`, `PATCH`, `PUT`, `DELETE`
- [ ] Lê `request.user` já populado pelo `AuthGuard`
- [ ] `AsyncLocalStorage` propaga contexto do usuário para camadas internas
- [ ] Rotas sensíveis como `/v1/auth/login` têm decorator `@SkipAudit()` para evitar dupla captura
- [ ] Gravação via fila (nunca síncrona)

**Prioridade:** Could Have
**Estimativa:** 3 dias

---

#### US-010 — Alertas de anomalia em tempo real

```
Como dono da conta
Quero ser notificado se um usuário fizer mais de 20 ações em 5 minutos
Para detectar comportamentos suspeitos automaticamente
```

**Critérios de aceitação:**
- [ ] `AuditLogWorker` incrementa contador Redis `audit:rate:{membershipId}` com TTL de 5min
- [ ] Se contador ultrapassar threshold configurável (default: 20), dispara evento para `NotificationsModule`
- [ ] Notificação é enviada para o gestor da conta via canal existente de notificações
- [ ] Threshold configurável por conta no `SystemSetting`

**Prioridade:** Won't Have (Sprint 4+)
**Estimativa:** 2 dias

---

## Mapa de dependências técnicas

```
US-001 (infra base)
  └── US-002 (auth events)
  └── US-003 (flux/leads)     ← depende de AsyncLocalStorage se chamado por workers
  └── US-004 (membership)
  └── US-005 (tasks)
        └── US-006 (API consulta)
              └── US-007 (frontend)

US-008 (retenção)   ← depende de US-001 + leitura do plano da subscription
US-009 (interceptor global) ← depende de US-001, substitui injeção manual
US-010 (alertas)    ← depende de US-001 + NotificationsModule
```

---

## Riscos e trade-offs documentados

| Risco | Impacto | Mitigação |
|---|---|---|
| Fila offline → eventos perdidos | Alto | Dead-letter queue + fallback de log em arquivo |
| `metadata before/after` inflando o banco | Médio | Gravar apenas `changedFields` por default; `before/after` completo apenas para entidades críticas |
| `AsyncLocalStorage` em workers BullMQ | Médio | Source=`worker` não precisa de contexto HTTP; `membershipId` passado explicitamente no job payload |
| LGPD — dados pessoais em `metadata` | Alto | Blocklist de campos sensíveis no `AuditLogService`; metadata excluído do export CSV por default |