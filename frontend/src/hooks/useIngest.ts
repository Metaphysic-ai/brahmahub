import { useMutation } from "@tanstack/react-query";
import { analyzePath } from "@/services/ingest";

export function useAnalyzePath() {
  return useMutation({
    mutationFn: ({ source_path, project_id }: { source_path: string; project_id: string }) =>
      analyzePath(source_path, project_id),
  });
}
