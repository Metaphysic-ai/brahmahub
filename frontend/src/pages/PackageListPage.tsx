import { Loader2, type LucideIcon, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AddPackageDialog } from "@/components/AddPackageDialog";
import { BulkActionBar } from "@/components/common/BulkActionBar";
import { EmptyState } from "@/components/common/EmptyState";
import { PackageIndicators } from "@/components/common/PackageIndicators";
import { SectionSummary } from "@/components/common/SectionSummary";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TagChip } from "@/components/common/TagChip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/useDebounce";
import { useBulkDeletePackages, usePaginatedPackages } from "@/hooks/usePackages";
import { useProjects } from "@/hooks/useProjects";
import { useAllSubjects } from "@/hooks/useSubjects";
import { useTableSelection } from "@/hooks/useTableSelection";
import { formatBytes, relativeTime } from "@/lib/formatters";

interface PackageListPageProps {
  packageType: string;
  title: string;
  entityLabel: string;
  emptyIcon: LucideIcon;
}

export default function PackageListPage({ packageType, title, entityLabel, emptyIcon }: PackageListPageProps) {
  const [search, setSearch] = useState("");
  const [ingestOpen, setIngestOpen] = useState(false);
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = usePaginatedPackages({
    packageType,
    search: debouncedSearch || undefined,
  });

  const packages = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);
  const total = data?.pages[0]?.total ?? 0;

  const { data: subjects } = useAllSubjects();
  const { data: projects } = useProjects();
  const bulkDelete = useBulkDeletePackages();
  const { toast } = useToast();

  const subjectMap = useMemo(() => {
    const m = new Map<string, { name: string; projectId: string }>();
    subjects?.forEach((s) => m.set(s.id, { name: s.name, projectId: s.project_id }));
    return m;
  }, [subjects]);

  const projectMap = useMemo(() => {
    const m = new Map<string, string>();
    projects?.forEach((p) => m.set(p.id, p.name));
    return m;
  }, [projects]);

  const { selectedIds, handleCheckboxChange, handleSelectAll, clearSelection, allSelected, someSelected } =
    useTableSelection({ items: packages });

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    await bulkDelete.mutateAsync(ids);
    toast({ title: `${ids.length} ${entityLabel}${ids.length > 1 ? "s" : ""} deleted` });
    clearSelection();
  };

  if (isLoading)
    return (
      <div className="p-5">
        <Skeleton className="h-8 w-48" />
      </div>
    );

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{title}</h1>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${entityLabel}s...`}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Button size="sm" variant="outline" onClick={() => setIngestOpen(true)}>
            <Plus size={14} /> Add {title.replace(/s$/, "")}
          </Button>
        </div>
      </div>

      {!packages.length ? (
        <EmptyState icon={emptyIcon} title={`No ${entityLabel}s found`} description="Try adjusting your search." />
      ) : (
        <>
          <SectionSummary
            packageCount={total}
            fileCount={packages.reduce((s, p) => s + p.file_count, 0)}
            totalSize={packages.reduce((s, p) => s + p.total_size_bytes, 0)}
          />
          <BulkActionBar
            selectedCount={selectedIds.size}
            entityLabel={entityLabel}
            onDelete={handleBulkDelete}
            onClearSelection={clearSelection}
            isDeleting={bulkDelete.isPending}
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={handleSelectAll}
                    className="h-3.5 w-3.5"
                  />
                </TableHead>
                <TableHead>{title.replace(/s$/, "")}</TableHead>
                <TableHead className="w-[70px]"></TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Project</TableHead>
                <TableHead className="text-right">Files</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead>Ingested</TableHead>
                <TableHead>Tags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packages.map((pkg, index) => {
                const sub = subjectMap.get(pkg.subject_id);
                return (
                  <TableRow
                    key={pkg.id}
                    className={
                      selectedIds.has(pkg.id) ? "bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]" : ""
                    }
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(pkg.id)}
                        onClick={(e) => handleCheckboxChange(pkg, index, e)}
                        className="h-3.5 w-3.5"
                      />
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/packages/${pkg.id}`}
                        className="font-mono-path text-xs font-medium text-foreground/90 hover:text-primary transition-colors duration-200"
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
                    <TableCell>
                      {pkg.linked_subjects?.length ? (
                        <span className="text-xs">
                          {pkg.linked_subjects.map((s, i) => {
                            const si = subjectMap.get(s.id);
                            return (
                              <span key={s.id}>
                                {i > 0 && <span className="text-muted-foreground/40">, </span>}
                                <Link
                                  to={`/projects/${si?.projectId ?? sub?.projectId}/subjects/${s.id}`}
                                  className="text-muted-foreground hover:text-foreground transition-colors duration-200"
                                >
                                  {s.name}
                                </Link>
                              </span>
                            );
                          })}
                        </span>
                      ) : sub ? (
                        <Link
                          to={`/projects/${sub.projectId}/subjects/${pkg.subject_id}`}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-200"
                        >
                          {sub.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {sub ? (
                        <Link
                          to={`/projects/${sub.projectId}`}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-200"
                        >
                          {projectMap.get(sub.projectId) ?? "—"}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs">{pkg.file_count}</TableCell>
                    <TableCell className="text-right text-xs">{formatBytes(pkg.total_size_bytes)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{relativeTime(pkg.ingested_at)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {pkg.tags.slice(0, 3).map((t) => (
                          <TagChip key={t} tag={t} />
                        ))}
                        {pkg.tags.length > 3 && (
                          <span className="text-2xs text-muted-foreground">+{pkg.tags.length - 3}</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {hasNextPage && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? <Loader2 size={12} className="animate-spin" /> : null}
                Load more ({packages.length} of {total})
              </Button>
            </div>
          )}
        </>
      )}

      <AddPackageDialog open={ingestOpen} onOpenChange={setIngestOpen} forcedPackageType={packageType} />
    </div>
  );
}
