import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProjects, getProject, createProject, deleteProject } from '@/services/projects';
import type { CreateProjectInput } from '@/types';

export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: getProjects });
}

export function useProject(id: string) {
  return useQuery({ queryKey: ['projects', id], queryFn: () => getProject(id), enabled: !!id });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProjectInput) => createProject(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}
