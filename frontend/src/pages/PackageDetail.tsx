import { useState, useMemo, useCallback, useEffect, memo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Film, ImageIcon, Music, Search, Grid3X3, LayoutGrid, Maximize, Plus, ChevronLeft, ChevronRight as ChevronRightIcon, X, Check, HardDrive, CloudOff, Trash2, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { usePackage, usePackageSummary, useDeletePackage, useUpdatePackage } from '@/hooks/usePackages';
import { backfillFaceMetadata } from '@/services/packages';
import { useSubject } from '@/hooks/useSubjects';
import { useProject } from '@/hooks/useProjects';
import { usePaginatedAssets, useUpdateAssetTags, useToggleAssetPickedUp } from '@/hooks/useAssets';
import { useDebounce } from '@/hooks/useDebounce';
import { VirtualizedAssetGrid } from '@/components/VirtualizedAssetGrid';
import { StatusBadge } from '@/components/common/StatusBadge';
import { PackageIndicators } from '@/components/common/PackageIndicators';
import { PackageSummaryCard } from '@/components/common/PackageSummaryCard';
import { TagChip } from '@/components/common/TagChip';
import { SubjectChip } from '@/components/common/SubjectChip';
import { CopyPathBox } from '@/components/common/CopyPathBox';
import { CopyCommandButton } from '@/components/common/CopyCommandButton';
import { EmptyState } from '@/components/common/EmptyState';
import { formatBytes, formatDuration, formatResolution, relativeTime, formatFullDate } from '@/lib/formatters';
import { displayPath } from '@/lib/paths';
import { useToast } from '@/hooks/use-toast';
import type { Asset, AssetFilters, Package } from '@/types';

type GridSize = 'sm' | 'md' | 'lg';
const gridCols: Record<GridSize, string> = { sm: 'grid-cols-8', md: 'grid-cols-5', lg: 'grid-cols-3' };
const colCounts: Record<GridSize, number> = { sm: 8, md: 5, lg: 3 };

const ASSET_TYPE_LABELS: Record<string, string> = {
  raw: 'Raw Videos',
  graded: 'Graded',
  proxy: 'Proxy',
  audio: 'Audio',
  metadata: 'Metadata',
  aligned: 'Aligned Images',
  grid: 'Grid Videos',
  plate: 'Plate/Source',
};
const ASSET_TYPE_ORDER = ['raw', 'graded', 'proxy', 'audio', 'metadata', 'aligned', 'grid', 'plate'];

const AssetThumbnail = memo(function AssetThumbnail({ asset, isActive, isSelected, showCheckbox, onClick, onCheckboxChange }: {
  asset: Asset; isActive: boolean; isSelected: boolean; showCheckbox: boolean; onClick: () => void; onCheckboxChange: (e: React.MouseEvent) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 group">
      <div
        className={`relative aspect-video rounded-lg overflow-hidden cursor-pointer bg-muted/20 transition-all duration-150 ${
          isActive ? 'ring-1 ring-primary/60' : isSelected ? 'ring-1 ring-primary/40' : asset.picked_up ? 'ring-2 ring-success/40' : 'hover:bg-muted/40 hover:scale-[1.02]'
        }`}
        onClick={onClick}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          {asset.file_type === 'video' ? <Film size={24} className="text-muted-foreground/20" /> : asset.file_type === 'audio' ? <Music size={24} className="text-muted-foreground/20" /> : <ImageIcon size={24} className="text-muted-foreground/20" />}
        </div>
        {asset.thumbnail_url && (
          <img src={asset.thumbnail_url} alt={asset.filename} className={`absolute inset-0 w-full h-full object-cover ${asset.picked_up ? 'opacity-60' : ''}`} loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        )}
        {asset.picked_up && (
          <div className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-success/20 to-transparent pointer-events-none" />
        )}
        <div className={`absolute top-1.5 left-1.5 z-10 transition-opacity ${showCheckbox || isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} onClick={e => { e.stopPropagation(); onCheckboxChange(e); }}>
          <div className={`rounded-md p-1 transition-all duration-200 ${isSelected ? 'bg-primary/90 shadow-md' : 'bg-background/70 backdrop-blur-sm'}`}><Checkbox checked={isSelected} className="h-3.5 w-3.5 data-[state=checked]:bg-transparent data-[state=checked]:border-primary-foreground" /></div>
        </div>
        {asset.picked_up && (
          <div className="absolute top-1.5 right-1.5 z-10"><div className="bg-success/90 rounded-full p-1 shadow-sm"><Check size={12} className="text-white" /></div></div>
        )}
        <div className="absolute bottom-1.5 left-1.5">
          <span className="flex items-center rounded bg-background/60 p-1 backdrop-blur-sm">
            {asset.file_type === 'video' ? <Film size={10} className="text-foreground/80" /> : asset.file_type === 'audio' ? <Music size={10} className="text-foreground/80" /> : <ImageIcon size={10} className="text-foreground/80" />}
          </span>
        </div>
        {(asset.file_type === 'video' || asset.file_type === 'audio') && asset.duration_seconds && (
          <div className="absolute bottom-1.5 right-1.5">
            <span className="rounded bg-background/70 px-1.5 py-0.5 text-2xs text-foreground/90 backdrop-blur-sm font-mono-path">{formatDuration(asset.duration_seconds)}</span>
          </div>
        )}
      </div>
      <span className="text-xs text-muted-foreground truncate font-mono-path px-0.5">{asset.filename}</span>
    </div>
  );
});

function AssetDetailPanel({ asset, assets, currentIndex, onNavigate, onClose, pkg, onOpenSourceVideo }: {
  asset: Asset; assets: Asset[]; currentIndex: number; onNavigate: (i: number) => void; onClose: () => void; pkg?: Package; onOpenSourceVideo?: () => void;
}) {
  const { toast } = useToast();
  const updateTags = useUpdateAssetTags();
  const togglePickedUp = useToggleAssetPickedUp();
  const [newTag, setNewTag] = useState('');
  const [showAddTag, setShowAddTag] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [imageZoomed, setImageZoomed] = useState(false);

  const handleTogglePickedUp = useCallback(() => {
    const next = !asset.picked_up;
    togglePickedUp.mutate({ id: asset.id, picked_up: next });
    toast({ title: next ? 'Marked as picked up' : 'Marked as available', duration: 1200 });
  }, [asset.id, asset.picked_up, toast, togglePickedUp]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && currentIndex > 0) onNavigate(currentIndex - 1);
      if (e.key === 'ArrowRight' && currentIndex < assets.length - 1) onNavigate(currentIndex + 1);
      if (e.key === ' ') { e.preventDefault(); handleTogglePickedUp(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentIndex, assets.length, onClose, onNavigate, handleTogglePickedUp]);

  useEffect(() => { setImageZoomed(false); }, [asset.id]);

  const handleAddTag = () => {
    if (!newTag.trim()) return;
    updateTags.mutate({ id: asset.id, tags: [...asset.tags, newTag.trim()] });
    toast({ title: 'Tag added', description: newTag.trim(), duration: 1500 });
    setNewTag(''); setShowAddTag(false);
  };

  const handleRemoveTag = (tag: string) => {
    updateTags.mutate({ id: asset.id, tags: asset.tags.filter(t => t !== tag) });
    toast({ title: 'Tag removed', description: tag, duration: 1500 });
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/60" onClick={onClose} />
      <div className="fixed top-0 right-0 z-50 h-full w-[65%] max-w-[1200px] min-w-[600px] bg-card border-l animate-slide-in-right flex flex-col">
        <div className="flex items-center px-3 h-10 border-b shrink-0 gap-2">
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => currentIndex > 0 && onNavigate(currentIndex - 1)} disabled={currentIndex === 0}><ChevronLeft size={14} /></Button>
            <span className="text-xs text-muted-foreground w-12 text-center">{currentIndex + 1} / {assets.length}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => currentIndex < assets.length - 1 && onNavigate(currentIndex + 1)} disabled={currentIndex === assets.length - 1}><ChevronRightIcon size={14} /></Button>
          </div>
          <span className="font-mono-path text-xs text-foreground truncate flex-1">{asset.filename}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}><X size={14} /></Button>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-[3] flex items-center justify-center bg-black min-w-0">
            {asset.file_type === 'video' ? (
              <video controls playsInline className="w-full h-full object-contain" src={asset.proxy_url ?? undefined} key={asset.id}>Your browser does not support the video tag.</video>
            ) : asset.file_type === 'audio' ? (
              <div className="flex flex-col items-center justify-center gap-3 w-full h-full">
                <Music size={48} className="text-muted-foreground/30" />
                <audio controls src={asset.disk_path ? `/media/${asset.disk_path}` : undefined} key={asset.id} className="w-3/4 max-w-md" />
              </div>
            ) : (
              <div className={`relative w-full h-full flex items-center justify-center cursor-pointer ${imageZoomed ? 'overflow-auto' : ''}`} onClick={() => setImageZoomed(!imageZoomed)}>
                {asset.proxy_url ? (
                  <img src={asset.proxy_url} alt={asset.filename} className={`${imageZoomed ? 'max-w-none' : 'max-w-full max-h-full'} object-contain transition-transform`} />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground/50">
                    <ImageIcon size={48} /><span className="text-xs">No preview available</span>
                  </div>
                )}
                {imageZoomed && (
                  <Button variant="secondary" size="sm" className="absolute top-2 right-2 text-xs h-6" onClick={(e) => { e.stopPropagation(); setImageZoomed(false); }}>Fit</Button>
                )}
              </div>
            )}
          </div>
          <div className="flex-[2] border-l border-border overflow-y-auto p-4 space-y-4">
            <section>
              <Button size="sm" variant={asset.picked_up ? 'default' : 'outline'} className="h-8 text-xs w-full gap-1.5" onClick={handleTogglePickedUp}>
                <Check size={12} />{asset.picked_up ? 'Picked up' : 'Mark as picked up'}
              </Button>
              <p className="text-2xs text-muted-foreground mt-1 text-center">Space to toggle</p>
            </section>

            <section>
              <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">File Info</h3>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="text-sm font-semibold font-mono-path break-all cursor-default">{asset.filename}</p>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-lg break-all font-mono-path text-xs">{displayPath(asset.disk_path)}</TooltipContent>
              </Tooltip>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5 text-xs text-foreground/80">
                <span>{formatResolution(asset.width, asset.height)}</span>
                {asset.codec && <><span className="text-muted-foreground/40">·</span><span>{asset.codec}</span></>}
                {asset.duration_seconds != null && <><span className="text-muted-foreground/40">·</span><span>{formatDuration(asset.duration_seconds)}</span></>}
                {asset.file_size_bytes != null && <><span className="text-muted-foreground/40">·</span><span>{formatBytes(asset.file_size_bytes)}</span></>}
              </div>
              {(() => {
                const face = asset.metadata.face;
                if (!face) return null;
                const items: string[] = [];
                if (face.yaw != null) items.push(`Yaw ${Number(face.yaw).toFixed(1)}°`);
                if (face.pitch != null) items.push(`Pitch ${Number(face.pitch).toFixed(1)}°`);
                if (face.sharpness != null) items.push(`Sharpness ${Number(face.sharpness).toFixed(2)}`);
                if (!items.length) return null;
                return (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                    {items.map((item, i) => (
                      <span key={i}>{i > 0 && <span className="text-muted-foreground/30 mr-2">·</span>}{item}</span>
                    ))}
                  </div>
                );
              })()}
            </section>

            <section>
              <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Location</h3>
              <div className={`flex items-center gap-1.5 text-xs mb-2 ${asset.is_on_disk ? 'text-foreground/70' : 'text-destructive'}`}>
                {asset.is_on_disk ? (
                  <><HardDrive size={12} className="text-primary shrink-0" /><span>On disk</span></>
                ) : (
                  <><CloudOff size={12} className="text-destructive shrink-0" /><span>Offlined — not on disk</span></>
                )}
              </div>
              <CopyPathBox label="Disk path" path={asset.disk_path} />
              {asset.file_type === 'video' && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <CopyCommandButton label="Copy RV command" command={`rv "${asset.disk_path}"`} />
                  <CopyCommandButton label="Copy VLC command" command={`vlc "${asset.disk_path}"`} />
                </div>
              )}
            </section>

            {(() => {
              const sourcePath =
                asset.metadata.face?.source_filepath ??
                pkg?.metadata.source_video_path;
              if (!sourcePath || asset.file_type !== 'image') return null;
              return (
                <section>
                  <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Source</h3>
                  <div className="space-y-2">
                    <CopyPathBox label="Extracted from" path={sourcePath} />
                    {onOpenSourceVideo && (
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 w-full" onClick={onOpenSourceVideo}>
                        <Film size={12} />
                        Show source video
                      </Button>
                    )}
                  </div>
                </section>
              );
            })()}

            <section>
              <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Tags</h3>
              <div className="flex flex-wrap gap-1.5">
                {asset.tags.map(tag => <TagChip key={tag} tag={tag} size="md" onRemove={() => handleRemoveTag(tag)} />)}
                {showAddTag ? (
                  <form onSubmit={e => { e.preventDefault(); handleAddTag(); }} className="flex gap-1">
                    <Input value={newTag} onChange={e => setNewTag(e.target.value)} className="h-6 w-24 text-xs" autoFocus onBlur={() => { if (!newTag) setShowAddTag(false); }} />
                  </form>
                ) : (
                  <button onClick={() => setShowAddTag(true)} className="inline-flex items-center gap-0.5 rounded-md border border-dashed px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                    <Plus size={10} /> add
                  </button>
                )}
              </div>
            </section>

            <Collapsible open={metadataOpen} onOpenChange={setMetadataOpen}>
              <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
                {metadataOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}Raw Metadata
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="mt-2 rounded-md bg-background p-3 text-xs font-mono-path overflow-x-auto border text-muted-foreground">{JSON.stringify(asset.metadata, null, 2)}</pre>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
      </div>
    </>
  );
}

export default function PackageDetail() {
  const { packageId } = useParams<{ packageId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: pkg, isLoading } = usePackage(packageId!);
  const { data: summary } = usePackageSummary(packageId!);
  const { data: subject } = useSubject(pkg?.subject_id ?? '');
  const { data: project } = useProject(subject?.project_id ?? '');
  const togglePickedUp = useToggleAssetPickedUp();
  const deletePackageMut = useDeletePackage();
  const updatePackageMut = useUpdatePackage();

  const [searchQuery, setSearchQuery] = useState('');
  const [fileTypeFilter, setFileTypeFilter] = useState('all');
  const [assetTypeFilter, setAssetTypeFilter] = useState('all');
  const [pickedUpFilter, setPickedUpFilter] = useState('all');
  const [gridSize, setGridSize] = useState<GridSize>('md');
  const [selectedAssetIndex, setSelectedAssetIndex] = useState<number | null>(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [selectedPoseBins, setSelectedPoseBins] = useState<Set<string>>(new Set());
  const [isBackfilling, setIsBackfilling] = useState(false);

  const isVfx = pkg?.package_type === 'vfx';
  const linkedSubjects = pkg?.linked_subjects ?? [];
  const showSubjectFilter = linkedSubjects.length > 1;

  // Auto-set VFX packages to show only aligned images by default
  useEffect(() => {
    if (isVfx) setAssetTypeFilter('aligned');
  }, [isVfx]);

  const debouncedSearch = useDebounce(searchQuery, 300);

  const assetFilters = useMemo<AssetFilters>(() => ({
    package_id: packageId,
    subject_id: subjectFilter ?? undefined,
    file_type: !isVfx && fileTypeFilter !== 'all' ? fileTypeFilter : undefined,
    asset_type: isVfx && assetTypeFilter !== 'all' ? assetTypeFilter : undefined,
    picked_up: pickedUpFilter === 'picked_up' ? true : pickedUpFilter === 'available' ? false : undefined,
    search: debouncedSearch || undefined,
    pose_bins: selectedPoseBins.size > 0 ? Array.from(selectedPoseBins).join(',') : undefined,
  }), [packageId, subjectFilter, isVfx, fileTypeFilter, assetTypeFilter, pickedUpFilter, debouncedSearch, selectedPoseBins]);

  const { data: assetData, isLoading: assetsLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = usePaginatedAssets(assetFilters);
  const filteredAssets = useMemo(() => assetData?.pages.flatMap(p => p.items) ?? [], [assetData]);

  const groupedAssets = useMemo(() => {
    if (isVfx) return null;
    const groups = new Map<string, Asset[]>();
    for (const asset of filteredAssets) {
      const t = asset.file_type === 'audio' ? 'audio' : (asset.asset_type || 'raw');
      if (!groups.has(t)) groups.set(t, []);
      groups.get(t)!.push(asset);
    }
    return ASSET_TYPE_ORDER
      .filter(t => groups.has(t))
      .map(t => ({ type: t, label: ASSET_TYPE_LABELS[t] || t, assets: groups.get(t)! }))
      .concat(
        [...groups.entries()]
          .filter(([t]) => !ASSET_TYPE_ORDER.includes(t))
          .map(([t, assets]) => ({ type: t, label: ASSET_TYPE_LABELS[t] || t, assets }))
      );
  }, [isVfx, filteredAssets]);

  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const toggleSection = useCallback((type: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  }, []);

  const handleNavigate = useCallback((i: number) => setSelectedAssetIndex(i), []);
  const handleClose = useCallback(() => setSelectedAssetIndex(null), []);

  const handleCheckboxChange = (asset: Asset, index: number, e: React.MouseEvent) => {
    const newSet = new Set(selectedAssetIds);
    if (e.shiftKey && lastClickedIndex !== null) {
      const start = Math.min(lastClickedIndex, index);
      const end = Math.max(lastClickedIndex, index);
      for (let i = start; i <= end; i++) newSet.add(filteredAssets[i].id);
    } else {
      if (newSet.has(asset.id)) newSet.delete(asset.id); else newSet.add(asset.id);
    }
    setSelectedAssetIds(newSet);
    setLastClickedIndex(index);
  };

  const handleSelectAll = () => {
    if (selectedAssetIds.size === filteredAssets.length) setSelectedAssetIds(new Set());
    else setSelectedAssetIds(new Set(filteredAssets.map(a => a.id)));
  };

  const selectedAssets = useMemo(() => filteredAssets.filter(a => selectedAssetIds.has(a.id)), [filteredAssets, selectedAssetIds]);

  const handleBulkMarkPickedUp = () => {
    selectedAssets.forEach(a => togglePickedUp.mutate({ id: a.id, picked_up: true }));
    toast({ title: `${selectedAssets.length} assets marked as picked up` });
  };

  const handleBulkMarkAvailable = () => {
    selectedAssets.forEach(a => togglePickedUp.mutate({ id: a.id, picked_up: false }));
    toast({ title: `${selectedAssets.length} assets marked as available` });
  };

  const handleTogglePackagePickedUp = () => {
    const next = !pkg?.picked_up;
    updatePackageMut.mutate({ id: packageId!, data: { picked_up: next } });
    toast({ title: next ? 'Package marked as picked up' : 'Package marked as available', duration: 1200 });
  };

  const handleDeletePackage = async () => {
    await deletePackageMut.mutateAsync(packageId!);
    toast({ title: 'Package deleted', description: pkg?.name });
    navigate(-1);
  };

  const handleBackfillMetadata = async () => {
    setIsBackfilling(true);
    try {
      const res = await backfillFaceMetadata(packageId!);
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let lastEvent = '';
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          lastEvent = decoder.decode(value, { stream: true });
        }
      }
      const match = lastEvent.match(/data: (.+)/);
      const result = match ? JSON.parse(match[1]) : {};
      toast({
        title: 'Metadata scan complete',
        description: `Updated ${result.updated ?? 0} assets, ${result.pose_count ?? 0} pose entries`,
        duration: 3000,
      });
      queryClient.invalidateQueries({ queryKey: ['package-summary', packageId] });
      queryClient.invalidateQueries({ queryKey: ['packages'] });
    } catch (e) {
      toast({ title: 'Backfill failed', description: String(e), variant: 'destructive' });
    } finally {
      setIsBackfilling(false);
    }
  };

  if (isLoading) return <div className="p-4"><Skeleton className="h-8 w-48" /></div>;
  if (!pkg) return <div className="p-4 text-muted-foreground">Package not found.</div>;

  const cameraModel = pkg.metadata.camera_model;

  return (
    <div className="p-5 space-y-5">
      <div className="border-l-2 border-l-primary/60 pl-4">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold font-mono-path">{pkg.name}</h1>
          <PackageIndicators ingestedAt={pkg.ingested_at} packageType={pkg.package_type} />
          <StatusBadge status={pkg.picked_up ? 'picked_up' : pkg.status} />
          <Button
            size="sm"
            variant={pkg.picked_up ? 'default' : 'outline'}
            className="h-7 text-xs gap-1.5 ml-auto"
            onClick={handleTogglePackagePickedUp}
          >
            <Check size={12} />
            {pkg.picked_up ? 'Picked up' : 'Mark as picked up'}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 size={14} /></Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete package?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete "{pkg.name}" and all {pkg.file_count} assets. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeletePackage} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
          <span>{formatBytes(pkg.total_size_bytes)}</span>
          <span>{pkg.file_count} files</span>
          <span title={formatFullDate(pkg.ingested_at)}>Ingested {relativeTime(pkg.ingested_at)}</span>
        </div>
      </div>

      {(project || subject) && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {project && <Link to={`/projects/${project.id}`} className="hover:text-foreground transition-colors duration-200">{project.name}</Link>}
          {project && (subject || linkedSubjects.length > 0) && <span className="text-muted-foreground/30">›</span>}
          {linkedSubjects.length > 0 ? (
            linkedSubjects.map((s, i) => (
              <span key={s.id} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-muted-foreground/30">,</span>}
                <Link to={`/projects/${project?.id}/subjects/${s.id}`} className="hover:text-foreground transition-colors duration-200">{s.name}</Link>
              </span>
            ))
          ) : subject && (
            <Link to={`/projects/${subject.project_id}/subjects/${subject.id}`} className="hover:text-foreground transition-colors duration-200">{subject.name}</Link>
          )}
        </div>
      )}

      {summary && <PackageSummaryCard summary={summary} packageType={pkg.package_type} onShowGrid={() => setAssetTypeFilter('grid')} selectedPoseBins={selectedPoseBins} onPoseBinSelectionChange={setSelectedPoseBins} />}

      {isVfx && summary && (!summary.face_types || summary.face_types.length === 0) && (
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={handleBackfillMetadata} disabled={isBackfilling}>
          {isBackfilling ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {isBackfilling ? 'Scanning metadata...' : 'Rescan Face Metadata'}
        </Button>
      )}

      <div className="rounded-lg border border-border/30 bg-card/60 p-4 space-y-3">
        {pkg.source_description && <p className="text-sm text-muted-foreground/80">{pkg.source_description}</p>}
        {cameraModel && (
          <div className="text-xs">
            <span className="text-muted-foreground/60">Camera: </span>
            <span className="text-foreground/80">{cameraModel}</span>
          </div>
        )}
        {pkg.disk_path && <CopyPathBox label="Disk path" path={pkg.disk_path} />}
      </div>

      {pkg.tags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {pkg.tags.map(t => <TagChip key={t} tag={t} size="md" />)}
        </div>
      )}

      <Collapsible open={metadataOpen} onOpenChange={setMetadataOpen}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors duration-200">
          {metadataOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}Raw Metadata
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="mt-2 rounded-lg bg-background/50 p-3 text-xs font-mono-path overflow-x-auto border border-border/30 text-muted-foreground">{JSON.stringify(pkg.metadata, null, 2)}</pre>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex items-center gap-3 flex-wrap">
        <div onClick={handleSelectAll} className="cursor-pointer">
          <Checkbox checked={filteredAssets.length > 0 && selectedAssetIds.size === filteredAssets.length} className="h-3.5 w-3.5" />
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {filteredAssets.length.toLocaleString()}{assetData?.pages[0] && filteredAssets.length < assetData.pages[0].total ? ` of ${assetData.pages[0].total.toLocaleString()}` : ''} assets
        </span>
        {showSubjectFilter && (
          <div className="flex items-center gap-1 flex-wrap">
            <SubjectChip
              name="All"
              isActive={subjectFilter === null}
              onClick={() => setSubjectFilter(null)}
              size="sm"
            />
            {linkedSubjects.map(s => (
              <SubjectChip
                key={s.id}
                name={s.name}
                isActive={subjectFilter === s.id}
                onClick={() => setSubjectFilter(subjectFilter === s.id ? null : s.id)}
                size="sm"
              />
            ))}
          </div>
        )}
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search files..." className="pl-8 h-8 text-xs" />
        </div>
        {isVfx ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1 min-w-[100px] justify-between rounded-lg">
                {assetTypeFilter === 'all' ? 'All types' : assetTypeFilter === 'aligned' ? 'Aligned' : assetTypeFilter === 'grid' ? 'Grid Video' : 'Plate/Source'}
                <ChevronDown size={12} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setAssetTypeFilter('aligned')}>Aligned Images</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAssetTypeFilter('grid')}>Grid Video</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAssetTypeFilter('plate')}>Plate/Source</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAssetTypeFilter('all')}>All types</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1 min-w-[100px] justify-between rounded-lg">
                {fileTypeFilter === 'all' ? 'All types' : fileTypeFilter === 'video' ? 'Video' : fileTypeFilter === 'image' ? 'Image' : fileTypeFilter === 'audio' ? 'Audio' : 'Aligned'}
                <ChevronDown size={12} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setFileTypeFilter('all')}>All types</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFileTypeFilter('video')}>Video</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFileTypeFilter('image')}>Image</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFileTypeFilter('audio')}>Audio</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFileTypeFilter('aligned')}>Aligned</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1 min-w-[110px] justify-between rounded-lg">
              {pickedUpFilter === 'all' ? 'All' : pickedUpFilter === 'picked_up' ? 'Picked up' : 'Available'}
              <ChevronDown size={12} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setPickedUpFilter('all')}>All</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPickedUpFilter('available')}>Available</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPickedUpFilter('picked_up')}>Picked up</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto flex items-center gap-1">
          <Button variant={gridSize === 'sm' ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7" onClick={() => setGridSize('sm')}><Grid3X3 size={14} /></Button>
          <Button variant={gridSize === 'md' ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7" onClick={() => setGridSize('md')}><LayoutGrid size={14} /></Button>
          <Button variant={gridSize === 'lg' ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7" onClick={() => setGridSize('lg')}><Maximize size={14} /></Button>
        </div>
      </div>

      {assetsLoading ? (
        <div className={`grid ${gridCols[gridSize]} gap-3`}>
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-video rounded-lg" />)}
        </div>
      ) : !filteredAssets.length ? (
        <EmptyState icon={ImageIcon} title="No assets found" description="Try adjusting your filters." />
      ) : groupedAssets && groupedAssets.length > 1 ? (
        <div className="space-y-4">
          {groupedAssets.map(group => {
            const isCollapsed = collapsedSections.has(group.type);
            return (
              <div key={group.type} className="rounded-lg border border-border/20 bg-card/20">
                <button
                  onClick={() => toggleSection(group.type)}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-left hover:bg-muted/20 transition-colors rounded-t-lg"
                >
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  <span className="text-xs font-medium text-foreground/80">{group.label}</span>
                  <Badge variant="secondary" className="text-2xs px-1.5 py-0 h-4 ml-1">{group.assets.length}</Badge>
                </button>
                {!isCollapsed && (
                  <div className={`grid ${gridCols[gridSize]} gap-3 px-4 pb-4`}>
                    {group.assets.map(asset => {
                      const globalIndex = filteredAssets.indexOf(asset);
                      return (
                        <AssetThumbnail
                          key={asset.id}
                          asset={asset}
                          isActive={selectedAssetIndex === globalIndex}
                          isSelected={selectedAssetIds.has(asset.id)}
                          showCheckbox={selectedAssetIds.size > 0}
                          onClick={() => setSelectedAssetIndex(globalIndex)}
                          onCheckboxChange={(e) => handleCheckboxChange(asset, globalIndex, e)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <VirtualizedAssetGrid
          assets={filteredAssets}
          totalCount={assetData?.pages[0]?.total ?? filteredAssets.length}
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

      {selectedAssetIds.size > 0 && (
        <div className="sticky bottom-0 left-0 right-0 bg-card border-t flex items-center gap-3 h-10 px-4 -mx-4 -mb-4">
          <span className="text-xs font-medium">{selectedAssetIds.size} selected</span>
          <div className="h-4 w-px bg-border" />
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleBulkMarkPickedUp}><Check size={12} /> Mark picked up</Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleBulkMarkAvailable}>Mark available</Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs ml-auto" onClick={() => setSelectedAssetIds(new Set())}>Clear selection</Button>
        </div>
      )}

      {selectedAssetIndex !== null && filteredAssets[selectedAssetIndex] && (
        <AssetDetailPanel
          asset={filteredAssets[selectedAssetIndex]} assets={filteredAssets} currentIndex={selectedAssetIndex}
          onNavigate={handleNavigate} onClose={handleClose} pkg={pkg}
          onOpenSourceVideo={() => { handleClose(); setAssetTypeFilter('plate'); }}
        />
      )}
    </div>
  );
}
