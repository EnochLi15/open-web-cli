# Open Web CLI Context

## Mission

Open Web CLI turns an existing Vue 3 + axios web application into an agent-ready adapter package.

The project is source-driven. It is not a general browser automation platform for arbitrary websites. The primary input is a known frontend codebase; browser automation is used mainly for login and auth-state capture.

## Product Shape

The generator reads a target web project and an `open-web.config.ts` file:

```ts
import { defineOpenWeb } from 'open-web-cli';

export default defineOpenWeb({
  output: {
    packageDir: '../web-agent-adapter',
    packageName: '@company/web-agent-adapter',
  },
});
```

The generated output is an independent adapter npm package. It exposes one capability set through multiple entry points:

- CLI commands for local and agent subprocess use.
- TypeScript SDK methods for direct imports.
- Mastra tool adapters.
- Vue card registry and renderer helpers for generative UI.

The generated package uses a single npm package with multiple `exports` entries. It should not depend on the original web project source path after release build.

## Capability Model

The generator scans the target project for axios atoms. Atoms are low-level API candidates discovered from axios calls, service functions, and axios instances.

Formal capabilities are the public contract. Capabilities must be explicitly selected through configuration before release. Development mode may expose all candidates for exploration, but release mode uses an allowlist.

Capability IDs use domain namespacing:

```text
resource.action
```

Examples:

```text
user.list
order.updateStatus
customer.detail
```

CLI and SDK must expose the same capability set:

- CLI maps `resource.action` to kebab-case commands.
- SDK maps `resource.action` to camelCase methods.
- Agent tools are adapters over SDK capabilities, not a separate business layer.

## Generated Package

The default generated package structure is:

```text
web-agent-adapter/
  package.json
  src/
    cli.ts
    sdk.ts
    manifest.ts
    capabilities/
    cards/
      registry.ts
    adapters/
      mastra.ts
      vue.ts
    runtime/
```

The package should support:

```ts
import { createSdk } from '@company/web-agent-adapter';
import { createMastraTools } from '@company/web-agent-adapter/mastra';
import { cardRegistry } from '@company/web-agent-adapter/vue';
```

## Result Protocol

Capability commands return a standard JSON envelope. CLI capability commands default to machine-readable JSON.

Successful result:

```ts
type OpenWebSuccess<TData = unknown> = {
  ok: true;
  capability: string;
  data: TData;
  summary?: string;
  ui?: OpenWebUiPayload;
};
```

Failed result:

```ts
type OpenWebFailure = {
  ok: false;
  error: {
    code: OpenWebErrorCode;
    message: string;
    recoverable?: boolean;
    details?: unknown;
  };
};
```

`ui` is a frontend rendering payload, not model reasoning context. The agent backend should not understand business UI types. It should only pass the payload through to the AI SDK UI message stream.

MVP uses inline props:

```ts
type OpenWebUiPayload = {
  kind: 'card' | 'table' | 'form' | 'panel' | 'custom';
  component: string;
  props: Record<string, unknown>;
  actions?: OpenWebUiAction[];
};
```

Future versions may support props references or compression, but the MVP should prefer simple cross-process JSON.

## Mastra And AI SDK Integration

The primary agent stack is Mastra + AI SDK.

The Mastra adapter should default to per-capability tools and also support a dispatcher tool mode. Tool execution returns the standard Open Web result.

GenUI is emitted by the chat route or Mastra stream adapter, not by business-specific agent code. When a tool result contains `ui`, the adapter appends one unified AI SDK data part:

```ts
{
  type: 'data-open-web-ui',
  id: string,
  data: OpenWebSuccess
}
```

The model should receive `data` and `summary` by default. The full `ui` payload should be sent only to the frontend message part. This keeps the agent decoupled from component names and props shapes.

## Vue Cards

Cards are generated into the adapter package and exposed through a Vue registry. The CLI and SDK return `component id + props`; the agent frontend renders the component from the generated registry.

Card publishing uses candidate discovery plus explicit configuration. The generator may find likely card components, but release output includes only configured cards.

Cards default to pure props rendering:

- Allowed by default: Vue, explicit peer UI libraries, local child components, local CSS.
- Requires explicit shim or refactor: Pinia/Vuex stores, vue-router, i18n globals, direct API calls, browser-only globals.

The MVP supports display-only cards. `ui.actions` is reserved but action bridge behavior is out of scope for MVP.

## Auth

Auth uses a pluggable `AuthStore`.

The default store is user-level local file storage under a stable Open Web directory, separated by package name, profile, and environment. Server-side or multi-user agent deployments can provide a custom encrypted/database-backed store.

Login is dual-mode by design:

- Browser login is the MVP default.
- API login can be generated when the project exposes a usable login API.

Browser login stores cookies and browser storage, then runs a configurable extractor to normalize headers/tokens into `AuthState`. A configured probe capability verifies the session.

## Axios Runtime

Development mode may link to the source project's axios instance and service functions for fast iteration.

Release build generates a bundled HTTP runtime. The release package should not import the original source project by path.

Axios interceptor migration is conservative:

- Portable logic can be generated: base URL, headers, token attachment, response unwrap, refresh token logic.
- Non-portable logic must be warned about and configured or shimmed: router redirects, UI toasts, stores, DOM access.

## Scanner

Default behavior scans the whole target project for axios-related usage. Configuration can narrow, exclude, rename, and override.

The scanner should parse:

- Vue 3 SFC files through Vue SFC parsing.
- TypeScript/JavaScript through AST analysis.
- Vite and TypeScript aliases.
- Vite env conventions without bundling secrets into generated packages.

Release builds require runtime input schemas for public capabilities. Output schemas are recommended but optional for MVP.

## MVP Boundary

MVP automation includes:

- Inspecting a Vue 3 + axios project.
- Discovering axios atoms.
- Producing candidate capability and card reports.
- Generating an independent adapter package from explicit configuration.
- Browser login and auth persistence.
- CLI JSON envelope output.
- SDK capability calls.
- Mastra per-capability tools and dispatcher mode.
- Unified `data-open-web-ui` part emission.
- Vue card registry rendering.

MVP does not include:

- General arbitrary website automation.
- Full workflow inference.
- Automatic API-to-card semantic matching.
- Interactive card action bridge.
- Full migration of complex app runtime dependencies.
