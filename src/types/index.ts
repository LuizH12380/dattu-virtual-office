export type AgentRole =
  | 'hr'
  | 'creative'
  | 'strategy'
  | 'meetings'
  | 'documents'
  | 'orchestrator';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

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
  context?: Record<string, unknown>;
  result?: string;
  vaultNotesCreated?: string[];
  createdAt: string;
  completedAt?: string;
}

export interface AgentMessage {
  from: AgentRole;
  to: AgentRole | 'all';
  subject: string;
  content: string;
  taskId?: string;
  timestamp: string;
}

export interface AgentContext {
  companyName: string;
  currentDate: string;
  recentDecisions: VaultNote[];
  teamMembers: VaultNote[];
  recentMeetings: VaultNote[];
  relevantNotes: VaultNote[];
}

export interface OrchestratorRequest {
  task: string;
  priority?: TaskPriority;
  context?: string;
  involveAgents?: AgentRole[];
}

export interface OrchestratorResult {
  taskId: string;
  summary: string;
  agentsInvolved: AgentRole[];
  notesCreated: string[];
  decisions: string[];
  nextSteps: string[];
}
