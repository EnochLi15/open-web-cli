import { defineOpenWeb } from 'open-web-cli';

export default defineOpenWeb({
  output: {
    packageDir: '../vite-vue-admin-open-web-adapter',
    packageName: '@demo/vite-vue-admin-open-web-adapter',
  },
  auth: {
    loginUrl: 'http://localhost:3002/login',
    probeCapability: 'user.info',
  },
  expose: {
    capabilities: {
      'auth.login': {
        from: 'src/api/logins.ts#login',
        description: 'Log in with the admin login payload.',
      },
      'auth.logout': {
        from: 'src/api/logins.ts#logout',
        description: 'Log out the current admin user.',
      },
      'user.info': {
        from: 'src/api/logins.ts#getUser',
        description: 'Fetch current admin user information.',
      },
      'user.list': {
        from: 'src/api/logins.ts#getUserList',
        description: 'List admin users.',
      },
      'table.list': {
        from: 'src/api/modules/table.ts#tableFun',
        description: 'List module table rows.',
      },
      'table.delete': {
        from: 'src/api/modules/table.ts#bookListsDelete',
        description: 'Delete module table rows by id.',
      },
      'home.count': {
        from: 'src/api/home.ts#countFun',
        description: 'Fetch dashboard count metrics.',
      },
      'role.list': {
        from: 'src/api/ums/role.ts#getRoleList',
        description: 'List roles.',
      },
    },
  },
  cards: {
    'module-table-card': {
      source: 'src/views/modules/table/index.vue',
      capability: 'table.list',
    },
    'dashboard-count-card': {
      source: 'src/views/home/components/PanelGroup.vue',
      capability: 'home.count',
    },
  },
});
