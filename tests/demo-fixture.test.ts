import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { buildAdapter, inspectProject } from '../src/index.js';

const execFileAsync = promisify(execFile);
const demoRoot = join(process.cwd(), 'examples/demo-vue-axios');
const realNpmEnv = { ...process.env, npm_config_dry_run: 'false' };

describe('demo Vue 3 axios fixture', () => {
  it('verifies the MVP flow against a real fixture project', async () => {
    const report = await inspectProject({ projectRoot: demoRoot });

    expect(report.axiosAtoms).toEqual(
      expect.arrayContaining([
        {
          id: 'kanban.listKanbanCards',
          method: 'GET',
          source: 'src/api/kanban.ts#listKanbanCards',
          url: '/kanban/cards',
        },
        {
          id: 'kanban.createKanbanCard',
          method: 'POST',
          source: 'src/api/kanban.ts#createKanbanCard',
          url: '/kanban/cards',
        },
        {
          id: 'kanban.moveKanbanCard',
          method: 'PATCH',
          source: 'src/api/kanban.ts#moveKanbanCard',
          url: '/kanban/cards/${id}/status',
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
          id: 'kanban-board-card',
          source: 'src/components/KanbanBoardCard.vue',
          props: ['lanes', 'members', 'tasks'],
          warnings: [],
        },
        {
          id: 'task-detail-card',
          source: 'src/components/TaskDetailCard.vue',
          props: ['assignee', 'task'],
          warnings: [],
        },
      ]),
    );

    const generated = await buildAdapter({ projectRoot: demoRoot, env: realNpmEnv });
    expect(generated.packageDir).toBe(join(process.cwd(), 'examples/demo-agent-adapter'));
    expect(generated.built).toBe(true);

    await execFileAsync('npm', ['run', 'agent:build'], { cwd: demoRoot, env: realNpmEnv });
    const agentCli = await execFileAsync(
      process.execPath,
      ['dist-agent/cli.mjs', 'member', 'list'],
      { cwd: demoRoot, env: realNpmEnv },
    );
    expect(JSON.parse(agentCli.stdout)).toEqual({
      ok: true,
      capability: 'member.list',
      data: [
        { id: 'm-1', name: 'Ava Chen', role: 'Product', avatar: 'AC' },
        { id: 'm-2', name: 'Noah Park', role: 'Frontend', avatar: 'NP' },
        { id: 'm-3', name: 'Mina Singh', role: 'Design', avatar: 'MS' },
        { id: 'm-4', name: 'Leo Wang', role: 'Backend', avatar: 'LW' },
      ],
      summary: 'Found 4 members.',
    });
  });
});
