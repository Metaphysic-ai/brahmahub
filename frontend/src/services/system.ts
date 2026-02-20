import { api } from "@/services/api";
import type { SystemInfo } from "@/types";

export function getSystemInfo(): Promise<SystemInfo> {
  return api.get<SystemInfo>("/system/info");
}
