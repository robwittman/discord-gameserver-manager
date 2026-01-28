import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, JobAction } from "../api/client";

export function useServerActions(serverId: string) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (action: JobAction) => {
      const response = await api.createJob(serverId, action);
      return response.job;
    },
    onSuccess: () => {
      // Invalidate server and jobs queries to refetch
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      queryClient.invalidateQueries({ queryKey: ["servers", serverId] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });

  return {
    start: () => mutation.mutate("start"),
    stop: () => mutation.mutate("stop"),
    backup: () => mutation.mutate("backup"),
    update: () => mutation.mutate("update"),
    isPending: mutation.isPending,
    error: mutation.error,
    lastJob: mutation.data,
  };
}
