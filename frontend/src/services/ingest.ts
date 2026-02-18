import type { AnalysisResult, DatasetResolution, IngestExecuteRequest, IngestExecuteResult } from "@/types";
import { API_BASE, api } from "./api";

export const analyzePath = (source_path: string, project_id: string) =>
  api.post<AnalysisResult>("/ingest/analyze", { source_path, project_id });

export const fetchDatasetDirs = () => api.get<{ datasets_root: string; dirs: string[] }>("/ingest/dataset-dirs");

export const resolveDatasets = (subjects: { name: string }[]) =>
  api.post<{ mappings: DatasetResolution[] }>("/ingest/resolve-datasets", { subjects });

export interface IngestProgressEvent {
  current: number;
  total: number;
  file: string;
  step: "probing" | "proxy" | "inserting" | "skipped";
  elapsed: number;
  message?: string;
}

export interface IngestCompleteEvent {
  type: "complete";
  package_id: string;
  file_count: number;
  subjects_created: string[];
  elapsed: number;
}

export interface IngestErrorEvent {
  type: "error";
  message: string;
  elapsed: number;
}

export interface IngestFinalizingEvent {
  type: "finalizing";
  message: string;
  total_files: number;
  elapsed: number;
}

export type IngestStreamEvent = IngestProgressEvent | IngestCompleteEvent | IngestErrorEvent | IngestFinalizingEvent;

export async function executeIngestStream(
  payload: IngestExecuteRequest,
  onProgress: (event: IngestStreamEvent) => void,
): Promise<IngestExecuteResult> {
  const response = await fetch(`${API_BASE}/ingest/execute-stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`${response.status}: ${text}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: IngestExecuteResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6);
      try {
        const event: IngestStreamEvent = JSON.parse(jsonStr);
        onProgress(event);

        if ("type" in event && event.type === "complete") {
          result = {
            package_id: event.package_id,
            file_count: event.file_count,
            subjects_created: event.subjects_created,
          };
        }
        if ("type" in event && event.type === "error") {
          throw new Error(event.message);
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }

  if (!result) throw new Error("Stream ended without completion event");
  return result;
}
