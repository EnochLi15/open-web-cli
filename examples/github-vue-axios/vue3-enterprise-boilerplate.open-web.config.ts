import { defineOpenWeb } from 'open-web-cli';

export default defineOpenWeb({
  output: {
    packageDir: '../vue3-enterprise-open-web-adapter',
    packageName: '@demo/vue3-enterprise-open-web-adapter',
  },
  auth: {
    loginUrl: 'http://localhost:5173/login',
    probeCapability: 'currentUser.get',
  },
  expose: {
    capabilities: {
      'auth.login': {
        from: 'src/modules/auth/auth-api.ts#loginApi',
        description: 'Log in with username and password.',
      },
      'auth.logout': {
        from: 'src/modules/auth/auth-api.ts#logoutApi',
        description: 'Log out the current user.',
      },
      'currentUser.get': {
        from: 'src/modules/current-user/current-user-api.ts#fetchCurrentUserApi',
        description: 'Fetch the current authenticated user.',
      },
      'role.list': {
        from: 'src/modules/user-management/role/role-api.ts#fetchRolesApi',
        description: 'List roles.',
      },
      'role.get': {
        from: 'src/modules/user-management/role/role-api.ts#fetchRoleByIdApi',
        description: 'Fetch a role by id.',
      },
      'role.create': {
        from: 'src/modules/user-management/role/role-api.ts#createRoleApi',
        description: 'Create a role.',
      },
    },
  },
  cards: {
    'recent-sales': {
      source: 'src/modules/dashboard/RecentSales.vue',
      capability: 'currentUser.get',
    },
    'role-listing': {
      source: 'src/modules/user-management/role/pages/RoleListing.vue',
      capability: 'role.list',
    },
  },
});
