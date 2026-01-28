import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export function useServer(id: string) {
  return useQuery({
    queryKey: ["servers", id],
    queryFn: async () => {
      const response = await api.getServer(id);
      return response.server;
    },
    enabled: !!id,
    refetchInterval: 10000, // Refetch every 10 seconds
  });
}
