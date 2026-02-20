import { Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BulkActionBar } from "@/components/common/BulkActionBar";
import { EmptyState } from "@/components/common/EmptyState";
import { TagChip } from "@/components/common/TagChip";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useProjects } from "@/hooks/useProjects";
import { useAllSubjects, useBulkDeleteSubjects } from "@/hooks/useSubjects";
import { useTableSelection } from "@/hooks/useTableSelection";
import { relativeTime } from "@/lib/formatters";

export default function Subjects() {
  const { data: subjects, isLoading } = useAllSubjects();
  const { data: projects } = useProjects();
  const [search, setSearch] = useState("");

  const projectMap = useMemo(() => {
    const m = new Map<string, string>();
    projects?.forEach((p) => m.set(p.id, p.name));
    return m;
  }, [projects]);

  const bulkDelete = useBulkDeleteSubjects();
  const { toast } = useToast();

  const filtered = useMemo(() => {
    if (!subjects) return [];
    if (!search) return subjects;
    const q = search.toLowerCase();
    return subjects.filter((s) => s.name.toLowerCase().includes(q));
  }, [subjects, search]);

  const { selectedIds, handleCheckboxChange, handleSelectAll, clearSelection, allSelected, someSelected } =
    useTableSelection({ items: filtered });

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    await bulkDelete.mutateAsync(ids);
    toast({ title: `${ids.length} subject${ids.length > 1 ? "s" : ""} deleted` });
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
        <h1 className="text-lg font-semibold">Subjects</h1>
        <div className="relative w-64">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search subjects..."
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      {!filtered.length ? (
        <EmptyState icon={Users} title="No subjects found" description="Try adjusting your search." />
      ) : (
        <>
          <BulkActionBar
            selectedCount={selectedIds.size}
            entityLabel="subject"
            onDelete={handleBulkDelete}
            onClearSelection={clearSelection}
            isDeleting={bulkDelete.isPending}
            deleteWarning={`This will permanently delete ${selectedIds.size} subject${selectedIds.size > 1 ? "s" : ""} along with ALL their packages and assets. This cannot be undone.`}
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
                <TableHead>Subject</TableHead>
                <TableHead>Project</TableHead>
                <TableHead className="text-right">Packages</TableHead>
                <TableHead className="text-right">Assets</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s, index) => (
                <TableRow
                  key={s.id}
                  className={selectedIds.has(s.id) ? "bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]" : ""}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(s.id)}
                      onClick={(e) => handleCheckboxChange(s, index, e)}
                      className="h-3.5 w-3.5"
                    />
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/projects/${s.project_id}/subjects/${s.id}`}
                      className="font-medium text-sm hover:text-primary transition-colors duration-200"
                    >
                      {s.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/projects/${s.project_id}`}
                      className="text-muted-foreground hover:text-foreground transition-colors duration-200 text-xs"
                    >
                      {projectMap.get(s.project_id) ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right text-xs">{s.package_count}</TableCell>
                  <TableCell className="text-right text-xs">{s.total_assets}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {s.tags.slice(0, 3).map((t) => (
                        <TagChip key={t} tag={t} />
                      ))}
                      {s.tags.length > 3 && (
                        <span className="text-2xs text-muted-foreground">+{s.tags.length - 3}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{relativeTime(s.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
