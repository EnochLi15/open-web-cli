import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type { KanbanMember, KanbanStatus, KanbanTask, KanbanTaskInput } from '@/types';

const members: KanbanMember[] = [
  { id: 'm-1', name: 'Ava Chen', role: 'Product', avatar: 'AC' },
  { id: 'm-2', name: 'Noah Park', role: 'Frontend', avatar: 'NP' },
  { id: 'm-3', name: 'Mina Singh', role: 'Design', avatar: 'MS' },
  { id: 'm-4', name: 'Leo Wang', role: 'Backend', avatar: 'LW' },
];

let tasks: KanbanTask[] = [
  {
    id: 'task-101',
    title: 'Map axios atoms from board services',
    summary: 'Confirm scanner detects list, create, and status movement APIs.',
    status: 'backlog',
    priority: 'high',
    assigneeId: 'm-2',
    dueDate: '2026-05-21',
    tags: ['scanner', 'axios'],
    points: 5,
  },
  {
    id: 'task-102',
    title: 'Publish generated Vue registry',
    summary: 'Expose board cards through the adapter package Vue entry.',
    status: 'ready',
    priority: 'medium',
    assigneeId: 'm-3',
    dueDate: '2026-05-22',
    tags: ['vue', 'registry'],
    points: 3,
  },
  {
    id: 'task-103',
    title: 'Wire Mastra tool dispatcher',
    summary: 'Make capability calls available to agent runtime tools.',
    status: 'progress',
    priority: 'urgent',
    assigneeId: 'm-4',
    dueDate: '2026-05-20',
    tags: ['mastra', 'tools'],
    points: 8,
  },
  {
    id: 'task-104',
    title: 'Review auth persistence UX',
    summary: 'Check login probe behavior and saved token display states.',
    status: 'review',
    priority: 'medium',
    assigneeId: 'm-1',
    dueDate: '2026-05-23',
    tags: ['auth'],
    points: 2,
  },
  {
    id: 'task-105',
    title: 'Ship demo acceptance notes',
    summary: 'Document commands used to verify inspect, generate, and build.',
    status: 'done',
    priority: 'low',
    assigneeId: 'm-1',
    dueDate: '2026-05-18',
    tags: ['docs'],
    points: 1,
  },
];

export const mockAdapter: AxiosAdapter = async (config) => {
  await delay(120);
  const url = normalizeUrl(config);
  const method = config.method?.toUpperCase() ?? 'GET';

  if (method === 'POST' && url.pathname === '/login') {
    return response(config, { accessToken: 'demo-kanban-token', profile: members[0] });
  }

  if (method === 'GET' && url.pathname === '/kanban/members') {
    return response(config, members);
  }

  if (method === 'GET' && url.pathname === '/kanban/cards') {
    const status = url.searchParams.get('status');
    const assigneeId = url.searchParams.get('assigneeId');
    const query = url.searchParams.get('query')?.toLowerCase();
    return response(
      config,
      tasks.filter((task) => {
        return (
          (!status || task.status === status) &&
          (!assigneeId || task.assigneeId === assigneeId) &&
          (!query || task.title.toLowerCase().includes(query) || task.summary.toLowerCase().includes(query))
        );
      }),
    );
  }

  if (method === 'POST' && url.pathname === '/kanban/cards') {
    const payload = readPayload<KanbanTaskInput>(config);
    const task: KanbanTask = {
      id: `task-${Math.floor(Math.random() * 9000) + 1000}`,
      status: 'backlog',
      ...payload,
    };
    tasks = [task, ...tasks];
    return response(config, task, 201);
  }

  const statusMatch = url.pathname.match(/^\/kanban\/cards\/([^/]+)\/status$/);
  if (method === 'PATCH' && statusMatch) {
    const payload = readPayload<{ status: KanbanStatus }>(config);
    tasks = tasks.map((task) => (task.id === statusMatch[1] ? { ...task, status: payload.status } : task));
    return response(config, tasks.find((task) => task.id === statusMatch[1]));
  }

  return response(config, { message: `No mock route for ${method} ${url.pathname}` }, 404);
};

function normalizeUrl(config: InternalAxiosRequestConfig): URL {
  const baseURL = config.baseURL ?? 'https://api.example.test';
  return new URL(config.url ?? '/', baseURL);
}

function readPayload<TPayload>(config: InternalAxiosRequestConfig): TPayload {
  if (!config.data) {
    return {} as TPayload;
  }

  return typeof config.data === 'string' ? JSON.parse(config.data) : (config.data as TPayload);
}

function response<TData>(
  config: InternalAxiosRequestConfig,
  data: TData,
  status = 200,
): AxiosResponse<TData> {
  return {
    data,
    status,
    statusText: status >= 400 ? 'Error' : 'OK',
    headers: {},
    config,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}
