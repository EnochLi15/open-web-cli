import axios from 'axios';
import { mockAdapter } from '@/api/mock';

const viteEnv = import.meta.env;

export const http = axios.create({
  baseURL: viteEnv.VITE_API_BASE_URL,
  withCredentials: true,
});

if (viteEnv.DEV || viteEnv.VITE_USE_MOCK_API !== 'false') {
  http.defaults.adapter = mockAdapter;
}

http.interceptors.request.use((config) => {
  const browserWindow = typeof window === 'undefined' ? undefined : window;
  const accessToken = browserWindow?.localStorage.getItem('accessToken');
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});
