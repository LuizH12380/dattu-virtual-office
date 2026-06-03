---
criado: 2026-06-02
atualizado: 2026-06-02
agente: data-analyst
cargo: Analista de Dados
tipo: analise-dados
status: Entregue ao Backend
pipelineId: c315b6c2-f9b8-4488-adf7-a35f2480ea65
taskTitle: Tenho a seguinte situaç
---

Diagnóstico feito. Mas a mensagem ainda está cortada — termina em **"Tenho a seguinte situaç..."**

Aqui está o que já sei do estado atual para quando você completar:

---

**Gap confirmado no FE** — `ACTION_OPTIONS` tem 15 ações, o BE tem 31. Faltam **16 ações Whatsapp + `IMPORT_REVERTED`**:
```
IMPORT_REVERTED
WHATSAPP_ACCOUNT_CREATED / UPDATED / DELETED
WHATSAPP_TEMPLATE_CREATED / DELETED
WHATSAPP_BROADCAST_CREATED / DISPATCHED / CANCELED
WHATSAPP_AUTOMATION_CREATED / UPDATED / DELETED / TOGGLED
WHATSAPP_CONVERSATION_ASSIGNED / STATUS_CHANGED / COMPANY_LINKED
WHATSAPP_COMPANY_CREATED_FROM_CONTACT
```

**`ENTITY_OPTIONS` também defasado** — faltam `LeadImport`, `WhatsappAccount`, `WhatsappTemplate`, `WhatsappBroadcast`, `WhatsappAutomation`, `WhatsappConversation` (6 entidades ausentes).

**`actionMeta()`** cai no `default` para todas as ações Whatsapp — sem ícone/cor dedicados.

---

**Reenvie a mensagem completa** — com o gap mapeado, executo imediatamente sem nova análise.