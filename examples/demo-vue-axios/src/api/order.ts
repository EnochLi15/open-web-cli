import { http } from '@/api/http';

export const updateOrderStatus = (id: string, status: string) => {
  return http.post(`/orders/${id}/status`, { status });
};
