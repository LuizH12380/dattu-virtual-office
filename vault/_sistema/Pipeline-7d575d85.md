---
criado: 2026-04-16
atualizado: 2026-04-16
tipo: pipeline-run
prioridade: medium
---

# Pipeline: Pauta para reunião de planejamento
**ID:** 7d575d85-285a-42a8-a93f-cfcf4331b199
**Data:** 16/04/2026
**Prioridade:** medium

## Progresso
```
✓ Definição de Requisitos
✓ Aprovação Executiva
✓ Análise de Dados & Schema
✓ Desenvolvimento Backend
✓ Desenvolvimento Frontend
✓ Review de UX
✓ Code Review
✓ Deploy & Infraestrutura
```

## Output Final
# Plano de Deploy — BLOQ-01: Auth httpOnly Cookie

**DevOps Engineer — Dattu**
**Data:** 16/04/2026
**Branch:** `feature/auth-httpcookie-bloq01`
**Status de entrada:** 🔴 Bloqueado no Tech Lead — aguardando aprovação

---

## ⚠️ Status Atual

O PR ainda **não foi aprovado** pelo Tech Lead. Este documento é o **plano de deploy antecipado** — preparação da infraestrutura e estratégia enquanto o código ainda está em revisão. Nenhum comando de deploy será executado até receber o ✅ do Tech Lead.

---

## 1. Contexto da Feature

Esta feature altera o mecanismo de autenticação do Dattu:

| Antes | Depois |
|-------|--------|
| Token em `localStorage` (inferido) | Cookie `httpOnly` gerenciado pelo servidor |
| Sem proteção contra XSS token theft | XSS não acessa o cookie |
| Sem rate limiting documentado | Rate limit + `Retry-After` no NestJS |

**Impacto crítico:** Mudança no fluxo de autenticação afeta **100% dos usuários ativos**. Sessões existentes serão invalidadas no deploy se os cookies antigos não forem aceitos em período de transição.

---

## 2. Pré-Requisitos para Liberação do Deploy

> Estes itens devem ser confirmados **antes** de eu receber o go do Tech Lead.

### 2.1 Checklist de Pré-Deploy

```
[ ] CÓDIGO
    [ ] PR aprovado pelo Tech Lead (CR-01 a CR-06 resolvidos)
    [ ] PR aprovado pelo UX Designer (itens P1 resolvidos)
    [ ] Branch atualizada com main (sem conflitos)
    [ ] CI passou: lint + type-check + testes unitários + e2e

[ ] VARIÁVEIS DE AMBIENTE
    Backend (dattu-back-end):
    [ ] JWT_SECRET rotacionado para produção (min 256 bits)
    [ ] JWT_EXPIRATION definido (ex: 15m para access, 7d para refresh)
    [ ] COOKIE_SECURE=true confirmado para produção
    [ ] COOKIE_SAMESITE=strict confirmado
    [ ] RATE_LIMIT_LOGIN_TTL e RATE_LIMIT_LOGIN_LIMIT definidos

    Frontend (dattu-front-end):
    [ ] NEXT_PUBLIC_API_URL apontando para produção
    [ ] Confirmar que NENHUM secret está com prefixo NEXT_PUBLIC_

[ ] BANCO DE DADOS
    [ ] Verificar se alguma migration está pendente
        → Esta feature altera autenticação, não schema — improvável migration
        → Confirmar com Dev: nenhuma coluna de token no users foi adicionada?
    [ ] Backup do banco confirmado (automático ou manual)

[ ] INFRAESTRUTURA
    [ ] Redis disponível e acessível pelo backend (BullMQ + cache de sessão)
    [ ] Certificado TLS válido (cookie Secure exige HTTPS)
    [ ] Load balancer com sticky sessions OU sessões armazenadas no Redis
        → CRÍTICO: cookie httpOnly + múltiplas instâncias = sessão deve
           ser centralizada no Redis, não em memória
```

---

## 3. Estratégia de Deploy

### 3.1 Abordagem: Rolling Deploy com Feature Flag

Dado que esta é uma mudança de autenticação crítica, usarei **rolling deploy** com suporte a **período de transição de cookies**.

```
Estratégia geral:
  1. Backend deploya primeiro (suporta AMBOS os mecanismos por 24h)
  2. Frontend deploya depois
  3. Após 24h sem problemas: remover suporte ao mecanismo antigo
```

**Por que não Blue-Green aqui?**

Blue-green exigiria dois ambientes completos sincronizados. Para uma mudança de auth, o risco de split-brain de sessões entre os dois ambientes é alto. Rolling com compatibilidade temporária é mais seguro.

---

### 3.2 Fase 1 — Backend NestJS (dattu-back-end)

