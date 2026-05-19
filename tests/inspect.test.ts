import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { inspectProject } from '../src/index.js';

describe('inspectProject', () => {
  it('finds axios atoms and Vue card candidates in a Vue 3 project', async () => {
    const projectRoot = join(tmpdir(), `open-web-inspect-${crypto.randomUUID()}`);
    await mkdir(join(projectRoot, 'src/api'), { recursive: true });
    await mkdir(join(projectRoot, 'src/components'), { recursive: true });

    await writeFile(
      join(projectRoot, 'src/api/http.ts'),
      [
        "import axios from 'axios';",
        "export const http = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL, withCredentials: true });",
        "http.interceptors.request.use((config) => {",
        "  config.headers.Authorization = `Bearer ${localStorage.getItem('accessToken')}`;",
        '  return config;',
        '});',
      ].join('\n'),
    );
    await writeFile(
      join(projectRoot, 'src/api/user.ts'),
      [
        "import { http } from './http';",
        'export function listUsers(params: { status?: string }) {',
        "  return http.get('/users', { params });",
        '}',
        'export const updateUserStatus = (id: string, status: string) => {',
        "  return http.post(`/users/${id}/status`, { status });",
        '};',
      ].join('\n'),
    );
    await writeFile(
      join(projectRoot, 'src/components/UserListCard.vue'),
      [
        '<script setup lang="ts">',
        'defineProps<{ users: Array<{ id: string; name: string }> }>();',
        '</script>',
        '<template>',
        '  <section><h2>Users</h2></section>',
        '</template>',
      ].join('\n'),
    );

    const report = await inspectProject({ projectRoot });

    expect(report.axiosAtoms).toEqual([
      {
        id: 'user.listUsers',
        method: 'GET',
        source: 'src/api/user.ts#listUsers',
        url: '/users',
      },
      {
        id: 'user.updateUserStatus',
        method: 'POST',
        source: 'src/api/user.ts#updateUserStatus',
        url: '/users/${id}/status',
      },
    ]);
    expect(report.authClues).toEqual([
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
      {
        kind: 'token',
        source: 'src/api/http.ts',
        detail: 'mentions token state',
      },
    ]);
    expect(report.cardCandidates).toEqual([
      {
        id: 'user-list-card',
        source: 'src/components/UserListCard.vue',
        props: ['users'],
        warnings: [],
      },
    ]);
  });

  it('finds request config object calls, string concatenation URLs, and local endpoint constants', async () => {
    const projectRoot = join(tmpdir(), `open-web-inspect-real-world-${crypto.randomUUID()}`);
    await mkdir(join(projectRoot, 'src/api/modules'), { recursive: true });
    await mkdir(join(projectRoot, 'src/modules/user-management/role'), { recursive: true });

    await writeFile(
      join(projectRoot, 'src/api/modules/table.ts'),
      [
        "import request from '@/utils/request';",
        'type paramsType = { pageSize: number; pageNum: number };',
        'export const tableFun = (params: paramsType) =>',
        '  request({',
        "    url: 'modules/table',",
        '    params,',
        '  });',
        'export const bookListsDelete = (ids: number[]) =>',
        '  request({',
        "    url: 'modules/table/remove',",
        "    method: 'delete',",
        '    data: { ids },',
        '  });',
      ].join('\n'),
    );
    await writeFile(
      join(projectRoot, 'src/modules/user-management/role/role-api.ts'),
      [
        "import { Http } from '@/services/Http';",
        "const API_ENDPOINT = '/api/v1/roles';",
        'export async function fetchRoleByIdApi(id: string, signal: AbortSignal) {',
        '  return await Http.get(`${API_ENDPOINT}/${id}`, undefined, { signal });',
        '}',
        'export async function fetchRoleAutocompleteApi(signal: AbortSignal, branchCode: string) {',
        '  return await Http.get(API_ENDPOINT + "/autocomplete?branchCode=" + branchCode, undefined, { signal });',
        '}',
      ].join('\n'),
    );

    const report = await inspectProject({ projectRoot });

    expect(report.axiosAtoms).toEqual([
      {
        id: 'table.bookListsDelete',
        method: 'DELETE',
        source: 'src/api/modules/table.ts#bookListsDelete',
        url: 'modules/table/remove',
      },
      {
        id: 'table.tableFun',
        method: 'GET',
        source: 'src/api/modules/table.ts#tableFun',
        url: 'modules/table',
      },
      {
        id: 'role-api.fetchRoleAutocompleteApi',
        method: 'GET',
        source: 'src/modules/user-management/role/role-api.ts#fetchRoleAutocompleteApi',
        url: '/api/v1/roles/autocomplete?branchCode=${branchCode}',
      },
      {
        id: 'role-api.fetchRoleByIdApi',
        method: 'GET',
        source: 'src/modules/user-management/role/role-api.ts#fetchRoleByIdApi',
        url: '/api/v1/roles/${id}',
      },
    ]);
  });
});
