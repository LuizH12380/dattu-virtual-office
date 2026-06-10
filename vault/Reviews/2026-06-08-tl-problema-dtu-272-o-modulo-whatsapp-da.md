---
criado: 2026-06-08
atualizado: 2026-06-08
agente: tech-lead
cargo: Tech Lead
tipo: code-review
status: Revisado
pipelineId: undefined
taskTitle: undefined
---

Diagnóstico claro pela arquitetura: como o evento é gravado **antes** de parsing/HMAC/worker, e só os POSTs de teste aparecem, a mensagem real **não está chegando ao servidor**. O problema é 100% upstream (Meta), não no nosso código. HMAC, prefixo `v1/` e worker estão exonerados — se a request batesse, geraria linha.

## 1) Hipóteses (por probabilidade)
1. **Campo `messages` não assinado** no App Dashboard > WhatsApp > Configuration > Webhooks (validar Callback ≠ assinar field). ← hipótese principal
2. **App não inscrito na WABA**: falta `POST /{WABA_ID}/subscribed_apps`. Assinar o field no app não basta; o app precisa estar subscrito à conta WhatsApp Business.
3. **App em modo Development** (não Live) — webhook de `messages` só dispara com app publicado.
4. Número de teste enviando para um número que não é o do Cloud API conectado / token de outra WABA.
5. (Improvável) firewall/Cloudflare bloqueando User-Agent da Meta `facebookexternalua` — mas o test POST passou, então a URL é alcançável.

## 2) Teste mais rápido (confirma/descarta #1 e #2 de uma vez)
```bash
# Campos assinados no app:
curl -s "https://graph.facebook.com/v20.0/{APP_ID}/subscriptions?access_token={APP_TOKEN}"
# App inscrito na WABA:
curl -s "https://graph.facebook.com/v20.0/{WABA_ID}/subscribed_apps?access_token={SYSTEM_USER_TOKEN}"
```
Se `messages` não estiver no 1º, ou o array vier vazio no 2º → causa confirmada.

## 3) Plano de verificação (Luiz executa)
1. Rodar os 2 `curl` acima e conferir `messages` + `subscribed_apps`.
2. Se faltar field: App Dashboard > WhatsApp > Configuration > Webhooks > **Manage > marcar `messages`**.
3. Se WABA vazia: `POST /{WABA_ID}/subscribed_apps` (System User token).
4. Confirmar app **Live** (toggle no topo do dashboard).
5. Enviar msg real ao número e checar `SELECT * FROM whatsapp_webhook_event ORDER BY created_at DESC LIMIT 1`.

Próximo passo: roda o passo 1 e me cola a saída dos dois curls — em 30s eu fecho o diagnóstico.