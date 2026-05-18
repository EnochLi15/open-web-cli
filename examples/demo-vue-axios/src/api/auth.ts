import { http } from '@/api/http';

export async function login(email: string, password: string) {
  const response = await http.post('/login', { email, password });
  localStorage.setItem('accessToken', response.data.accessToken);
  return response.data;
}
