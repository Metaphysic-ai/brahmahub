import { useQuery } from "@tanstack/react-query";
import { getSystemInfo } from "@/services/system";

export function useSystemInfo() {
  return useQuery({
    queryKey: ["system", "info"],
    queryFn: getSystemInfo,
    refetchInterval: 300_000, // 5 min — matches backend cache TTL
    staleTime: 60_000,
  });
}
