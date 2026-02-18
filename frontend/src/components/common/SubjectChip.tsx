import { cn } from "@/lib/utils";

interface SubjectChipProps {
  name: string;
  isActive?: boolean;
  onClick?: () => void;
  size?: "sm" | "md";
}

export function SubjectChip({ name, isActive = false, onClick, size = "sm" }: SubjectChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-full border font-medium transition-all duration-200 cursor-pointer",
        size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-2.5 py-1 text-xs",
        isActive
          ? "bg-primary/10 border-primary/30 text-primary"
          : "bg-transparent border-border text-muted-foreground hover:border-primary/30 hover:text-foreground",
      )}
    >
      {name}
    </button>
  );
}
