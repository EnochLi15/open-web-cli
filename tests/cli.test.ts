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
      cardCandidates: [],
    });
  });
});
