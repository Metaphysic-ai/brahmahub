import { useRef, useEffect, useCallback, useMemo } from 'react';

const BIN_SIZE = 10;
const COLS = 18; // -90 to 80 in steps of 10
const ROWS = 18; // -90 to 80 in steps of 10
const YAW_MIN = -90;
const PITCH_MIN = -90;
const PITCH_MAX = 80; // top row = 80..90
const LABEL_W = 36; // left margin for pitch labels
const LABEL_H = 20; // bottom margin for yaw labels

interface PoseMatrixProps {
  poseData: Array<{ y: number; p: number; count?: number }>;
  selectedBins: Set<string>;
  onSelectionChange: (bins: Set<string>) => void;
  className?: string;
}

export function PoseMatrix({ poseData, selectedBins, onSelectionChange, className }: PoseMatrixProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { bins, maxCount } = useMemo(() => {
    const m = new Map<string, number>();

    for (const d of poseData) {
      const yBin = Math.floor(d.y / BIN_SIZE) * BIN_SIZE;
      const pBin = Math.floor(d.p / BIN_SIZE) * BIN_SIZE;
      const key = `${yBin}:${pBin}`;
      m.set(key, (m.get(key) ?? 0) + (d.count ?? 1));
    }

    let mc = 0;
    for (const c of m.values()) if (c > mc) mc = c;

    return { bins: m, maxCount: mc };
  }, [poseData]);

  const draw = useCallback((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const containerWidth = containerRef.current?.clientWidth ?? 600;
    const cellW = Math.min(28, Math.max(12, Math.floor((containerWidth - LABEL_W) / COLS)));
    const cellH = cellW; // square cells
    const w = COLS * cellW + LABEL_W;
    const h = ROWS * cellH + LABEL_H;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, w, h);

    const hasSelection = selectedBins.size > 0;
    const logMax = Math.log(maxCount + 1);

    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS; row++) {
        const yaw = YAW_MIN + col * BIN_SIZE;
        const pitch = PITCH_MAX - row * BIN_SIZE; // top = high pitch
        const key = `${yaw}:${pitch}`;
        const count = bins.get(key);
        const x = LABEL_W + col * cellW;
        const y = row * cellH;

        if (count) {
          const norm = Math.log(count + 1) / logMax;
          // Purple (270°) → Cyan (180°), lightness 15% → 75%
          const hue = 270 - norm * 90;
          const lightness = 15 + norm * 60;
          const dimmed = hasSelection && !selectedBins.has(key);

          ctx.fillStyle = `hsl(${hue}, 70%, ${lightness}%)`;
          ctx.globalAlpha = dimmed ? 0.3 : 1;
          ctx.fillRect(x, y, cellW, cellH);
          ctx.globalAlpha = 1;

          if (cellW >= 16) {
            ctx.fillStyle = dimmed ? 'rgba(255,255,255,0.3)' : '#fff';
            ctx.font = `${count >= 1000 ? 7 : cellW <= 18 ? 8 : 9}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(count), x + cellW / 2, y + cellH / 2);
          }

          if (selectedBins.has(key)) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);
          }
        }

        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, cellW, cellH);
      }
    }

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let col = 0; col <= COLS; col += 3) {
      const yaw = YAW_MIN + col * BIN_SIZE;
      const x = LABEL_W + col * cellW;
      ctx.fillText(`${yaw}°`, x, ROWS * cellH + 4);
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let row = 0; row < ROWS; row += 3) {
      const pitch = PITCH_MAX - row * BIN_SIZE;
      const y = row * cellH + cellH / 2;
      ctx.fillText(`${pitch}°`, LABEL_W - 4, y);
    }
  }, [bins, maxCount, selectedBins]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) draw(canvas);
  }, [draw]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ro = new ResizeObserver(() => draw(canvas));
    ro.observe(container);
    return () => ro.disconnect();
  }, [draw]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / (window.devicePixelRatio || 1) / rect.width;
    const scaleY = canvas.height / (window.devicePixelRatio || 1) / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    const containerWidth = containerRef.current?.clientWidth ?? 600;
    const cellW = Math.min(28, Math.max(12, Math.floor((containerWidth - LABEL_W) / COLS)));
    const cellH = cellW;

    const gridX = mx - LABEL_W;
    const gridY = my;

    if (gridX < 0 || gridX >= COLS * cellW || gridY < 0 || gridY >= ROWS * cellH) {
      if (selectedBins.size > 0) onSelectionChange(new Set());
      return;
    }

    const col = Math.floor(gridX / cellW);
    const row = Math.floor(gridY / cellH);
    const yaw = YAW_MIN + col * BIN_SIZE;
    const pitch = PITCH_MAX - row * BIN_SIZE;
    const key = `${yaw}:${pitch}`;

    if (!bins.has(key)) return;

    const next = new Set(selectedBins);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onSelectionChange(next);
  }, [bins, selectedBins, onSelectionChange]);

  return (
    <div ref={containerRef} className={className}>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className="cursor-pointer rounded"
        style={{ display: 'block', maxWidth: '100%' }}
      />
    </div>
  );
}
