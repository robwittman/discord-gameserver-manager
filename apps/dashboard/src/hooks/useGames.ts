import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export function useGames() {
  return useQuery({
    queryKey: ["games"],
    queryFn: async () => {
      const response = await api.listGames();
      return response.games;
    },
    staleTime: 60000, // Games don't change often
  });
}