```bash
# 1. Pull da branch aprovada
git checkout main
git pull origin main

# 2. Build da imagem Docker
docker build \
  --build-arg NODE_ENV=production \
  -t dattu-backend:bloq01-$(git rev-parse --short HEAD) \
  -f Dockerfile .

# 3. Tag como candidato a produção (não latest ainda)
docker tag dattu-backend:bloq01-<sha> dattu-backend:release-candidate

# 4. Executar testes de integração contra a imagem candidata
docker compose -f docker-compose.test.yml up --abort-on-container-exit

# 5. Se testes passarem: deploy rolling (PM2 ou orquestrador)
# Usando PM2:
pm2 reload dattu-backend --update-env

# Usando Docker (rolling manual):
docker service update \
  --image dattu-backend:bloq01-<sha> \
  --update-parallelism 1 \
  --update-delay 30s \
  dattu_backend_service
```

**Configuração de variáveis no servidor:**

```bash
# Injetar via secrets manager ou .env seguro no servidor
export JWT_SECRET="$(openssl rand -hex 32)"
export COOKIE_SECURE=true
export COOKIE_SAMESITE=strict
export COOKIE_HTTPONLY=true
export COOKIE_MAX_AGE=900  # 15 minutos em segundos
export RATE_LIMIT_LOGIN_TTL=60
export RATE_LIMIT_LOGIN_LIMIT=5
```

---

### 3.3 Fase 2 — Frontend Next.js 15 (dattu-front-end)

```bash
# Opção A: Vercel (deploy automático via push)
git push origin main
# Vercel detecta push e inicia build automaticamente
# Monitorar: vercel logs --follow

# Opção B: Docker + Nginx
docker build \
  --build-arg NEXT_PUBLIC_API_URL=https://api.dattu.com.br \
  -t dattu-frontend:bloq01-$(git rev-parse --short HEAD) \
  -f Dockerfile .

docker service update \
  --image dattu-frontend:bloq01-<sha> \
  --update-parallelism 1 \
  --update-delay 20s \
  dattu_frontend_service
```

---

### 3.4 Ordem de Deploy

```
┌─────────────────────────────────────────────────────────────┐
│  ORDEM OBRIGATÓRIA                                          │
│                                                             │
│  1. ✅ Backend (NestJS) → aceita cookie httpOnly            │
│  2. ⏱  Aguardar 5 min → smoke tests no backend             │
│  3. ✅ Frontend (Next.js) → envia cookie httpOnly           │
│  4. ⏱  Aguardar 10 min → smoke tests completos             │
│  5. ✅ Monitoramento ativo por 2h                           │
└─────────────────────────────────────────────────────────────┘

⛔ NUNCA fazer frontend antes do backend:
   O novo frontend enviará cookies que o backend antigo
   não sabe processar → usuários ficam sem conseguir logar.
```

---

## 4. Migrations em Produção

> **Resultado da análise:** Sem migrations esperadas nesta feature.

Esta feature altera o mecanismo de transporte do token (localStorage → cookie), não o schema do banco. Porém, **se o Dev adicionou alguma coluna** (ex: `refresh_token`, `session_id` na tabela `users`), o protocolo é:

```bash
# Verificar migrations pendentes ANTES do deploy
npx prisma migrate status

# Se houver migration pendente — executar ANTES do backend subir
# Zero-downtime: adicionar coluna nullable primeiro, depois aplicar default
npx prisma migrate deploy

# Confirmar resultado
npx prisma migrate status
```

**Isso deve estar confirmado no checklist 2.1 antes do deploy.**

---

## 5. Plano de Rollback

### 5.1 Critérios para Acionar Rollback

```
Acionar rollback imediato se qualquer um destes ocorrer
nas primeiras 2h após deploy:

[ ] Taxa de erro 4xx no /auth/login > 5% (baseline: < 1%)
[ ] Taxa de erro 5xx em qualquer endpoint > 2%
[ ] Tempo médio de resposta do login > 3s por mais de 2 min
[ ] Mais de 10 reports de usuários sem conseguir logar
[ ] Redis inacessível (sessões perdidas)
[ ] Qualquer vazamento de cookie em logs (senha/token visível)
```

### 5.2 Procedimento de Rollback

**Tempo estimado:** 4–6 minutos

