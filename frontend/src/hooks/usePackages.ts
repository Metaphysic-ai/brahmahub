import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPackages, getPackagesPaginated, getPackage, getPackageSummary, getProjectPackages, updatePackage, deletePackage, bulkDeletePackages } from '@/services/packages';

export function usePackages(subjectId?: string, packageType?: string) {
  return useQuery({
    queryKey: ['packages', subjectId, packageType],
    queryFn: () => getPackages({ subjectId, packageType }),
    select: (data) => data.items,
  });
}

const PAGE_SIZE = 50;

export function usePaginatedPackages(opts: {
  packageType?: string;
  subjectId?: string;
  search?: string;
}) {
  return useInfiniteQuery({
    queryKey: ['packages', 'paginated', opts.packageType, opts.subjectId, opts.search],
    queryFn: ({ pageParam = 0 }) =>
      getPackagesPaginated({
        packageType: opts.packageType,
        subjectId: opts.subjectId,
        search: opts.search || undefined,
        offset: pageParam,
        limit: PAGE_SIZE,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const next = lastPage.offset + lastPage.limit;
      return next < lastPage.total ? next : undefined;
    },
  });
}

export function usePackage(id: string) {
  return useQuery({ queryKey: ['packages', 'detail', id], queryFn: () => getPackage(id), enabled: !!id });
}

export function usePackageSummary(packageId: string) {
  return useQuery({
    queryKey: ['package-summary', packageId],
    queryFn: () => getPackageSummary(packageId),
    enabled: !!packageId,
  });
}

export function useUpdatePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updatePackage(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['packages'] });
    },
  });
}

export function useProjectPackages(projectId?: string, packageType?: string) {
  return useQuery({
    queryKey: ['packages', 'project', projectId, packageType],
    queryFn: () => getProjectPackages(projectId!, packageType),
    enabled: !!projectId,
  });
}

export function useDeletePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deletePackage,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['packages'] });
      qc.invalidateQueries({ queryKey: ['subjects'], refetchType: 'none' });
      qc.invalidateQueries({ queryKey: ['projects'], refetchType: 'none' });
      qc.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'none' });
    },
  });
}

export function useBulkDeletePackages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => bulkDeletePackages(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['packages'] });
      qc.invalidateQueries({ queryKey: ['subjects'], refetchType: 'none' });
      qc.invalidateQueries({ queryKey: ['projects'], refetchType: 'none' });
      qc.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'none' });
    },
  });
}
