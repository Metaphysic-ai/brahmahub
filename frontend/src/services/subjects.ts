import type { Subject, CreateSubjectInput, UpdateSubjectInput } from '@/types';
import { api } from './api';

export const getSubjects = (projectId?: string) =>
  api.get<Subject[]>(projectId ? `/subjects?project_id=${projectId}` : '/subjects');

export const getSubject = (id: string) => api.get<Subject>(`/subjects/${id}`);

export const createSubject = (data: CreateSubjectInput) =>
  api.post<Subject>('/subjects', data);

export const updateSubject = (id: string, data: UpdateSubjectInput) =>
  api.put<Subject>(`/subjects/${id}`, data);

export const deleteSubject = (id: string) => api.delete(`/subjects/${id}`);

export const bulkDeleteSubjects = (ids: string[]) =>
  api.post<{ deleted: number }>('/subjects/bulk-delete', { ids });
