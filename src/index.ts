import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { createContext, Script } from 'node:vm';
import { promisify } from 'node:util';
import { parse as parseSfc } from '@vue/compiler-sfc';
import ts from 'typescript';

const execFileAsync = promisify(execFile);

export type OpenWebDiagnostic = {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  details?: unknown;
};

export type OpenWebEvent =
  | {
      type: 'inspect:start';
      projectRoot: string;
    }
  | {
      type: 'inspect:complete';
      projectRoot: string;
      report: InspectReport;
    }
  | {
      type: 'config:load';
      configPath: string;
    }
  | {
      type: 'generate:start';
      projectRoot: string;
      packageDir: string;
    }
  | {
      type: 'generate:file';
      packageDir: string;
      filePath: string;
    }
  | {
      type: 'generate:complete';
      result: GenerateAdapterResult;
    }
  | {
      type: 'build:start';
      packageDir: string;
    }
  | {
      type: 'build:command';
      packageDir: string;
      command: string;
      args: string[];
    }
  | {
      type: 'build:complete';
      result: BuildAdapterResult;
    };

export type OpenWebReporter = {
  event?: (event: OpenWebEvent) => void;
  diagnostic?: (diagnostic: OpenWebDiagnostic) => void;
};

export type OpenWebUiPayload = {
  kind: 'card' | 'table' | 'form' | 'panel' | 'custom';
  component: string;
  props: Record<string, unknown>;
  actions?: Array<Record<string, unknown>>;
};

export type OpenWebSuccess<TData = unknown> = {
  ok: true;
  capability: string;
  data: TData;
  summary?: string;
  ui?: OpenWebUiPayload;
};

export type OpenWebFailure = {
  ok: false;
  error: {
    code:
      | 'AUTH_REQUIRED'
      | 'AUTH_EXPIRED'
      | 'PERMISSION_DENIED'
      | 'VALIDATION_ERROR'
      | 'REMOTE_HTTP_ERROR'
      | 'REMOTE_BUSINESS_ERROR'
      | 'NETWORK_ERROR'
      | 'CAPABILITY_NOT_FOUND'
      | 'UI_RENDER_UNAVAILABLE'
      | 'CONFIG_ERROR'
      | 'UNKNOWN_ERROR';
    message: string;
    recoverable?: boolean;
    details?: unknown;
  };
};

export type OpenWebResult<TData = unknown> = OpenWebSuccess<TData> | OpenWebFailure;

export type CliIo = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

export type CliExecutionContext = {
  capability: string;
  argv: string[];
  env: NodeJS.ProcessEnv;
};

export type AxiosCliCallable = (...args: any[]) => Promise<unknown> | unknown;

export type AxiosCliDefinition<TInput = unknown, TData = unknown> = {
  call: AxiosCliCallable;
  description?: string;
  parameters?: OpenWebDocsParameter[];
  inputExample?: unknown;
  args?: (input: TInput, context: CliExecutionContext) => unknown[];
  summary?: (data: TData, input: TInput) => string | undefined;
  ui?:
    | OpenWebUiPayload
    | ((data: TData, input: TInput) => OpenWebUiPayload | undefined);
};

export type AxiosCliMapInput = Record<string, AxiosCliCallable | AxiosCliDefinition>;

export type CliMapEntry = {
  id: string;
  description?: string;
  parameters?: OpenWebDocsParameter[];
  inputExample?: unknown;
  execute: (input: unknown, context: CliExecutionContext) => Promise<OpenWebResult>;
};

export type CliMap = Record<string, CliMapEntry>;

export type OpenWebDocsParameter = {
  name: string;
  in: 'path' | 'query' | 'body' | 'input';
  required?: boolean;
  description?: string;
};

export type OpenWebDocsCapability = {
  id: string;
  description?: string;
  method?: string;
  url?: string;
  uiComponent?: string | null;
  parameters?: OpenWebDocsParameter[];
  inputExample?: unknown;
};

export type OpenWebDocsManifest = {
  packageName?: string;
  capabilities: OpenWebDocsCapability[];
  cards?: Array<{
    id: string;
    source: string;
    capability?: string;
  }>;
  auth?: {
    loginUrl?: string;
    probeCapability?: string;
  };
};

export type OpenWebDocsServerOptions = {
  host?: string;
  port?: number;
  io?: CliIo;
  execute?: (capabilityId: string, input: unknown) => Promise<unknown>;
  signal?: AbortSignal;
};

export type OpenWebDocsServer = {
  url: string;
  close: () => Promise<void>;
};

export type InspectProjectOptions = {
  projectRoot: string;
  reporter?: OpenWebReporter;
};

export type OpenWebConfig = {
  output: {
    packageDir: string;
    packageName: string;
  };
  auth?: {
    loginUrl?: string;
    probeCapability?: string;
  };
  expose?: {
    capabilities?: Record<
      string,
      {
        from: string;
        description?: string;
      }
    >;
  };
  cards?: Record<
    string,
    {
      source: string;
      capability?: string;
    }
  >;
};

export type AxiosAtom = {
  id: string;
  method: string;
  source: string;
  url: string;
};

export type CardCandidate = {
  id: string;
  source: string;
  props: string[];
  warnings: string[];
};

export type AuthClue = {
  kind: 'login' | 'token' | 'authorization-header' | 'credentials';
  source: string;
  detail: string;
};

export type InspectReport = {
  axiosAtoms: AxiosAtom[];
  authClues: AuthClue[];
  cardCandidates: CardCandidate[];
};

export type GenerateAdapterOptions = {
  projectRoot: string;
  configPath?: string;
  reporter?: OpenWebReporter;
};

export type GenerateAdapterResult = {
  packageDir: string;
  files: string[];
};

export type BuildAdapterOptions = GenerateAdapterOptions & {
  install?: boolean;
  packageManager?: string;
  env?: NodeJS.ProcessEnv;
};

export type BuildAdapterResult = GenerateAdapterResult & {
  built: true;
};

export function defineOpenWeb<const TConfig extends OpenWebConfig>(config: TConfig): TConfig {
  return config;
}

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const DEFAULT_CLI_IO: CliIo = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

function reportEvent(reporter: OpenWebReporter | undefined, event: OpenWebEvent): void {
  reporter?.event?.(event);
}

function reportDiagnostic(reporter: OpenWebReporter | undefined, diagnostic: OpenWebDiagnostic): void {
  reporter?.diagnostic?.(diagnostic);
}

export function axios2cli(definitions: AxiosCliMapInput): CliMap {
  return Object.fromEntries(
    Object.entries(definitions).map(([id, definition]) => {
      const normalized = normalizeAxiosCliDefinition(definition);
      return [
        id,
        {
          id,
          description: normalized.description,
          parameters: normalized.parameters,
          inputExample: normalized.inputExample,
          execute: async (input: unknown, context: CliExecutionContext): Promise<OpenWebResult> => {
            try {
              const args = normalized.args ? normalized.args(input, context) : [input];
              const response = await normalized.call(...args);
              const data = unwrapAxiosData(response);
              const result: OpenWebSuccess = {
                ok: true,
                capability: id,
                data,
                summary: normalized.summary?.(data, input),
              };
              const ui = typeof normalized.ui === 'function' ? normalized.ui(data, input) : normalized.ui;
              if (ui) {
                result.ui = ui;
              }
              return result;
            } catch (error) {
              return normalizeCliError(error);
            }
          },
        },
      ];
    }),
  );
}

