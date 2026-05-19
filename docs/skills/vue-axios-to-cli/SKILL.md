---
name: vue-axios-to-cli
description: Convert an existing Vue 3 + axios project into an Open Web CLI adapter using the published npm package. Use when the user asks to turn a Vue app into a CLI, generate an adapter from a Vue axios codebase, or demonstrate Open Web CLI on a real Vue project.
---

# Vue Axios To CLI

## Goal

Use `open-web-cli@0.1.0` from npm inside a Vue 3 + axios project, select a small capability slice, build the generated adapter, and verify the generated CLI/docs page.

## Quick Workflow

1. Work from the target Vue project root.

```bash
npm install -D open-web-cli@0.1.0
npx open-web inspect --json
```

2. Read the inspect output.

- `axiosAtoms`: service functions that can become CLI capabilities.
- `authClues`: login/token/header files to use when choosing `auth.loginUrl` and `auth.probeCapability`.
- `cardCandidates`: Vue components/pages that can become generated UI cards.

3. Pick a narrow first slice.

- Start with 3-8 capabilities.
- Prefer auth, current-user/profile, list, detail, and dashboard metric endpoints.
- Use atoms whose `source` points to stable API/service modules, not component-local request code.
- Prefer card candidates with no warnings; warnings like `uses-store`, `uses-router`, or `uses-browser-global` mean the card may need shimming or refactoring later.

4. Create `open-web.config.ts` in the target project.

```ts
import { defineOpenWeb } from 'open-web-cli';

export default defineOpenWeb({
  output: {
    packageDir: '../web-agent-adapter',
    packageName: '@demo/web-agent-adapter',
  },
  auth: {
    loginUrl: 'http://localhost:5173/login',
    probeCapability: 'user.info',
  },
  expose: {
    capabilities: {
      'user.info': {
        from: 'src/api/user.ts#getUserInfo',
        description: 'Fetch current user profile information.',
      },
      'role.list': {
        from: 'src/api/role.ts#listRoles',
        description: 'List roles.',
      },
    },
  },
  cards: {
    'user-profile-card': {
      source: 'src/views/profile/UserProfile.vue',
      capability: 'user.info',
    },
  },
});
```

5. Build and verify.

```bash
npx open-web build --json
cd ../web-agent-adapter
node dist/cli.js docs --json
node dist/cli.js docs --port 4317
node dist/cli.js login --auth-json '{"headers":{"authorization":"Bearer demo"}}' --json
OPEN_WEB_BASE_URL=http://127.0.0.1:3000 node dist/cli.js user info --input '{}'
```

## Real Project Pattern

The known-good demo shape from this repository:

- `makunet/maku-admin`: broad admin app; good for many `service.get/post` atoms and auth/token examples.
- `saymenghour/vue3-enterprise-boilerplate`: modular enterprise app; good for auth/current-user/role/user-management examples.
- `peng-xiao-shuai/vite-vue-admin`: common admin template; good for `request({ url, method })` wrapper examples.

Use `examples/github-vue-axios/*.open-web.config.ts` as copyable starting points when testing those projects.

## Troubleshooting

- If a configured capability fails with `unknown axios atom`, rerun `npx open-web inspect --json` and copy the exact `source` string.
- If `inspect` finds too many component cards, choose cards manually in config; release output includes only configured cards.
- If generated CLI requests the wrong URL, check whether the original code used constants or string concatenation and inspect the discovered `url`.
- If auth is not ready, use `login --auth-json` with demo headers while validating CLI shape.
- If `npx open-web` is unavailable, run `npm install -D open-web-cli@0.1.0` in the target project and retry.

## Done Criteria

- `npx open-web inspect --json` finds relevant atoms and card candidates.
- `npx open-web build --json` completes.
- The generated adapter has `dist/cli.js`.
- `node dist/cli.js docs --json` returns the manifest.
- `node dist/cli.js docs --port <port>` opens the local web explorer.
- At least one generated capability command returns a standard `{ ok, capability, data }` envelope.
