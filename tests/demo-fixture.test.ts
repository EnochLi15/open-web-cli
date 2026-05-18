import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { generateAdapter, inspectProject } from '../src/index.js';

const execFileAsync = promisify(execFile);
const demoRoot = join(process.cwd(), 'examples/demo-vue-axios');

describe('demo Vue 3 axios fixture', () => {
  it('verifies the MVP flow against a real fixture project', async () => {
    const report = await inspectProject({ projectRoot: demoRoot });

    expect(report.axiosAtoms).toEqual(
      expect.arrayContaining([
        {
          id: 'user.listUsers',
          method: 'GET',
          source: 'src/api/user.ts#listUsers',
          url: '/users',
        },
        {
          id: 'order.updateOrderStatus',
          method: 'POST',
          source: 'src/api/order.ts#updateOrderStatus',
          url: '/orders/${id}/status',
        },
      ]),
    );
    expect(report.authClues).toEqual(
      expect.arrayContaining([
        {
          kind: 'login',
          source: 'src/api/auth.ts',
          detail: 'mentions login flow',
        },
        {
          kind: 'authorization-header',
          source: 'src/api/http.ts',
          detail: 'mentions authorization header',
        },
        {
          kind: 'credentials',
          source: 'src/api/http.ts',
          detail: 'mentions credentialed requests',
        },
      ]),
    );
    expect(report.cardCandidates).toEqual(
      expect.arrayContaining([
        {
          id: 'user-list-card',
          source: 'src/components/UserListCard.vue',
          props: ['users'],
          warnings: [],
        },
        {
          id: 'order-status-card',
          source: 'src/components/OrderStatusCard.vue',
          props: ['orderId', 'status'],
          warnings: [],
        },
      ]),
    );

    const generated = await generateAdapter({ projectRoot: demoRoot });
    expect(generated.packageDir).toBe(join(process.cwd(), 'examples/demo-agent-adapter'));

    await execFileAsync('npm', ['install', '--ignore-scripts'], { cwd: generated.packageDir });
    await execFileAsync('npm', ['run', 'build'], { cwd: generated.packageDir });
  });
});
