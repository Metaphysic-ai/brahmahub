import { Database, Package, Plus, Trash2, User } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AddPackageDialog } from "@/components/AddPackageDialog";
import { BulkActionBar } from "@/components/common/BulkActionBar";
import { EmptyState } from "@/components/common/EmptyState";
import { PackageIndicators } from "@/components/common/PackageIndicators";
import { SectionSummary } from "@/components/common/SectionSummary";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TagChip } from "@/components/common/TagChip";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useBulkDeletePackages, useProjectPackages } from "@/hooks/usePackages";
import { useDeleteProject, useProject } from "@/hooks/useProjects";
import { useCreateSubject, useSubjects } from "@/hooks/useSubjects";
import { useTableSelection } from "@/hooks/useTableSelection";
import { formatBytes, pluralize, relativeTime } from "@/lib/formatters";
import type { ProjectPackage } from "@/services/packages";
import type { Subject } from "@/types";

const ACCENT_COLORS = [
  "border-l-primary",
  "border-l-chart-2",
  "border-l-chart-3",
  "border-l-chart-4",
  "border-l-chart-5",
];

interface PackageTableSectionProps {
  packages: ProjectPackage[];
  projectId: string;
  selectedIds: Set<string>;
  allSelected: boolean;
  someSelected: boolean;
  onSelectAll: () => void;
  onCheckboxChange: (item: ProjectPackage, index: number, e: React.MouseEvent) => void;
}