```bash
# ─── ROLLBACK BACKEND ────────────────────────────────────────

# Identificar a imagem anterior (mantida com tag)
docker images | grep dattu-backend

# Reverter para a imagem anterior
docker service update \
  --image dattu-backend:stable-anterior \
  --update-parallelism 2 \
  --update-delay 10s \
  dattu_backend_service

# Confirmar que o serviço subiu
docker service ps dattu_backend_service

# ─── ROLLBACK FRONTEND ───────────────────────────────────────

# Opção Vercel: usar instant rollback no dashboard
# vercel rollback [deployment-url]

# Opção Docker:
docker service update \
  --image dattu-frontend:stable-anterior \
  dattu_frontend_service

# ─── VERIFICAÇÃO PÓS-ROLLBACK ────────────────────────────────
curl -s -o /dev/null -w "%{http_code}" https://api.dattu.com.br/health
# Esperado: 200

curl -X POST https://api.dattu.com.br/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@dattu.com.br","password":"SmokeTest#01"}' \
  -w "\nHTTP Status: %{http_code}\n"
# Esperado: 200 com cookie (ou 401 se credenciais inválidas — endpoint respondendo)
```

### 5.3 Manter Imagens Anteriores

```bash
# Política: nunca sobrescrever :latest sem manter a anterior
# Antes de qualquer deploy, tagear o estado atual como :stable-anterior

docker tag dattu-backend:latest dattu-backend:stable-anterior
docker tag dattu-frontend:latest dattu-frontend:stable-anterior
```

---

## 6. Testes de Smoke Pós-Deploy

### 6.1 Backend

```bash
# ── Saúde do serviço ─────────────────────────────────────────
curl -s https://api.dattu.com.br/health | jq .
# Esperado: { "status": "ok", "redis": "connected", "db": "connected" }

# ── Login bem-sucedido ───────────────────────────────────────
RESPONSE=$(curl -si -X POST https://api.dattu.com.br/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@dattu.com.br","password":"SmokeTest#01"}')

echo "$RESPONSE" | grep "set-cookie"
# Esperado: set-cookie: auth_token=...; HttpOnly; Secure; SameSite=Strict

echo "$RESPONSE" | grep "HTTP/"
# Esperado: HTTP/2 200

# ── Cookie HttpOnly não acessível via JS (verificar header) ──
echo "$RESPONSE" | grep -i "httponly"
# Esperado: presente

# ── Credenciais inválidas retornam 401 (não 404) ─────────────
curl -s -o /dev/null -w "%{http_code}" -X POST https://api.dattu.com.br/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"naoexiste@dattu.com.br","password":"qualquer"}'
# Esperado: 401 (não 404 — anti-enumeration)

# ── Rate limit ativo ─────────────────────────────────────────
for i in {1..6}; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST https://api.dattu.com.br/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@dattu.com.br","password":"errado"}')
  echo "Tentativa $i: $STATUS"
done
# Esperado: tentativas 1-5 retornam 401, tentativa 6 retorna 429
```

### 6.2 Frontend

```bash
# ── Página de login carrega ──────────────────────────────────
curl -s -o /dev/null -w "%{http_code}" https://app.dattu.com.br/login
# Esperado: 200

# ── Redirect não-autenticado funciona ────────────────────────
curl -s -o /dev/null -w "%{http_code}" https://app.dattu.com.br/dashboard
# Esperado: 302 ou 307 para /login

# ── Assets estáticos acessíveis (middleware não bloqueou) ────
curl -s -o /dev/null -w "%{http_code}" https://app.dattu.com.br/favicon.ico
# Esperado: 200 (não 307 redirect)

# ── Open redirect bloqueado ──────────────────────────────────
curl -s -o /dev/null -w "%{http_code}" \
  "https://app.dattu.com.br/login?redirectTo=//evil.com"
# Esperado: após login, redireciona para /dashboard, não para evil.com
```

---

## 7. Monitoramento nas Primeiras 2 Horas

### 7.1 Métricas Críticas a Observar

| Métrica | Baseline esperado | Alerta se |
|---------|-------------------|-----------|
| `POST /auth/login` — taxa de sucesso (2xx) | > 94% | < 90% por 2 min |
| `POST /auth/login` — latência P95 | < 800ms | > 2s por 2 min |
| `POST /auth/login` — taxa 429 | < 2% | > 10% (rate limit muito agressivo) |
| `POST /auth/login` — taxa 5xx | < 0.1% | > 1% |
| Redis — conexões ativas | estável | queda brusca ou timeout |
| Memory do backend | estável | crescimento contínuo (leak) |
| Erros de `SameSite` no browser | 0 | qualquer ocorrência |

### 7.2 Queries de Observabilidade

```bash
# ── Logs em tempo real (PM2) ─────────────────────────────────
pm2 logs dattu-backend --lines 200

# ── Logs em tempo real (Docker) ──────────────────────────────
docker service logs -f --tail 200 dattu_backend_service

# ── Filtrar apenas erros de auth ─────────────────────────────
docker service logs dattu_backend_service 2>&1 | \
  grep -E "(auth|login|cookie|token|ERROR|WARN)" | tail -50

# ── Verificar Redis ──────────────────────────────────────────
redis-cli PING
redis-cli INFO stats | grep -E "(total_commands|rejected_connections)"