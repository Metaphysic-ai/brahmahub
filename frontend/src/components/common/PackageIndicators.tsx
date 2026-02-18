import { Badge } from "@/components/ui/badge";
import { isNew } from "@/lib/formatters";

export function PackageIndicators({ ingestedAt, packageType }: { ingestedAt: string; packageType?: string }) {
  const showDataset = packageType === "vfx";
  const showNew = isNew(ingestedAt);
  if (!showDataset && !showNew) return null;
  return (
    <div className="flex gap-1">
      {showDataset && (
        <Badge
          variant="outline"
          className="text-xs px-1.5 py-0 font-medium bg-dataset/10 text-dataset-foreground border-dataset/20"
        >
          Dataset
        </Badge>
      )}
      {showNew && (
        <Badge
          variant="outline"
          className="text-xs px-1.5 py-0 font-medium bg-primary/10 text-primary border-primary/20"
        >
          New
        </Badge>
      )}
    </div>
  );
}
