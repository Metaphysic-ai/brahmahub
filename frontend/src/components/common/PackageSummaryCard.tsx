import { Check, ChevronDown, ChevronRight, Copy, Film } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatResolution } from "@/lib/formatters";
import { displayPath } from "@/lib/paths";
import type { PackageSummary } from "@/types";
import { PoseMatrix } from "./PoseMatrix";

function StatItem({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === "") return null;
  return (
    <div className="space-y-0.5">
      <p className="text-2xs text-muted-foreground/60 uppercase tracking-wider">{label}</p>
      <p className="text-xs text-foreground/90 font-medium">{value}</p>
    </div>
  );
}

function formatAngleRange(min: number | null, max: number | null): string | null {
  if (min == null || max == null) return null;
  return `${min.toFixed(0)}\u00B0 to ${max.toFixed(0)}\u00B0`;
}

function formatLongDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function CopyableSourcePath({ path, filename }: { path: string; filename?: string | null }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(path);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-2xs text-muted-foreground/60 uppercase tracking-wider shrink-0">Source Video</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-xs text-foreground/90 font-medium font-mono-path truncate cursor-default">
            {filename || path.split("/").pop()}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-lg break-all font-mono-path text-xs">
          {displayPath(path)}
        </TooltipContent>
      </Tooltip>
      <button onClick={handleCopy} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
        {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
      </button>
    </div>
  );
}

export function PackageSummaryCard({
  summary,
  packageType,
  onShowGrid,
  selectedPoseBins,
  onPoseBinSelectionChange,
}: {
  summary: PackageSummary;
  packageType: string;
  onShowGrid?: () => void;
  selectedPoseBins?: Set<string>;
  onPoseBinSelectionChange?: (bins: Set<string>) => void;
}) {
  const [poseOpen, setPoseOpen] = useState(false);
  const isVfx = packageType === "vfx";
  const hasFaceData = summary.face_types && summary.face_types.length > 0;

  return (
    <div className="rounded-lg border border-border/30 bg-card/60 p-4 space-y-3">
      <h3 className="text-xs font-medium text-muted-foreground">
        {isVfx && hasFaceData ? "Dataset Summary" : "Package Overview"}
      </h3>

      {isVfx && hasFaceData ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
          <StatItem label="Source Resolution" value={formatResolution(summary.source_width, summary.source_height)} />
          <StatItem label="Output Resolution" value={formatResolution(summary.common_width, summary.common_height)} />
          <StatItem
            label="Aligned Images"
            value={summary.aligned_count > 0 ? summary.aligned_count.toLocaleString() : null}
          />
          <StatItem label="Yaw Range" value={formatAngleRange(summary.yaw_min, summary.yaw_max)} />
          <StatItem label="Pitch Range" value={formatAngleRange(summary.pitch_min, summary.pitch_max)} />
          <StatItem
            label="Avg Sharpness"
            value={summary.avg_sharpness != null ? summary.avg_sharpness.toFixed(2) : null}
          />
          <StatItem label="Cameras" value={summary.cameras?.join(", ")} />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
          <StatItem
            label="Assets"
            value={
              [
                summary.video_count > 0 ? `${summary.video_count} videos` : null,
                summary.image_count > 0 ? `${summary.image_count} images` : null,
              ]
                .filter(Boolean)
                .join(" \u00B7 ") || `${summary.total_assets} files`
            }
          />
          <StatItem
            label="Duration"
            value={summary.total_duration > 0 ? formatLongDuration(summary.total_duration) : null}
          />
          <StatItem label="Resolution" value={formatResolution(summary.common_width, summary.common_height)} />
          <StatItem label="Codecs" value={summary.codecs?.join(", ")} />
          <StatItem label="Cameras" value={summary.cameras?.join(", ")} />
          <StatItem
            label="Picked Up"
            value={summary.picked_up_count > 0 ? `${summary.picked_up_count} / ${summary.total_assets}` : null}
          />
        </div>
      )}

      {isVfx && summary.pose_data && summary.pose_data.length > 0 && selectedPoseBins && onPoseBinSelectionChange && (
        <Collapsible open={poseOpen} onOpenChange={setPoseOpen} className="border-t border-border/20 pt-3">
          <CollapsibleTrigger className="flex items-center gap-1 text-2xs text-muted-foreground/60 uppercase tracking-wider hover:text-foreground transition-colors">
            {poseOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Pose Coverage
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pt-2">
              <PoseMatrix
                poseData={summary.pose_data}
                selectedBins={selectedPoseBins}
                onSelectionChange={onPoseBinSelectionChange}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {isVfx && (summary.grid_asset_id || summary.source_video_path) && (
        <div className="border-t border-border/20 pt-3 flex items-center gap-4 flex-wrap">
          {summary.grid_asset_id && onShowGrid && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5 bg-dataset/5 border-dataset/20 text-dataset-foreground hover:bg-dataset/10"
              onClick={onShowGrid}
            >
              <Film size={12} />
              Show Grid Video
            </Button>
          )}
          {summary.source_video_path && (
            <CopyableSourcePath path={summary.source_video_path} filename={summary.source_video_filename} />
          )}
        </div>
      )}
    </div>
  );
}
