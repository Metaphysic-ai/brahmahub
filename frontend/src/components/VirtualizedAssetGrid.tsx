import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Asset } from "@/types";

interface VirtualizedAssetGridProps {
  assets: Asset[];
  totalCount: number;
  colCount: number;
  gridClassName: string;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  selectedAssetIndex: number | null;
  selectedAssetIds: Set<string>;
  onAssetClick: (index: number) => void;
  onCheckboxChange: (asset: Asset, index: number, e: React.MouseEvent) => void;
  renderItem: (props: {
    asset: Asset;
    index: number;
    isActive: boolean;
    isSelected: boolean;
    showCheckbox: boolean;
    onClick: () => void;
    onCheckboxChange: (e: React.MouseEvent) => void;
  }) => React.ReactNode;
}

export function VirtualizedAssetGrid({
  assets,
  totalCount,
  colCount,
  gridClassName,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  selectedAssetIndex,
  selectedAssetIds,
  onAssetClick,
  onCheckboxChange,
  renderItem,
}: VirtualizedAssetGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowCount = Math.ceil(assets.length / colCount);

  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const estimateRowHeight = useCallback(() => {
    const w = containerWidth || 800;
    // aspect-video = 9/16 ratio, plus filename label (~20px) + gap (6px)
    const itemWidth = (w - (colCount - 1) * 12) / colCount;
    return Math.round(itemWidth * (9 / 16)) + 26;
  }, [colCount, containerWidth]);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: estimateRowHeight,
    overscan: 5,
  });

  useEffect(() => {
    if (containerWidth > 0) {
      virtualizer.measure();
    }
  }, [containerWidth, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();
  useEffect(() => {
    if (virtualItems.length === 0) return;
    const lastRow = virtualItems[virtualItems.length - 1];
    if (lastRow.index >= rowCount - 3 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [virtualItems, rowCount, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const showCheckbox = selectedAssetIds.size > 0;

  return (
    <div ref={scrollRef} className="overflow-y-auto" style={{ height: "calc(100vh - 280px)", minHeight: 300 }}>
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {virtualItems.map((virtualRow) => {
          const rowStartIdx = virtualRow.index * colCount;
          return (
            <div
              key={virtualRow.index}
              className={`grid ${gridClassName} gap-3`}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {Array.from({ length: colCount }).map((_, col) => {
                const idx = rowStartIdx + col;
                const asset = assets[idx];
                if (!asset) return <div key={col} />;
                return (
                  <div key={asset.id}>
                    {renderItem({
                      asset,
                      index: idx,
                      isActive: selectedAssetIndex === idx,
                      isSelected: selectedAssetIds.has(asset.id),
                      showCheckbox,
                      onClick: () => onAssetClick(idx),
                      onCheckboxChange: (e) => onCheckboxChange(asset, idx, e),
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {isFetchingNextPage && (
        <div className={`grid ${gridClassName} gap-3 py-3`}>
          {Array.from({ length: colCount }).map((_, i) => (
            <Skeleton key={i} className="aspect-video rounded-lg" />
          ))}
        </div>
      )}
      {!isFetchingNextPage && assets.length < totalCount && (
        <p className="text-center text-xs text-muted-foreground/50 py-4">
          Showing {assets.length.toLocaleString()} of {totalCount.toLocaleString()} assets
        </p>
      )}
      {assets.length >= totalCount && assets.length > 0 && (
        <p className="text-center text-xs text-muted-foreground/50 py-4">{totalCount.toLocaleString()} assets</p>
      )}
    </div>
  );
}
