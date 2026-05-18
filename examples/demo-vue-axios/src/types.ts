export type KanbanStatus = 'backlog' | 'ready' | 'progress' | 'review' | 'done';

export type KanbanPriority = 'low' | 'medium' | 'high' | 'urgent';

export type KanbanMember = {
  id: string;
  name: string;
  role: string;
  avatar: string;
};

export type KanbanTask = {
  id: string;
  title: string;
  summary: string;
  status: KanbanStatus;
  priority: KanbanPriority;
  assigneeId: string;
  dueDate: string;
  tags: string[];
  points: number;
};

export type KanbanTaskInput = {
  title: string;
  summary: string;
  priority: KanbanPriority;
  assigneeId: string;
  dueDate: string;
  tags: string[];
  points: number;
};
