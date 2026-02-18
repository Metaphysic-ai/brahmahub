import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSubjects, getSubject, createSubject, updateSubject, deleteSubject, bulkDeleteSubjects } from '@/services/subjects';
import type { CreateSubjectInput, UpdateSubjectInput } from '@/types';

export function useSubjects(projectId?: string) {
  return useQuery({ queryKey: ['subjects', projectId], queryFn: () => getSubjects(projectId) });
}

export function useAllSubjects() {
  return useQuery({ queryKey: ['subjects', 'all'], queryFn: () => getSubjects() });
}

export function useSubject(id: string) {
  return useQuery({ queryKey: ['subjects', 'detail', id], queryFn: () => getSubject(id), enabled: !!id });
}

export function useCreateSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSubjectInput) => createSubject(data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['subjects', vars.project_id] }),
  });
}

export function useUpdateSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSubjectInput }) => updateSubject(id, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['subjects'] });
      qc.invalidateQueries({ queryKey: ['subjects', 'detail', vars.id] });
    },
  });
}

export function useDeleteSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSubject(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subjects'] }),
  });
}

export function useBulkDeleteSubjects() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => bulkDeleteSubjects(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subjects'] });
      qc.invalidateQueries({ queryKey: ['packages'], refetchType: 'none' });
      qc.invalidateQueries({ queryKey: ['projects'], refetchType: 'none' });
      qc.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'none' });
    },
  });
}
