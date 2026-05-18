import { describe, expect, it } from 'vitest';
import { axios2cli, runCliMap, serveOpenWebDocs } from '../src/index.js';

describe('axios2cli', () => {
  it('wraps axios-style functions as agent-friendly CLI capabilities', async () => {
    const calls: unknown[] = [];
    const cliMap = axios2cli({
      'board.listCards': {
        description: 'List cards',
        call: async (input: unknown) => {
          calls.push(input);
          return {
            status: 200,
            data: [{ id: 'card-1', title: 'Ship runtime adapter' }],
          };
        },
        summary: (cards) => `Found ${(cards as unknown[]).length} cards.`,
        ui: (cards) => ({
          kind: 'card',
          component: 'kanban-board-card',
          props: { cards },
        }),
      },
      'card.move': {
        call: async (id: string, status: string) => ({
          status: 200,
          data: { id, status },
        }),
        args: (input) => {
          const payload = input as { id: string; status: string };
          return [payload.id, payload.status];
        },
      },
    });

    const writes: string[] = [];
    const exitCode = await runCliMap(cliMap, ['board', 'listCards', '--input', '{"status":"ready"}'], {
      stdout: (text) => writes.push(text),
      stderr: () => undefined,
    });

    expect(exitCode).toBe(0);
    expect(calls).toEqual([{ status: 'ready' }]);
    expect(JSON.parse(writes.join(''))).toEqual({
      ok: true,
      capability: 'board.listCards',
      data: [{ id: 'card-1', title: 'Ship runtime adapter' }],
      summary: 'Found 1 cards.',
      ui: {
        kind: 'card',
        component: 'kanban-board-card',
        props: {
          cards: [{ id: 'card-1', title: 'Ship runtime adapter' }],
        },
      },
    });

    const move = await cliMap['card.move'].execute(
      { id: 'card-1', status: 'done' },
      { capability: 'card.move', argv: [], env: {} },
    );
    expect(move).toEqual({
      ok: true,
      capability: 'card.move',
      data: {
        id: 'card-1',
        status: 'done',
      },
    });
  });

  it('returns machine-readable failures for bad input and unknown capabilities', async () => {
    const cliMap = axios2cli({
      'board.listCards': async () => ({ status: 200, data: [] }),
    });

    const invalidInputWrites: string[] = [];
    const invalidInputExit = await runCliMap(cliMap, ['board', 'listCards', '--input', '{'], {
      stdout: (text) => invalidInputWrites.push(text),
      stderr: () => undefined,
    });
    expect(invalidInputExit).toBe(1);
    expect(JSON.parse(invalidInputWrites.join(''))).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        recoverable: true,
      },
    });

    const unknownWrites: string[] = [];
    const unknownExit = await runCliMap(cliMap, ['board', 'archive'], {
      stdout: (text) => unknownWrites.push(text),
      stderr: () => undefined,
    });
    expect(unknownExit).toBe(1);
    expect(JSON.parse(unknownWrites.join(''))).toEqual({
      ok: false,
      error: {
        code: 'CAPABILITY_NOT_FOUND',
        message: 'Unknown capability: board.archive',
        recoverable: false,
      },
    });
  });

  it('exposes converted CLI docs metadata and demo execution', async () => {
    const cliMap = axios2cli({
      'board.listCards': {
        description: 'List kanban cards',
        parameters: [{ name: 'status', in: 'query', required: false }],
        inputExample: { status: 'ready' },
        call: async () => ({ status: 200, data: [{ id: 'card-1' }] }),
      },
    });

    const docsWrites: string[] = [];
    const docsExit = await runCliMap(cliMap, ['docs', '--json'], {
      stdout: (text) => docsWrites.push(text),
      stderr: () => undefined,
    });
    expect(docsExit).toBe(0);
    expect(JSON.parse(docsWrites.join(''))).toEqual({
      capabilities: [
        {
          id: 'board.listCards',
          description: 'List kanban cards',
          parameters: [{ name: 'status', in: 'query', required: false }],
          inputExample: { status: 'ready' },
        },
      ],
    });

    const server = await serveOpenWebDocs(JSON.parse(docsWrites.join('')), {
      execute: (capabilityId, input) =>
        cliMap[capabilityId].execute(input, {
          capability: capabilityId,
          argv: [],
          env: {},
        }),
    });
    try {
      const response = await fetch(`${server.url}/api/demo/board.listCards`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'ready' }),
      });
      expect(await response.json()).toEqual({
        ok: true,
        capability: 'board.listCards',
        data: [{ id: 'card-1' }],
      });
    } finally {
      await server.close();
    }
  });
});
