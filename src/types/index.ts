export type AgentRole =
  | 'po'
  | 'ceo'
  | 'tech-lead'
  | 'dev-backend'
  | 'dev-frontend'
  | 'ux'
  | 'devops'
  | 'data-analyst';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'rejected';

export type WorkflowStageStatus = 'pending' | 'active' | 'approved' | 'rejected' | 'done';

export interface WorkflowStage {
  agent: AgentRole;
  label: string;
  vaultFolder: string;
  canApprove: boolean;        // pode aprovar/rejeitar o fluxo
  rejectBackTo?: AgentRole;   // se rejeitar, volta para qual agente
  next?: AgentRole;           // próximo na pipeline
}

export interface PipelineRun {
  id: string;
  title: string;
  priority: TaskPriority;
  currentStage: AgentRole;
  stages: Array<{
    agent: AgentRole;
    status: WorkflowStageStatus;
    output?: string;
    noteCreated?: string;
    startedAt?: string;
    completedAt?: string;
  }>;
  createdAt: string;
  completedAt?: string;
}

export interface VaultNote {
  path: string;
  filename: string;
  content: string;
  frontmatter: Record<string, unknown>;
  links: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentTask {
  id: string;
  type: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  assignedTo: AgentRole;
  pipelineId?: string;
  taskTitle?: string;           // titulo original da tarefa (para kanban/vault)
  previousOutput?: string;      // output do agente anterior no pipeline
  context?: Record<string, unknown>;
  result?: string;
  vaultNotesCreated?: string[];
  createdAt: string;
  completedAt?: string;
}

export type ToolPermission = 'read' | 'write' | 'search';
export type ProjectName = 'dattu-back-end' | 'dattu-front-end';

export interface AgentToolConfig {
  permissions: Record<ProjectName, ToolPermission[]>;
}

export interface AgentDecision {
  approved: boolean;
  reasoning: string;
  feedback?: string;          // se rejeitou, o que precisa mudar
}

export interface OrchestratorRequest {
  task: string;
  priority?: TaskPriority;
  context?: string;
  mode?: 'pipeline' | 'direct';  // pipeline = fluxo completo, direct = agente específico
  startFrom?: AgentRole;          // onde começar no pipeline
  involveAgents?: AgentRole[];    // modo direct: agentes específicos
}

export interface OrchestratorResult {
  taskId: string;
  summary: string;
  agentsInvolved: AgentRole[];
  notesCreated: string[];
  decisions: string[];
  nextSteps: string[];
  pipeline?: PipelineRun;
}
