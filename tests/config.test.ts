import { describe, expect, it } from 'vitest';
import { defineOpenWeb } from '../src/index.js';

describe('defineOpenWeb', () => {
  it('returns the user configuration unchanged', () => {
    const config = {
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
    };

    expect(defineOpenWeb(config)).toBe(config);
  });
});
