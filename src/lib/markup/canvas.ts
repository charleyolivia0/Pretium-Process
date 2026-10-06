import type { InkPath } from "./types";

export function drawPathsOnCanvas(canvas: HTMLCanvasElement, paths: InkPath[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  for (const path of paths) {
    if (path.points.length < 2) continue;
    ctx.strokeStyle = path.color;
    ctx.lineWidth = Math.max(1, path.strokeWidth);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    const p0 = path.points[0];
    ctx.moveTo(p0.x * w, p0.y * h);
    for (let i = 1; i < path.points.length; i++) {
      const p = path.points[i];
      ctx.lineTo(p.x * w, p.y * h);
    }
    ctx.stroke();
  }
}

export function normalizePointer(
  e: React.PointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const x = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
  const y = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0;
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
}
