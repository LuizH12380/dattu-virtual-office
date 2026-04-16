---
criado: 2026-04-16
atualizado: 2026-04-16
agente: data-analyst
cargo: Analista de Dados
tipo: analise-dados
status: Entregue ao Backend
---

# Requirements de Dados — Sprint 1 Dattu

**Data:** 16 de abril de 2026 | **Analista:** Dattu Data | **Status:** ✅ Pronto para DEV Backend

---

## 1. Entidades de Dados Envolvidas

```
Workspace ──< User (via WorkspaceMember)
Workspace ──< Pipeline ──< Stage ──< Deal
Workspace ──< Contact
Deal >── Contact (many-to-many via DealContact)
Deal ──< Activity (preparado para Sprint 2)
```

**Total de modelos Sprint 1:** 8 modelos principais + 2 tabelas de junção

---

## 2. Proposta de Schema Prisma

### 2.1 Workspace + Auth + RBAC

```prisma
model Workspace {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  members   WorkspaceMember[]
  pipelines Pipeline[]
  contacts  Contact[]
  deals     Deal[]

  @@index([slug])
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  name         String
  avatarUrl    String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  workspaces   WorkspaceMember[]
  dealsOwned   Deal[]            @relation("DealOwner")

  @@index([email])
}

model WorkspaceMember {
  id          String          @id @default(cuid())
  workspaceId String
  userId      String
  role        WorkspaceRole   @default(MEMBER)
  joinedAt    DateTime        @default(now())

  workspace   Workspace       @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user        User            @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, userId])
  @@index([workspaceId])
  @@index([userId])
}

enum WorkspaceRole {
  OWNER
  MEMBER
}
```

---

### 2.2 Pipeline + Stage + Deal (Core do CRM)

```prisma
model Pipeline {
  id          String   @id @default(cuid())
  workspaceId String
  name        String
  isDefault   Boolean  @default(false)
  position    Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  stages      Stage[]

  @@index([workspaceId])
  @@index([workspaceId, isDefault])
}

model Stage {
  id          String     @id @default(cuid())
  workspaceId String
  pipelineId  String
  name        String
  position    Int
  color       String?    // hex, ex: "#4F46E5"
  probability Int        @default(0) // 0-100
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  pipeline    Pipeline   @relation(fields: [pipelineId], references: [id], onDelete: Cascade)
  deals       Deal[]

  @@index([pipelineId])
  @@index([workspaceId])
  @@index([pipelineId, position]) // crítico para ordenação Kanban
}

model Deal {
  id          String     @id @default(cuid())
  workspaceId String
  stageId     String
  ownerId     String
  title       String
  value       Decimal?   @db.Decimal(15, 2)
  currency    String     @default("BRL")
  status      DealStatus @default(OPEN)
  expectedCloseAt DateTime?
  closedAt    DateTime?
  position    Int        @default(0) // posição dentro do stage
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  workspace   Workspace  @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  stage       Stage      @relation(fields: [stageId], references: [id])
  owner       User       @relation("DealOwner", fields: [ownerId], references: [id])
  contacts    DealContact[]

  @@index([workspaceId])
  @@index([workspaceId, status])
  @@index([stageId, position])   // crítico para Kanban
  @@index([ownerId])
  @@index([workspaceId, createdAt]) // relatórios temporais Sprint 2
}

enum DealStatus {
  OPEN
  WON
  LOST
}

model DealContact {
  dealId    String
  contactId String

  deal      Deal    @relation(fields: [dealId], references: [id], onDelete: Cascade)
  contact   Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)

  @@id([dealId, contactId])
  @@index([contactId]) // busca reversa: deals de um contato
}
```

---

### 2.3 Contact + CNPJ Lookup

```prisma
model Contact {
  id          String      @id @default(cuid())
  workspaceId String
  type        ContactType @default(PERSON)
  name        String
  email       String?
  phone       String?

  // Campos PJ — populados via MinhaReceitaAPI
  cnpj              String?
  companyName       String?   // razão social
  tradeName         String?   // nome fantasia
  cnpjStatus        String?   // "ATIVA", "BAIXADA", etc.
  cnpjLastFetchedAt DateTime? // controle de cache/staleness

  // Campos PF
  cpf       String?

  avatarUrl String?
  notes     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  workspace Workspace    @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  deals     DealContact[]

  @@index([workspaceId])
  @@index([workspaceId, type])
  @@index([workspaceId, email])
  @@index([cnpj])               // lookup por CNPJ
  @@index([workspaceId, name])  // busca textual simples
}

enum ContactType {
  PERSON
  COMPANY
}
```

