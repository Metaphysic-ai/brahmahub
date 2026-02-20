import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  bulkUpdateAssets,
  getAssets,
  getAssetsPaginated,
  lookupAssetByPath,
  toggleAssetPickedUp,
  updateAssetTags,
} from "@/services/assets";
import type { AssetFilters } from "@/types";

export function useAssets(packageId?: string) {
  return useQuery({ queryKey: ["assets", packageId], queryFn: () => getAssets(packageId) });
}

export function useUpdateAssetTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tags }: { id: string; tags: string[] }) => updateAssetTags(id, tags),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assets"] }),
  });
}

export function useToggleAssetPickedUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, picked_up }: { id: string; picked_up: boolean }) => toggleAssetPickedUp(id, picked_up),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assets"] }),
  });
}

export function useBulkUpdateAssets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ asset_ids, updates }: { asset_ids: string[]; updates: Record<string, unknown> }) =>
      bulkUpdateAssets(asset_ids, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assets"] }),
  });
}

export function useAssetByPath(diskPath?: string | null) {
  return useQuery({
    queryKey: ["assets", "lookup", diskPath],
    queryFn: () => lookupAssetByPath(diskPath!),
    enabled: !!diskPath,
  });
}

const PAGE_SIZE = 200;

export function usePaginatedAssets(filters: AssetFilters) {
  return useInfiniteQuery({
    queryKey: ["assets", "paginated", filters],
    queryFn: ({ pageParam = 0 }) => getAssetsPaginated(filters, pageParam, PAGE_SIZE),
    getNextPageParam: (lastPage) => {
      const next = lastPage.offset + lastPage.limit;
      return next < lastPage.total ? next : undefined;
    },
    initialPageParam: 0,
    enabled: !!(filters.package_id || filters.subject_id),
  });
}
