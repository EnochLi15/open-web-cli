import { defineOpenWeb } from 'open-web-cli';

export default defineOpenWeb({
  output: {
    packageDir: '../demo-agent-adapter',
    packageName: '@demo/agent-adapter',
  },
  auth: {
    loginUrl: 'https://app.example.test/login',
    probeCapability: 'board.listCards',
  },
  expose: {
    capabilities: {
      'board.listCards': {
        from: 'src/api/kanban.ts#listKanbanCards',
        description: 'List kanban cards',
      },
      'card.create': {
        from: 'src/api/kanban.ts#createKanbanCard',
        description: 'Create a kanban card',
      },
      'card.move': {
        from: 'src/api/kanban.ts#moveKanbanCard',
        description: 'Move a kanban card to another status',
      },
      'member.list': {
        from: 'src/api/kanban.ts#listKanbanMembers',
        description: 'List board members',
      },
    },
  },
  cards: {
    'kanban-board-card': {
      source: 'src/components/KanbanBoardCard.vue',
      capability: 'board.listCards',
    },
    'task-detail-card': {
      source: 'src/components/TaskDetailCard.vue',
      capability: 'card.move',
    },
  },
});
