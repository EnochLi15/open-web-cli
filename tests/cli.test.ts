import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { runCli } from '../src/cli.js';

describe('open-web inspect', () => {
  it('prints a JSON inspection report for a target project', async () => {
    const projectRoot = join(tmpdir(), `open-web-cli-${crypto.randomUUID()}`);
    await mkdir(join(projectRoot, 'src/api'), { recursive: true });

    await writeFile(
      join(projectRoot, 'src/api/orders.ts'),
      [
        "import axios from 'axios';",
        'export async function listOrders() {',
        "  return axios.get('/orders');",
        '}',
      ].join('\n'),
    );

    const writes: string[] = [];
    const exitCode = await runCli(['inspect', '--project', projectRoot, '--json'], {
      stdout: (text) => writes.push(text),
      stderr: () => undefined,
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(writes.join(''))).toEqual({
      axiosAtoms: [
        {
          id: 'orders.listOrders',
          method: 'GET',
          source: 'src/api/orders.ts#listOrders',
          url: '/orders',
        },
      ],
      authClues: [],
      cardCandidates: [],
    });
  });
});

describe('open-web generate', () => {
  it('writes an adapter package from the target project config', async () => {
    const workspace = join(tmpdir(), `open-web-cli-generate-${crypto.randomUUID()}`);
    const projectRoot = join(workspace, 'demo-web');
    await mkdir(join(projectRoot, 'src/api'), { recursive: true });
    await mkdir(join(projectRoot, 'src/components'), { recursive: true });

    await writeFile(
      join(projectRoot, 'open-web.config.ts'),
      [
        "import { defineOpenWeb } from 'open-web-cli';",
        'export default defineOpenWeb({',
        "  output: { packageDir: '../demo-agent-adapter', packageName: '@demo/agent-adapter' },",
        "  expose: { capabilities: { 'order.list': { from: 'src/api/orders.ts#listOrders' } } },",
        "  cards: { 'order-list-card': { source: 'src/components/OrderListCard.vue', capability: 'order.list' } },",
        '});',
      ].join('\n'),
    );
    await writeFile(
      join(projectRoot, 'src/api/orders.ts'),
      ["import axios from 'axios';", 'export function listOrders() {', "  return axios.get('/orders');", '}'].join(
        '\n',
      ),
    );
    await writeFile(
      join(projectRoot, 'src/components/OrderListCard.vue'),
      ['<script setup lang="ts">', 'defineProps<{ data: unknown[] }>();', '</script>', '<template />'].join('\n'),
    );

    const writes: string[] = [];
    const exitCode = await runCli(['generate', '--project', projectRoot, '--json'], {
      stdout: (text) => writes.push(text),
      stderr: () => undefined,
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(writes.join(''))).toEqual({
      packageDir: join(workspace, 'demo-agent-adapter'),
      files: expect.arrayContaining(['package.json', 'src/sdk.ts', 'src/cli.ts']),
    });
  });
});