function PackageTableSection({
  packages,
  projectId,
  selectedIds,
  allSelected,
  someSelected,
  onSelectAll,
  onCheckboxChange,
}: PackageTableSectionProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[40px]">
            <Checkbox
              checked={allSelected ? true : someSelected ? "indeterminate" : false}
              onCheckedChange={onSelectAll}
            />
          </TableHead>
          <TableHead>Name</TableHead>
          <TableHead className="w-[70px]"></TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Subject</TableHead>
          <TableHead className="text-right">Files</TableHead>
          <TableHead className="text-right">Size</TableHead>
          <TableHead>Ingested</TableHead>
          <TableHead>Tags</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {packages.map((pkg, index) => (
          <TableRow
            key={pkg.id}
            className={selectedIds.has(pkg.id) ? "bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]" : ""}
          >
            <TableCell>
              <Checkbox checked={selectedIds.has(pkg.id)} onClick={(e) => onCheckboxChange(pkg, index, e)} />
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
              <Link
                to={`/projects/${projectId}/subjects/${pkg.subject_id}`}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-200"
              >
                {pkg.subject_name}
              </Link>
            </TableCell>
            <TableCell className="text-right text-xs">{pkg.file_count}</TableCell>
            <TableCell className="text-right text-xs">{formatBytes(pkg.total_size_bytes)}</TableCell>
            <TableCell className="text-xs text-muted-foreground">{relativeTime(pkg.ingested_at)}</TableCell>
            <TableCell>
              <div className="flex gap-1 flex-wrap">
                {pkg.tags.slice(0, 3).map((t) => (
                  <TagChip key={t} tag={t} />
                ))}
                {pkg.tags.length > 3 && <span className="text-2xs text-muted-foreground">+{pkg.tags.length - 3}</span>}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SubjectCard({
  subject,
  projectId,
  packageCount,
  assetCount,
  index,
}: {
  subject: Subject;
  projectId: string;
  packageCount: number;
  assetCount: number;
  index: number;
}) {
  const navigate = useNavigate();
  const accentColor = ACCENT_COLORS[index % ACCENT_COLORS.length];
  return (
    <div
      className={`cursor-pointer rounded-lg bg-card/60 border border-border/30 border-l-2 ${accentColor} p-4 space-y-2 transition-all duration-200 hover:ring-1 hover:ring-primary/20 hover:shadow-lg hover:shadow-black/20`}
      onClick={() => navigate(`/projects/${projectId}/subjects/${subject.id}`)}
    >
      <h3 className="text-sm font-semibold">{subject.name}</h3>
      {subject.description && <p className="text-xs text-muted-foreground/70 line-clamp-2">{subject.description}</p>}
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span>{pluralize(packageCount, "package")}</span>
        <span className="text-muted-foreground/30">·</span>
        <span>{pluralize(assetCount, "asset")}</span>
      </div>
    </div>
  );
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: project, isLoading } = useProject(id!);
  const { data: subjects, isLoading: subjectsLoading } = useSubjects(id);
  const deleteProject = useDeleteProject();
  const createSubject = useCreateSubject();
  const { data: atmanPackages, isLoading: atmanPkgLoading } = useProjectPackages(id, "atman");
  const { data: vfxPackages, isLoading: vfxPkgLoading } = useProjectPackages(id, "vfx");

  const atmanSelection = useTableSelection({ items: atmanPackages ?? [] });
  const vfxSelection = useTableSelection({ items: vfxPackages ?? [] });
  const bulkDelete = useBulkDeletePackages();

  const handleBulkDelete = async (ids: string[]) => {
    await bulkDelete.mutateAsync(ids);
    toast({ title: "Deleted", description: `${ids.length} item${ids.length === 1 ? "" : "s"} deleted` });
    atmanSelection.clearSelection();
    vfxSelection.clearSelection();
  };

  const [dialogOpen, setDialogOpen] = useState(false);
  const [ingestDialogOpen, setIngestDialogOpen] = useState(false);
  const [datasetDialogOpen, setDatasetDialogOpen] = useState(false);
  const [subjectName, setSubjectName] = useState("");
  const [subjectDesc, setSubjectDesc] = useState("");
  const [subjectNotes, setSubjectNotes] = useState("");
  const [subjectTagsInput, setSubjectTagsInput] = useState("");

  const handleDelete = async () => {
    await deleteProject.mutateAsync(id!);
    toast({ title: "Project deleted" });
    navigate("/projects");
  };

  const handleCreateSubject = async () => {
    if (!subjectName.trim()) return;
    const tags = subjectTagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    await createSubject.mutateAsync({
      project_id: id!,
      name: subjectName.trim(),
      description: subjectDesc.trim() || undefined,
      notes: subjectNotes.trim() || undefined,
      tags: tags.length ? tags : undefined,
    });
    toast({ title: "Subject added", description: subjectName });
    setDialogOpen(false);
    setSubjectName("");
    setSubjectDesc("");
    setSubjectNotes("");
    setSubjectTagsInput("");
  };

  if (isLoading)
    return (
      <div className="p-5">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-4 w-96" />
      </div>
    );
  if (!project) return <div className="p-5 text-muted-foreground">Project not found.</div>;

  return (
    <div className="p-5">
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{project.name}</h1>
            <Badge
              variant="outline"
              className={`text-2xs px-2 py-0.5 ${
                project.project_type === "atman"
                  ? "text-info border-info/20 bg-info/8"
                  : "text-warning border-warning/20 bg-warning/8"
              }`}
            >
              {project.project_type === "atman" ? "ATMAN" : "VFX"}
            </Badge>
          </div>
          {project.description && <p className="text-sm text-muted-foreground/70 mt-1">{project.description}</p>}
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={() => setIngestDialogOpen(true)}>
            <Package size={14} /> Add Package
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDatasetDialogOpen(true)}>
            <Database size={14} /> Add Dataset
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                <Trash2 size={14} />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete project?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete "{project.name}" and all associated data.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-muted-foreground">Subjects</h2>
        <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
          <Plus size={14} /> Add Subject
        </Button>
      </div>

      {subjectsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : !subjects?.length ? (
        <EmptyState
          icon={User}
          title="No subjects yet"
          description="Add a subject to start organizing captures."
          actionLabel="Add Subject"
          onAction={() => setDialogOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {subjects.map((s, i) => (
            <SubjectCard
              key={s.id}
              subject={s}
              projectId={id!}
              packageCount={s.package_count}
              assetCount={s.total_assets}
              index={i}
            />
          ))}
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Packages ({atmanPackages?.length ?? 0})</h2>
        {atmanPkgLoading ? (
          <Skeleton className="h-32" />
        ) : !atmanPackages?.length ? (
          <p className="text-xs text-muted-foreground/60">No packages yet.</p>
        ) : (
          <>
            <SectionSummary
              packageCount={atmanPackages.length}
              fileCount={atmanPackages.reduce((s, p) => s + p.file_count, 0)}
              totalSize={atmanPackages.reduce((s, p) => s + p.total_size_bytes, 0)}
            />
            <BulkActionBar
              selectedCount={atmanSelection.selectedIds.size}
              entityLabel="package"
              onDelete={() => handleBulkDelete([...atmanSelection.selectedIds])}
              onClearSelection={atmanSelection.clearSelection}
              isDeleting={bulkDelete.isPending}
            />
            <div className="mt-2">
              <PackageTableSection
                packages={atmanPackages}
                projectId={id!}
                selectedIds={atmanSelection.selectedIds}
                allSelected={atmanSelection.allSelected}
                someSelected={atmanSelection.someSelected}
                onSelectAll={atmanSelection.handleSelectAll}
                onCheckboxChange={atmanSelection.handleCheckboxChange}
              />
            </div>
          </>
        )}
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Datasets ({vfxPackages?.length ?? 0})</h2>
        {vfxPkgLoading ? (
          <Skeleton className="h-32" />
        ) : !vfxPackages?.length ? (
          <p className="text-xs text-muted-foreground/60">No datasets yet.</p>
        ) : (
          <>
            <SectionSummary
              packageCount={vfxPackages.length}
              fileCount={vfxPackages.reduce((s, p) => s + p.file_count, 0)}
              totalSize={vfxPackages.reduce((s, p) => s + p.total_size_bytes, 0)}
            />
            <BulkActionBar
              selectedCount={vfxSelection.selectedIds.size}
              entityLabel="dataset"
              onDelete={() => handleBulkDelete([...vfxSelection.selectedIds])}
              onClearSelection={vfxSelection.clearSelection}
              isDeleting={bulkDelete.isPending}
            />
            <div className="mt-2">
              <PackageTableSection
                packages={vfxPackages}
                projectId={id!}
                selectedIds={vfxSelection.selectedIds}
                allSelected={vfxSelection.allSelected}
                someSelected={vfxSelection.someSelected}
                onSelectAll={vfxSelection.handleSelectAll}
                onCheckboxChange={vfxSelection.handleCheckboxChange}
              />
            </div>
          </>
        )}
      </div>

      <AddPackageDialog
        open={ingestDialogOpen}
        onOpenChange={setIngestDialogOpen}
        projectId={id!}
        forcedPackageType="atman"
      />
      <AddPackageDialog
        open={datasetDialogOpen}
        onOpenChange={setDatasetDialogOpen}
        projectId={id!}
        forcedPackageType="vfx"
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Subject</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                placeholder="Subject name"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea
                value={subjectDesc}
                onChange={(e) => setSubjectDesc(e.target.value)}
                placeholder="Optional description"
                className="mt-1"
                rows={2}
              />
            </div>
            <Separator />
            <p className="text-xs text-muted-foreground">Optional</p>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={subjectNotes}
                onChange={(e) => setSubjectNotes(e.target.value)}
                placeholder="Internal notes"
                className="mt-1"
                rows={2}
              />
            </div>
            <div>
              <Label className="text-xs">Tags</Label>
              <Input
                value={subjectTagsInput}
                onChange={(e) => setSubjectTagsInput(e.target.value)}
                placeholder="tag1, tag2"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateSubject} disabled={!subjectName.trim()}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