---

### 2.4 Tabela de Auditoria de CNPJ Lookups

> Necessária para controle de rate limit, circuit breaker e analytics de uso da MinhaReceitaAPI.

```prisma
model CnpjLookupLog {
  id          String   @id @default(cuid())
  workspaceId String
  cnpj        String
  success     Boolean
  statusCode  Int?
  durationMs  Int?
  source      String   @default("minhareceita") // extensível
  createdAt   DateTime @default(now())

  @@index([cnpj, createdAt])      // deduplicação e cache staleness
  @@index([workspaceId, createdAt])
  @@index([success, createdAt])   // monitoramento de falhas
}
```

---

## 3. Queries Críticas e Estratégia de Otimização

### 3.1 Kanban — Buscar deals por pipeline agrupados por stage

```sql
-- Query crítica: carregamento inicial do Kanban
SELECT
  s.id, s.name, s.position, s.color,
  d.id, d.title, d.value, d.position, d.status
FROM stages s
LEFT JOIN deals d
  ON d.stage_id = s.id
  AND d.workspace_id = $workspaceId
  AND d.status = 'OPEN'
WHERE s.pipeline_id = $pipelineId
  AND s.workspace_id = $workspaceId
ORDER BY s.position ASC, d.position ASC;
```

**Índices que cobrem essa query:**
- `@@index([pipelineId, position])` em Stage ✅
- `@@index([stageId, position])` em Deal ✅
- `@@index([workspaceId, status])` em Deal ✅

**Estratégia de cache Redis:**
```
Key: kanban:{workspaceId}:{pipelineId}
TTL: 30s (invalidado em toda mutação de deal/stage)
Tipo: string (JSON serializado)
```

---

### 3.2 Drag-and-drop — Reordenar deal entre stages

> Requer atualização em lote de `position`. Evitar N updates individuais.

```sql
-- Atualizar posição do deal movido + rebalancear stage de destino
UPDATE deals
SET stage_id = $newStageId, position = $newPosition, updated_at = NOW()
WHERE id = $dealId AND workspace_id = $workspaceId;

-- Rebalancear posições no stage de destino (apenas deals afetados)
UPDATE deals
SET position = position + 1
WHERE stage_id = $newStageId
  AND workspace_id = $workspaceId
  AND position >= $newPosition
  AND id != $dealId;
```

**Recomendação:** usar `position` com float (ex: `Decimal @db.Decimal(10,5)`) para evitar rebalanceamento em cadeia. Considerar revisão no Sprint 2.

---

### 3.3 Busca de contatos por workspace

```sql
SELECT * FROM contacts
WHERE workspace_id = $workspaceId
  AND (name ILIKE $query OR email ILIKE $query OR cnpj = $cnpjClean)
ORDER BY name ASC
LIMIT 20;
```

**Atenção:** `ILIKE` sem índice é full scan. Para Sprint 1, aceitável com volume baixo. **Sprint 2:** implementar `pg_trgm` ou `ts_vector` para busca full-text.

---

## 4. Eventos de Analytics a Capturar

> Todos os eventos seguem o padrão: `{entidade}.{ação}` com `workspaceId`, `userId`, `timestamp` e metadados.

| Evento | Gatilho | Metadados Essenciais |
|---|---|---|
| `deal.created` | POST /deals | `pipelineId`, `stageId`, `value`, `hasContact` |
| `deal.stage_changed` | PATCH /deals/:id/stage | `fromStageId`, `toStageId`, `dealId`, `timeInPreviousStage` |
| `deal.won` | PATCH status=WON | `dealId`, `value`, `daysToClose` |
| `deal.lost` | PATCH status=LOST | `dealId`, `value`, `lastStageId` |
| `contact.created` | POST /contacts | `type`, `hasCnpj`, `hasEmail` |
| `cnpj.lookup` | GET /contacts/cnpj/:cnpj | `cnpj`, `success`, `durationMs`, `fromCache` |
| `pipeline.created` | POST /pipelines | `stageCount` |
| `workspace.member_invited` | POST /workspaces/:id/members | `role` |
| `auth.login` | POST /auth/login | `method: jwt` |

