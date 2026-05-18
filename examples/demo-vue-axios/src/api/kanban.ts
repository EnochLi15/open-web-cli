import { http } from '@/api/http';
import type { KanbanStatus, KanbanTaskInput } from '@/types';

export function listKanbanCards(params: { status?: KanbanStatus; assigneeId?: string; query?: string }) {
  return http.get('/kanban/cards', { params });
}

export function createKanbanCard(input: KanbanTaskInput) {
  return http.post('/kanban/cards', input);
}

export const moveKanbanCard = (id: string, status: KanbanStatus) => {
  return http.patch(`/kanban/cards/${id}/status`, { status });
};

export function listKanbanMembers() {
  return http.get('/kanban/members');
}
