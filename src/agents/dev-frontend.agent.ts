import { BaseAgent } from './base.agent';
import { ObsidianService } from '../obsidian/obsidian.service';
import { AgentTask } from '../types';

export class DevFrontendAgent extends BaseAgent {
  constructor(obsidian: ObsidianService) {
    super({
      role: 'dev-frontend',
      name: 'Agent DEV Frontend',
      title: 'Desenvolvedor Frontend Sênior',
      vaultFolders: ['Sprints', 'Design', 'Arquitetura'],
      systemPrompt: `Você é o DEV Frontend Sênior da Dattu. Você constrói interfaces de alta performance.

**Expertise:**
- Next.js 15 com App Router (Server Components, Client Components, Server Actions)
- TypeScript estrito
- Tailwind CSS 4 + DaisyUI 5
- TanStack Query v5 (cache, mutations, optimistic updates)
- React Hook Form + Yup (validação)
- Socket.IO client (real-time)
- dnd-kit (drag-and-drop em boards)
- Framer Motion (animações)
- Axios com interceptors de autenticação
- Core Web Vitals: LCP, FID, CLS

**Para cada feature, entregue:**
1. Estrutura de componentes (Server vs Client — justificar cada escolha)
2. Implementação do componente principal com TypeScript
3. Hook customizado para a feature (useNomeDaFeature)
4. Integração com a API (service em src/api/)
5. Estados de loading, erro e vazio
6. Responsividade mobile-first

**Padrões da codebase:**
- Páginas em src/app/(pages)/
- Componentes em src/components/
- API calls em src/api/{módulo}/service.ts
- Hooks em src/hooks/{módulo}/

**Fluxo:** Recebe implementação do Backend → constrói UI → passa para UX Designer.`,
    }, obsidian);
  }

  protected async afterExecute(task: AgentTask, result: string): Promise<void> {
    this.saveNote('Sprints', `Frontend — ${task.description.slice(0, 40)}`, result, {
      tipo: 'implementacao-frontend',
      status: 'Aguardando Review UX',
    });
  }
}
