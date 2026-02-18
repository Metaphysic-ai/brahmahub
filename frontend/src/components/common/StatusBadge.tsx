import type { Package } from '@/types';
import { Badge } from '@/components/ui/badge';

const statusConfig: Record<string, { label: string; className: string; dotColor: string }> = {
  ingested: { label: 'Ingested', className: 'bg-status-ingested/10 text-status-ingested border-status-ingested/20', dotColor: 'bg-status-ingested shadow-[0_0_6px_hsl(213,60%,55%,0.5)]' },
  processing: { label: 'Processing', className: 'bg-status-processing/10 text-status-processing border-status-processing/20', dotColor: 'bg-status-processing shadow-[0_0_6px_hsl(38,80%,55%,0.5)]' },
  ready: { label: 'Ready', className: 'bg-status-ready/10 text-status-ready border-status-ready/20', dotColor: 'bg-status-ready shadow-[0_0_6px_hsl(142,55%,45%,0.5)]' },
  picked_up: { label: 'Picked up', className: 'bg-success/10 text-success border-success/20', dotColor: 'bg-success shadow-[0_0_6px_hsl(var(--success)/0.5)]' },
  error: { label: 'Error', className: 'bg-status-error/10 text-status-error border-status-error/20', dotColor: 'bg-status-error shadow-[0_0_6px_hsl(0,72%,55%,0.5)]' },
};

export function StatusBadge({ status }: { status: Package['status'] | 'picked_up' }) {
  const cfg = statusConfig[status] ?? statusConfig.ingested;
  return (
    <Badge variant="outline" className={`text-xs px-2 py-0.5 font-medium gap-1.5 ${cfg.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dotColor}`} />
      {cfg.label}
    </Badge>
  );
}
