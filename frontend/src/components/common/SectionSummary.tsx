import { Package, FileVideo, HardDrive } from 'lucide-react';
import { formatBytes, pluralize } from '@/lib/formatters';

interface SectionSummaryProps {
  packageCount?: number;
  fileCount?: number;
  totalSize?: number;
}

export function SectionSummary({ packageCount, fileCount, totalSize }: SectionSummaryProps) {
  const items: string[] = [];
  if (packageCount !== undefined) items.push(pluralize(packageCount, 'package'));
  if (fileCount !== undefined) items.push(pluralize(fileCount, 'file'));
  if (totalSize !== undefined) items.push(formatBytes(totalSize));

  if (!items.length) return null;

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
      {packageCount !== undefined && (
        <span className="flex items-center gap-1"><Package size={12} />{pluralize(packageCount, 'package')}</span>
      )}
      {fileCount !== undefined && (
        <span className="flex items-center gap-1"><FileVideo size={12} />{pluralize(fileCount, 'file')}</span>
      )}
      {totalSize !== undefined && (
        <span className="flex items-center gap-1"><HardDrive size={12} />{formatBytes(totalSize)}</span>
      )}
    </div>
  );
}
