import { defineOpenWeb } from 'open-web-cli';

export default defineOpenWeb({
  output: {
    packageDir: '../maku-open-web-adapter',
    packageName: '@demo/maku-open-web-adapter',
  },
  auth: {
    loginUrl: 'https://demo.maku.net',
    probeCapability: 'user.info',
  },
  expose: {
    capabilities: {
      'auth.login': {
        from: 'src/api/auth.ts#useAccountLoginApi',
        description: 'Log in with an account credential payload.',
      },
      'auth.logout': {
        from: 'src/api/auth.ts#useLogoutApi',
        description: 'Log out the current session.',
      },
      'captcha.get': {
        from: 'src/api/auth.ts#useCaptchaApi',
        description: 'Fetch a login captcha.',
      },
      'user.info': {
        from: 'src/api/sys/user.ts#useUserInfoApi',
        description: 'Fetch current user profile information.',
      },
      'role.list': {
        from: 'src/api/sys/role.ts#useRoleListApi',
        description: 'List roles.',
      },
      'server.info': {
        from: 'src/api/monitor/server.ts#useServerInfoApi',
        description: 'Fetch server monitoring information.',
      },
    },
  },
  cards: {
    'role-list-card': {
      source: 'src/views/sys/role/index.vue',
      capability: 'role.list',
    },
    'server-monitor-card': {
      source: 'src/views/monitor/server/index.vue',
      capability: 'server.info',
    },
  },
});
