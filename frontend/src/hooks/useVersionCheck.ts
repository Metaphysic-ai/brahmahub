import { useQuery } from "@tanstack/react-query";
import { isVersionMismatch } from "@/lib/version";
import { api } from "@/services/api";

interface HealthResponse {
  status: string;
  version: string;
}

export function useVersionCheck() {
  const { data } = useQuery<HealthResponse>({
    queryKey: ["health"],
    queryFn: () => api.get<HealthResponse>("/health"),
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    staleTime: 30_000,
  });

  const backendVersion = data?.version ?? "";
  const updateAvailable = backendVersion ? isVersionMismatch(backendVersion) : false;

  return { updateAvailable, backendVersion };
}
