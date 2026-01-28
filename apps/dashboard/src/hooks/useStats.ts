import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export function useStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: () => api.getStats(),
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}
