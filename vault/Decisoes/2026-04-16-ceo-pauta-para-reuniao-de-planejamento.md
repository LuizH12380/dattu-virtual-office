---
criado: 2026-04-16
atualizado: 2026-04-16
agente: ceo
cargo: Chief Executive Officer
tipo: decisao-executiva
status: Registrada
---

# Decisão do CEO — Planejamento Sprint Dattu

**Data:** 16 de abril de 2026 | **Status:** ✅ Aprovado com diretrizes

---

## Resposta às Perguntas de Desbloqueio

Antes de qualquer priorização, preciso endereçar as 4 perguntas que o PO levantou corretamente:

| Pergunta | Resposta do CEO |
|---|---|
| Estágio do produto | **Assumo MVP em construção, zero clientes pagantes.** Sem histórico no vault, essa é a premissa conservadora. PO deve confirmar. |
| Capacidade do time | **Assumo time enxuto: 2 devs backend, 1 dev frontend, 1 PO.** Sprint de **2 semanas.** PO ajusta se diferente. |
| Backlog priorizado | **Partindo do zero.** Esta reunião define o backlog v1. |
| Multi-tenancy | **Decisão tomada agora:** `row-level security` com coluna `workspace_id`. Simples, sem overhead de schema-per-tenant neste estágio. Revisamos em escala. |

---

## Aprovações e Rejeições por Bloco

### ✅ APROVADO — Must Have (Sprint 1)

**1. Schema Prisma fechado (Deal, Contact, Pipeline, Stage, Workspace)**
- Pré-requisito absoluto. Sem isso nada anda.
- **Prazo:** 17/04. Não negocia.
- **Escopo mínimo:** modelos com `workspace_id`, sem over-engineering.

**2. Autenticação + RBAC por workspace**
- Sem auth estável não tem produto multi-usuário.
- **Escopo mínimo:** JWT, roles `owner/member`, middleware de workspace.
- Importação, automações e qualquer outra feature dependem disso.

**3. Pipeline Visual de Negócios (Kanban de Deals)**
- É o core do CRM. Sem isso não somos CRM, somos agenda.
- **Escopo mínimo:** CRUD de Pipeline, Stage e Deal. Drag-and-drop de estágio. Sem filtros avançados agora.

**4. Gestão de Contatos com CNPJ lookup**
- MinhaReceitaAPI já está em Go e integrada. Custo de entrega baixo, valor alto para mercado BR.
- **Escopo mínimo:** CRUD de Contact + lookup por CNPJ com circuit breaker no NestJS.

---

### 🟡 APROVADO CONDICIONALMENTE — Should Have (Sprint 2 em diante)

**Automações via n8n**
- Aprovo o **spike técnico de 1 dia** ainda neste sprint.
- Feature completa **entra no Sprint 2**, não no 1.
- **Condição:** spike precisa validar latência dos webhooks e mapeamento dos gatilhos antes de qualquer estimativa de desenvolvimento.
- O dado de "churn 40% menor para usuários com automações ativas" é o argumento mais forte que temos. Priorizamos logo após o core.

**Timeline de atividades por contato/negócio**
- Aprovado para Sprint 2. Depende de Contact + Deal estarem estáveis.

**Dashboard de métricas de vendas**
- Aprovado para Sprint 2, mas **somente após** pipeline em produção com dados reais.

---

### ❌ REJEITADO — Fora do roadmap agora

**Importação CSV, WhatsApp webhook, Relatórios PDF**
- Nenhum desses resolve dor de ativação ou retenção no estágio atual.
- Revisamos quando tivermos os primeiros 50 clientes ativos e feedback real.
- **O que precisa mudar para aprovação:** dados de clientes pedindo explicitamente + pipeline core em produção.

---

## Decisões de Arquitetura Homologadas

```
Multi-tenancy:     row-level (workspace_id em todas as tabelas)
Auth:              JWT + RBAC (owner/member)
Filas:             BullMQ/Redis — provisionado no Sprint 1, usado no Sprint 2
MinhaReceitaAPI:   circuit breaker obrigatório antes de ir a produção
```

---

## Prioridade do Sprint 1 — Ordem de Execução

```
1. Schema Prisma (bloqueante)
2. Auth + RBAC (bloqueante)
3. Pipeline Visual (core do produto)
4. Gestão de Contatos + CNPJ lookup (valor imediato BR)
5. Spike n8n (paralelo, 1 dia, não bloqueia o sprint)
```

---

## Capacidade e Gestão de Risco

- **20% da capacidade reservada para tech debt** — aprovo sem discussão. Sprint incompleto por dívida técnica é custo invisível que vira crise visível.
- **User Stories com Critérios de Aceitação fechados antes de entrar no sprint** — sem AC definido, o card não entra. PO é dono disso.

---

## Próximos Passos — Com Donos e Prazos

| Ação | Dono | Prazo | Status |
|---|---|---|---|
| Fechar Prisma schema (v1) | Tech Lead | **17/04** | 🔴 Urgente |
| User Stories Sprint 1 com AC | PO | **18/04** | 🟡 Em andamento |
| Spike n8n + webhooks | Dev Backend | **18/04** | 🟡 Paralelo |
| Configurar BullMQ/Redis no ambiente | Dev Backend | **18/04** | 🟡 Paralelo |
| Kickoff de desenvolvimento | Time todo | **19/04** | ⚪ Aguarda acima |

---

## Visão de Longo Prazo (Para o Time Entender o Porquê)

> O Dattu compete em mercado dominado por Pipedrive e RD Station. Não vencemos por ter mais features — vencemos por ser o CRM mais fluido para o mercado brasileiro, com CNPJ lookup nativo, automações acessíveis e UX sem fricção. **Sprint 1 nos coloca no jogo. Sprint 2 nos diferencia.**

---

**Dependência de agente:** Com estas decisões homologadas, o fluxo segue para o **Analista de Dados** para mapear métricas de acompanhamento do sprint (ativação, velocidade de entrega, estabilidade da API). Em paralelo, o **Tech Lead** já pode iniciar o Prisma schema com base na decisão de multi-tenancy aprovada acima.