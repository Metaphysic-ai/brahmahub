import { X } from "lucide-react";
import { getTagColor } from "@/lib/tagColors";

interface TagChipProps {
  tag: string;
  onRemove?: () => void;
  size?: "sm" | "md";
}

export function TagChip({ tag, onRemove, size = "sm" }: TagChipProps) {
  const { bg, text } = getTagColor(tag);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg border font-medium transition-all duration-200 hover:brightness-110 ${
        size === "sm" ? "text-xs px-2 py-0.5" : "text-xs px-2.5 py-1"
      }`}
      style={{ backgroundColor: bg, color: text, borderColor: `${text}22` }}
    >
      {tag}
      {onRemove && (
        <button onClick={onRemove} className="hover:opacity-70 -mr-0.5 transition-opacity duration-150">
          <X size={10} />
        </button>
      )}
    </span>
  );
}
