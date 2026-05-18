import { axios2cli } from 'open-web-cli';
import {
  createKanbanCard,
  listKanbanCards,
  listKanbanMembers,
  moveKanbanCard,
} from '@/api/kanban';

export const cliMap = axios2cli({
  'board.listCards': {
    description: 'List kanban cards',
    call: listKanbanCards,
    summary: (cards) => `Found ${(cards as unknown[]).length} kanban cards.`,
    ui: (cards) => ({
      kind: 'card',
      component: 'kanban-board-card',
      props: { data: cards },
    }),
  },
  'card.create': {
    description: 'Create a kanban card',
    call: createKanbanCard,
    summary: () => 'Created a kanban card.',
  },
  'card.move': {
    description: 'Move a kanban card to another status',
    call: moveKanbanCard,
    args: (input) => {
      const payload = input as { id: string; status: string };
      return [payload.id, payload.status];
    },
    summary: () => 'Moved a kanban card.',
    ui: (card) => ({
      kind: 'card',
      component: 'task-detail-card',
      props: { data: card },
    }),
  },
  'member.list': {
    description: 'List board members',
    call: listKanbanMembers,
    summary: (members) => `Found ${(members as unknown[]).length} members.`,
  },
});
