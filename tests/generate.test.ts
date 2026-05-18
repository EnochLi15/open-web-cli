import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { buildAdapter } from '../src/index.js';

const execFileAsync = promisify(execFile);

describe('buildAdapter', () => {
  it('creates and builds an independent adapter package with CLI, SDK, Mastra, stream, and Vue registry entry points', async () => {
    const workspace = join(tmpdir(), `open-web-generate-${crypto.randomUUID()}`);
    const projectRoot = join(workspace, 'demo-web');
    const packageDir = join(workspace, 'demo-agent-adapter');

    await mkdir(join(projectRoot, 'src/api'), { recursive: true });
    await mkdir(join(projectRoot, 'src/components'), { recursive: true });

    await writeFile(
      join(projectRoot, 'open-web.config.ts'),
      [
        "import { defineOpenWeb } from 'open-web-cli';",
        'export default defineOpenWeb({',
        '  output: {',
        "    packageDir: '../demo-agent-adapter',",
        "    packageName: '@demo/agent-adapter',",
        '  },',
        '  auth: {',
        "    loginUrl: 'https://app.example.test/login',",
        "    probeCapability: 'user.list',",
        '  },',
        '  expose: {',
        '    capabilities: {',
        "      'user.list': { from: 'src/api/user.ts#listUsers', description: 'List users' },",
        "      'user.updateStatus': { from: 'src/api/user.ts#updateUserStatus', description: 'Update status' },",
        '    },',
        '  },',
        '  cards: {',
        "    'user-list-card': { source: 'src/components/UserListCard.vue', capability: 'user.list' },",
        '  },',
        '});',
      ].join('\n'),
    );
    await writeFile(
      join(projectRoot, 'src/api/user.ts'),
      [
        "import axios from 'axios';",
        'export function listUsers(params: { status?: string }) {',
        "  return axios.get('/users', { params });",
        '}',
        'export const updateUserStatus = (id: string, status: string) => {',
        "  return axios.post(`/users/${id}/status`, { status });",
        '};',
      ].join('\n'),
    );
    await writeFile(
      join(projectRoot, 'src/components/UserListCard.vue'),
      [
        '<script setup lang="ts">',
        'defineProps<{ users: Array<{ id: string; name: string }> }>();',
        '</script>',
        '<template><section>{{ users.length }}</section></template>',
      ].join('\n'),
    );

    const events: string[] = [];
    const diagnostics: string[] = [];
    const result = await buildAdapter({
      projectRoot,
      reporter: {
        event: (event) => events.push(event.type),
        diagnostic: (diagnostic) => diagnostics.push(diagnostic.code),
      },
    });

    expect(result.packageDir).toBe(packageDir);
    expect(result.built).toBe(true);
    expect(result.files).toEqual(
      expect.arrayContaining([
        'package.json',
        'src/cli.ts',
        'src/sdk.ts',
        'src/manifest.ts',
        'src/adapters/mastra.ts',
        'src/adapters/vue.ts',
        'src/cards/registry.ts',
        'src/runtime/auth.ts',
        'src/runtime/http.ts',
        'src/runtime/result.ts',
        'src/runtime/stream.ts',
      ]),
    );
    expect(events).toEqual(
      expect.arrayContaining([
        'config:load',
        'inspect:start',
        'inspect:complete',
        'generate:start',
        'generate:complete',
        'build:start',
        'build:command',
        'build:complete',
      ]),
    );
    expect(diagnostics).toEqual(expect.arrayContaining(['INSPECT_SUMMARY']));

    const cliSource = await readFile(join(packageDir, 'src/cli.ts'), 'utf8');
    const sdkSource = await readFile(join(packageDir, 'src/sdk.ts'), 'utf8');

    expect(cliSource).not.toContain(projectRoot);
    expect(sdkSource).not.toContain(projectRoot);

    const { createSdk } = await import(`${packageDir}/dist/sdk.js`);
    const { createMastraTools } = await import(`${packageDir}/dist/adapters/mastra.js`);
    const { cardRegistry, renderOpenWebPayload } = await import(`${packageDir}/dist/adapters/vue.js`);
    const { toOpenWebUiPart } = await import(`${packageDir}/dist/runtime/stream.js`);

    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const sdk = createSdk({
      baseUrl: 'https://api.example.test',
      fetch: async (url: string, init?: RequestInit) => {
        requests.push({ url, init });
        return Response.json([{ id: '1', name: 'Ada' }]);
      },
    });

    const sdkResult = await sdk.user.list({ status: 'active' });
    expect(sdkResult).toEqual({
      ok: true,
      capability: 'user.list',
      data: [{ id: '1', name: 'Ada' }],
      summary: 'user.list completed.',
      ui: {
        kind: 'card',
        component: 'user-list-card',
        props: {
          data: [{ id: '1', name: 'Ada' }],
        },
      },
    });
    expect(requests[0]?.url).toBe('https://api.example.test/users?status=active');

    const tools = createMastraTools(sdk);
    expect(Object.keys(tools)).toEqual(['user_list', 'user_updateStatus']);
    expect(await tools.user_list.execute({ status: 'active' })).toEqual(sdkResult);

    expect(cardRegistry['user-list-card']).toEqual({
      id: 'user-list-card',
      source: 'src/components/UserListCard.vue',
      capability: 'user.list',
    });
    expect(renderOpenWebPayload(sdkResult.ui)).toEqual({
      component: cardRegistry['user-list-card'],
      props: { data: [{ id: '1', name: 'Ada' }] },
    });
    expect(toOpenWebUiPart(sdkResult, 'part-1')).toEqual({
      type: 'data-open-web-ui',
      id: 'part-1',
      data: sdkResult,
    });

    const login = await execFileAsync(process.execPath, [
      join(packageDir, 'dist/cli.js'),
      'login',
      '--auth-json',
      '{"headers":{"authorization":"Bearer test"}}',
      '--json',
    ]);
    expect(JSON.parse(login.stdout)).toEqual({
      ok: true,
      capability: 'auth.login',
      data: {
        authenticated: true,
      },
      summary: 'Auth state saved.',
    });

    const capability = await execFileAsync(process.execPath, [
      join(packageDir, 'dist/cli.js'),
      'user',
      'list',
      '--input',
      '{"status":"active"}',
    ]).catch((error: unknown) => error as { stdout: string });
    expect(JSON.parse(capability.stdout)).toEqual({
      ok: false,
      error: {
        code: 'NETWORK_ERROR',
        message: expect.stringContaining('fetch failed'),
        recoverable: true,
      },
    });
  });
});