export async function runCliMap(
  cliMap: CliMap,
  args = process.argv.slice(2),
  io: CliIo = DEFAULT_CLI_IO,
): Promise<number> {
  const [resourceOrCommand, actionOrFlag, ...rest] = args;

  if (resourceOrCommand === 'docs') {
    const flags = parseCliMapFlags([actionOrFlag, ...rest].filter((arg): arg is string => Boolean(arg)));
    const docs = createCliMapDocsManifest(cliMap);

    if (flags.has('json')) {
      io.stdout(`${JSON.stringify(docs, null, 2)}\n`);
      return 0;
    }

    if (flags.has('html')) {
      io.stdout(createOpenWebDocsHtml(docs));
      return 0;
    }

    const server = await serveOpenWebDocs(docs, {
      host: flags.get('host'),
      port: flags.has('port') ? Number(flags.get('port')) : undefined,
      io,
      execute: (capabilityId, input) => {
        const entry = cliMap[capabilityId];
        if (!entry) {
          return Promise.resolve({
            ok: false,
            error: {
              code: 'CAPABILITY_NOT_FOUND',
              message: `Unknown capability: ${capabilityId}`,
              recoverable: false,
            },
          } satisfies OpenWebFailure);
        }

        return entry.execute(input, {
          capability: capabilityId,
          argv: args,
          env: process.env,
        });
      },
    });
    io.stdout(`Open Web docs available at ${server.url}\n`);
    await new Promise<never>(() => undefined);
  }

  if (!resourceOrCommand || resourceOrCommand === 'help' || resourceOrCommand === '--help') {
    io.stdout(formatCliMapHelp(cliMap));
    return 0;
  }

  if (resourceOrCommand === 'list') {
    io.stdout(`${JSON.stringify(Object.values(cliMap).map(({ id, description }) => ({ id, description })), null, 2)}\n`);
    return 0;
  }

  const action = actionOrFlag?.startsWith('--') ? undefined : actionOrFlag;
  const flags = parseCliMapFlags(action ? rest : args.slice(1));
  const capability = action ? `${resourceOrCommand}.${action}` : resourceOrCommand;
  const entry = cliMap[capability];

  if (!entry) {
    writeCliMapJson(io, {
      ok: false,
      error: {
        code: 'CAPABILITY_NOT_FOUND',
        message: `Unknown capability: ${capability}`,
        recoverable: false,
      },
    } satisfies OpenWebFailure);
    return 1;
  }

  let input: unknown = {};
  try {
    input = flags.has('input') ? JSON.parse(flags.get('input') ?? '{}') : {};
  } catch (error) {
    writeCliMapJson(io, {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: error instanceof Error ? error.message : String(error),
        recoverable: true,
      },
    } satisfies OpenWebFailure);
    return 1;
  }

  const result = await entry.execute(input, {
    capability,
    argv: args,
    env: process.env,
  });
  writeCliMapJson(io, result);
  return result.ok ? 0 : 1;
}

function normalizeAxiosCliDefinition(definition: AxiosCliCallable | AxiosCliDefinition): AxiosCliDefinition {
  return typeof definition === 'function' ? { call: definition } : definition;
}

function createCliMapDocsManifest(cliMap: CliMap): OpenWebDocsManifest {
  return {
    capabilities: Object.values(cliMap).map((entry) => ({
      id: entry.id,
      description: entry.description,
      parameters: entry.parameters,
      inputExample: entry.inputExample,
    })),
  };
}

export async function serveOpenWebDocs(
  docs: OpenWebDocsManifest,
  options: OpenWebDocsServerOptions = {},
): Promise<OpenWebDocsServer> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 0;
  const server = createServer(async (request, response) => {
    await handleOpenWebDocsRequest(docs, options.execute, request, response);
  });

  options.signal?.addEventListener('abort', () => {
    server.close();
  });

  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolvePromise();
    });
  });

  const address = server.address() as AddressInfo;
  const displayHost = address.address === '0.0.0.0' || address.address === '::' ? '127.0.0.1' : address.address;
  return {
    url: `http://${displayHost}:${address.port}`,
    close: () => closeServer(server),
  };
}

async function handleOpenWebDocsRequest(
  docs: OpenWebDocsManifest,
  execute: OpenWebDocsServerOptions['execute'],
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');

  if (request.method === 'GET' && url.pathname === '/') {
    writeResponse(response, 200, createOpenWebDocsHtml(docs), 'text/html; charset=utf-8');
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/capabilities') {
    writeJsonResponse(response, 200, docs);
    return;
  }

  if (request.method === 'POST' && url.pathname.startsWith('/api/demo/')) {
    const capabilityId = decodeURIComponent(url.pathname.slice('/api/demo/'.length));
    if (!execute) {
      writeJsonResponse(response, 501, {
        ok: false,
        error: {
          code: 'CONFIG_ERROR',
          message: 'No demo executor is configured for this docs server.',
          recoverable: false,
        },
      } satisfies OpenWebFailure);
      return;
    }

    try {
      const input = await readJsonBody(request);
      const result = await execute(capabilityId, input);
      writeJsonResponse(response, 200, result);
    } catch (error) {
      writeJsonResponse(response, 400, {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error instanceof Error ? error.message : String(error),
          recoverable: true,
        },
      } satisfies OpenWebFailure);
    }
    return;
  }

  writeResponse(response, 404, 'Not found\n', 'text/plain; charset=utf-8');
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString('utf8').trim();
  return body ? JSON.parse(body) : {};
}

function writeJsonResponse(response: ServerResponse, statusCode: number, value: unknown): void {
  writeResponse(response, statusCode, `${JSON.stringify(value, null, 2)}\n`, 'application/json; charset=utf-8');
}

function writeResponse(response: ServerResponse, statusCode: number, body: string, contentType: string): void {
  response.writeHead(statusCode, {
    'content-type': contentType,
    'cache-control': 'no-store',
  });
  response.end(body);
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolvePromise();
    });
  });
}

