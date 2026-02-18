import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightIcon,
  CloudOff,
  Copy,
  Download,
  Film,
  Grid3X3,
  HardDrive,
  ImageIcon,
  LayoutGrid,
  Maximize,
  Music,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BulkActionBar } from "@/components/common/BulkActionBar";
import { CopyCommandButton } from "@/components/common/CopyCommandButton";
import { CopyPathBox } from "@/components/common/CopyPathBox";
import { EmptyState } from "@/components/common/EmptyState";
import { PackageIndicators } from "@/components/common/PackageIndicators";
import { SourceVideoLink } from "@/components/common/SourceVideoLink";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TagChip } from "@/components/common/TagChip";
import { SubjectStats } from "@/components/SubjectStats";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { VirtualizedAssetGrid } from "@/components/VirtualizedAssetGrid";
import { useToast } from "@/hooks/use-toast";
import { useBulkUpdateAssets, usePaginatedAssets, useToggleAssetPickedUp, useUpdateAssetTags } from "@/hooks/useAssets";
import { useDebounce } from "@/hooks/useDebounce";
import { useBulkDeletePackages, usePackages } from "@/hooks/usePackages";
import { useProject } from "@/hooks/useProjects";
import { useDeleteSubject, useSubject, useUpdateSubject } from "@/hooks/useSubjects";
import { useTableSelection } from "@/hooks/useTableSelection";
import { copyPathsToClipboard, downloadFile, generateCSV, generateManifestJSON } from "@/lib/export";
import { formatBytes, formatDuration, formatFullDate, formatResolution, relativeTime } from "@/lib/formatters";
import { displayPath } from "@/lib/paths";
import type { Asset, AssetFilters, Package } from "@/types";

type GridSize = "sm" | "md" | "lg";
const gridCols: Record<GridSize, string> = {
  sm: "grid-cols-8",
  md: "grid-cols-5",
  lg: "grid-cols-3",
};
const colCounts: Record<GridSize, number> = { sm: 8, md: 5, lg: 3 };

