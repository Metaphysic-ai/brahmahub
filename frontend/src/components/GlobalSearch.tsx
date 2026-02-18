import { useQuery } from "@tanstack/react-query";
import { Database, Film, FolderOpen, Package, User } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useDebounce } from "@/hooks/useDebounce";
import { api } from "@/services/api";

interface SearchResults {
  projects: Array<{ id: string; name: string }>;
  subjects: Array<{ id: string; name: string; project_id: string }>;
  packages: Array<{ id: string; name: string; package_type?: string; subject_id: string }>;
  assets: Array<{ id: string; filename: string; package_id: string }>;
}

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  const debouncedQuery = useDebounce(query, 300);

  const { data: results } = useQuery<SearchResults>({
    queryKey: ["search", debouncedQuery],
    queryFn: () => api.get<SearchResults>(`/search?q=${encodeURIComponent(debouncedQuery)}`),
    enabled: open && debouncedQuery.length >= 2,
  });

  const handleSelect = (path: string) => {
    onOpenChange(false);
    setQuery("");
    navigate(path);
  };

  const hasResults =
    results && (results.projects.length || results.subjects.length || results.packages.length || results.assets.length);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) setQuery("");
        onOpenChange(isOpen);
      }}
    >
      <DialogContent className="overflow-hidden p-0 shadow-lg">
        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
        >
          <CommandInput placeholder="Search projects, subjects, assets..." value={query} onValueChange={setQuery} />
          <CommandList>
            {query.length >= 2 && !hasResults && <CommandEmpty>No results found.</CommandEmpty>}
            {results?.projects && results.projects.length > 0 && (
              <CommandGroup heading="Projects">
                {results.projects.map((p: any) => (
                  <CommandItem key={p.id} onSelect={() => handleSelect(`/projects/${p.id}`)}>
                    <FolderOpen className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>{p.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results?.subjects && results.subjects.length > 0 && (
              <CommandGroup heading="Subjects">
                {results.subjects.map((s: any) => (
                  <CommandItem key={s.id} onSelect={() => handleSelect(`/projects/${s.project_id}/subjects/${s.id}`)}>
                    <User className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>{s.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results?.packages && results.packages.length > 0 && (
              <CommandGroup heading="Packages & Datasets">
                {results.packages.map((p: any) => (
                  <CommandItem key={p.id} onSelect={() => handleSelect(`/packages/${p.id}`)}>
                    {p.package_type === "vfx" ? (
                      <Database className="mr-2 h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Package className="mr-2 h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-mono-path">{p.name}</span>
                    {p.package_type === "vfx" && (
                      <span className="ml-2 text-2xs text-warning bg-warning/10 px-1.5 py-0.5 rounded">Dataset</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results?.assets && results.assets.length > 0 && (
              <CommandGroup heading="Assets">
                {results.assets.map((a: any) => (
                  <CommandItem key={a.id} onSelect={() => handleSelect(`/packages/${a.package_id}`)}>
                    <Film className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span className="font-mono-path">{a.filename}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
