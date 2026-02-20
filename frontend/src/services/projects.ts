import type { CreateProjectInput, Project } from "@/types";
import { api } from "./api";

export const getProjects = () => api.get<Project[]>("/projects");

export const getProject = (id: string) => api.get<Project>(`/projects/${id}`);

export const createProject = (data: CreateProjectInput) => api.post<Project>("/projects", data);

export const deleteProject = (id: string) => api.delete(`/projects/${id}`);
