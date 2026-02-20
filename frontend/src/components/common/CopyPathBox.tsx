import { Check, Copy, Server } from "lucide-react";
import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { displayPath, toDgxPath } from "@/lib/paths";

interface CopyPathBoxProps {
  label: string;
  path: string;
}

export function CopyPathBox({ label, path }: CopyPathBoxProps) {
  const [copied, setCopied] = useState<"path" | "dgx" | null>(null);
  const { toast } = useToast();

  const shown = displayPath(path);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shown);
    setCopied("path");
    toast({ title: "Path copied", description: shown, duration: 2000 });
    setTimeout(() => setCopied(null), 2000);
  };

  const handleCopyDgx = async () => {
    const dgx = toDgxPath(path);
    await navigator.clipboard.writeText(dgx);
    setCopied("dgx");
    toast({ title: "DGX path copied", description: dgx, duration: 2000 });
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div>
      <p className="text-xs text-muted-foreground/70 mb-1">{label}</p>
      <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/50 p-2 group">
        <Tooltip>
          <TooltipTrigger asChild>
            <code className="font-mono-path flex-1 truncate text-foreground/80 cursor-default">{shown}</code>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-lg break-all font-mono-path text-xs">
            {shown}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleCopy}
              className="shrink-0 text-muted-foreground/50 hover:text-foreground transition-colors duration-200"
            >
              {copied === "path" ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Copy path
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleCopyDgx}
              className="shrink-0 text-muted-foreground/50 hover:text-foreground transition-colors duration-200"
            >
              {copied === "dgx" ? <Check size={14} /> : <Server size={14} />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Copy as DGX path
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
