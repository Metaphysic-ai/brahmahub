import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface BulkActionBarProps {
  selectedCount: number;
  entityLabel?: string;
  onDelete: () => void;
  onClearSelection: () => void;
  deleteWarning?: string;
  isDeleting?: boolean;
  children?: React.ReactNode;
}

export function BulkActionBar({
  selectedCount,
  entityLabel = 'item',
  onDelete,
  onClearSelection,
  deleteWarning,
  isDeleting = false,
  children,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  const plural = selectedCount === 1 ? entityLabel : `${entityLabel}s`;
  const defaultWarning = `This will permanently delete ${selectedCount} ${plural}. This cannot be undone.`;

  return (
    <div className="bg-card border rounded-lg flex items-center gap-3 h-10 px-4 animate-fade-in-up">
      <span className="text-xs font-medium">
        {selectedCount} {plural} selected
      </span>
      <div className="h-4 w-px bg-border" />

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive">
            <Trash2 size={12} /> Delete
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedCount} {plural}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteWarning ?? defaultWarning}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {children}

      <Button variant="ghost" size="sm" className="h-7 text-xs ml-auto" onClick={onClearSelection}>
        Clear selection
      </Button>
    </div>
  );
}
