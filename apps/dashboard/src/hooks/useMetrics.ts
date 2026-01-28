import { useQuery } from "@tanstack/react-query";
import { api, ServerStatus } from "../api/client";

export function useMetrics(serverId: string, serverStatus?: ServerStatus) {
  const isRunning = serverStatus === ServerStatus.Running;

  return useQuery({
    queryKey: ["metrics", serverId],
    queryFn: async () => {
      const response = await api.getServerMetrics(serverId);
      return response.metrics;
    },
    enabled: !!serverId && isRunning,
    refetchInterval: isRunning ? 10000 : false, // Poll every 10 seconds when running
    retry: false, // Don't retry failed metrics calls
  });
}
