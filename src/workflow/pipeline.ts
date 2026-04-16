import { AgentRole, WorkflowStage, PipelineRun, WorkflowStageStatus } from '../types';

// ─── Definição do pipeline Dattu ──────────────────────────────────────────────
//
//  PO → CEO → DataAnalyst → DevBackend → DevFrontend → UX → TechLead → DevOps
//              ↑ (rejeita)                                   ↑ (rejeita)
//              └── volta ao PO                               └── volta ao DEV
//
export const DATTU_PIPELINE: WorkflowStage[] = [
  {
    agent: 'po',
    label: 'Definição de Requisitos',
    vaultFolder: 'Backlog',
    canApprove: false,
    next: 'ceo',
  },
  {
    agent: 'ceo',
    label: 'Aprovação Executiva',
    vaultFolder: 'Decisoes',
    canApprove: true,
    rejectBackTo: 'po',
    next: 'data-analyst',
  },
  {
    agent: 'data-analyst',
    label: 'Análise de Dados & Schema',
    vaultFolder: 'Analises',
    canApprove: false,
    next: 'dev-backend',
  },
  {
    agent: 'dev-backend',
    label: 'Desenvolvimento Backend',
    vaultFolder: 'Sprints',
    canApprove: false,
    next: 'dev-frontend',
  },
  {
    agent: 'dev-frontend',
    label: 'Desenvolvimento Frontend',
    vaultFolder: 'Sprints',
    canApprove: false,
    next: 'ux',
  },
  {
    agent: 'ux',
    label: 'Review de UX',
    vaultFolder: 'Design',
    canApprove: false,
    next: 'tech-lead',
  },
  {
    agent: 'tech-lead',
    label: 'Code Review',
    vaultFolder: 'Reviews',
    canApprove: true,
    rejectBackTo: 'dev-backend',
    next: 'devops',
  },
  {
    agent: 'devops',
    label: 'Deploy & Infraestrutura',
    vaultFolder: 'Deploy',
    canApprove: false,
    next: undefined, // fim do pipeline
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getStage(agent: AgentRole): WorkflowStage | undefined {
  return DATTU_PIPELINE.find((s) => s.agent === agent);
}

export function getStageIndex(agent: AgentRole): number {
  return DATTU_PIPELINE.findIndex((s) => s.agent === agent);
}

export function getNextStage(agent: AgentRole): WorkflowStage | undefined {
  const stage = getStage(agent);
  return stage?.next ? getStage(stage.next) : undefined;
}

export function getRejectionTarget(agent: AgentRole): WorkflowStage | undefined {
  const stage = getStage(agent);
  return stage?.rejectBackTo ? getStage(stage.rejectBackTo) : undefined;
}

export function buildPipelineRun(id: string, title: string, priority: string, startFrom?: AgentRole): PipelineRun {
  const startIndex = startFrom ? getStageIndex(startFrom) : 0;
  const stages = DATTU_PIPELINE.slice(startIndex).map((s, i) => ({
    agent: s.agent,
    status: (i === 0 ? 'active' : 'pending') as WorkflowStageStatus,
  }));

  return {
    id,
    title,
    priority: priority as PipelineRun['priority'],
    currentStage: DATTU_PIPELINE[startIndex].agent,
    stages,
    createdAt: new Date().toISOString(),
  };
}

export function formatPipelineProgress(run: PipelineRun): string {
  const icons: Record<WorkflowStageStatus, string> = {
    pending: '○',
    active: '◉',
    approved: '✓',
    rejected: '✗',
    done: '✓',
  };

  return DATTU_PIPELINE.map((stage) => {
    const stageRun = run.stages.find((s) => s.agent === stage.agent);
    const icon = stageRun ? icons[stageRun.status] : '○';
    const active = stageRun?.status === 'active' ? ' ◄' : '';
    return `${icon} ${stage.label}${active}`;
  }).join('\n');
}
