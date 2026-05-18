import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
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
  execute: (input: unknown, context: CliExecutionContext) => Promise<OpenWebResult>;
};

export type CliMap = Record<string, CliMapEntry>;

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
      };
    }),
    cards,
  };
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
import { FileAuthStore, openBrowserLogin, type AuthState } from './runtime/auth.js';
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
    io.stderr('Usage: web-agent login|logout|auth status|<resource> <action>\\n');
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
