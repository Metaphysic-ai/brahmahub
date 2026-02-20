import { formatBytes } from "@/lib/formatters";

interface SubjectStatsProps {
  videoCount: number;
  imageCount: number;
  totalSize: number;
  totalDuration: number;
  pickedUpCount: number;
}

export function SubjectStats({ videoCount, imageCount, totalSize, totalDuration, pickedUpCount }: SubjectStatsProps) {
  const hours = Math.floor(totalDuration / 3600);
  const mins = Math.floor((totalDuration % 3600) / 60);
  const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  const statPills: string[] = [];
  if (videoCount) statPills.push(`${videoCount} video${videoCount !== 1 ? "s" : ""}`);
  if (imageCount) statPills.push(`${imageCount} image${imageCount !== 1 ? "s" : ""}`);
  if (totalDuration > 0) statPills.push(durationStr);
  if (pickedUpCount > 0) statPills.push(`${pickedUpCount} picked up`);
  statPills.push(formatBytes(totalSize));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {statPills.map((pill, i) => (
        <span key={i} className="text-xs text-muted-foreground bg-muted/50 rounded-md px-2 py-0.5">
          {pill}
        </span>
      ))}
    </div>
  );
}
