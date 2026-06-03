---
criado: 2026-06-02
atualizado: 2026-06-02
agente: dev-frontend
cargo: DEV Frontend Senior
tipo: implementacao-frontend
status: Aguardando Review UX
pipelineId: 8e534656-2ae4-490f-8dc9-51cae6a13bef
taskTitle: Tenho a seguinte situação, no http://localhost:3000/atendimento esta retornando alguns erros, 1 visualmente, a visualização esta quebrada, e esta dando erro quando tento iniciar uma conversa nova, não aparece os templates, e quando envio a mensagem livre da erro e não diz o porque e não consigo saber oque aconteceu.
---

Agora tenho o quadro completo. Vou aplicar os **3 fixes** de uma vez:

1. **Bug 1 (visual):** `min-h-0` na div raiz do `page.tsx`
2. **Bug 2 (templates):** toast detalhado quando lista vazia + instrução de sync
3. **Bug 3 (erro mudo ao enviar):** `toast.error` com mensagem real do backend no `handleSend`