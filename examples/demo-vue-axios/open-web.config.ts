import { defineOpenWeb } from 'open-web-cli';

export default defineOpenWeb({
  output: {
    packageDir: '../demo-agent-adapter',
    packageName: '@demo/agent-adapter',
  },
  auth: {
    loginUrl: 'https://app.example.test/login',
    probeCapability: 'user.list',
  },
  expose: {
    capabilities: {
      'user.list': {
        from: 'src/api/user.ts#listUsers',
        description: 'List users',
      },
      'order.updateStatus': {
        from: 'src/api/order.ts#updateOrderStatus',
        description: 'Update an order status',
      },
    },
  },
  cards: {
    'user-list-card': {
      source: 'src/components/UserListCard.vue',
      capability: 'user.list',
    },
    'order-status-card': {
      source: 'src/components/OrderStatusCard.vue',
      capability: 'order.updateStatus',
    },
  },
});
