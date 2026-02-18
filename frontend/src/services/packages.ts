import type { Package, PackageSummary, PaginatedPackages } from '@/types';
import { api, API_BASE } from './api';

export const getPackages = (opts?: { subjectId?: string; packageType?: string }) => {
  const params = new URLSearchParams();
  if (opts?.subjectId) params.set('subject_id', opts.subjectId);
  if (opts?.packageType) params.set('package_type', opts.packageType);
  const qs = params.toString();
  return api.get<PaginatedPackages>(`/packages${qs ? `?${qs}` : ''}`);
};

export const getPackage = (id: string) => api.get<Package>(`/packages/${id}`);

export const getPackagesPaginated = (opts: {
  packageType?: string;
  subjectId?: string;
  search?: string;
  offset?: number;
  limit?: number;
}) => {
  const params = new URLSearchParams();
  if (opts.packageType) params.set('package_type', opts.packageType);
  if (opts.subjectId) params.set('subject_id', opts.subjectId);
  if (opts.search) params.set('search', opts.search);
  if (opts.offset != null) params.set('offset', String(opts.offset));
  if (opts.limit != null) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return api.get<PaginatedPackages>(`/packages${qs ? `?${qs}` : ''}`);
};

export const updatePackage = (id: string, data: Record<string, unknown>) =>
  api.put<Package>(`/packages/${id}`, data);

export const deletePackage = (id: string) => api.delete(`/packages/${id}`);

export const bulkDeletePackages = (ids: string[]) =>
  api.post<{ deleted: number }>('/packages/bulk-delete', { ids });

export interface ProjectPackage extends Package {
  subject_name: string;
}

export const getPackageSummary = (id: string) =>
  api.get<PackageSummary>(`/packages/${id}/summary`);

export const getProjectPackages = (projectId: string, packageType?: string) => {
  const qs = packageType ? `?package_type=${packageType}` : '';
  return api.get<ProjectPackage[]>(`/projects/${projectId}/packages${qs}`);
};

export const backfillFaceMetadata = (packageId: string) =>
  fetch(`${API_BASE}/packages/${packageId}/backfill-face-metadata`, { method: 'POST' });
