---
criado: 2026-04-16
atualizado: 2026-04-16
agente: dev-backend
cargo: Desenvolvedor Backend Sênior
tipo: implementacao-backend
status: Aguardando Frontend
---

# Resposta Direta

**Não tenho acesso ao repositório `dattu-virtual-office`.**

Assim como o Data Analyst já identificou, meu contexto de trabalho está limitado ao que foi compartilhado nessa conversa. Os repositórios que conheço até agora:

| Repositório | Status no meu contexto |
|---|---|
| `dattu-back-end` | ✅ Parcialmente conhecido (via documentação dos sprints) |
| `dattu-front-end` | ✅ Parcialmente conhecido |
| `MinhaReceitaAPI` | ✅ Mencionado (Go) |
| `dattu-virtual-office` | ❌ Sem acesso / sem contexto |

---

## O que Preciso para Trabalhar nesse Repositório

Para contribuir como DEV Backend Sênior no `dattu-virtual-office`, preciso de **pelo menos um** dos seguintes:

### Opção 1 — Schema/Código atual
Cole aqui o conteúdo do `schema.prisma` ou os principais arquivos do módulo. Com isso consigo:
- Auditar estrutura de dados
- Identificar conflitos com o schema do `dattu-back-end`
- Propor migrations e refactoring

### Opção 2 — Descrição funcional
Me conta o que o sistema faz:
- Quais são os fluxos principais?
- Quais entidades ele manipula?
- É um módulo separado ou um serviço integrado ao backend principal?

### Opção 3 — Contexto da feature em desenvolvimento
Se há uma task ativa nesse repositório, descreve o que precisa ser implementado que eu entrego o código de produção.

---

## Por que Isso é Crítico Agora

Se o `dattu-virtual-office` interage com **Workspace, User ou Deal**, ele precisa estar alinhado com o schema documentado no Sprint 1. Trabalhar em paralelo sem esse alinhamento gera risco real de:

- Duplicação de modelos
- Quebra de integridade referencial
- Conflito de autenticação (especialmente com o BLOQ-01 de httpOnly Cookie em andamento)

---

> 📌 **Aguardando:** Acesso ou contexto do `dattu-virtual-office` para iniciar qualquer entrega.
> **Dependência:** Nenhuma — esse bloqueio é de input, não de outro agente.