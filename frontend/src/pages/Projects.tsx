import { FolderOpen, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useCreateProject, useProjects } from "@/hooks/useProjects";
import { useCreateSubject } from "@/hooks/useSubjects";
import { formatFullDate, pluralize, relativeTime } from "@/lib/formatters";
import type { Project } from "@/types";

function ProjectCard({
  project,
  subjectCount,
  assetCount,
}: {
  project: Project;
  subjectCount: number;
  assetCount: number;
}) {
  const navigate = useNavigate();
  return (
    <div
      className="cursor-pointer rounded-lg bg-card/60 backdrop-blur-sm border border-border/30 p-4 space-y-2.5 transition-all duration-200 hover:ring-1 hover:ring-primary/20 hover:shadow-lg hover:shadow-black/20"
      onClick={() => navigate(`/projects/${project.id}`)}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold truncate">{project.name}</h3>
        <Badge
          variant="outline"
          className={`text-2xs px-2 py-0.5 shrink-0 ${
            project.project_type === "atman"
              ? "text-info border-info/20 bg-info/8"
              : "text-warning border-warning/20 bg-warning/8"
          }`}
        >
          {project.project_type === "atman" ? "ATMAN" : "VFX"}
        </Badge>
      </div>
      {project.description && <p className="text-xs text-muted-foreground/70 line-clamp-2">{project.description}</p>}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{pluralize(subjectCount, "subject")}</span>
        <span>{pluralize(assetCount, "asset")}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="ml-auto">{relativeTime(project.updated_at)}</span>
          </TooltipTrigger>
          <TooltipContent>{formatFullDate(project.updated_at)}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

export default function Projects() {
  const { data: projects, isLoading } = useProjects();
  const createProject = useCreateProject();
  const createSubject = useCreateSubject();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"atman" | "vfx">("atman");
  const [initialSubject, setInitialSubject] = useState("");
  const [client, setClient] = useState("");
  const [notes, setNotes] = useState("");
  const [tagsInput, setTagsInput] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) return;
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const newProject = await createProject.mutateAsync({
      name: name.trim(),
      description: description.trim() || undefined,
      project_type: type,
      client: client.trim() || undefined,
      notes: notes.trim() || undefined,
      tags: tags.length ? tags : undefined,
    });

    if (initialSubject.trim()) {
      await createSubject.mutateAsync({ project_id: newProject.id, name: initialSubject.trim() });
      toast({ title: "Project created", description: `with subject: ${initialSubject.trim()}` });
    } else {
      toast({ title: "Project created", description: name });
    }

    setDialogOpen(false);
    setName("");
    setDescription("");
    setType("atman");
    setInitialSubject("");
    setClient("");
    setNotes("");
    setTagsInput("");
  };

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-semibold">Projects</h1>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus size={14} /> New Project
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : !projects?.length ? (
        <EmptyState
          icon={FolderOpen}
          title="No projects yet"
          description="Create your first project to start organizing datasets."
          actionLabel="New Project"
          onAction={() => setDialogOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} subjectCount={p.subject_count} assetCount={p.total_assets} />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Project name"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Type</Label>
                <RadioGroup
                  value={type}
                  onValueChange={(v) => setType(v as "atman" | "vfx")}
                  className="flex gap-4 mt-2"
                >
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="atman" id="atman" />
                    <Label htmlFor="atman" className="text-sm">
                      ATMAN
                    </Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="vfx" id="vfx" />
                    <Label htmlFor="vfx" className="text-sm">
                      VFX
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                className="mt-1"
                rows={2}
              />
            </div>
            <div>
              <Label className="text-xs">Initial Subject (optional)</Label>
              <Input
                value={initialSubject}
                onChange={(e) => setInitialSubject(e.target.value)}
                placeholder="e.g. Elena Vasquez"
                className="mt-1"
              />
            </div>
            <Separator />
            <p className="text-xs text-muted-foreground">Optional</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Client</Label>
                <Input
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                  placeholder="Client name"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Tags</Label>
                <Input
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="tag1, tag2"
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal notes"
                className="mt-1"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!name.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
