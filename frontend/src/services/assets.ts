import type { Asset, AssetFilters, PaginatedAssets } from "@/types";
import { api } from "./api";

export const getAssets = (packageId?: string) =>
  api.get<Asset[]>(packageId ? `/assets?package_id=${packageId}` : "/assets");

export const updateAssetTags = (id: string, tags: string[]) => api.put<Asset>(`/assets/${id}`, { tags });

export const toggleAssetPickedUp = (id: string, picked_up: boolean) => api.put<Asset>(`/assets/${id}`, { picked_up });

export const bulkUpdateAssets = (asset_ids: string[], updates: Record<string, unknown>) =>
  api.post<Asset[]>("/assets/bulk-update", { asset_ids, updates });

export const lookupAssetByPath = (diskPath: string) =>
  api.get<{ id: string; package_id: string; filename: string; file_type: string } | null>(
    `/assets/lookup-by-path?disk_path=${encodeURIComponent(diskPath)}`,
  );

export const getAssetsPaginated = (
  filters: AssetFilters,
  offset: number,
  limit: number = 200,
): Promise<PaginatedAssets> => {
  const params = new URLSearchParams();
  if (filters.file_type) params.set("file_type", filters.file_type);
  if (filters.asset_type) params.set("asset_type", filters.asset_type);
  if (filters.picked_up !== undefined) params.set("picked_up", String(filters.picked_up));
  if (filters.search) params.set("search", filters.search);
  if (filters.pose_bins) params.set("pose_bins", filters.pose_bins);
  params.set("offset", String(offset));
  params.set("limit", String(limit));

  if (filters.package_id) {
    if (filters.subject_id) params.set("subject_id", filters.subject_id);
    return api.get<PaginatedAssets>(`/packages/${filters.package_id}/assets?${params}`);
  }
  if (filters.subject_id) {
    return api.get<PaginatedAssets>(`/subjects/${filters.subject_id}/assets?${params}`);
  }
  return api.get<PaginatedAssets>(`/assets?${params}`);
};
