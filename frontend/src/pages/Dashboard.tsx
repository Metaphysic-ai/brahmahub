import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database as DatabaseIcon, Users, Package, FileVideo, HardDrive } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusBadge } from '@/components/common/StatusBadge';
import { PackageIndicators } from '@/components/common/PackageIndicators';
import { BulkActionBar } from '@/components/common/BulkActionBar';
import { useDashboardStats, useRecentIngests, useStorageByProject } from '@/hooks/useDashboard';
import { useBulkDeletePackages } from '@/hooks/usePackages';
import { useTableSelection } from '@/hooks/useTableSelection';
import { useToast } from '@/hooks/use-toast';
import { formatBytes, relativeTime, formatFullDate, pluralize } from '@/lib/formatters';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip, Label } from 'recharts';

const CHART_COLORS = ['hsl(213,60%,50%)', 'hsl(38,80%,55%)', 'hsl(142,55%,45%)', 'hsl(280,50%,55%)'];

const statItems = [
  { key: 'total_projects' as const, label: 'Projects', icon: DatabaseIcon, color: 'bg-primary/10 text-primary' },
  { key: 'total_subjects' as const, label: 'Subjects', icon: Users, color: 'bg-chart-2/10 text-chart-2' },
  { key: 'total_raw_packages' as const, label: 'Packages', icon: Package, color: 'bg-chart-3/10 text-chart-3' },
  { key: 'total_datasets' as const, label: 'Datasets', icon: DatabaseIcon, color: 'bg-chart-4/10 text-chart-4' },
  { key: 'total_assets' as const, label: 'Assets', icon: FileVideo, color: 'bg-chart-5/10 text-chart-5' },
];

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: recents, isLoading: recentsLoading } = useRecentIngests();
  const { data: storage } = useStorageByProject();
  const navigate = useNavigate();

  const bulkDelete = useBulkDeletePackages();
  const { toast } = useToast();

  const recentPackages = useMemo(() => recents?.filter(r => r.package.package_type === 'atman') ?? [], [recents]);
  const recentDatasets = useMemo(() => recents?.filter(r => r.package.package_type === 'vfx') ?? [], [recents]);

  // Wrap RecentIngest items with a top-level `id` for useTableSelection
  const packagesWithId = useMemo(() => recentPackages.map(r => ({ ...r, id: r.package.id })), [recentPackages]);
  const datasetsWithId = useMemo(() => recentDatasets.map(r => ({ ...r, id: r.package.id })), [recentDatasets]);

  const {
    selectedIds: selectedPkgIds,
    handleCheckboxChange: handlePkgCheckbox,
    handleSelectAll: handlePkgSelectAll,
    clearSelection: clearPkgSelection,
    allSelected: allPkgSelected,
    someSelected: somePkgSelected,
  } = useTableSelection({ items: packagesWithId });

  const {
    selectedIds: selectedDsIds,
    handleCheckboxChange: handleDsCheckbox,
    handleSelectAll: handleDsSelectAll,
    clearSelection: clearDsSelection,
    allSelected: allDsSelected,
    someSelected: someDsSelected,
  } = useTableSelection({ items: datasetsWithId });

  const handleBulkDeletePackages = async () => {
    const ids = [...selectedPkgIds];
    await bulkDelete.mutateAsync(ids);
    toast({ title: `${ids.length} package${ids.length > 1 ? 's' : ''} deleted` });
    clearPkgSelection();
  };

  const handleBulkDeleteDatasets = async () => {
    const ids = [...selectedDsIds];
    await bulkDelete.mutateAsync(ids);
    toast({ title: `${ids.length} dataset${ids.length > 1 ? 's' : ''} deleted` });
    clearDsSelection();
  };

  const storageWithData = storage?.filter(s => s.total_bytes > 0);
  const hasStorageData = storageWithData && storageWithData.length > 0;
  const totalStorage = storageWithData?.reduce((sum, s) => sum + s.total_bytes, 0) ?? 0;

  return (
    <div className="p-5 space-y-5">
      <div className="grid grid-cols-3 lg:grid-cols-5 gap-3">
        {statItems.map(({ key, label, icon: Icon, color }) => (
          <div key={key} className="rounded-lg bg-gradient-to-br from-card to-card/60 border border-border/30 p-3 flex items-center gap-3">
            <div className={`rounded-lg h-9 w-9 flex items-center justify-center ${color}`}>
              <Icon size={18} />
            </div>
            <div>
              {statsLoading ? (
                <Skeleton className="h-6 w-10" />
              ) : (
                <p className="text-xl font-semibold leading-none">{stats?.[key] ?? 0}</p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        <div className="space-y-4">
          <Card className="border-border/30">
            <CardContent className="p-0">
              <div className="px-4 py-3 space-y-2">
                <h2 className="text-sm font-medium">Recent Packages</h2>
                <BulkActionBar
                  selectedCount={selectedPkgIds.size}
                  entityLabel="package"
                  onDelete={handleBulkDeletePackages}
                  onClearSelection={clearPkgSelection}
                  isDeleting={bulkDelete.isPending}
                />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={allPkgSelected ? true : somePkgSelected ? 'indeterminate' : false}
                        onCheckedChange={handlePkgSelectAll}
                        className="h-3.5 w-3.5"
                      />
                    </TableHead>
                    <TableHead>Package</TableHead>
                    <TableHead className="w-[70px]"></TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Files</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                    <TableHead className="text-right">Ingested</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentsLoading
                    ? Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 9 }).map((_, j) => (
                            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    : packagesWithId.map((item, index) => {
                        const { package: pkg, subjectName, subjectId, projectName, projectId } = item;
                        return (
                        <TableRow key={pkg.id} className={`cursor-pointer ${selectedPkgIds.has(pkg.id) ? 'bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]' : ''}`} onClick={() => navigate(`/projects/${projectId}/subjects/${subjectId}`)}>
                          <TableCell>
                            <Checkbox
                              checked={selectedPkgIds.has(pkg.id)}
                              onClick={(e) => { e.stopPropagation(); handlePkgCheckbox(item, index, e); }}
                              className="h-3.5 w-3.5"
                            />
                          </TableCell>
                          <TableCell className="font-mono-path text-xs">{pkg.name}</TableCell>
                          <TableCell><PackageIndicators ingestedAt={pkg.ingested_at} packageType={pkg.package_type} /></TableCell>
                          <TableCell className="text-xs">{subjectName}</TableCell>
                          <TableCell className="text-xs">{projectName}</TableCell>
                          <TableCell><StatusBadge status={pkg.picked_up ? 'picked_up' : pkg.status} /></TableCell>
                          <TableCell className="text-xs text-right">{pluralize(pkg.file_count, 'file')}</TableCell>
                          <TableCell className="text-xs text-right">{formatBytes(pkg.total_size_bytes)}</TableCell>
                          <TableCell className="text-xs text-right text-muted-foreground">
                            <Tooltip><TooltipTrigger asChild><span>{relativeTime(pkg.ingested_at)}</span></TooltipTrigger><TooltipContent>{formatFullDate(pkg.ingested_at)}</TooltipContent></Tooltip>
                          </TableCell>
                        </TableRow>
                        );
                      })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-border/30">
            <CardContent className="p-0">
              <div className="px-4 py-3 space-y-2">
                <h2 className="text-sm font-medium">Recent Datasets</h2>
                <BulkActionBar
                  selectedCount={selectedDsIds.size}
                  entityLabel="dataset"
                  onDelete={handleBulkDeleteDatasets}
                  onClearSelection={clearDsSelection}
                  isDeleting={bulkDelete.isPending}
                />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={allDsSelected ? true : someDsSelected ? 'indeterminate' : false}
                        onCheckedChange={handleDsSelectAll}
                        className="h-3.5 w-3.5"
                      />
                    </TableHead>
                    <TableHead>Dataset</TableHead>
                    <TableHead className="w-[70px]"></TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Files</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                    <TableHead className="text-right">Ingested</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentsLoading
                    ? Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 9 }).map((_, j) => (
                            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    : datasetsWithId.map((item, index) => {
                        const { package: pkg, subjectName, subjectId, projectName, projectId } = item;
                        return (
                        <TableRow key={pkg.id} className={`cursor-pointer ${selectedDsIds.has(pkg.id) ? 'bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]' : ''}`} onClick={() => navigate(`/projects/${projectId}/subjects/${subjectId}`)}>
                          <TableCell>
                            <Checkbox
                              checked={selectedDsIds.has(pkg.id)}
                              onClick={(e) => { e.stopPropagation(); handleDsCheckbox(item, index, e); }}
                              className="h-3.5 w-3.5"
                            />
                          </TableCell>
                          <TableCell className="font-mono-path text-xs">{pkg.name}</TableCell>
                          <TableCell><PackageIndicators ingestedAt={pkg.ingested_at} packageType={pkg.package_type} /></TableCell>
                          <TableCell className="text-xs">{subjectName}</TableCell>
                          <TableCell className="text-xs">{projectName}</TableCell>
                          <TableCell><StatusBadge status={pkg.picked_up ? 'picked_up' : pkg.status} /></TableCell>
                          <TableCell className="text-xs text-right">{pluralize(pkg.file_count, 'file')}</TableCell>
                          <TableCell className="text-xs text-right">{formatBytes(pkg.total_size_bytes)}</TableCell>
                          <TableCell className="text-xs text-right text-muted-foreground">
                            <Tooltip><TooltipTrigger asChild><span>{relativeTime(pkg.ingested_at)}</span></TooltipTrigger><TooltipContent>{formatFullDate(pkg.ingested_at)}</TooltipContent></Tooltip>
                          </TableCell>
                        </TableRow>
                        );
                      })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/30 border-t-2 border-t-primary/40">
          <CardContent className="p-4">
            <h2 className="text-sm font-medium mb-3">Storage by Project</h2>
            {hasStorageData ? (
              <>
                <div className="h-[160px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={storageWithData} dataKey="total_bytes" nameKey="project_name" cx="50%" cy="50%" innerRadius={40} outerRadius={65} strokeWidth={1} stroke="hsl(225,8%,7%)">
                        {storageWithData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                        <Label
                          value={formatBytes(totalStorage)}
                          position="center"
                          className="fill-foreground text-xs font-medium"
                        />
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: 'hsl(225,7%,11%)', border: '1px solid hsl(225,5%,18%)', borderRadius: '8px', fontSize: '12px' }}
                        formatter={(value: number) => formatBytes(value)}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1.5 mt-3">
                  {storageWithData.map((s, i) => (
                    <div key={s.project_name} className="flex items-center gap-2 text-xs">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-muted-foreground truncate">{s.project_name}</span>
                      <span className="ml-auto text-foreground">{formatBytes(s.total_bytes)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-[160px] flex flex-col items-center justify-center text-muted-foreground/50">
                <HardDrive size={28} className="mb-2" />
                <p className="text-xs">No storage data yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