export function createOpenWebDocsHtml(docs: OpenWebDocsManifest): string {
  const capabilities = [...docs.capabilities].sort((left, right) => left.id.localeCompare(right.id));
  const cards = docs.cards ?? [];
  const packageName = docs.packageName ?? 'Open Web CLI';
  const initialCapability = capabilities[0];
  const docsJson = JSON.stringify({ ...docs, capabilities }).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(packageName)} Docs</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fb;
      --panel: #ffffff;
      --ink: #172033;
      --muted: #5c667a;
      --line: #d9deea;
      --accent: #0f766e;
      --accent-strong: #115e59;
      --code: #111827;
      --chip: #eef7f5;
      --warn: #8a4b0f;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }
    header {
      border-bottom: 1px solid var(--line);
      background: #ffffff;
    }
    .topbar {
      max-width: 1180px;
      margin: 0 auto;
      padding: 24px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 20px;
      align-items: end;
    }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 28px; line-height: 1.15; font-weight: 750; }
    .subtitle { margin-top: 8px; color: var(--muted); font-size: 14px; }
    .metrics { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .metric {
      min-width: 112px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px 12px;
      background: #fbfcff;
    }
    .metric strong { display: block; font-size: 22px; line-height: 1; }
    .metric span { display: block; margin-top: 6px; color: var(--muted); font-size: 12px; }
    main {
      max-width: 1180px;
      margin: 0 auto;
      padding: 20px 24px 32px;
      display: grid;
      grid-template-columns: 330px minmax(0, 1fr);
      gap: 18px;
    }
    aside, section.panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      min-width: 0;
    }
    aside { overflow: hidden; }
    .search { padding: 12px; border-bottom: 1px solid var(--line); }
    input, textarea {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px 12px;
      font: inherit;
      color: var(--ink);
      background: #ffffff;
    }
    textarea {
      min-height: 170px;
      resize: vertical;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 13px;
      line-height: 1.5;
    }
    .list { max-height: calc(100vh - 190px); overflow: auto; }
    .cap-row {
      width: 100%;
      display: grid;
      grid-template-columns: 58px minmax(0, 1fr);
      gap: 10px;
      align-items: center;
      padding: 12px;
      border: 0;
      border-bottom: 1px solid var(--line);
      background: #ffffff;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }
    .cap-row:hover, .cap-row.active { background: #f1f8f7; }
    .method, .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 24px;
      border-radius: 6px;
      padding: 3px 7px;
      color: var(--accent-strong);
      background: var(--chip);
      font-size: 11px;
      font-weight: 750;
      text-transform: uppercase;
    }
    .cap-id { min-width: 0; font-weight: 650; overflow-wrap: anywhere; }
    .cap-desc { margin-top: 4px; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
    section.panel { padding: 18px; }
    .detail-head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: start;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--line);
    }
    .detail-id { font-size: 24px; line-height: 1.2; overflow-wrap: anywhere; }
    .url { margin-top: 10px; color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow-wrap: anywhere; }
    .grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 16px;
      margin-top: 16px;
    }
    .block h3 { font-size: 15px; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 9px 8px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { color: var(--muted); font-weight: 650; }
    code, pre {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: var(--code);
    }
    pre {
      margin: 0;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fbfcff;
      overflow: auto;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-size: 13px;
      line-height: 1.5;
    }
    .demo-actions { display: flex; gap: 8px; align-items: center; margin-top: 10px; flex-wrap: wrap; }
    button.primary {
      border: 1px solid var(--accent-strong);
      border-radius: 6px;
      background: var(--accent);
      color: white;
      padding: 9px 12px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    button.secondary {
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #ffffff;
      color: var(--ink);
      padding: 9px 12px;
      font: inherit;
      cursor: pointer;
    }
    .status { color: var(--muted); font-size: 13px; }
    .empty { color: var(--muted); padding: 12px 0; }
    @media (max-width: 860px) {
      .topbar, main, .grid, .detail-head { grid-template-columns: 1fr; }
      .metrics { justify-content: flex-start; }
      .list { max-height: 280px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="topbar">
      <div>
        <h1>${escapeHtml(packageName)}</h1>
        <p class="subtitle">Converted CLI capability explorer and demo console</p>
      </div>
      <div class="metrics" aria-label="Conversion summary">
        <div class="metric"><strong>${capabilities.length}</strong><span>CLI capabilities</span></div>
        <div class="metric"><strong>${cards.length}</strong><span>UI cards</span></div>
        <div class="metric"><strong>${docs.auth?.loginUrl ? 1 : 0}</strong><span>Login flows</span></div>
      </div>
    </div>
  </header>
  <main>
    <aside>
      <div class="search"><input id="search" placeholder="Search capabilities" /></div>
      <div class="list" id="capability-list"></div>
    </aside>
    <section class="panel" id="detail"></section>
  </main>
  <script id="open-web-docs-data" type="application/json">${docsJson}</script>
  <script>
    const docs = JSON.parse(document.getElementById('open-web-docs-data').textContent);
    const capabilities = docs.capabilities || [];
    let selectedId = ${JSON.stringify(initialCapability?.id ?? '')};

    const list = document.getElementById('capability-list');
    const detail = document.getElementById('detail');
    const search = document.getElementById('search');

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }

    function methodLabel(capability) {
      return capability.method || 'CLI';
    }

    function cliUsage(capability) {
      const parts = capability.id.split('.');
      const command = parts.length > 1 ? parts[0] + ' ' + parts.slice(1).join('.') : capability.id;
      return 'web-agent ' + command + " --input '" + JSON.stringify(exampleInput(capability)) + "'";
    }

    function exampleInput(capability) {
      if (capability.inputExample !== undefined) return capability.inputExample;
      const input = {};
      for (const parameter of capability.parameters || []) {
        input[parameter.name] = parameter.name === 'id' ? 'demo-id' : 'demo-' + parameter.name;
      }
      return input;
    }

    function renderList() {
      const query = search.value.trim().toLowerCase();
      const visible = capabilities.filter((capability) => {
        return !query || capability.id.toLowerCase().includes(query) || String(capability.description || '').toLowerCase().includes(query);
      });
      list.innerHTML = visible.map((capability) => {
        const active = capability.id === selectedId ? ' active' : '';
        return '<button class="cap-row' + active + '" data-id="' + escapeHtml(capability.id) + '">'
          + '<span class="method">' + escapeHtml(methodLabel(capability)) + '</span>'
          + '<span><span class="cap-id">' + escapeHtml(capability.id) + '</span>'
          + '<span class="cap-desc">' + escapeHtml(capability.description || 'No description') + '</span></span>'
          + '</button>';
      }).join('') || '<p class="empty">No capabilities match this search.</p>';
    }

    function renderDetail() {
      const capability = capabilities.find((candidate) => candidate.id === selectedId) || capabilities[0];
      if (!capability) {
        detail.innerHTML = '<p class="empty">No converted CLI capabilities yet.</p>';
        return;
      }
      selectedId = capability.id;
      const params = capability.parameters || [];
      const paramRows = params.map((parameter) => '<tr><td><code>' + escapeHtml(parameter.name) + '</code></td><td>' + escapeHtml(parameter.in) + '</td><td>' + (parameter.required ? 'yes' : 'no') + '</td><td>' + escapeHtml(parameter.description || '') + '</td></tr>').join('');
      detail.innerHTML = ''
        + '<div class="detail-head"><div><h2 class="detail-id">' + escapeHtml(capability.id) + '</h2>'
        + '<p class="subtitle">' + escapeHtml(capability.description || 'No description provided') + '</p>'
        + (capability.url ? '<p class="url">' + escapeHtml(capability.method || '') + ' ' + escapeHtml(capability.url) + '</p>' : '')
        + '</div><span class="badge">' + escapeHtml(methodLabel(capability)) + '</span></div>'
        + '<div class="grid"><div class="block"><h3>Parameters</h3>'
        + (params.length ? '<table><thead><tr><th>Name</th><th>In</th><th>Required</th><th>Description</th></tr></thead><tbody>' + paramRows + '</tbody></table>' : '<p class="empty">Accepts a free-form JSON input object.</p>')
        + '</div><div class="block"><h3>CLI Usage</h3><pre>' + escapeHtml(cliUsage(capability)) + '</pre></div></div>'
        + '<div class="grid"><div class="block"><h3>Demo Input</h3><textarea id="demo-input">' + escapeHtml(JSON.stringify(exampleInput(capability), null, 2)) + '</textarea>'
        + '<div class="demo-actions"><button class="primary" id="run-demo">Run demo</button><button class="secondary" id="reset-demo">Reset</button><span class="status" id="demo-status"></span></div></div>'
        + '<div class="block"><h3>Demo Result</h3><pre id="demo-result">No request yet.</pre></div></div>';
      document.getElementById('run-demo').addEventListener('click', () => runDemo(capability));
      document.getElementById('reset-demo').addEventListener('click', () => {
        document.getElementById('demo-input').value = JSON.stringify(exampleInput(capability), null, 2);
        document.getElementById('demo-result').textContent = 'No request yet.';
      });
    }

    async function runDemo(capability) {
      const status = document.getElementById('demo-status');
      const result = document.getElementById('demo-result');
      status.textContent = 'Running...';
      try {
        const payload = JSON.parse(document.getElementById('demo-input').value || '{}');
        const response = await fetch('/api/demo/' + encodeURIComponent(capability.id), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        result.textContent = JSON.stringify(data, null, 2);
        status.textContent = response.ok ? 'Done' : 'Failed';
      } catch (error) {
        result.textContent = String(error);
        status.textContent = 'Failed';
      }
    }

    list.addEventListener('click', (event) => {
      const row = event.target.closest('[data-id]');
      if (!row) return;
      selectedId = row.getAttribute('data-id');
      renderList();
      renderDetail();
    });
    search.addEventListener('input', renderList);
    renderList();
    renderDetail();
  </script>
</body>
</html>
`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function unwrapAxiosData(response: unknown): unknown {
  if (
    typeof response === 'object' &&
    response !== null &&
    'data' in response &&
    'status' in response &&
    typeof (response as { status: unknown }).status === 'number'
  ) {
    return (response as { data: unknown }).data;
  }

  return response;
}

function normalizeCliError(error: unknown): OpenWebFailure {
  if (isAxiosLikeError(error)) {
    if (error.response) {
      return {
        ok: false,
        error: {
          code: 'REMOTE_HTTP_ERROR',
          message: `HTTP ${error.response.status}`,
          recoverable: error.response.status >= 500,
          details: error.response.data,
        },
      };
    }

    return {
      ok: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error.message,
        recoverable: true,
        details: error.code ? { code: error.code } : undefined,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: 'UNKNOWN_ERROR',
      message: error instanceof Error ? error.message : String(error),
      recoverable: false,
    },
  };
}

function isAxiosLikeError(error: unknown): error is {
  isAxiosError?: boolean;
  message: string;
  code?: string;
  response?: {
    status: number;
    data?: unknown;
  };
} {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    ((error as { isAxiosError?: unknown }).isAxiosError === true || 'response' in error || 'code' in error)
  );
}

function parseCliMapFlags(args: string[]): Map<string, string | undefined> {
  const flags = new Map<string, string | undefined>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith('--')) {
      const name = arg.slice(2);
      const value = args[index + 1]?.startsWith('--') ? undefined : args[index + 1];
      flags.set(name, value);
      if (value !== undefined) {
        index += 1;
      }
    }
  }
  return flags;
}

function writeCliMapJson(io: CliIo, value: unknown): void {
  io.stdout(`${JSON.stringify(value, null, 2)}\n`);
}

function formatCliMapHelp(cliMap: CliMap): string {
  return [
    'Usage:',
    '  web-agent docs [--port <port>] [--host <host>]',
    '  web-agent list',
    '  web-agent <resource> <action> [--input <json>]',
    '',
    'Capabilities:',
    ...Object.values(cliMap).map((entry) => `  ${entry.id}${entry.description ? ` - ${entry.description}` : ''}`),
    '',
  ].join('\n');
}

export async function inspectProject(options: InspectProjectOptions): Promise<InspectReport> {
  const projectRoot = resolve(options.projectRoot);
  reportEvent(options.reporter, { type: 'inspect:start', projectRoot });
  const files = await listProjectFiles(projectRoot);
  const axiosAtoms: AxiosAtom[] = [];
  const authClues: AuthClue[] = [];
  const cardCandidates: CardCandidate[] = [];

  for (const filePath of files) {
    const extension = extname(filePath);
    if (SOURCE_EXTENSIONS.has(extension)) {
      const sourceText = await readFile(filePath, 'utf8');
      axiosAtoms.push(...findAxiosAtoms(projectRoot, filePath, sourceText));
      authClues.push(...findAuthClues(projectRoot, filePath, sourceText));
    }

    if (extension === '.vue') {
      const sourceText = await readFile(filePath, 'utf8');
      authClues.push(...findAuthClues(projectRoot, filePath, sourceText));
      cardCandidates.push(findCardCandidate(projectRoot, filePath, sourceText));
    }
  }

  const report = {
    axiosAtoms: axiosAtoms.sort((left, right) => left.source.localeCompare(right.source)),
    authClues: authClues.sort((left, right) => left.source.localeCompare(right.source) || left.kind.localeCompare(right.kind)),
    cardCandidates: cardCandidates.sort((left, right) => left.source.localeCompare(right.source)),
  };

  reportDiagnostic(options.reporter, {
    code: 'INSPECT_SUMMARY',
    severity: 'info',
    message: `Found ${report.axiosAtoms.length} axios atoms and ${report.cardCandidates.length} card candidates.`,
    details: {
      axiosAtoms: report.axiosAtoms.length,
      authClues: report.authClues.length,
      cardCandidates: report.cardCandidates.length,
    },
  });
  reportEvent(options.reporter, { type: 'inspect:complete', projectRoot, report });
  return report;
}

export async function generateAdapter(options: GenerateAdapterOptions): Promise<GenerateAdapterResult> {
  const projectRoot = resolve(options.projectRoot);
  const configPath = options.configPath ?? join(projectRoot, 'open-web.config.ts');
  reportEvent(options.reporter, { type: 'config:load', configPath });
  const config = await loadOpenWebConfig(configPath);
  const report = await inspectProject({ projectRoot, reporter: options.reporter });
  const packageDir = resolve(projectRoot, config.output.packageDir);
  reportEvent(options.reporter, { type: 'generate:start', projectRoot, packageDir });
  const manifest = buildAdapterManifest(config, report);
  const files = buildAdapterFiles(config, manifest);

  for (const [filePath, content] of files) {
    await writeGeneratedFile(packageDir, filePath, content);
    reportEvent(options.reporter, { type: 'generate:file', packageDir, filePath });
  }

  const result = {
    packageDir,
    files: files.map(([filePath]) => filePath),
  };
  reportEvent(options.reporter, { type: 'generate:complete', result });
  return result;
}

export async function buildAdapter(options: BuildAdapterOptions): Promise<BuildAdapterResult> {
  const generated = await generateAdapter(options);
  const packageManager = options.packageManager ?? 'npm';
  const env = { ...process.env, npm_config_dry_run: 'false', ...options.env };

  reportEvent(options.reporter, { type: 'build:start', packageDir: generated.packageDir });

  if (options.install !== false) {
    const installArgs = ['install', '--ignore-scripts'];
    reportEvent(options.reporter, {
      type: 'build:command',
      packageDir: generated.packageDir,
      command: packageManager,
      args: installArgs,
    });
    await execFileAsync(packageManager, installArgs, { cwd: generated.packageDir, env });
  }

  const buildArgs = ['run', 'build'];
  reportEvent(options.reporter, {
    type: 'build:command',
    packageDir: generated.packageDir,
    command: packageManager,
    args: buildArgs,
  });
  await execFileAsync(packageManager, buildArgs, { cwd: generated.packageDir, env });

  const result = { ...generated, built: true as const };
  reportEvent(options.reporter, { type: 'build:complete', result });
  return result;
}

async function loadOpenWebConfig(configPath: string): Promise<OpenWebConfig> {
  const sourceText = await readFile(configPath, 'utf8');
  const runnableSource = [
    sourceText
      .replace(/import\s+\{[^}]*defineOpenWeb[^}]*\}\s+from\s+['"]open-web-cli['"];?/g, '')
      .replace(/export\s+default\s+/, 'const __openWebConfig = '),
    'globalThis.__openWebConfig = __openWebConfig;',
  ].join('\n');
  const transpiled = ts.transpileModule(runnableSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const context = createContext({
    defineOpenWeb,
    globalThis: {},
  });

  new Script(transpiled, { filename: configPath }).runInContext(context);
  const config = (context.globalThis as { __openWebConfig?: OpenWebConfig }).__openWebConfig;
  if (!config) {
    throw new Error(`No default Open Web config exported from ${configPath}`);
  }

  return config;
}

type AdapterManifest = {
  packageName: string;
  auth: {
    loginUrl?: string;
    probeCapability?: string;
  };
  capabilities: Array<{
    id: string;
    method: string;
    url: string;
    description?: string;
    uiComponent: string | null;
    parameters: OpenWebDocsParameter[];
    inputExample: Record<string, unknown>;
  }>;
  cards: Array<{
    id: string;
    source: string;
    capability?: string;
  }>;
};

function buildAdapterManifest(config: OpenWebConfig, report: InspectReport): AdapterManifest {
  const atomsBySource = new Map(report.axiosAtoms.map((atom) => [atom.source, atom]));
  const cards = Object.entries(config.cards ?? {}).map(([id, card]) => ({
    id,
    source: card.source,
    capability: card.capability,
  }));

  return {
    packageName: config.output.packageName,
    auth: {
      loginUrl: config.auth?.loginUrl,
      probeCapability: config.auth?.probeCapability,
    },
    capabilities: Object.entries(config.expose?.capabilities ?? {}).map(([id, capability]) => {
      const atom = atomsBySource.get(capability.from);
      if (!atom) {
        throw new Error(`Configured capability ${id} points at unknown axios atom ${capability.from}`);
      }

      return {
        id,
        method: atom.method,
        url: atom.url,
        description: capability.description,
        uiComponent: cards.find((card) => card.capability === id)?.id ?? null,
        parameters: buildCapabilityParameters(atom),
        inputExample: buildCapabilityInputExample(atom),
      };
    }),
    cards,
  };
}

function buildCapabilityParameters(atom: AxiosAtom): OpenWebDocsParameter[] {
  const pathParameters = [...atom.url.matchAll(/\$\{([^}]+)\}/g)].map((match) => ({
    name: match[1],
    in: 'path' as const,
    required: true,
    description: `Interpolated into ${atom.url}`,
  }));

  return pathParameters.length > 0
    ? pathParameters
    : [
        {
          name: atom.method === 'GET' ? 'query' : 'body',
          in: atom.method === 'GET' ? 'query' : 'body',
          required: false,
          description:
            atom.method === 'GET'
              ? 'Additional JSON input is sent as query parameters.'
              : 'Additional JSON input is sent as the request body.',
        },
      ];
}

function buildCapabilityInputExample(atom: AxiosAtom): Record<string, unknown> {
  const example: Record<string, unknown> = {};
  for (const parameter of buildCapabilityParameters(atom)) {
    if (parameter.in === 'path') {
      example[parameter.name] = parameter.name.toLowerCase() === 'id' ? 'demo-id' : `demo-${parameter.name}`;
    }
  }
  return example;
}

function buildAdapterFiles(config: OpenWebConfig, manifest: AdapterManifest): Array<[string, string]> {
  return [
    ['package.json', generatedPackageJson(config)],
    ['tsconfig.json', generatedTsconfig()],
    ['src/manifest.ts', generatedManifest(manifest)],
    ['src/sdk.ts', generatedSdk()],
    ['src/cli.ts', generatedCli()],
    ['src/adapters/mastra.ts', generatedMastraAdapter()],
    ['src/adapters/vue.ts', generatedVueAdapter()],
    ['src/cards/registry.ts', generatedCardRegistry()],
    ['src/runtime/auth.ts', generatedAuthRuntime()],
    ['src/runtime/docs.ts', generatedDocsRuntime()],
    ['src/runtime/http.ts', generatedHttpRuntime()],
    ['src/runtime/result.ts', generatedResultRuntime()],
    ['src/runtime/stream.ts', generatedStreamRuntime()],
  ];
}

async function writeGeneratedFile(packageDir: string, filePath: string, content: string): Promise<void> {
  const fullPath = join(packageDir, filePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content);
}

function generatedPackageJson(config: OpenWebConfig): string {
  return `${JSON.stringify(
    {
      name: config.output.packageName,
      version: '0.0.0',
      type: 'module',
      private: true,
      exports: {
        '.': {
          types: './dist/sdk.d.ts',
          default: './dist/sdk.js',
        },
        './mastra': {
          types: './dist/adapters/mastra.d.ts',
          default: './dist/adapters/mastra.js',
        },
        './vue': {
          types: './dist/adapters/vue.d.ts',
          default: './dist/adapters/vue.js',
        },
        './docs': {
          types: './dist/runtime/docs.d.ts',
          default: './dist/runtime/docs.js',
        },
      },
      types: './dist/sdk.d.ts',
      bin: {
        'web-agent': './dist/cli.js',
      },
      scripts: {
        build: 'tsc -p tsconfig.json',
      },
      devDependencies: {
        '@types/node': '^22.10.2',
        typescript: '^5.7.3',
      },
    },
    null,
    2,
  )}\n`;
}

function generatedTsconfig(): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        declaration: true,
        outDir: 'dist',
        rootDir: 'src',
        lib: ['ES2022', 'DOM'],
        types: ['node'],
        skipLibCheck: true,
      },
      include: ['src/**/*.ts'],
    },
    null,
    2,
  )}\n`;
}

function generatedManifest(manifest: AdapterManifest): string {
  return `export const manifest = ${JSON.stringify(manifest, null, 2)} as const;\n`;
}

function generatedResultRuntime(): string {
  return `export type OpenWebUiPayload = {
  kind: 'card' | 'table' | 'form' | 'panel' | 'custom';
  component: string;
  props: Record<string, unknown>;
  actions?: Array<Record<string, unknown>>;
};

export type OpenWebSuccess<TData = unknown> = {
  ok: true;
  capability: string;
  data: TData;
  summary?: string;
  ui?: OpenWebUiPayload;
};

export type OpenWebFailure = {
  ok: false;
  error: {
    code:
      | 'AUTH_REQUIRED'
      | 'AUTH_EXPIRED'
      | 'PERMISSION_DENIED'
      | 'VALIDATION_ERROR'
      | 'REMOTE_HTTP_ERROR'
      | 'REMOTE_BUSINESS_ERROR'
      | 'NETWORK_ERROR'
      | 'CAPABILITY_NOT_FOUND'
      | 'UI_RENDER_UNAVAILABLE'
      | 'CONFIG_ERROR'
      | 'UNKNOWN_ERROR';
    message: string;
    recoverable?: boolean;
    details?: unknown;
  };
};

export type OpenWebResult<TData = unknown> = OpenWebSuccess<TData> | OpenWebFailure;
`;
}

function generatedHttpRuntime(): string {
  return `import type { OpenWebFailure } from './result.js';

export type HttpCapability = {
  id: string;
  method: string;
  url: string;
  uiComponent?: string | null;
};

export type HttpOptions = {
  baseUrl?: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
};

export async function callCapability(capability: HttpCapability, input: unknown, options: HttpOptions): Promise<unknown> {
  const fetchImpl = options.fetch ?? fetch;
  const payload = isRecord(input) ? { ...input } : {};
  const path = capability.url.replace(/\\$\\{([^}]+)\\}/g, (_match, key: string) => {
    const value = payload[key];
    delete payload[key];
    return encodeURIComponent(String(value ?? ''));
  });
  const url = new URL(path, options.baseUrl ?? 'http://127.0.0.1:9');
  const init: RequestInit = {
    method: capability.method,
    headers: {
      ...options.headers,
    },
  };

  if (capability.method === 'GET') {
    for (const [key, value] of Object.entries(payload)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  } else if (Object.keys(payload).length > 0) {
    init.headers = {
      'content-type': 'application/json',
      ...init.headers,
    };
    init.body = JSON.stringify(payload);
  }

  const response = await fetchImpl(url.toString(), init);
  const data = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw {
      ok: false,
      error: {
        code: 'REMOTE_HTTP_ERROR',
        message: \`HTTP \${response.status}\`,
        recoverable: response.status >= 500,
        details: data,
      },
    } satisfies OpenWebFailure;
  }

  return data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
`;
}

function generatedAuthRuntime(): string {
  return `import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { manifest } from '../manifest.js';

export type AuthState = {
  headers?: Record<string, string>;
  cookies?: Array<Record<string, unknown>>;
  storage?: Record<string, unknown>;
};

export class FileAuthStore {
  constructor(private readonly filePath = defaultAuthPath()) {}

  async get(): Promise<AuthState | undefined> {
    try {
      return JSON.parse(await readFile(this.filePath, 'utf8')) as AuthState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }

  async set(authState: AuthState): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(authState, null, 2));
  }

  async clear(): Promise<void> {
    await this.set({});
  }
}

export function defaultAuthPath(): string {
  const safePackageName = manifest.packageName.replace(/[^a-zA-Z0-9._-]+/g, '_');
  return join(homedir(), '.open-web', safePackageName, 'default', 'local', 'auth.json');
}

export async function openBrowserLogin(): Promise<string | undefined> {
  if (!manifest.auth.loginUrl) {
    return undefined;
  }

  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', manifest.auth.loginUrl] : [manifest.auth.loginUrl];
  const child = spawn(opener, args, { detached: true, stdio: 'ignore' });
  child.unref();
  return manifest.auth.loginUrl;
}
`;
}

function generatedDocsRuntime(): string {
  return String.raw`import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export type OpenWebDocsServerOptions = {
  host?: string;
  port?: number;
  execute?: (capabilityId: string, input: unknown) => Promise<unknown>;
  signal?: AbortSignal;
};

export type OpenWebDocsServer = {
  url: string;
  close: () => Promise<void>;
};

export async function serveOpenWebDocs(docs: any, options: OpenWebDocsServerOptions = {}): Promise<OpenWebDocsServer> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 0;
  const server = createServer(async (request, response) => {
    await handleRequest(docs, options.execute, request, response);
  });

  options.signal?.addEventListener('abort', () => {
    server.close();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  const displayHost = address.address === '0.0.0.0' || address.address === '::' ? '127.0.0.1' : address.address;
  return {
    url: 'http://' + displayHost + ':' + address.port,
    close: () => closeServer(server),
  };
}

async function handleRequest(
  docs: any,
  execute: OpenWebDocsServerOptions['execute'],
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');

  if (request.method === 'GET' && url.pathname === '/') {
    writeResponse(response, 200, createOpenWebDocsHtml(docs), 'text/html; charset=utf-8');
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/capabilities') {
    writeJson(response, 200, docs);
    return;
  }

  if (request.method === 'POST' && url.pathname.startsWith('/api/demo/')) {
    if (!execute) {
      writeJson(response, 501, { ok: false, error: { code: 'CONFIG_ERROR', message: 'No demo executor configured.', recoverable: false } });
      return;
    }

    try {
      const capabilityId = decodeURIComponent(url.pathname.slice('/api/demo/'.length));
      const input = await readJsonBody(request);
      writeJson(response, 200, await execute(capabilityId, input));
    } catch (error) {
      writeJson(response, 400, {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error instanceof Error ? error.message : String(error),
          recoverable: true,
        },
      });
    }
    return;
  }

  writeResponse(response, 404, 'Not found\n', 'text/plain; charset=utf-8');
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks).toString('utf8').trim();
  return body ? JSON.parse(body) : {};
}

function writeJson(response: ServerResponse, statusCode: number, value: unknown): void {
  writeResponse(response, statusCode, JSON.stringify(value, null, 2) + '\n', 'application/json; charset=utf-8');
}

function writeResponse(response: ServerResponse, statusCode: number, body: string, contentType: string): void {
  response.writeHead(statusCode, { 'content-type': contentType, 'cache-control': 'no-store' });
  response.end(body);
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export function createOpenWebDocsHtml(docs: any): string {
  const capabilities = [...(docs.capabilities ?? [])].sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const cards = docs.cards ?? [];
  const packageName = docs.packageName ?? 'Open Web CLI';
  const payload = JSON.stringify({ ...docs, capabilities }).replace(/</g, '\\u003c');
  const initialId = capabilities[0]?.id ?? '';

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '<title>' + escapeHtml(packageName) + ' Docs</title>',
    '<style>',
    ':root{--bg:#f7f8fb;--panel:#fff;--ink:#172033;--muted:#5c667a;--line:#d9deea;--accent:#0f766e;--chip:#eef7f5;--code:#111827}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0}header{border-bottom:1px solid var(--line);background:#fff}.topbar{max-width:1180px;margin:0 auto;padding:24px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:20px;align-items:end}h1,h2,h3,p{margin:0}h1{font-size:28px;line-height:1.15}.subtitle{margin-top:8px;color:var(--muted);font-size:14px}.metrics{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.metric{min-width:112px;border:1px solid var(--line);border-radius:8px;padding:10px 12px;background:#fbfcff}.metric strong{display:block;font-size:22px;line-height:1}.metric span{display:block;margin-top:6px;color:var(--muted);font-size:12px}main{max-width:1180px;margin:0 auto;padding:20px 24px 32px;display:grid;grid-template-columns:330px minmax(0,1fr);gap:18px}aside,section.panel{background:var(--panel);border:1px solid var(--line);border-radius:8px;min-width:0}aside{overflow:hidden}.search{padding:12px;border-bottom:1px solid var(--line)}input,textarea{width:100%;border:1px solid var(--line);border-radius:6px;padding:10px 12px;font:inherit;color:var(--ink);background:#fff}textarea{min-height:170px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.5}.list{max-height:calc(100vh - 190px);overflow:auto}.cap-row{width:100%;display:grid;grid-template-columns:58px minmax(0,1fr);gap:10px;align-items:center;padding:12px;border:0;border-bottom:1px solid var(--line);background:#fff;color:inherit;text-align:left;cursor:pointer}.cap-row:hover,.cap-row.active{background:#f1f8f7}.method,.badge{display:inline-flex;align-items:center;justify-content:center;min-height:24px;border-radius:6px;padding:3px 7px;color:#115e59;background:var(--chip);font-size:11px;font-weight:750;text-transform:uppercase}.cap-id{min-width:0;font-weight:650;overflow-wrap:anywhere}.cap-desc{margin-top:4px;color:var(--muted);font-size:12px;overflow-wrap:anywhere}section.panel{padding:18px}.detail-head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:start;padding-bottom:16px;border-bottom:1px solid var(--line)}.detail-id{font-size:24px;line-height:1.2;overflow-wrap:anywhere}.url{margin-top:10px;color:var(--muted);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow-wrap:anywhere}.grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;margin-top:16px}.block h3{font-size:15px;margin-bottom:10px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:9px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--muted);font-weight:650}code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--code)}pre{margin:0;padding:12px;border:1px solid var(--line);border-radius:6px;background:#fbfcff;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.5}.demo-actions{display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap}button.primary{border:1px solid #115e59;border-radius:6px;background:var(--accent);color:#fff;padding:9px 12px;font:inherit;font-weight:700;cursor:pointer}button.secondary{border:1px solid var(--line);border-radius:6px;background:#fff;color:var(--ink);padding:9px 12px;font:inherit;cursor:pointer}.status{color:var(--muted);font-size:13px}.empty{color:var(--muted);padding:12px 0}@media(max-width:860px){.topbar,main,.grid,.detail-head{grid-template-columns:1fr}.metrics{justify-content:flex-start}.list{max-height:280px}}',
    '</style>',
    '</head>',
    '<body>',
    '<header><div class="topbar"><div><h1>' + escapeHtml(packageName) + '</h1><p class="subtitle">Converted CLI capability explorer and demo console</p></div><div class="metrics"><div class="metric"><strong>' + capabilities.length + '</strong><span>CLI capabilities</span></div><div class="metric"><strong>' + cards.length + '</strong><span>UI cards</span></div><div class="metric"><strong>' + (docs.auth?.loginUrl ? 1 : 0) + '</strong><span>Login flows</span></div></div></div></header>',
    '<main><aside><div class="search"><input id="search" placeholder="Search capabilities" /></div><div class="list" id="capability-list"></div></aside><section class="panel" id="detail"></section></main>',
    '<script id="open-web-docs-data" type="application/json">' + payload + '</script>',
    '<script>',
    'const docs=JSON.parse(document.getElementById("open-web-docs-data").textContent);const capabilities=docs.capabilities||[];let selectedId=' + JSON.stringify(initialId) + ';const list=document.getElementById("capability-list");const detail=document.getElementById("detail");const search=document.getElementById("search");function escapeHtml(value){return String(value??"").replace(/[&<>"]/g,function(char){return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[char]}).replaceAll(String.fromCharCode(39),"&#39;")}function methodLabel(capability){return capability.method||"CLI"}function exampleInput(capability){if(capability.inputExample!==undefined)return capability.inputExample;const input={};for(const parameter of capability.parameters||[]){input[parameter.name]=parameter.name==="id"?"demo-id":"demo-"+parameter.name}return input}function cliUsage(capability){const parts=capability.id.split(".");const command=parts.length>1?parts[0]+" "+parts.slice(1).join("."):capability.id;const quote=String.fromCharCode(39);return "web-agent "+command+" --input "+quote+JSON.stringify(exampleInput(capability))+quote}function renderList(){const query=search.value.trim().toLowerCase();const visible=capabilities.filter(function(capability){return !query||capability.id.toLowerCase().includes(query)||String(capability.description||"").toLowerCase().includes(query)});list.innerHTML=visible.map(function(capability){const active=capability.id===selectedId?" active":"";return "<button class=\\"cap-row"+active+"\\" data-id=\\""+escapeHtml(capability.id)+"\\"><span class=\\"method\\">"+escapeHtml(methodLabel(capability))+"</span><span><span class=\\"cap-id\\">"+escapeHtml(capability.id)+"</span><span class=\\"cap-desc\\">"+escapeHtml(capability.description||"No description")+"</span></span></button>"}).join("")||"<p class=\\"empty\\">No capabilities match this search.</p>"}function renderDetail(){const capability=capabilities.find(function(candidate){return candidate.id===selectedId})||capabilities[0];if(!capability){detail.innerHTML="<p class=\\"empty\\">No converted CLI capabilities yet.</p>";return}selectedId=capability.id;const params=capability.parameters||[];const rows=params.map(function(parameter){return "<tr><td><code>"+escapeHtml(parameter.name)+"</code></td><td>"+escapeHtml(parameter.in)+"</td><td>"+(parameter.required?"yes":"no")+"</td><td>"+escapeHtml(parameter.description||"")+"</td></tr>"}).join("");detail.innerHTML="<div class=\\"detail-head\\"><div><h2 class=\\"detail-id\\">"+escapeHtml(capability.id)+"</h2><p class=\\"subtitle\\">"+escapeHtml(capability.description||"No description provided")+"</p>"+(capability.url?"<p class=\\"url\\">"+escapeHtml(capability.method||"")+" "+escapeHtml(capability.url)+"</p>":"")+"</div><span class=\\"badge\\">"+escapeHtml(methodLabel(capability))+"</span></div><div class=\\"grid\\"><div class=\\"block\\"><h3>Parameters</h3>"+(params.length?"<table><thead><tr><th>Name</th><th>In</th><th>Required</th><th>Description</th></tr></thead><tbody>"+rows+"</tbody></table>":"<p class=\\"empty\\">Accepts a free-form JSON input object.</p>")+"</div><div class=\\"block\\"><h3>CLI Usage</h3><pre>"+escapeHtml(cliUsage(capability))+"</pre></div></div><div class=\\"grid\\"><div class=\\"block\\"><h3>Demo Input</h3><textarea id=\\"demo-input\\">"+escapeHtml(JSON.stringify(exampleInput(capability),null,2))+"</textarea><div class=\\"demo-actions\\"><button class=\\"primary\\" id=\\"run-demo\\">Run demo</button><button class=\\"secondary\\" id=\\"reset-demo\\">Reset</button><span class=\\"status\\" id=\\"demo-status\\"></span></div></div><div class=\\"block\\"><h3>Demo Result</h3><pre id=\\"demo-result\\">No request yet.</pre></div></div>";document.getElementById("run-demo").addEventListener("click",function(){runDemo(capability)});document.getElementById("reset-demo").addEventListener("click",function(){document.getElementById("demo-input").value=JSON.stringify(exampleInput(capability),null,2);document.getElementById("demo-result").textContent="No request yet."})}async function runDemo(capability){const status=document.getElementById("demo-status");const result=document.getElementById("demo-result");status.textContent="Running...";try{const payload=JSON.parse(document.getElementById("demo-input").value||"{}");const response=await fetch("/api/demo/"+encodeURIComponent(capability.id),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});const data=await response.json();result.textContent=JSON.stringify(data,null,2);status.textContent=response.ok?"Done":"Failed"}catch(error){result.textContent=String(error);status.textContent="Failed"}}list.addEventListener("click",function(event){const row=event.target.closest("[data-id]");if(!row)return;selectedId=row.getAttribute("data-id");renderList();renderDetail()});search.addEventListener("input",renderList);renderList();renderDetail();',
    '</script>',
    '</body>',
    '</html>',
  ].join('\n');
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
`;
}

function generatedSdk(): string {
  return `import { manifest } from './manifest.js';
import { callCapability } from './runtime/http.js';
import type { OpenWebFailure, OpenWebResult, OpenWebSuccess } from './runtime/result.js';

export type SdkOptions = {
  baseUrl?: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
};

export function createSdk(options: SdkOptions = {}): any {
  const sdk: Record<string, any> = {};

  for (const capability of manifest.capabilities) {
    const [resource, action] = capability.id.split('.');
    sdk[resource] ??= {};
    sdk[resource][action] = async (input?: unknown): Promise<OpenWebResult> => executeCapability(capability.id, input, options);
  }

  return sdk;
}

export async function executeCapability(
  capabilityId: string,
  input: unknown,
  options: SdkOptions = {},
): Promise<OpenWebResult> {
  const capability = (manifest.capabilities as readonly any[]).find((candidate) => candidate.id === capabilityId);
  if (!capability) {
    return {
      ok: false,
      error: {
        code: 'CAPABILITY_NOT_FOUND',
        message: \`Unknown capability: \${capabilityId}\`,
        recoverable: false,
      },
    };
  }

  try {
    const data = await callCapability(capability, input, options);
    const result: OpenWebSuccess = {
      ok: true,
      capability: capability.id,
      data,
      summary: \`\${capability.id} completed.\`,
    };

    if (capability.uiComponent) {
      result.ui = {
        kind: 'card',
        component: capability.uiComponent,
        props: { data },
      };
    }

    return result;
  } catch (error) {
    if (isOpenWebFailure(error)) {
      return error;
    }

    return {
      ok: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : String(error),
        recoverable: true,
      },
    };
  }
}

function isOpenWebFailure(error: unknown): error is OpenWebFailure {
  return typeof error === 'object' && error !== null && 'ok' in error && (error as { ok: unknown }).ok === false;
}
`;
}

function generatedCli(): string {
  return `#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifest } from './manifest.js';
import { FileAuthStore, openBrowserLogin, type AuthState } from './runtime/auth.js';
import { createOpenWebDocsHtml, serveOpenWebDocs } from './runtime/docs.js';
import { executeCapability } from './sdk.js';

type CliIo = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

const DEFAULT_IO: CliIo = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

export async function runCli(args = process.argv.slice(2), io: CliIo = DEFAULT_IO): Promise<number> {
  const [command, ...commandRest] = args;
  const action = command === 'auth' ? commandRest[0] : commandRest[0]?.startsWith('--') ? undefined : commandRest[0];
  const rest = action ? commandRest.slice(1) : commandRest;
  const flags = parseFlags(rest);
  const authStore = new FileAuthStore();

  if (command === 'docs') {
    if (flags.has('json')) {
      writeJson(io, manifest);
      return 0;
    }

    if (flags.has('html')) {
      io.stdout(createOpenWebDocsHtml(manifest));
      return 0;
    }

    const server = await serveOpenWebDocs(manifest, {
      host: flags.get('host'),
      port: flags.has('port') ? Number(flags.get('port')) : undefined,
      execute: async (capabilityId, input) => {
        const authState = await authStore.get();
        return executeCapability(capabilityId, input, {
          baseUrl: process.env.OPEN_WEB_BASE_URL,
          headers: authState?.headers,
        });
      },
    });
    io.stdout(\`Open Web docs available at \${server.url}\\n\`);
    await new Promise<never>(() => undefined);
  }

  if (command === 'login') {
    const authJson = flags.get('auth-json');
    if (authJson) {
      await authStore.set(JSON.parse(authJson) as AuthState);
      writeJson(io, { ok: true, capability: 'auth.login', data: { authenticated: true }, summary: 'Auth state saved.' });
      return 0;
    }

    const loginUrl = await openBrowserLogin();
    writeJson(io, { ok: true, capability: 'auth.login', data: { loginUrl }, summary: 'Browser login opened.' });
    return 0;
  }

  if (command === 'auth' && action === 'status') {
    const authState = await authStore.get();
    writeJson(io, { ok: true, capability: 'auth.status', data: { authenticated: Boolean(authState?.headers) } });
    return 0;
  }

  if (command === 'logout') {
    await authStore.clear();
    writeJson(io, { ok: true, capability: 'auth.logout', data: { authenticated: false }, summary: 'Auth state cleared.' });
    return 0;
  }

  if (!command || !action) {
    io.stderr('Usage: web-agent login|logout|auth status|docs|<resource> <action>\\n');
    return 1;
  }

  const input = flags.has('input') ? JSON.parse(flags.get('input') ?? '{}') : {};
  const authState = await authStore.get();
  const result = await executeCapability(\`\${command}.\${action}\`, input, {
    baseUrl: process.env.OPEN_WEB_BASE_URL,
    headers: authState?.headers,
  });
  writeJson(io, result);
  return result.ok ? 0 : 1;
}

function parseFlags(args: string[]): Map<string, string | undefined> {
  const flags = new Map<string, string | undefined>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith('--')) {
      const name = arg.slice(2);
      const value = args[index + 1]?.startsWith('--') ? undefined : args[index + 1];
      flags.set(name, value);
      if (value !== undefined) {
        index += 1;
      }
    }
  }
  return flags;
}

function writeJson(io: CliIo, value: unknown): void {
  io.stdout(\`\${JSON.stringify(value, null, 2)}\\n\`);
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(process.argv[1]))) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
`;
}

function generatedMastraAdapter(): string {
  return `import { manifest } from '../manifest.js';

export type MastraTool = {
  id: string;
  description: string;
  execute: (input: unknown) => Promise<unknown>;
};

export function createMastraTools(sdk: Record<string, any>, options: { mode?: 'per-capability' | 'dispatcher' } = {}): Record<string, MastraTool> {
  if (options.mode === 'dispatcher') {
    return {
      open_web: {
        id: 'open_web',
        description: 'Dispatch an Open Web capability.',
        execute: async (input: unknown) => {
          const payload = input as { capability: string; input?: unknown };
          const [resource, action] = payload.capability.split('.');
          return sdk[resource][action](payload.input);
        },
      },
    };
  }

  return Object.fromEntries(
    (manifest.capabilities as readonly any[]).map((capability) => {
      const [resource, action] = capability.id.split('.');
      return [
        capability.id.replace(/\\./g, '_'),
        {
          id: capability.id,
          description: capability.description ?? capability.id,
          execute: (input: unknown) => sdk[resource][action](input),
        },
      ];
    }),
  );
}
`;
}

function generatedCardRegistry(): string {
  return `import { manifest } from '../manifest.js';

export type CardRegistryEntry = {
  id: string;
  source: string;
  capability?: string;
};

export const cardRegistry: Record<string, CardRegistryEntry> = Object.fromEntries(
  (manifest.cards as readonly CardRegistryEntry[]).map((card) => [card.id, card]),
);
`;
}

function generatedVueAdapter(): string {
  return `import { cardRegistry } from '../cards/registry.js';
import type { OpenWebUiPayload } from '../runtime/result.js';

export { cardRegistry } from '../cards/registry.js';

export function renderOpenWebPayload(ui: OpenWebUiPayload): { component: unknown; props: Record<string, unknown> } {
  const component = cardRegistry[ui.component];
  if (!component) {
    throw new Error(\`Unknown Open Web card: \${ui.component}\`);
  }

  return {
    component,
    props: ui.props,
  };
}

export const OpenWebRenderer = {
  render: renderOpenWebPayload,
};
`;
}

function generatedStreamRuntime(): string {
  return `import type { OpenWebSuccess } from './result.js';

export type OpenWebUiPart = {
  type: 'data-open-web-ui';
  id: string;
  data: OpenWebSuccess;
};

export function toOpenWebUiPart(result: OpenWebSuccess, id = crypto.randomUUID()): OpenWebUiPart | undefined {
  if (!result.ui) {
    return undefined;
  }

  return {
    type: 'data-open-web-ui',
    id,
    data: result,
  };
}
`;
}

async function listProjectFiles(projectRoot: string): Promise<string[]> {
  const files: string[] = [];
  const ignoredDirectories = new Set(['.git', 'node_modules', 'dist']);

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (ignoredDirectories.has(entry.name)) {
        continue;
      }

      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  await visit(projectRoot);
  return files;
}

function findAxiosAtoms(projectRoot: string, filePath: string, sourceText: string): AxiosAtom[] {
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const atoms: AxiosAtom[] = [];

  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name) {
      collectAtomsFromFunction(projectRoot, filePath, node.name.text, node, atoms);
    }

    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.initializer &&
          (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))
        ) {
          collectAtomsFromFunction(projectRoot, filePath, declaration.name.text, declaration.initializer, atoms);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return atoms;
}

function collectAtomsFromFunction(
  projectRoot: string,
  filePath: string,
  functionName: string,
  functionNode: ts.Node,
  atoms: AxiosAtom[],
): void {
  function visit(node: ts.Node): void {
    const call = getHttpCall(node);
    if (call) {
      atoms.push({
        id: `${resourceNameFromFile(filePath)}.${functionName}`,
        method: call.method.toUpperCase(),
        source: `${toProjectPath(projectRoot, filePath)}#${functionName}`,
        url: call.url,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(functionNode);
}

function getHttpCall(node: ts.Node): { method: string; url: string } | undefined {
  if (
    !ts.isCallExpression(node) ||
    !ts.isPropertyAccessExpression(node.expression) ||
    !ts.isIdentifier(node.expression.expression)
  ) {
    return undefined;
  }

  const method = node.expression.name.text;
  if (!HTTP_METHODS.has(method)) {
    return undefined;
  }

  const urlArgument = node.arguments[0];
  const url = getUrlText(urlArgument);
  if (!url) {
    return undefined;
  }

  return { method, url };
}

function getUrlText(node: ts.Expression | undefined): string | undefined {
  if (!node) {
    return undefined;
  }

  if (ts.isStringLiteralLike(node)) {
    return node.text;
  }

  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }

  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map((span) => `\${${span.expression.getText()}}${span.literal.text}`).join('');
  }

  return undefined;
}

function findCardCandidate(projectRoot: string, filePath: string, sourceText: string): CardCandidate {
  const descriptor = parseSfc(sourceText, { filename: filePath }).descriptor;
  const scriptContent = [descriptor.script?.content, descriptor.scriptSetup?.content].filter(Boolean).join('\n');

  return {
    id: kebabCase(basename(filePath, '.vue')),
    source: toProjectPath(projectRoot, filePath),
    props: findDefineProps(scriptContent),
    warnings: findCardWarnings(scriptContent),
  };
}

function findAuthClues(projectRoot: string, filePath: string, sourceText: string): AuthClue[] {
  const source = toProjectPath(projectRoot, filePath);
  const checks: Array<[RegExp, AuthClue['kind'], string]> = [
    [/\blogin\b|\/login/i, 'login', 'mentions login flow'],
    [/\baccessToken\b|\brefreshToken\b|\btoken\b/i, 'token', 'mentions token state'],
    [/\bauthorization\b/i, 'authorization-header', 'mentions authorization header'],
    [/\bwithCredentials\b/i, 'credentials', 'mentions credentialed requests'],
  ];

  return checks
    .filter(([pattern]) => pattern.test(sourceText) || pattern.test(source))
    .map(([, kind, detail]) => ({
      kind,
      source,
      detail,
    }));
}

function findDefineProps(scriptContent: string): string[] {
  const sourceFile = ts.createSourceFile('component.ts', scriptContent, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const props = new Set<string>();

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineProps' &&
      node.typeArguments?.[0] &&
      ts.isTypeLiteralNode(node.typeArguments[0])
    ) {
      for (const member of node.typeArguments[0].members) {
        if (ts.isPropertySignature(member) && member.name) {
          props.add(member.name.getText(sourceFile).replace(/^['"]|['"]$/g, ''));
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return [...props].sort();
}

function findCardWarnings(scriptContent: string): string[] {
  const warnings: string[] = [];
  const checks: Array<[RegExp, string]> = [
    [/\buse[A-Z]\w*Store\s*\(/, 'uses-store'],
    [/\buseRouter\s*\(|\buseRoute\s*\(/, 'uses-router'],
    [/\buseI18n\s*\(/, 'uses-i18n'],
    [/\bwindow\b|\bdocument\b/, 'uses-browser-global'],
    [/\baxios\b|\bfetch\s*\(/, 'uses-direct-api'],
  ];

  for (const [pattern, warning] of checks) {
    if (pattern.test(scriptContent)) {
      warnings.push(warning);
    }
  }

  return warnings;
}

function resourceNameFromFile(filePath: string): string {
  return basename(filePath, extname(filePath));
}

function toProjectPath(projectRoot: string, filePath: string): string {
  return relative(projectRoot, filePath).split(sep).join('/');
}

function kebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}
