import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Check, ChevronDown, ChevronRight, FolderSymlink, Loader2, Package } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAnalyzePath } from "@/hooks/useIngest";
import { useCreateProject, useProjects } from "@/hooks/useProjects";
import { useSubjects } from "@/hooks/useSubjects";
import { formatBytes, pluralize } from "@/lib/formatters";
import type { IngestStreamEvent } from "@/services/ingest";
import { executeIngestStream, fetchDatasetDirs, resolveDatasets } from "@/services/ingest";
import type { AnalysisResult, DatasetMapping, DatasetSuggestion, SubjectAnalysis } from "@/types";

function normalizeSubjectName(name: string): string {
  return name
    .trim()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

type Step = "input" | "preview" | "datasets" | "confirm" | "ingesting" | "done";

interface DatasetMappingState {
  dir: string;
  isNew: boolean;
  status: "matched" | "review" | "new" | "skip";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  forcedPackageType?: "atman" | "vfx";
}

interface VirtualizedFileListProps {
  files: SubjectAnalysis["files"];
  subjectIdx: number;
  toggleFileSelected: (subjectIdx: number, fileIdx: number) => void;
}

function VirtualizedFileList({ files, subjectIdx, toggleFileSelected }: VirtualizedFileListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 10,
  });

  return (
    <div className="border-t border-border/20">
      <div className="grid grid-cols-[2rem_1fr_3.5rem_4rem_4rem_4rem] text-xs text-muted-foreground border-b border-border/10 px-1 py-0.5">
        <div></div>
        <div>Filename</div>
        <div>Type</div>
        <div className="text-right">Size</div>
        <div>Camera</div>
        <div>Asset</div>
      </div>
      <div ref={parentRef} className="max-h-48 overflow-y-auto">
        <div style={{ height: `${virtualizer.getTotalSize()}px`, width: "100%", position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const file = files[virtualRow.index];
            const fi = virtualRow.index;
            return (
              <div
                key={fi}
                className={`grid grid-cols-[2rem_1fr_3.5rem_4rem_4rem_4rem] text-xs items-center px-1 hover:bg-muted/20 ${!file.selected ? "opacity-40" : ""}`}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="flex justify-center">
                  <Checkbox
                    checked={file.selected}
                    onCheckedChange={() => toggleFileSelected(subjectIdx, fi)}
                    className="h-3 w-3"
                  />
                </div>
                <div className="truncate font-mono">{file.original_path.split("/").pop()}</div>
                <div>{file.file_type}</div>
                <div className="text-right">{formatBytes(file.size_bytes)}</div>
                <div>{file.camera}</div>
                <div>{file.asset_type}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function AddPackageDialog({ open, onOpenChange, projectId: projectIdProp, forcedPackageType }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const analyze = useAnalyzePath();
  const { data: projects } = useProjects();
  const createProject = useCreateProject();

  const [step, setStep] = useState<Step>("input");

  const [selectedProjectId, setSelectedProjectId] = useState(projectIdProp ?? "");
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectType, setNewProjectType] = useState<"atman" | "vfx">("atman");

  const effectiveProjectId = projectIdProp ?? selectedProjectId;

  const { data: existingSubjects } = useSubjects(effectiveProjectId || undefined);

  const [sourcePath, setSourcePath] = useState("");
  const [packageName, setPackageName] = useState("");
  const [packageNameTouched, setPackageNameTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [subjects, setSubjects] = useState<SubjectAnalysis[]>([]);
  const [expandedSubjects, setExpandedSubjects] = useState<Set<number>>(new Set());
  const [skipProxies, setSkipProxies] = useState(false);

  // Dataset mapping state
  const [datasetMappings, setDatasetMappings] = useState<Map<string, DatasetMappingState>>(new Map());
  const [allDatasetDirs, setAllDatasetDirs] = useState<string[]>([]);
  const [datasetsRoot, setDatasetsRoot] = useState("");
  const [datasetSuggestions, setDatasetSuggestions] = useState<Map<string, DatasetSuggestion[]>>(new Map());
  const [skipDatasets, setSkipDatasets] = useState(false);
  const [datasetsLoading, setDatasetsLoading] = useState(false);
  const [browseDirs, setBrowseDirs] = useState<Set<string>>(new Set());

  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    file: string;
    step: string;
    elapsed: number;
  } | null>(null);
  const progressRef = useRef<{ current: number; total: number; file: string; step: string; elapsed: number } | null>(
    null,
  );
  const rafRef = useRef<number>();
  const [result, setResult] = useState<{ package_id: string; file_count: number; subjects_created: string[] } | null>(
    null,
  );

  const reset = useCallback(() => {
    setStep("input");
    setSelectedProjectId(projectIdProp ?? "");
    setCreatingProject(false);
    setNewProjectName("");
    setNewProjectType("atman");
    setSourcePath("");
    setPackageName("");
    setPackageNameTouched(false);
    setDescription("");
    setTagsInput("");
    setAnalysis(null);
    setSubjects([]);
    setExpandedSubjects(new Set());
    setSkipProxies(false);
    setDatasetMappings(new Map());
    setAllDatasetDirs([]);
    setDatasetsRoot("");
    setDatasetSuggestions(new Map());
    setSkipDatasets(false);
    setDatasetsLoading(false);
    setBrowseDirs(new Set());
    setProgress(null);
    progressRef.current = null;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = undefined;
    }
    setResult(null);
  }, [projectIdProp]);

  const handleClose = (isOpen: boolean) => {
    const hadResult = result !== null;
    if (!isOpen) reset();
    onOpenChange(isOpen);
    if (!isOpen && hadResult) {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["packages"] });
        queryClient.invalidateQueries({ queryKey: ["subjects"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["projects"] });
      }, 100);
    }
  };

  const handleProjectSelect = (value: string) => {
    if (value === "__new__") {
      setCreatingProject(true);
    } else {
      setCreatingProject(false);
      setSelectedProjectId(value);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      const created = await createProject.mutateAsync({
        name: newProjectName.trim(),
        project_type: newProjectType,
      });
      setSelectedProjectId(created.id);
      setCreatingProject(false);
      toast({ title: "Project created", description: newProjectName });
    } catch (err: any) {
      toast({ title: "Failed to create project", description: err.message, variant: "destructive" });
    }
  };

  const handleAnalyze = async () => {
    if (!sourcePath.trim() || !effectiveProjectId) return;
    try {
      const res = await analyze.mutateAsync({ source_path: sourcePath.trim(), project_id: effectiveProjectId });
      const effectiveResult = forcedPackageType ? { ...res, package_type: forcedPackageType } : res;
      setAnalysis(effectiveResult);
      // Auto-rename subjects that fuzzy-match a single existing subject
      const mapped = res.subjects.map((s) => {
        const match = findSubjectMatch(s.name);
        if (match.type === "exact" || (match.type === "fuzzy" && match.matches.length === 1)) {
          return { ...s, name: match.matches[0] };
        }
        return s;
      });
      setSubjects(mapped.map((s) => ({ ...s, files: s.files.map((f) => ({ ...f })) })));
      setExpandedSubjects(new Set(mapped.map((_, i) => i)));
      if (!packageNameTouched) {
        const lastPart = sourcePath.trim().replace(/\/+$/, "").split("/").pop() || "package";
        setPackageName(lastPart);
      }
      setStep("preview");
    } catch (err: any) {
      toast({ title: "Analysis failed", description: err.message, variant: "destructive" });
    }
  };

  const handleEnterDatasets = async () => {
    setStep("datasets");
    setDatasetsLoading(true);
    try {
      const activeSubjects = subjects.filter((s) => s.files.some((f) => f.selected)).map((s) => ({ name: s.name }));

      const [dirsRes, resolveRes] = await Promise.all([fetchDatasetDirs(), resolveDatasets(activeSubjects)]);

      setDatasetsRoot(dirsRes.datasets_root);
      setAllDatasetDirs(dirsRes.dirs);

      const sugMap = new Map<string, DatasetSuggestion[]>();
      const mapState = new Map<string, DatasetMappingState>();

      for (const m of resolveRes.mappings) {
        sugMap.set(m.subject_name, m.suggestions);

        // Determine initial state
        if (m.existing_dir) {
          // Subject already has a dataset dir stored
          mapState.set(m.subject_name, {
            dir: m.existing_dir,
            isNew: false,
            status: "matched",
          });
        } else if (m.suggestions.length > 0 && m.suggestions[0].score >= 0.9) {
          // Confident match (exact or single-prefix)
          mapState.set(m.subject_name, {
            dir: `${dirsRes.datasets_root}/${m.suggestions[0].dir_name}`,
            isNew: false,
            status: "matched",
          });
        } else if (m.suggestions.length > 0 && m.suggestions[0].score >= 0.75) {
          // Ambiguous but plausible — needs review
          mapState.set(m.subject_name, {
            dir: "",
            isNew: false,
            status: "review",
          });
        } else {
          // No match — default to create new
          const normalized = m.subject_name.trim().toLowerCase().replace(/\s+/g, "_");
          mapState.set(m.subject_name, {
            dir: `${dirsRes.datasets_root}/${normalized}`,
            isNew: true,
            status: "new",
          });
        }
      }

      setDatasetSuggestions(sugMap);
      setDatasetMappings(mapState);
    } catch (err: any) {
      toast({ title: "Failed to load dataset dirs", description: err.message, variant: "destructive" });
    } finally {
      setDatasetsLoading(false);
    }
  };

  const handleIngest = async () => {
    if (!analysis || !effectiveProjectId) return;
    setStep("ingesting");
    setProgress(null);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      // Build dataset mappings if configured
      const dsMappings: DatasetMapping[] = [];
      if (!skipDatasets && datasetMappings.size > 0) {
        for (const [subjName, state] of datasetMappings) {
          if (state.status !== "skip" && state.dir) {
            dsMappings.push({
              subject_name: subjName,
              dataset_dir: state.dir,
              is_new: state.isNew,
            });
          }
        }
      }

      const res = await executeIngestStream(
        {
          project_id: effectiveProjectId,
          source_path: sourcePath.trim(),
          package_type: analysis.package_type,
          subjects: subjects.map((s) => ({
            name: s.name
              .trim()
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase()),
            files: s.files.map((f) => ({
              original_path: f.original_path,
              selected: f.selected,
              subject: f.subject,
              asset_type: f.asset_type,
            })),
          })),
          package_name: packageName.trim(),
          description: description.trim(),
          tags,
          skip_proxies: skipProxies,
          proxy_height: 720,
          ...(dsMappings.length > 0 ? { dataset_mappings: dsMappings } : {}),
        },
        (event: IngestStreamEvent) => {
          if ("current" in event) {
            progressRef.current = {
              current: event.current,
              total: event.total,
              file: event.file,
              step: event.step,
              elapsed: event.elapsed,
            };
            if (!rafRef.current) {
              rafRef.current = requestAnimationFrame(() => {
                if (progressRef.current) setProgress({ ...progressRef.current });
                rafRef.current = undefined;
              });
            }
          } else if ("type" in event && event.type === "finalizing") {
            setProgress((prev) => (prev ? { ...prev, step: "finalizing", file: "Committing to database..." } : prev));
          }
        },
      );
      setResult(res);
      setStep("done");
      toast({ title: "Ingest complete", description: `${res.file_count} assets ingested` });
    } catch (err: any) {
      toast({ title: "Ingest failed", description: err.message, variant: "destructive" });
      setStep("confirm");
    }
  };

  const toggleFileSelected = (subjectIdx: number, fileIdx: number) => {
    setSubjects((prev) => {
      const next = prev.map((s) => ({ ...s, files: s.files.map((f) => ({ ...f })) }));
      next[subjectIdx].files[fileIdx].selected = !next[subjectIdx].files[fileIdx].selected;
      return next;
    });
  };

  const toggleAllInSubject = (subjectIdx: number, selected: boolean) => {
    setSubjects((prev) => {
      const next = prev.map((s) => ({ ...s, files: s.files.map((f) => ({ ...f })) }));
      next[subjectIdx].files.forEach((f) => (f.selected = selected));
      return next;
    });
  };

  const renameSubject = (subjectIdx: number, name: string) => {
    setSubjects((prev) => {
      const next = [...prev];
      next[subjectIdx] = { ...next[subjectIdx], name };
      return next;
    });
  };

  const toggleExpanded = (index: number) => {
    setExpandedSubjects((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  };

  const totalSelected = subjects.reduce((sum, s) => sum + s.files.filter((f) => f.selected).length, 0);
  const totalSelectedSize = subjects.reduce(
    (sum, s) => sum + s.files.filter((f) => f.selected).reduce((fs, f) => fs + f.size_bytes, 0),
    0,
  );

  const existingSubjectList = (existingSubjects ?? []).map((s) => ({
    original: s.name,
    normalized: normalizeSubjectName(s.name).toLowerCase(),
  }));

  function findSubjectMatch(rawName: string): { type: "exact" | "fuzzy" | "none"; matches: string[] } {
    const norm = normalizeSubjectName(rawName).toLowerCase();
    const exact = existingSubjectList.find((s) => s.normalized === norm);
    if (exact) return { type: "exact", matches: [exact.original] };
    const fuzzy = existingSubjectList.filter((s) => s.normalized.includes(norm) || norm.includes(s.normalized));
    if (fuzzy.length > 0) return { type: "fuzzy", matches: fuzzy.map((f) => f.original) };
    return { type: "none", matches: [] };
  }

  const selectedProject = projects?.find((p) => p.id === effectiveProjectId);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package size={16} />
            {forcedPackageType === "vfx" ? "Add Dataset" : "Add Package"}
          </DialogTitle>
        </DialogHeader>

        {step === "input" && (
          <>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Project</Label>
                {projectIdProp ? (
                  <p className="text-sm mt-1 text-foreground/80">{selectedProject?.name ?? "Loading..."}</p>
                ) : creatingProject ? (
                  <div className="mt-1 space-y-2 rounded-md border border-border/40 p-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder="Project name"
                        className="text-xs"
                        autoFocus
                      />
                      <RadioGroup
                        value={newProjectType}
                        onValueChange={(v) => setNewProjectType(v as "atman" | "vfx")}
                        className="flex gap-3 items-center"
                      >
                        <div className="flex items-center gap-1">
                          <RadioGroupItem value="atman" id="new-atman" />
                          <Label htmlFor="new-atman" className="text-xs">
                            ATMAN
                          </Label>
                        </div>
                        <div className="flex items-center gap-1">
                          <RadioGroupItem value="vfx" id="new-vfx" />
                          <Label htmlFor="new-vfx" className="text-xs">
                            VFX
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => setCreatingProject(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={handleCreateProject}
                        disabled={!newProjectName.trim() || createProject.isPending}
                      >
                        {createProject.isPending && <Loader2 size={12} className="animate-spin mr-1" />}
                        Create
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Select value={selectedProjectId} onValueChange={handleProjectSelect}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select a project..." />
                    </SelectTrigger>
                    <SelectContent>
                      {projects?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="flex items-center gap-2">
                            {p.name}
                            <Badge
                              variant="outline"
                              className={`text-2xs px-1.5 py-0 ${
                                p.project_type === "atman"
                                  ? "text-info border-info/20"
                                  : "text-warning border-warning/20"
                              }`}
                            >
                              {p.project_type === "atman" ? "ATMAN" : "VFX"}
                            </Badge>
                          </span>
                        </SelectItem>
                      ))}
                      <SelectItem value="__new__">+ Create new project</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div>
                <Label className="text-xs">Source Path</Label>
                <Input
                  value={sourcePath}
                  onChange={(e) => setSourcePath(e.target.value)}
                  placeholder="/mnt/x/PROJECTS/..."
                  className="mt-1 font-mono text-xs"
                  onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                />
              </div>
              <div>
                <Label className="text-xs">Package Name</Label>
                <Input
                  value={packageName}
                  onChange={(e) => {
                    setPackageName(e.target.value);
                    setPackageNameTouched(true);
                  }}
                  placeholder="Auto-filled from path"
                  className="mt-1"
                />
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
                <Label className="text-xs">Tags</Label>
                <Input
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="tag1, tag2"
                  className="mt-1"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button onClick={handleAnalyze} disabled={!sourcePath.trim() || !effectiveProjectId || analyze.isPending}>
                {analyze.isPending && <Loader2 size={14} className="animate-spin mr-1" />}
                Analyze
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "preview" && analysis && (
          <>
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant="outline"
                  className={
                    analysis.package_type === "vfx"
                      ? "text-warning border-warning/20 bg-warning/8"
                      : "text-info border-info/20 bg-info/8"
                  }
                >
                  {analysis.package_type === "vfx" ? "VFX (auto-detected)" : "ATMAN"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {pluralize(analysis.total_files, "file")} ({formatBytes(analysis.total_size_bytes)}) across{" "}
                  {pluralize(analysis.subjects.length, "subject")}
                </span>
                {selectedProject && (
                  <span className="text-xs text-muted-foreground/60 ml-auto">Project: {selectedProject.name}</span>
                )}
              </div>

              <Separator />

              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {subjects.map((subj, si) => {
                  const selectedCount = subj.files.filter((f) => f.selected).length;
                  const allSelected = selectedCount === subj.files.length;
                  const isExpanded = expandedSubjects.has(si);
                  const match = findSubjectMatch(subj.name);

                  return (
                    <div key={si} className="border border-border/30 rounded-md">
                      <div
                        className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/30"
                        onClick={() => toggleExpanded(si)}
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <Input
                          value={subj.name}
                          onChange={(e) => {
                            e.stopPropagation();
                            renameSubject(si, e.target.value);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="h-6 text-xs font-medium w-40 px-1"
                        />
                        {match.type === "exact" ? (
                          <Badge
                            variant="outline"
                            className="text-success border-success/20 bg-success/8 text-2xs px-1.5 py-0"
                          >
                            Existing
                          </Badge>
                        ) : match.type === "fuzzy" ? (
                          <Badge
                            variant="outline"
                            className="text-warning border-warning/20 bg-warning/8 text-2xs px-1.5 py-0"
                          >
                            Match: {match.matches[0]}
                            {match.matches.length > 1 ? ` +${match.matches.length - 1}` : ""}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-info border-info/20 bg-info/8 text-2xs px-1.5 py-0">
                            New
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">
                          {selectedCount}/{subj.files.length} selected ({formatBytes(subj.total_size_bytes)})
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1.5 text-2xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleAllInSubject(si, !allSelected);
                          }}
                        >
                          {allSelected ? "Deselect all" : "Select all"}
                        </Button>
                      </div>

                      {isExpanded && (
                        <VirtualizedFileList
                          files={subj.files}
                          subjectIdx={si}
                          toggleFileSelected={toggleFileSelected}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <Separator />

              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs">
                  <Checkbox
                    checked={skipProxies}
                    onCheckedChange={(c) => setSkipProxies(c === true)}
                    className="h-3 w-3"
                  />
                  Skip proxy generation
                </label>
                <p className="text-xs text-muted-foreground/60">
                  References original files in place — no source data is copied or duplicated.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("input")}>
                Back
              </Button>
              <Button onClick={handleEnterDatasets} disabled={totalSelected === 0}>
                Review & Ingest
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "datasets" && (
          <>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <FolderSymlink size={16} className="text-muted-foreground" />
                  <span className="text-sm font-medium">Dataset Mapping</span>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <Checkbox
                    checked={skipDatasets}
                    onCheckedChange={(c) => setSkipDatasets(c === true)}
                    className="h-3 w-3"
                  />
                  Skip
                </label>
              </div>

              {!skipDatasets && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Map each subject to a dataset directory. Symlinks will be created from the dataset directory to the
                  ingested files.
                </p>
              )}

              {datasetsLoading ? (
                <div className="flex items-center gap-2 py-8 justify-center">
                  <Loader2 size={16} className="animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Loading dataset directories...</span>
                </div>
              ) : (
                !skipDatasets && (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {subjects
                      .filter((s) => s.files.some((f) => f.selected))
                      .map((subj) => {
                        const mapping = datasetMappings.get(subj.name);
                        const suggestions = (datasetSuggestions.get(subj.name) || []).filter((s) => s.score >= 0.75);
                        const status = mapping?.status || "review";
                        const fileCount = subj.files.filter((f) => f.selected).length;
                        const showBrowse = browseDirs.has(subj.name);

                        return (
                          <div
                            key={subj.name}
                            className="rounded-lg border border-border/30 bg-card/60 p-4 space-y-2.5"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{normalizeSubjectName(subj.name)}</span>
                              {status === "matched" && (
                                <Badge
                                  variant="outline"
                                  className="text-success border-success/20 bg-success/8 text-2xs px-1.5 py-0"
                                >
                                  Matched
                                </Badge>
                              )}
                              {status === "review" && (
                                <Badge
                                  variant="outline"
                                  className="text-warning border-warning/20 bg-warning/8 text-2xs px-1.5 py-0"
                                >
                                  Review
                                </Badge>
                              )}
                              {status === "new" && (
                                <Badge
                                  variant="outline"
                                  className="text-info border-info/20 bg-info/8 text-2xs px-1.5 py-0"
                                >
                                  New
                                </Badge>
                              )}
                              {status === "skip" && (
                                <Badge
                                  variant="outline"
                                  className="text-muted-foreground border-border/40 text-2xs px-1.5 py-0"
                                >
                                  Skipped
                                </Badge>
                              )}
                              <span className="text-xs text-muted-foreground ml-auto">
                                {pluralize(fileCount, "file")}
                              </span>
                            </div>

                            <Select
                              value={
                                status === "skip"
                                  ? "__skip__"
                                  : status === "new"
                                    ? "__create_new__"
                                    : mapping?.dir || "__unset__"
                              }
                              onValueChange={(val) => {
                                if (val === "__browse__") {
                                  setBrowseDirs((prev) => {
                                    const next = new Set(prev);
                                    next.add(subj.name);
                                    return next;
                                  });
                                  return;
                                }
                                setDatasetMappings((prev) => {
                                  const next = new Map(prev);
                                  if (val === "__skip__") {
                                    next.set(subj.name, { dir: "", isNew: false, status: "skip" });
                                  } else if (val === "__create_new__") {
                                    const normalized = subj.name.trim().toLowerCase().replace(/\s+/g, "_");
                                    next.set(subj.name, {
                                      dir: `${datasetsRoot}/${normalized}`,
                                      isNew: true,
                                      status: "new",
                                    });
                                  } else {
                                    next.set(subj.name, { dir: val, isNew: false, status: "matched" });
                                  }
                                  return next;
                                });
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select dataset directory..." />
                              </SelectTrigger>
                              <SelectContent className="max-h-72">
                                {suggestions.length > 0 && (
                                  <SelectGroup>
                                    <SelectLabel className="text-2xs text-muted-foreground/70">Suggestions</SelectLabel>
                                    {suggestions.slice(0, 3).map((s) => (
                                      <SelectItem
                                        key={`sug-${s.dir_name}`}
                                        value={`${datasetsRoot}/${s.dir_name}`}
                                        className="text-xs"
                                      >
                                        <span className="flex items-center gap-2">
                                          {s.dir_name}
                                          <span className="text-2xs text-muted-foreground">
                                            {s.match_type} {Math.round(s.score * 100)}%
                                          </span>
                                        </span>
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                )}
                                {showBrowse && (
                                  <SelectGroup>
                                    <SelectLabel className="text-2xs text-muted-foreground/70">
                                      All directories
                                    </SelectLabel>
                                    {allDatasetDirs.map((d) => (
                                      <SelectItem key={d} value={`${datasetsRoot}/${d}`} className="text-xs">
                                        {d}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                )}
                                <SelectGroup>
                                  {!showBrowse && (
                                    <SelectItem value="__browse__" className="text-xs text-muted-foreground italic">
                                      Browse all directories...
                                    </SelectItem>
                                  )}
                                  <SelectItem value="__create_new__" className="text-xs text-info">
                                    + Create new directory
                                  </SelectItem>
                                  <SelectItem value="__skip__" className="text-xs text-muted-foreground">
                                    Skip (no dataset link)
                                  </SelectItem>
                                </SelectGroup>
                              </SelectContent>
                            </Select>

                            {mapping?.dir && status !== "skip" && (
                              <p className="text-2xs text-muted-foreground/60 font-mono truncate mt-1">
                                {mapping.isNew ? "Will create: " : ""}
                                {mapping.dir}
                              </p>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("preview")}>
                Back
              </Button>
              <Button
                onClick={() => setStep("confirm")}
                disabled={!skipDatasets && Array.from(datasetMappings.values()).some((m) => m.status === "review")}
              >
                Continue
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "confirm" && (
          <>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Please review the following before ingesting:</p>
              <div className="rounded-lg border border-border/30 bg-muted/10 p-4 space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Project</span>
                  <span className="font-medium">{selectedProject?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Package</span>
                  <span className="font-mono-path">{packageName || "(auto)"}</span>
                </div>
                <Separator />
                <div className="space-y-1.5">
                  <span className="text-muted-foreground text-xs">Subjects</span>
                  {subjects
                    .filter((s) => s.files.some((f) => f.selected))
                    .map((s, i) => {
                      const match = findSubjectMatch(s.name);
                      const count = s.files.filter((f) => f.selected).length;
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="font-medium">{normalizeSubjectName(s.name)}</span>
                          {match.type === "exact" ? (
                            <Badge variant="outline" className="text-success border-success/20 text-2xs px-1.5 py-0">
                              Existing
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-info border-info/20 text-2xs px-1.5 py-0">
                              New
                            </Badge>
                          )}
                          <span className="text-muted-foreground ml-auto">
                            {count} {count === 1 ? "file" : "files"}
                          </span>
                        </div>
                      );
                    })}
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total files</span>
                  <span>{totalSelected}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total size</span>
                  <span>{formatBytes(totalSelectedSize)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Proxy generation</span>
                  <span>{skipProxies ? "Skipped" : "Enabled"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dataset linking</span>
                  <span>
                    {skipDatasets
                      ? "Skipped"
                      : `${Array.from(datasetMappings.values()).filter((m) => m.status !== "skip" && m.dir).length} subjects`}
                  </span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("datasets")}>
                Back
              </Button>
              <Button onClick={handleIngest} disabled={!effectiveProjectId}>
                Confirm & Ingest
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "ingesting" && (
          <div className="flex flex-col items-center justify-center py-8 gap-4 min-w-[320px]">
            {progress ? (
              <>
                <div className="w-full space-y-2">
                  <Progress value={(progress.current / progress.total) * 100} className="h-2" />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {progress.current} / {progress.total} files
                    </span>
                    <span>{progress.elapsed}s elapsed</span>
                  </div>
                </div>
                <div className="text-center space-y-0.5">
                  <p className="text-xs font-mono truncate max-w-[400px]">{progress.file}</p>
                  <p className="text-xs text-muted-foreground capitalize">{progress.step}...</p>
                </div>
              </>
            ) : (
              <div className="w-full space-y-3">
                <div className="flex items-center gap-3">
                  <Loader2 size={20} className="animate-spin text-primary shrink-0" />
                  <p className="text-sm text-muted-foreground">Preparing ingest...</p>
                </div>
                <div className="rounded-lg border border-border/30 bg-muted/10 p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Package</span>
                    <span className="font-mono-path">{packageName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subjects</span>
                    <span>{subjects.filter((s) => s.files.some((f) => f.selected)).length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Files</span>
                    <span>{totalSelected}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total size</span>
                    <span>{formatBytes(totalSelectedSize)}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground/60 text-center">Creating subjects and packages...</p>
              </div>
            )}
          </div>
        )}

        {step === "done" && result && (
          <>
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
                <Check size={20} className="text-success" />
              </div>
              <p className="text-sm font-medium">Ingest Complete</p>
              <div className="text-xs text-muted-foreground text-center space-y-0.5">
                <p>{pluralize(result.file_count, "asset")} ingested</p>
                {result.subjects_created.length > 0 && (
                  <p>
                    {pluralize(result.subjects_created.length, "new subject")} created:{" "}
                    {result.subjects_created.join(", ")}
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
