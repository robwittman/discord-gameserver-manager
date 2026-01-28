import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export function useJobs(serverId?: string) {
  return useQuery({
    queryKey: ["jobs", serverId],
    queryFn: async () => {
      const response = await api.listJobs(serverId);
      return response.jobs;
    },
    refetchInterval: 5000, // Refetch every 5 seconds for job updates
  });
}

export function useJob(id: string) {
  return useQuery({
    queryKey: ["jobs", "detail", id],
    queryFn: async () => {
      const response = await api.getJob(id);
      return response.job;
    },
    enabled: !!id,
    refetchInterval: 2000, // Refetch every 2 seconds for running jobs
  });
}
