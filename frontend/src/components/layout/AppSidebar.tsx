import {
  Database,
  FolderOpen,
  LayoutDashboard,
  Package,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { useState } from "react";
import { AddPackageDialog } from "@/components/AddPackageDialog";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function AppSidebar({ onOpenSearch }: { onOpenSearch?: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const [ingestOpen, setIngestOpen] = useState(false);
  const [datasetOpen, setDatasetOpen] = useState(false);

  return (
    <aside
      className={`flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200 ${
        collapsed ? "w-14" : "w-52"
      }`}
    >
      <div className="flex items-center gap-2 px-3 h-12 border-b border-sidebar-border">
        {!collapsed && (
          <span className="text-sm font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
            IngestHub
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 ml-auto text-sidebar-foreground hover:text-sidebar-primary-foreground"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
        </Button>
      </div>

      <div className="px-2 pt-3 pb-1">
        {collapsed ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-sidebar-foreground hover:text-sidebar-primary-foreground"
            onClick={onOpenSearch}
          >
            <Search size={16} />
          </Button>
        ) : (
          <button
            onClick={onOpenSearch}
            className="w-full flex items-center gap-2 rounded-lg border border-sidebar-border/60 bg-sidebar-accent/20 px-2.5 py-2 text-xs text-muted-foreground hover:text-sidebar-primary-foreground hover:border-sidebar-border transition-all duration-200"
          >
            <Search size={14} className="opacity-50" />
            <span className="flex-1 text-left">Search...</span>
            <kbd className="text-2xs bg-sidebar-accent/60 px-1.5 py-0.5 rounded-md font-mono">⌘K</kbd>
          </button>
        )}
      </div>

      <div className="px-2 py-1">
        <div className="h-px bg-sidebar-border/40" />
      </div>

      <nav className="flex-1 flex flex-col gap-0.5 px-2 pt-1">
        <NavLink
          to="/"
          end
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-all duration-200"
          activeClassName="bg-sidebar-accent text-sidebar-primary-foreground font-medium shadow-[0_0_8px_hsl(213,60%,50%,0.15)]"
        >
          <LayoutDashboard size={16} />
          {!collapsed && <span>Dashboard</span>}
        </NavLink>
        <NavLink
          to="/projects"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-all duration-200"
          activeClassName="bg-sidebar-accent text-sidebar-primary-foreground font-medium shadow-[0_0_8px_hsl(213,60%,50%,0.15)]"
        >
          <FolderOpen size={16} />
          {!collapsed && <span>Projects</span>}
        </NavLink>
        <NavLink
          to="/subjects"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-all duration-200"
          activeClassName="bg-sidebar-accent text-sidebar-primary-foreground font-medium shadow-[0_0_8px_hsl(213,60%,50%,0.15)]"
        >
          <Users size={16} />
          {!collapsed && <span>Subjects</span>}
        </NavLink>
        <NavLink
          to="/packages"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-all duration-200"
          activeClassName="bg-sidebar-accent text-sidebar-primary-foreground font-medium shadow-[0_0_8px_hsl(213,60%,50%,0.15)]"
        >
          <Package size={16} />
          {!collapsed && <span>Packages</span>}
        </NavLink>
        <NavLink
          to="/datasets"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-all duration-200"
          activeClassName="bg-sidebar-accent text-sidebar-primary-foreground font-medium shadow-[0_0_8px_hsl(213,60%,50%,0.15)]"
        >
          <Database size={16} />
          {!collapsed && <span>Datasets</span>}
        </NavLink>
      </nav>

      <div className="px-2 pb-1">
        <div className="h-px bg-sidebar-border/40 mb-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setIngestOpen(true)}
              className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-all duration-200 ${
                collapsed ? "justify-center" : ""
              }`}
            >
              <Plus size={16} />
              {!collapsed && <span>Add Package</span>}
            </button>
          </TooltipTrigger>
          {collapsed && <TooltipContent side="right">Add Package</TooltipContent>}
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setDatasetOpen(true)}
              className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-all duration-200 ${
                collapsed ? "justify-center" : ""
              }`}
            >
              <Database size={16} />
              {!collapsed && <span>Add Dataset</span>}
            </button>
          </TooltipTrigger>
          {collapsed && <TooltipContent side="right">Add Dataset</TooltipContent>}
        </Tooltip>
      </div>

      <div className="border-t border-sidebar-border/40 px-3 py-2.5 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-status-ready shrink-0" />
        {!collapsed && <span className="text-2xs text-sidebar-foreground/40">v0.1.0-dev</span>}
      </div>

      <AddPackageDialog open={ingestOpen} onOpenChange={setIngestOpen} forcedPackageType="atman" />
      <AddPackageDialog open={datasetOpen} onOpenChange={setDatasetOpen} forcedPackageType="vfx" />
    </aside>
  );
}
