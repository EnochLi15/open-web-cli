# MVP PRD: Open Web CLI

## Goal

Prove that an existing Vue 3 + axios web project can be converted into an installable, agent-ready adapter package that supports CLI use, SDK import, Mastra tools, and Vue generative UI rendering.

## Non-Goals

- Do not support arbitrary websites without source code.
- Do not infer complex business workflows automatically.
- Do not automatically bind arbitrary APIs to arbitrary cards.
- Do not implement UI card action bridge in MVP.
- Do not require generated release packages to import the original project source path.

## Target User

A developer or agent engineer who owns a Vue 3 + axios web application and wants to expose selected business capabilities to agents quickly, while reusing existing authentication and Vue card UI where practical.

## User Flow

1. The user installs Open Web CLI.
2. The user creates `open-web.config.ts` in the target Vue project.
3. The user runs `open-web inspect`.
4. The tool reports axios atoms, auth clues, and card candidates.
5. The user allowlists capabilities and configured cards.
6. The user runs `open-web generate`.
7. The tool writes an independent adapter package.
8. The user runs the generated CLI locally and logs in through browser auth.
9. The user imports the generated SDK and Mastra adapter into an agent project.
10. The agent stream emits `data-open-web-ui`.
11. The Vue frontend renders generated cards through the generated registry.

## Required Commands

Open Web CLI commands:

```bash
open-web inspect
open-web generate
open-web build
```

Generated adapter CLI commands:

```bash
web-agent login
web-agent auth status
web-agent logout
web-agent <resource> <action>
```

Capability commands output JSON by default. Auxiliary commands may output human-readable text but must support `--json`.

## Configuration

MVP uses one conversion entry point:

```ts
import { defineOpenWeb } from 'open-web-cli';

export default defineOpenWeb({
  output: {
    packageDir: '../demo-agent-adapter',
    packageName: '@demo/agent-adapter',
  },
  expose: {
    capabilities: {
      'user.list': {
        from: 'src/api/user.ts#listUsers',
        description: 'List users',
      },
    },
  },
  cards: {
    'user-list-card': {
      source: 'src/components/UserListCard.vue',
      capability: 'user.list',
    },
  },
});
```

## Generated Adapter API

Generated SDK:

```ts
const sdk = createSdk();
const result = await sdk.user.list({ status: 'active' });
```

Generated Mastra adapter:

```ts
const tools = createMastraTools(sdk, {
  mode: 'per-capability',
});
```

Generated Vue registry:

```ts
import { cardRegistry, OpenWebRenderer } from '@demo/agent-adapter/vue';
```

## Result Envelope

Success:

```json
{
  "ok": true,
  "capability": "user.list",
  "data": [],
  "summary": "Found 0 users.",
  "ui": {
    "kind": "card",
    "component": "user-list-card",
    "props": {
      "users": []
    }
  }
}
```

Failure:

```json
{
  "ok": false,
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Please run login.",
    "recoverable": true
  }
}
```

## Error Codes

MVP error codes:

- `AUTH_REQUIRED`
- `AUTH_EXPIRED`
- `PERMISSION_DENIED`
- `VALIDATION_ERROR`
- `REMOTE_HTTP_ERROR`
- `REMOTE_BUSINESS_ERROR`
- `NETWORK_ERROR`
- `CAPABILITY_NOT_FOUND`
- `UI_RENDER_UNAVAILABLE`
- `CONFIG_ERROR`
- `UNKNOWN_ERROR`

## Auth Requirements

Browser login must:

1. Open the configured login URL.
2. Let the user complete the original web login flow.
3. Capture cookies and browser storage.
4. Run a configurable extractor to produce headers/tokens.
5. Save auth state through `AuthStore`.
6. Probe a configured capability to verify the session.

## Demo Fixture Acceptance Test

Create or use a demo Vue 3 + axios app with:

- A login flow.
- One axios instance.
- At least two API service functions.
- At least two Vue card components.
- Vite alias and env usage.

The MVP is accepted when:

1. `open-web inspect` finds axios atoms and card candidates.
2. `open-web generate` creates an independent adapter package.
3. The generated package builds without importing the demo source path in release output.
4. The generated CLI supports browser login.
5. A generated capability command returns the standard JSON envelope.
6. The generated SDK can call the same capability.
7. The generated Mastra adapter exposes per-capability tools.
8. The generated stream bridge emits `data-open-web-ui` for results with UI.
9. The generated Vue registry renders a card from the UI payload.

## Implementation Notes

The initial implementation should prioritize a narrow working vertical slice over broad inference quality:

- Use full-project scanning by default.
- Allow configuration to override scanner mistakes.
- Require runtime input schemas for release capabilities.
- Keep cards pure props by default.
- Warn on store, router, i18n, direct API, or DOM dependencies inside card components.
