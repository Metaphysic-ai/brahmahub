import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import type { DashboardStats, RecentIngest, StorageByProject } from "@/types";

function useDashboardData() {
  return useQuery<DashboardStats>({
    queryKey: ["dashboard", "stats"],
    queryFn: () => api.get<DashboardStats>("/stats/dashboard"),
  });
}

export function useDashboardStats() {
  return useDashboardData();
}

export function useRecentIngests() {
  const { data: stats, ...rest } = useDashboardData();
  const ingests: RecentIngest[] | undefined = stats?.recent_packages.map((pkg) => ({
    package: pkg,
    subjectName: pkg.subject_names,
    subjectId: pkg.subject_ids.split(",")[0],
    projectName: pkg.project_name,
    projectId: pkg.project_id,
  }));
  return { data: ingests, ...rest };
}

export function useStorageByProject() {
  const { data: stats, ...rest } = useDashboardData();
  return { data: stats?.storage_by_project as StorageByProject[] | undefined, ...rest };
}