**Armazenamento Sprint 1:** logar em tabela `AnalyticsEvent` (append-only) + Redis counter para métricas em tempo real.

```prisma
model AnalyticsEvent {
  id          String   @id @default(cuid())
  workspaceId String
  userId      String?
  event       String
  properties  Json     @default("{}")
  occurredAt  DateTime @default(now())

  @@index([workspaceId, event])
  @@index([workspaceId, occurredAt])
  @@index([event, occurredAt]) // agregações cross-workspace para produto
}
```

---

## 5. Estimativa de Volume de Dados

> Premissa: MVP com 0 clientes pagantes. Projeção para primeiros 90 dias com crescimento conservador.

| Tabela | Sprint 1 (fim) | 30 dias | 90 dias |
|---|---|---|---|
| Workspace | ~10 | ~50 | ~200 |
| User | ~30 | ~150 | ~600 |
| WorkspaceMember | ~30 | ~150 | ~600 |
| Pipeline | ~15 | ~75 | ~300 |
| Stage | ~75 | ~375 | ~1.500 |
| Deal | ~200 | ~2.000 | ~20.000 |
| Contact | ~300 | ~3.000 | ~30.000 |
| CnpjLookupLog | ~100 | ~1.500 | ~15.000 |
| AnalyticsEvent | ~500 | ~10.000 | ~150.000 |

**Conclusão:** Nenhuma tabela chega perto de limites de performance com os índices propostos até 90 dias. **Particionamento e arquivamento são preocupações do Sprint 4+.**

---

## 6. Considerações de Privacidade (LGPD)

### Dados Sensíveis Mapeados

| Campo | Tabela | Classificação | Tratamento |
|---|---|---|---|
| `email` | User, Contact | Dado pessoal | Não expor em logs |
| `passwordHash` | User | Dado sensível | bcrypt, nunca serializar |
| `cpf` | Contact | Dado pessoal sensível | Mascarar em respostas (`***.***.***-**`) |
| `cnpj` | Contact | Dado público (RFB) | Sem restrição especial |
| `phone` | Contact | Dado pessoal | Não expor em logs |

### Obrigações Imediatas (Sprint 1)

1. **Soft delete obrigatório** — adicionar `deletedAt DateTime?` em `User` e `Contact`. Não deletar fisicamente dados pessoais enquanto houver obrigação contratual ativa.
2. **Auditoria de acesso** — `WorkspaceMember` garante que dados só trafeguem via `workspaceId` validado no middleware. Row-level security via Prisma middleware antes de chegar ao PostgreSQL.
3. **CPF nunca em query string** — apenas body/POST.
4. **`CnpjLookupLog` não armazena dados pessoais** — apenas CNPJ (dado público), status e duração. ✅ Sem risco LGPD.
5. **Consentimento e DPA:** definir Política de Privacidade antes do primeiro cliente real (fora do escopo técnico, ação para CEO/jurídico).

---

## 7. Redis — Estrutura de Keys

```
# Cache Kanban
kanban:{workspaceId}:{pipelineId}         → JSON | TTL 30s

# Contadores em tempo real
counter:deals:open:{workspaceId}          → INT  | sem TTL
counter:deals:won:{workspaceId}:{month}   → INT  | TTL 90d
counter:cnpj:lookups:{workspaceId}:{day}  → INT  | TTL 7d

# Rate limit MinhaReceitaAPI (circuit breaker)
ratelimit:minhareceita:failures           → INT  | TTL 60s
ratelimit:minhareceita:open               → 1/0  | TTL 30s

# Sessões JWT (refresh token blacklist)
jwt:blacklist:{jti}                       → 1    | TTL = exp do token
```

---

## 8. Checklist de Entrega para DEV Backend

```
[ ] Schema Prisma aplicado via migration (prazo: 17/04)
[ ] Row-