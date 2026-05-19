# GitHub Vue Axios Demo Projects

These configs target three real Vue 3 + axios repositories that are useful for testing and demonstrating Open Web CLI against existing application source.

## Projects

| Project | Why it is useful | License |
| --- | --- | --- |
| `makunet/maku-admin` | Broad admin app with auth, refresh-token handling, many service APIs, and clean page candidates. | Apache-2.0 |
| `saymenghour/vue3-enterprise-boilerplate` | Smaller enterprise boilerplate with modular auth, current-user, role, and user-management APIs. | MIT |
| `peng-xiao-shuai/vite-vue-admin` | Admin template with common `request({ url, method })` axios wrapper calls and mock-oriented pages. | MIT |

## Clone Targets

```bash
mkdir -p /tmp/open-web-candidates
gh repo clone makunet/maku-admin /tmp/open-web-candidates/maku-admin -- --depth 1
gh repo clone saymenghour/vue3-enterprise-boilerplate /tmp/open-web-candidates/vue3-enterprise-boilerplate -- --depth 1
gh repo clone peng-xiao-shuai/vite-vue-admin /tmp/open-web-candidates/vite-vue-admin -- --depth 1
```

## Inspect

```bash
export OPEN_WEB_CLI_REPO=/path/to/open-web-cli

cd /tmp/open-web-candidates/maku-admin
npm install -D open-web-cli@0.1.0
npx open-web inspect --json

cd /tmp/open-web-candidates/vue3-enterprise-boilerplate
npm install -D open-web-cli@0.1.0
npx open-web inspect --json

cd /tmp/open-web-candidates/vite-vue-admin
npm install -D open-web-cli@0.1.0
npx open-web inspect --json
```

## Generate And Build

```bash
cd /tmp/open-web-candidates/maku-admin
cp "$OPEN_WEB_CLI_REPO/examples/github-vue-axios/maku-admin.open-web.config.ts" open-web.config.ts
npx open-web build --json

cd /tmp/open-web-candidates/vue3-enterprise-boilerplate
cp "$OPEN_WEB_CLI_REPO/examples/github-vue-axios/vue3-enterprise-boilerplate.open-web.config.ts" open-web.config.ts
npx open-web build --json

cd /tmp/open-web-candidates/vite-vue-admin
cp "$OPEN_WEB_CLI_REPO/examples/github-vue-axios/vite-vue-admin.open-web.config.ts" open-web.config.ts
npx open-web build --json
```

Each generated adapter supports:

```bash
node dist/cli.js docs --json
node dist/cli.js docs --html
node dist/cli.js login --auth-json '{"headers":{"authorization":"Bearer demo"}}' --json
OPEN_WEB_BASE_URL=https://api.example.test node dist/cli.js <resource> <action> --input '{}'
```