const AssetThumbnail = memo(function AssetThumbnail({
  asset,
  isActive,
  isSelected,
  showCheckbox,
  onClick,
  onCheckboxChange,
}: {
  asset: Asset;
  isActive: boolean;
  isSelected: boolean;
  showCheckbox: boolean;
  onClick: () => void;
  onCheckboxChange: (e: React.MouseEvent) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 group">
      <div
        className={`relative aspect-video rounded-lg overflow-hidden cursor-pointer bg-muted/20 transition-all duration-150 ${
          isActive
            ? "ring-1 ring-primary/60"
            : isSelected
              ? "ring-1 ring-primary/40"
              : asset.picked_up
                ? "ring-2 ring-success/40"
                : "hover:bg-muted/40 hover:scale-[1.02]"
        }`}
        onClick={onClick}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          {asset.file_type === "video" ? (
            <Film size={24} className="text-muted-foreground/20" />
          ) : asset.file_type === "audio" ? (
            <Music size={24} className="text-muted-foreground/20" />
          ) : (
            <ImageIcon size={24} className="text-muted-foreground/20" />
          )}
        </div>
        {asset.thumbnail_url && (
          <img
            src={asset.thumbnail_url}
            alt={asset.filename}
            className={`absolute inset-0 w-full h-full object-cover ${asset.picked_up ? "opacity-60" : ""}`}
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}

        {asset.picked_up && (
          <div className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-success/20 to-transparent pointer-events-none" />
        )}

        <div
          className={`absolute top-1.5 left-1.5 z-10 transition-opacity ${showCheckbox || isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
          onClick={(e) => {
            e.stopPropagation();
            onCheckboxChange(e);
          }}
        >
          <div
            className={`rounded-md p-1 transition-all duration-200 ${
              isSelected ? "bg-primary/90 shadow-md" : "bg-background/70 backdrop-blur-sm"
            }`}
          >
            <Checkbox
              checked={isSelected}
              className="h-3.5 w-3.5 data-[state=checked]:bg-transparent data-[state=checked]:border-primary-foreground"
            />
          </div>
        </div>

        {asset.picked_up && (
          <div className="absolute top-1.5 right-1.5 z-10">
            <div className="bg-success/90 rounded-full p-1 shadow-sm">
              <Check size={12} className="text-white" />
            </div>
          </div>
        )}

        <div className="absolute bottom-1.5 left-1.5">
          <span className="flex items-center rounded bg-background/60 p-1 backdrop-blur-sm">
            {asset.file_type === "video" ? (
              <Film size={10} className="text-foreground/80" />
            ) : asset.file_type === "audio" ? (
              <Music size={10} className="text-foreground/80" />
            ) : (
              <ImageIcon size={10} className="text-foreground/80" />
            )}
          </span>
        </div>

        {(asset.file_type === "video" || asset.file_type === "audio") && asset.duration_seconds && (
          <div className="absolute bottom-1.5 right-1.5">
            <span className="rounded bg-background/70 px-1.5 py-0.5 text-2xs text-foreground/90 backdrop-blur-sm font-mono-path">
              {formatDuration(asset.duration_seconds)}
            </span>
          </div>
        )}
      </div>
      <span className="text-xs text-muted-foreground truncate font-mono-path px-0.5">{asset.filename}</span>
    </div>
  );
});

function AssetDetailPanel({
  asset,
  assets,
  currentIndex,
  onNavigate,
  onClose,
  packages,
}: {
  asset: Asset;
  assets: Asset[];
  currentIndex: number;
  onNavigate: (index: number) => void;
  onClose: () => void;
  packages: Package[];
}) {
  const { toast } = useToast();
  const updateTags = useUpdateAssetTags();
  const togglePickedUp = useToggleAssetPickedUp();
  const [newTag, setNewTag] = useState("");
  const [showAddTag, setShowAddTag] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [imageZoomed, setImageZoomed] = useState(false);

  const pkg = packages.find((p) => p.id === asset.package_id);

  const handleTogglePickedUp = useCallback(() => {
    const next = !asset.picked_up;
    togglePickedUp.mutate({ id: asset.id, picked_up: next });
    toast({ title: next ? "Marked as picked up" : "Marked as available", duration: 1200 });
  }, [asset.id, asset.picked_up, toast, togglePickedUp]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && currentIndex > 0) onNavigate(currentIndex - 1);
      if (e.key === "ArrowRight" && currentIndex < assets.length - 1) onNavigate(currentIndex + 1);
      if (e.key === " ") {
        e.preventDefault();
        handleTogglePickedUp();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentIndex, assets.length, onClose, onNavigate, handleTogglePickedUp]);

  useEffect(() => {
    setImageZoomed(false);
  }, []);

  const handleAddTag = () => {
    if (!newTag.trim()) return;
    const tags = [...asset.tags, newTag.trim()];
    updateTags.mutate({ id: asset.id, tags });
    toast({ title: "Tag added", description: newTag.trim(), duration: 1500 });
    setNewTag("");
    setShowAddTag(false);
  };

  const handleRemoveTag = (tag: string) => {
    const tags = asset.tags.filter((t) => t !== tag);
    updateTags.mutate({ id: asset.id, tags });
    toast({ title: "Tag removed", description: tag, duration: 1500 });
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/60" onClick={onClose} />
      <div className="fixed top-0 right-0 z-50 h-full w-[65%] max-w-[1200px] min-w-[600px] bg-card border-l animate-slide-in-right flex flex-col">
        <div className="flex items-center px-3 h-10 border-b shrink-0 gap-2">
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => currentIndex > 0 && onNavigate(currentIndex - 1)}
              disabled={currentIndex === 0}
            >
              <ChevronLeft size={14} />
            </Button>
            <span className="text-xs text-muted-foreground w-12 text-center">
              {currentIndex + 1} / {assets.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => currentIndex < assets.length - 1 && onNavigate(currentIndex + 1)}
              disabled={currentIndex === assets.length - 1}
            >
              <ChevronRightIcon size={14} />
            </Button>
          </div>
          <span className="font-mono-path text-xs text-foreground truncate flex-1">{asset.filename}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
            <X size={14} />
          </Button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-[3] flex items-center justify-center bg-black min-w-0">
            {asset.file_type === "video" ? (
              <video
                controls
                playsInline
                className="w-full h-full object-contain"
                src={asset.proxy_url ?? undefined}
                key={asset.id}
              >
                Your browser does not support the video tag.
              </video>
            ) : asset.file_type === "audio" ? (
              <div className="flex flex-col items-center justify-center gap-3 w-full h-full">
                <Music size={48} className="text-muted-foreground/30" />
                <audio
                  controls
                  src={asset.disk_path ? `/media/${asset.disk_path}` : undefined}
                  key={asset.id}
                  className="w-3/4 max-w-md"
                />
              </div>
            ) : (
              <div
                className={`relative w-full h-full flex items-center justify-center cursor-pointer ${imageZoomed ? "overflow-auto" : ""}`}
                onClick={() => setImageZoomed(!imageZoomed)}
              >
                {asset.proxy_url ? (
                  <img
                    src={asset.proxy_url}
                    alt={asset.filename}
                    className={`${imageZoomed ? "max-w-none" : "max-w-full max-h-full"} object-contain transition-transform`}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground/50">
                    <ImageIcon size={48} />
                    <span className="text-xs">No preview available</span>
                  </div>
                )}
                {imageZoomed && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="absolute top-2 right-2 text-xs h-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      setImageZoomed(false);
                    }}
                  >
                    Fit
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="flex-[2] border-l border-border overflow-y-auto p-4 space-y-4">
            <section>
              <Button
                size="sm"
                variant={asset.picked_up ? "default" : "outline"}
                className="h-8 text-xs w-full gap-1.5"
                onClick={handleTogglePickedUp}
              >
                <Check size={12} />
                {asset.picked_up ? "Picked up" : "Mark as picked up"}
              </Button>
              <p className="text-2xs text-muted-foreground mt-1 text-center">Space to toggle</p>
            </section>

            <section>
              <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">File Info</h3>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="text-sm font-semibold font-mono-path break-all cursor-default">
                    {asset.disk_path.split("/").pop()}
                  </p>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-lg break-all font-mono-path text-xs">
                  {displayPath(asset.disk_path)}
                </TooltipContent>
              </Tooltip>
              <p className="text-2xs text-muted-foreground font-mono-path break-all mt-0.5">
                {displayPath(asset.disk_path)}
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
                <span className="text-muted-foreground">Type</span>
                <span>{asset.file_type}</span>
                {asset.codec && (
                  <>
                    <span className="text-muted-foreground">Codec</span>
                    <span>{asset.codec}</span>
                  </>
                )}
                <span className="text-muted-foreground">Resolution</span>
                <span>{formatResolution(asset.width, asset.height)}</span>
                {asset.duration_seconds && (
                  <>
                    <span className="text-muted-foreground">Duration</span>
                    <span>{formatDuration(asset.duration_seconds)}</span>
                  </>
                )}
                <span className="text-muted-foreground">Size</span>
                <span>{asset.file_size_bytes ? formatBytes(asset.file_size_bytes) : "—"}</span>
              </div>
            </section>

            <section>
              <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Disk Status</h3>
              <div
                className={`flex items-center gap-2 rounded-lg border p-2 text-xs ${asset.is_on_disk ? "border-border/40 bg-background/50" : "border-destructive/30 bg-destructive/5"}`}
              >
                {asset.is_on_disk ? (
                  <>
                    <HardDrive size={14} className="text-primary shrink-0" />
                    <span className="text-foreground/80">On disk</span>
                  </>
                ) : (
                  <>
                    <CloudOff size={14} className="text-destructive shrink-0" />
                    <span className="text-destructive">Offlined — not on disk</span>
                  </>
                )}
              </div>
            </section>

            <section>
              <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Source</h3>
              <div className="text-xs space-y-1">
                {asset.camera && (
                  <div>
                    <span className="text-muted-foreground">Camera: </span>
                    {asset.camera}
                  </div>
                )}
                {pkg && (
                  <div>
                    <span className="text-muted-foreground">Package: </span>
                    <Link to={`/packages/${pkg.id}`} className="text-primary hover:underline">
                      {pkg.name}
                    </Link>
                  </div>
                )}
                {asset.file_type === "image" && asset.metadata.face?.source_filepath && (
                  <div className="mt-2">
                    <span className="text-muted-foreground">Extracted from: </span>
                    <CopyPathBox label="Source video" path={asset.metadata.face.source_filepath} />
                    <div className="mt-1">
                      <SourceVideoLink sourcePath={asset.metadata.face.source_filepath} />
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Paths</h3>
              <CopyPathBox label="Original" path={asset.disk_path} />
              {asset.proxy_path && <CopyPathBox label="Proxy" path={asset.proxy_path} />}
            </section>

            <section>
              <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Open With</h3>
              <div className="flex flex-wrap gap-1.5">
                <CopyCommandButton label="Copy RV command" command={`rv "${asset.disk_path}"`} />
                {asset.file_type === "video" && (
                  <CopyCommandButton label="Copy VLC command" command={`vlc "${asset.disk_path}"`} />
                )}
                {asset.file_type === "image" && asset.metadata.face?.source_filepath && (
                  <CopyCommandButton
                    label="Copy source video RV"
                    command={`rv "${asset.metadata.face.source_filepath}"`}
                  />
                )}
              </div>
            </section>

            <section>
              <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Tags</h3>
              <div className="flex flex-wrap gap-1.5">
                {asset.tags.map((tag) => (
                  <TagChip key={tag} tag={tag} size="md" onRemove={() => handleRemoveTag(tag)} />
                ))}
                {showAddTag ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleAddTag();
                    }}
                    className="flex gap-1"
                  >
                    <Input
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      className="h-6 w-24 text-xs"
                      autoFocus
                      onBlur={() => {
                        if (!newTag) setShowAddTag(false);
                      }}
                    />
                  </form>
                ) : (
                  <button
                    onClick={() => setShowAddTag(true)}
                    className="inline-flex items-center gap-0.5 rounded-md border border-dashed px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                  >
                    <Plus size={10} /> add
                  </button>
                )}
              </div>
            </section>

            <Collapsible open={metadataOpen} onOpenChange={setMetadataOpen}>
              <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
                {metadataOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                Raw Metadata
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="mt-2 rounded-md bg-background p-3 text-xs font-mono-path overflow-x-auto border text-muted-foreground">
                  {JSON.stringify(asset.metadata, null, 2)}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
      </div>
    </>
  );
}

export default function SubjectDetail() {
  const { id: projectId, subjectId } = useParams<{ id: string; subjectId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: subject, isLoading } = useSubject(subjectId!);
  const { data: project } = useProject(projectId!);
  const { data: atmanPackages, isLoading: atmanPkgLoading } = usePackages(subjectId, "atman");
  const { data: vfxPackages, isLoading: vfxPkgLoading } = usePackages(subjectId, "vfx");
  const packages = useMemo(() => [...(atmanPackages ?? []), ...(vfxPackages ?? [])], [atmanPackages, vfxPackages]);
  const _packagesLoading = atmanPkgLoading || vfxPkgLoading;
  const deleteSubject = useDeleteSubject();
  const updateSubjectMut = useUpdateSubject();
  const updateTags = useUpdateAssetTags();
  const _togglePickedUp = useToggleAssetPickedUp();
  const bulkUpdate = useBulkUpdateAssets();
  const bulkDeletePkgs = useBulkDeletePackages();

  const atmanSelection = useTableSelection({ items: atmanPackages ?? [] });
  const vfxSelection = useTableSelection({ items: vfxPackages ?? [] });

  const handleBulkDeletePackages = async (ids: string[], clearFn: () => void) => {
    await bulkDeletePkgs.mutateAsync(ids);
    toast({ title: `${ids.length} ${ids.length === 1 ? "item" : "items"} deleted` });
    clearFn();
  };

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState("");

  const [packagesOpen, setPackagesOpen] = useState(true);
  const [datasetsOpen, setDatasetsOpen] = useState(true);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [fileTypeFilter, setFileTypeFilter] = useState<string>("all");
  const [pickedUpFilter, setPickedUpFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState("");
  const [gridSize, setGridSize] = useState<GridSize>("md");

  const debouncedSearch = useDebounce(searchQuery, 300);

  const assetFilters = useMemo<AssetFilters>(
    () => ({
      subject_id: subjectId,
      package_id: selectedPackageId ?? undefined,
      file_type: fileTypeFilter !== "all" ? fileTypeFilter : undefined,
      picked_up: pickedUpFilter === "picked_up" ? true : pickedUpFilter === "available" ? false : undefined,
      search: debouncedSearch || undefined,
    }),
    [subjectId, selectedPackageId, fileTypeFilter, pickedUpFilter, debouncedSearch],
  );

  const {
    data: assetData,
    isLoading: assetsLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = usePaginatedAssets(assetFilters);
  const allLoadedAssets = useMemo(() => assetData?.pages.flatMap((p) => p.items) ?? [], [assetData]);
  const assetStats = assetData?.pages[0];
  const [selectedAssetIndex, setSelectedAssetIndex] = useState<number | null>(null);

  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [showBulkTagInput, setShowBulkTagInput] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedAssetIndex === null && selectedAssetIds.size > 0) {
        setSelectedAssetIds(new Set());
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedAssetIndex, selectedAssetIds.size]);

  // Tag filter is still client-side (not in paginated API)
  const filteredAssets = useMemo(() => {
    if (!tagFilter) return allLoadedAssets;
    const q = tagFilter.toLowerCase();
    return allLoadedAssets.filter((a) => a.tags.some((t) => t.toLowerCase().includes(q)));
  }, [allLoadedAssets, tagFilter]);

  const handleNavigate = useCallback((index: number) => setSelectedAssetIndex(index), []);
  const handleClose = useCallback(() => setSelectedAssetIndex(null), []);

  const handleRenameSubject = async () => {
    if (!editName.trim()) return;
    await updateSubjectMut.mutateAsync({ id: subjectId!, data: { name: editName.trim() } });
    toast({ title: "Subject renamed" });
    setEditDialogOpen(false);
  };

  const handleDeleteSubject = async () => {
    await deleteSubject.mutateAsync(subjectId!);
    toast({ title: "Subject deleted" });
    navigate(`/projects/${projectId}`);
  };

  const _handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    toast({ title: "Path copied", description: path, duration: 1500 });
  };

  const handleCheckboxChange = (asset: Asset, index: number, e: React.MouseEvent) => {
    const newSet = new Set(selectedAssetIds);
    if (e.shiftKey && lastClickedIndex !== null) {
      const start = Math.min(lastClickedIndex, index);
      const end = Math.max(lastClickedIndex, index);
      for (let i = start; i <= end; i++) {
        newSet.add(filteredAssets[i].id);
      }
    } else {
      if (newSet.has(asset.id)) newSet.delete(asset.id);
      else newSet.add(asset.id);
    }
    setSelectedAssetIds(newSet);
    setLastClickedIndex(index);
  };

  const handleSelectAll = () => {
    if (selectedAssetIds.size === filteredAssets.length) {
      setSelectedAssetIds(new Set());
    } else {
      setSelectedAssetIds(new Set(filteredAssets.map((a) => a.id)));
    }
  };

  const selectedAssets = useMemo(
    () => filteredAssets.filter((a) => selectedAssetIds.has(a.id)),
    [filteredAssets, selectedAssetIds],
  );
  const exportAssets = selectedAssetIds.size > 0 ? selectedAssets : filteredAssets;

  const handleBulkCopyPaths = () => {
    copyPathsToClipboard(selectedAssets);
    toast({ title: `${selectedAssets.length} paths copied` });
  };

  const handleBulkAddTag = () => {
    if (!bulkTagInput.trim()) return;
    const tag = bulkTagInput.trim();
    // For tag addition, we still update individually since each asset has different existing tags
    selectedAssets.forEach((a) => {
      if (!a.tags.includes(tag)) {
        updateTags.mutate({ id: a.id, tags: [...a.tags, tag] });
      }
    });
    toast({ title: `Tag "${tag}" added to ${selectedAssets.length} assets` });
    setBulkTagInput("");
    setShowBulkTagInput(false);
  };

  const handleBulkMarkPickedUp = () => {
    bulkUpdate.mutate({ asset_ids: selectedAssets.map((a) => a.id), updates: { picked_up: true } });
    toast({ title: `${selectedAssets.length} assets marked as picked up` });
  };

  const handleBulkMarkAvailable = () => {
    bulkUpdate.mutate({ asset_ids: selectedAssets.map((a) => a.id), updates: { picked_up: false } });
    toast({ title: `${selectedAssets.length} assets marked as available` });
  };

  const handleExportJSON = () => {
    const manifest = generateManifestJSON(exportAssets, project?.name ?? "", subject?.name ?? "", {
      picked_up: pickedUpFilter !== "all" ? pickedUpFilter : undefined,
      package: selectedPackageId ?? undefined,
    });
    downloadFile(JSON.stringify(manifest, null, 2), `${subject?.name ?? "export"}_manifest.json`, "application/json");
    toast({ title: "Manifest downloaded", description: `${exportAssets.length} assets` });
  };

  const handleExportCSV = () => {
    const csv = generateCSV(exportAssets);
    downloadFile(csv, `${subject?.name ?? "export"}_assets.csv`, "text/csv");
    toast({ title: "CSV downloaded", description: `${exportAssets.length} assets` });
  };

  const handleExportCopyPaths = () => {
    copyPathsToClipboard(exportAssets);
    toast({ title: `${exportAssets.length} paths copied` });
  };

  if (isLoading)
    return (
      <div className="p-4">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  if (!subject) return <div className="p-4 text-muted-foreground">Subject not found.</div>;

  return (
    <div className="p-4 space-y-4 relative">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">{subject.name}</h1>
          {subject.description && <p className="text-sm text-muted-foreground mt-0.5">{subject.description}</p>}
        </div>
        <div className="flex gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              setEditName(subject.name);
              setEditDialogOpen(true);
            }}
          >
            <Pencil size={14} />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                <Trash2 size={14} />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete subject?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete "{subject.name}" and all associated packages and assets.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteSubject}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {assetStats && assetStats.total > 0 && (
        <SubjectStats
          videoCount={assetStats.video_count}
          imageCount={assetStats.image_count}
          totalSize={assetStats.total_size_bytes}
          totalDuration={assetStats.total_duration_seconds}
          pickedUpCount={assetStats.picked_up_count}
        />
      )}

      <Collapsible open={packagesOpen} onOpenChange={setPackagesOpen}>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-medium hover:text-foreground transition-colors text-muted-foreground">
          {packagesOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Packages ({atmanPackages?.length ?? 0})
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2">
            {atmanPkgLoading ? (
              Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-8" />)
            ) : !atmanPackages?.length ? (
              <p className="text-xs text-muted-foreground/60 py-2">No packages yet.</p>
            ) : (
              <>
                <BulkActionBar
                  selectedCount={atmanSelection.selectedIds.size}
                  entityLabel="package"
                  onDelete={() =>
                    handleBulkDeletePackages([...atmanSelection.selectedIds], atmanSelection.clearSelection)
                  }
                  onClearSelection={atmanSelection.clearSelection}
                  isDeleting={bulkDeletePkgs.isPending}
                />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">
                        <Checkbox
                          checked={atmanSelection.allSelected}
                          {...(atmanSelection.someSelected ? { "data-state": "indeterminate" } : {})}
                          onClick={atmanSelection.handleSelectAll}
                          className="h-3.5 w-3.5"
                        />
                      </TableHead>
                      <TableHead>Package</TableHead>
                      <TableHead className="w-[70px]"></TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Files</TableHead>
                      <TableHead className="text-right">Size</TableHead>
                      <TableHead>Ingested</TableHead>
                      <TableHead>Tags</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {atmanPackages.map((pkg, index) => (
                      <TableRow
                        key={pkg.id}
                        className={`cursor-pointer transition-colors ${atmanSelection.selectedIds.has(pkg.id) ? "bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]" : selectedPackageId === pkg.id ? "bg-primary/10" : ""}`}
                        onClick={() => setSelectedPackageId(pkg.id === selectedPackageId ? null : pkg.id)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={atmanSelection.selectedIds.has(pkg.id)}
                            onClick={(e) =>
                              atmanSelection.handleCheckboxChange(pkg, index, e as unknown as React.MouseEvent)
                            }
                            className="h-3.5 w-3.5"
                          />
                        </TableCell>
                        <TableCell>
                          <Link
                            to={`/packages/${pkg.id}`}
                            className="font-mono-path text-xs font-medium text-foreground/90 hover:text-primary transition-colors duration-200"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {pkg.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <PackageIndicators ingestedAt={pkg.ingested_at} packageType={pkg.package_type} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={pkg.picked_up ? "picked_up" : pkg.status} />
                        </TableCell>
                        <TableCell className="text-right text-xs">{pkg.file_count}</TableCell>
                        <TableCell className="text-right text-xs">{formatBytes(pkg.total_size_bytes)}</TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-xs text-muted-foreground">{relativeTime(pkg.ingested_at)}</span>
                            </TooltipTrigger>
                            <TooltipContent>{formatFullDate(pkg.ingested_at)}</TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {pkg.tags.slice(0, 3).map((tag) => (
                              <TagChip key={tag} tag={tag} />
                            ))}
                            {pkg.tags.length > 3 && (
                              <span className="text-2xs text-muted-foreground">+{pkg.tags.length - 3}</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible open={datasetsOpen} onOpenChange={setDatasetsOpen}>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-medium hover:text-foreground transition-colors text-muted-foreground">
          {datasetsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Datasets ({vfxPackages?.length ?? 0})
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2">
            {vfxPkgLoading ? (
              Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-8" />)
            ) : !vfxPackages?.length ? (
              <p className="text-xs text-muted-foreground/60 py-2">No datasets yet.</p>
            ) : (
              <>
                <BulkActionBar
                  selectedCount={vfxSelection.selectedIds.size}
                  entityLabel="dataset"
                  onDelete={() => handleBulkDeletePackages([...vfxSelection.selectedIds], vfxSelection.clearSelection)}
                  onClearSelection={vfxSelection.clearSelection}
                  isDeleting={bulkDeletePkgs.isPending}
                />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">
                        <Checkbox
                          checked={vfxSelection.allSelected}
                          {...(vfxSelection.someSelected ? { "data-state": "indeterminate" } : {})}
                          onClick={vfxSelection.handleSelectAll}
                          className="h-3.5 w-3.5"
                        />
                      </TableHead>
                      <TableHead>Dataset</TableHead>
                      <TableHead className="w-[70px]"></TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Files</TableHead>
                      <TableHead className="text-right">Size</TableHead>
                      <TableHead>Ingested</TableHead>
                      <TableHead>Tags</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vfxPackages.map((pkg, index) => (
                      <TableRow
                        key={pkg.id}
                        className={`cursor-pointer transition-colors ${vfxSelection.selectedIds.has(pkg.id) ? "bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]" : selectedPackageId === pkg.id ? "bg-primary/10" : ""}`}
                        onClick={() => setSelectedPackageId(pkg.id === selectedPackageId ? null : pkg.id)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={vfxSelection.selectedIds.has(pkg.id)}
                            onClick={(e) =>
                              vfxSelection.handleCheckboxChange(pkg, index, e as unknown as React.MouseEvent)
                            }
                            className="h-3.5 w-3.5"
                          />
                        </TableCell>
                        <TableCell>
                          <Link
                            to={`/packages/${pkg.id}`}
                            className="font-mono-path text-xs font-medium text-foreground/90 hover:text-primary transition-colors duration-200"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {pkg.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <PackageIndicators ingestedAt={pkg.ingested_at} packageType={pkg.package_type} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={pkg.picked_up ? "picked_up" : pkg.status} />
                        </TableCell>
                        <TableCell className="text-right text-xs">{pkg.file_count}</TableCell>
                        <TableCell className="text-right text-xs">{formatBytes(pkg.total_size_bytes)}</TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-xs text-muted-foreground">{relativeTime(pkg.ingested_at)}</span>
                            </TooltipTrigger>
                            <TooltipContent>{formatFullDate(pkg.ingested_at)}</TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {pkg.tags.slice(0, 3).map((tag) => (
                              <TagChip key={tag} tag={tag} />
                            ))}
                            {pkg.tags.length > 3 && (
                              <span className="text-2xs text-muted-foreground">+{pkg.tags.length - 3}</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Filter bar — using DropdownMenu instead of Select to avoid freezing */}
      <div className="flex items-center gap-3 flex-wrap">
        <div onClick={handleSelectAll} className="cursor-pointer">
          <Checkbox
            checked={filteredAssets.length > 0 && selectedAssetIds.size === filteredAssets.length}
            className="h-3.5 w-3.5"
          />
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {filteredAssets.length.toLocaleString()}
          {assetStats && filteredAssets.length < assetStats.total ? ` of ${assetStats.total.toLocaleString()}` : ""}{" "}
          {filteredAssets.length === 1 ? "asset" : "assets"}
        </span>
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files..."
            className="pl-8 h-8 text-xs"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1 min-w-[100px] justify-between">
              {fileTypeFilter === "all"
                ? "All types"
                : fileTypeFilter === "video"
                  ? "Video"
                  : fileTypeFilter === "image"
                    ? "Image"
                    : fileTypeFilter === "audio"
                      ? "Audio"
                      : "Aligned"}
              <ChevronDown size={12} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setFileTypeFilter("all")}>All types</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFileTypeFilter("video")}>Video</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFileTypeFilter("image")}>Image</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFileTypeFilter("audio")}>Audio</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFileTypeFilter("aligned")}>Aligned</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1 min-w-[110px] justify-between">
              {pickedUpFilter === "all" ? "All" : pickedUpFilter === "picked_up" ? "Picked up" : "Available"}
              <ChevronDown size={12} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setPickedUpFilter("all")}>All</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPickedUpFilter("available")}>Available</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPickedUpFilter("picked_up")}>Picked up</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 min-w-[140px] justify-between font-mono-path"
            >
              {selectedPackageId
                ? (packages?.find((p) => p.id === selectedPackageId)?.name ?? "Package")
                : "All packages"}
              <ChevronDown size={12} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-60 overflow-y-auto">
            <DropdownMenuItem onClick={() => setSelectedPackageId(null)}>All packages</DropdownMenuItem>
            {packages?.map((pkg) => (
              <DropdownMenuItem
                key={pkg.id}
                onClick={() => setSelectedPackageId(pkg.id)}
                className="font-mono-path text-xs"
              >
                {pkg.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="relative max-w-[140px]">
          <Input
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            placeholder="Filter by tag..."
            className="h-8 text-xs"
          />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                <Download size={12} /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={handleExportCopyPaths}>Copy all paths</DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportJSON}>Export JSON manifest</DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportCSV}>Export CSV</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant={gridSize === "sm" ? "secondary" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={() => setGridSize("sm")}
          >
            <Grid3X3 size={14} />
          </Button>
          <Button
            variant={gridSize === "md" ? "secondary" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={() => setGridSize("md")}
          >
            <LayoutGrid size={14} />
          </Button>
          <Button
            variant={gridSize === "lg" ? "secondary" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={() => setGridSize("lg")}
          >
            <Maximize size={14} />
          </Button>
        </div>
      </div>

      {selectedAssetIds.size > 0 && (
        <div className="bg-card border rounded-lg flex items-center gap-3 h-10 px-4">
          <span className="text-xs font-medium">
            {selectedAssetIds.size} {selectedAssetIds.size === 1 ? "asset" : "assets"} selected
          </span>
          <div className="h-4 w-px bg-border" />
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleBulkCopyPaths}>
            <Copy size={12} /> Copy paths
          </Button>
          {showBulkTagInput ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleBulkAddTag();
              }}
              className="flex gap-1 items-center"
            >
              <Input
                value={bulkTagInput}
                onChange={(e) => setBulkTagInput(e.target.value)}
                placeholder="Tag name"
                className="h-6 w-24 text-xs"
                autoFocus
              />
              <Button type="submit" variant="ghost" size="sm" className="h-6 text-xs px-2">
                Add
              </Button>
            </form>
          ) : (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowBulkTagInput(true)}>
              <Plus size={12} /> Add tag
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleBulkMarkPickedUp}>
            <Check size={12} /> Mark picked up
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleBulkMarkAvailable}>
            Mark available
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs ml-auto"
            onClick={() => setSelectedAssetIds(new Set())}
          >
            Clear selection
          </Button>
        </div>
      )}

      {assetsLoading ? (
        <div className={`grid ${gridCols[gridSize]} gap-3`}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-video rounded-lg" />
          ))}
        </div>
      ) : !filteredAssets.length ? (
        <EmptyState icon={ImageIcon} title="No assets found" description="Try adjusting your filters." />
      ) : (
        <VirtualizedAssetGrid
          assets={filteredAssets}
          totalCount={assetStats?.total ?? filteredAssets.length}
          colCount={colCounts[gridSize]}
          gridClassName={gridCols[gridSize]}
          hasNextPage={!!hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          fetchNextPage={fetchNextPage}
          selectedAssetIndex={selectedAssetIndex}
          selectedAssetIds={selectedAssetIds}
          onAssetClick={setSelectedAssetIndex}
          onCheckboxChange={handleCheckboxChange}
          renderItem={(props) => (
            <AssetThumbnail
              asset={props.asset}
              isActive={props.isActive}
              isSelected={props.isSelected}
              showCheckbox={props.showCheckbox}
              onClick={props.onClick}
              onCheckboxChange={props.onCheckboxChange}
            />
          )}
        />
      )}

      {selectedAssetIndex !== null && filteredAssets[selectedAssetIndex] && (
        <AssetDetailPanel
          asset={filteredAssets[selectedAssetIndex]}
          assets={filteredAssets}
          currentIndex={selectedAssetIndex}
          onNavigate={handleNavigate}
          onClose={handleClose}
          packages={packages ?? []}
        />
      )}

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Subject</DialogTitle>
          </DialogHeader>
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRenameSubject()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRenameSubject} disabled={!editName.trim() || updateSubjectMut.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
