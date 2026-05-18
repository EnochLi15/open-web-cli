import axios from 'axios';
import { mockAdapter } from '@/api/mock';

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  withCredentials: true,
});

if (import.meta.env.DEV || import.meta.env.VITE_USE_MOCK_API !== 'false') {
  http.defaults.adapter = mockAdapter;
}

http.interceptors.request.use((config) => {
  const accessToken = localStorage.getItem('accessToken');
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});
