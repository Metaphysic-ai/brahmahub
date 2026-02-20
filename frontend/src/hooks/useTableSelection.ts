import { useCallback, useEffect, useMemo, useState } from "react";

interface UseTableSelectionOptions<T extends { id: string }> {
  items: T[];
}

export function useTableSelection<T extends { id: string }>({ items }: UseTableSelectionOptions<T>) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

  useEffect(() => {
    setSelectedIds((prev) => {
      const itemIdSet = new Set(items.map((i) => i.id));
      const pruned = new Set([...prev].filter((id) => itemIdSet.has(id)));
      return pruned.size === prev.size ? prev : pruned;
    });
  }, [items]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedIds.size > 0) {
        setSelectedIds(new Set());
        setLastClickedIndex(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedIds.size]);

  const handleCheckboxChange = useCallback(
    (item: T, index: number, e: React.MouseEvent) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (e.shiftKey && lastClickedIndex !== null) {
          const start = Math.min(lastClickedIndex, index);
          const end = Math.max(lastClickedIndex, index);
          for (let i = start; i <= end; i++) {
            next.add(items[i].id);
          }
        } else {
          if (next.has(item.id)) next.delete(item.id);
          else next.add(item.id);
        }
        return next;
      });
      setLastClickedIndex(index);
    },
    [items, lastClickedIndex],
  );

  const handleSelectAll = useCallback(() => {
    setSelectedIds((prev) => (prev.size === items.length ? new Set() : new Set(items.map((i) => i.id))));
  }, [items]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setLastClickedIndex(null);
  }, []);

  const allSelected = items.length > 0 && selectedIds.size === items.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < items.length;

  const selectedItems = useMemo(() => items.filter((i) => selectedIds.has(i.id)), [items, selectedIds]);

  return {
    selectedIds,
    selectedItems,
    lastClickedIndex,
    allSelected,
    someSelected,
    handleCheckboxChange,
    handleSelectAll,
    clearSelection,
  };
}
