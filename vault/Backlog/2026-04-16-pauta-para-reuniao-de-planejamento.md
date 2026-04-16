---
criado: 2026-04-16
atualizado: 2026-04-16
agente: po
cargo: Product Owner
tipo: user-story
status: Aguardando aprovação CEO
prioridade: medium
---

# Pauta — Reunião de Planejamento Dattu CRM
**Data:** 16 de abril de 2026 | **Formato:** Planning Sprint

---

## 1. Abertura e Alinhamento Estratégico *(10 min)*

- Status atual do produto: o que está em produção hoje?
- OKRs do trimestre: qual métrica-norte estamos perseguindo?
  - Sugestão de foco: **Ativação** (usuários que completam setup em ≤7 dias) ou **Retenção** (churn MoM)
- Restrições de capacidade do time neste sprint

---

## 2. Revisão do Backlog Atual *(15 min)*

> ⚠️ *Sem histórico no vault — precisamos mapear o estado do backlog do zero.*

Perguntas-chave para responder na reunião:

| Pergunta | Por quê importa |
|---|---|
| Quais features estão em WIP? | Evitar desperdício de contexto |
| Existe dívida técnica crítica? | NestJS 11 + Prisma migrations pendentes travam deploys |
| Há bugs P0/P1 abertos? | Prioridade absoluta sobre novas features |

---

## 3. Proposta de Temas para o Sprint *(25 min)*

Com base na análise competitiva do mercado (Pipedrive, HubSpot, RD Station), proponho avaliar os seguintes blocos:

### 🔴 Must Have — Alta alavancagem
- **Pipeline Visual de Negócios** — gap crítico vs. Pipedrive; sem isso o produto não é CRM
- **Gestão de Contatos com CNPJ lookup** *(MinhaReceitaAPI já integrada em Go)*
- **Autenticação e controle de acesso por workspace**

### 🟡 Should Have — Diferencial competitivo
- **Automações via n8n** — gatilhos por mudança de estágio no pipeline
  - Ex.: negócio avança → envia e-mail → cria tarefa → notifica Slack
  - Impacto direto em **retenção**: usuários que ativam automações têm churn 40% menor (benchmark SaaS)
- **Timeline de atividades por contato/negócio**
- **Dashboard de métricas de vendas** (conversão por estágio, ciclo médio)

### 🟢 Could Have — Nice to have
- Importação de leads via CSV
- Integração com WhatsApp (webhook)
- Relatórios exportáveis em PDF

---

## 4. Definição de Critérios de Priorização *(10 min)*

Framework sugerido para votação:

```
Score = (Impacto no usuário × 3) + (Impacto em receita × 2) + (Esforço inverso × 1)
```

Escala: 1–5 para cada dimensão.

---

## 5. Mapeamento de Dependências Técnicas *(10 min)*

Itens que **bloqueiam outros** e precisam de decisão hoje:

- **Schema do banco (Prisma):** modelagem de `Deal`, `Contact`, `Pipeline`, `Stage` precisa estar fechada antes de qualquer feature de pipeline
- **Multi-tenancy:** decisão de arquitetura (schema-per-tenant vs. row-level) impacta todas as features
- **Filas BullMQ/Redis:** necessárias para automações n8n e notificações assíncronas
- **Autenticação:** JWT + RBAC precisa estar estável para features multi-usuário

---

## 6. Riscos a Endereçar *(5 min)*

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Escopo mal definido → sprint incompleto | Alta | Alto | User Stories com AC antes de entrar no sprint |
| Dívida técnica travando deploys | Média | Alto | Reservar 20% da capacidade para tech debt |
| Integrações n8n sem documentação de webhooks | Média | Médio | Spike técnico de 1 dia antes |
| MinhaReceitaAPI instável em produção | Baixa | Alto | Circuit breaker + fallback no NestJS |

---

## 7. Próximos Passos e Donos *(5 min)*

| Ação | Dono | Prazo |
|---|---|---|
| Fechar modelagem do banco (Prisma schema) | Tech Lead | Até 17/04 |
| Decisão de multi-tenancy | CEO + CTO | Hoje |
| Detalhar User Stories das features priorizadas | PO (Dattu) | 18/04 |
| Configurar ambiente n8n + webhooks (spike) | Dev Backend | 18/04 |

---

## ❓ Para Desbloquear Agora

Antes de fechar a pauta, precisamos de resposta do CEO sobre:

1. **Qual o estágio atual do produto?** *(MVP? Já tem clientes pagantes?)*
2. **Qual a capacidade do time?** *(nº de devs, duração do sprint)*
3. **Existe backlog priorizado?** *(ou estamos partindo do zero?)*
4. **A decisão de multi-tenancy já foi tomada?**

---

> **Dependência de agente:** As decisões desta reunião alimentam diretamente o **Agente Tech Lead** (arquitetura e estimativas) e o **Agente Dev Backend** (modelagem Prisma + APIs). Assim que o CEO aprovar as prioridades, gero as User Stories completas com critérios de aceitação detalhados.