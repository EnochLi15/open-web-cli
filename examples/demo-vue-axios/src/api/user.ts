import { http } from '@/api/http';

export function listUsers(params: { status?: string }) {
  return http.get('/users', { params });
}
