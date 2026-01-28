import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export function useServers() {
  return useQuery({
    queryKey: ["servers"],
    queryFn: async () => {
      const response = await api.listServers();
      return response.servers;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}
