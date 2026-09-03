import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { getLineMap } from '../maps/line';
import { getMazeMap } from '../maps/maze';
import type { LineBitmap } from '../sim/sensors/reflectance';
import { buildWallSegments, goalCenterMm } from '../sim/maze/grid';
import { getLineRobot, getMazeRobot } from '../robots/definitions';
import { isCustomRuntimeId, resolveCustomLineMap, resolveCustomMazeMap } from '../store/customMapResolvers';
import { computeTransform, toScreen } from './transform';

/** White floor, black line — rendered as a raster image since a custom track has no vector centerline. */
function bitmapToImageBitmapCanvas(bitmap: LineBitmap): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(bitmap.width, bitmap.height);
  for (let i = 0; i < bitmap.width * bitmap.height; i++) {
    const v = 255 - bitmap.data[i];
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function Canvas2D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const mode = useStore((s) => s.mode);
  const mapId = useStore((s) => s.mapId);
  const robotId = useStore((s) => s.robotId);
  const pose = useStore((s) => s.pose);
  const trail = useStore((s) => s.trail);
  const lineTelemetry = useStore((s) => s.lineTelemetry);
  const mazeTelemetry = useStore((s) => s.mazeTelemetry);
  const showSensorOverlay = useStore((s) => s.showSensorOverlay);
  const [, forceResize] = useState(0);
  const customBitmapCanvasRef = useRef<{ mapId: string; canvas: HTMLCanvasElement } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => forceResize((n) => n + 1));
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0a0a0b';
    ctx.fillRect(0, 0, w, h);

    if (mode === 'line') {
      const robot = getLineRobot(robotId);
      const isCustom = isCustomRuntimeId(mapId);
      const builtin = isCustom ? null : getLineMap(mapId);
      const custom = isCustom ? resolveCustomLineMap(mapId) : null;
      const widthMm = builtin ? builtin.widthMm : custom!.bitmap.width * custom!.bitmap.mmPerPixel;
      const heightMm = builtin ? builtin.heightMm : custom!.bitmap.height * custom!.bitmap.mmPerPixel;
      const startPose = builtin ? builtin.startPose : custom!.startPose;
      const startRadiusMm = builtin ? builtin.startRadiusMm : custom!.startRadiusMm;
      const t = computeTransform(w, h, widthMm, heightMm);

      // Track
      if (builtin) {
        ctx.strokeStyle = '#27272a';
        ctx.lineWidth = Math.max(1, builtin.trackWidthMm * t.scale);
        ctx.lineJoin = 'round';
        ctx.beginPath();
        builtin.points.forEach((p, i) => {
          const [sx, sy] = toScreen(t, p.x, p.y);
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.closePath();
        ctx.stroke();
      } else {
        // Custom tracks have no vector centerline — render the painted
        // bitmap directly as a white-floor/black-line raster, matching a
        // real reflectance sensor's view.
        if (customBitmapCanvasRef.current?.mapId !== mapId) {
          customBitmapCanvasRef.current = { mapId, canvas: bitmapToImageBitmapCanvas(custom!.bitmap) };
        }
        const [ox, oy] = toScreen(t, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(customBitmapCanvasRef.current.canvas, ox, oy, widthMm * t.scale, heightMm * t.scale);
      }

      // Start marker
      const [ssx, ssy] = toScreen(t, startPose.x, startPose.y);
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ssx, ssy, startRadiusMm * t.scale, 0, Math.PI * 2);
      ctx.stroke();

      // Trail
      if (trail.length > 1) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        trail.forEach((p, i) => {
          const [sx, sy] = toScreen(t, p.x, p.y);
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.stroke();
      }

      // Robot footprint + heading
      const [rx, ry] = toScreen(t, pose.x, pose.y);
      const bodyR = Math.max(4, robot.wheelBase * 0.55 * t.scale);
      ctx.fillStyle = robot.color;
      ctx.beginPath();
      ctx.arc(rx, ry, bodyR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e5e5e5';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + Math.cos(pose.theta) * bodyR * 1.8, ry + Math.sin(pose.theta) * bodyR * 1.8);
      ctx.stroke();

      // Sensors
      if (showSensorOverlay && lineTelemetry) {
        const fx = Math.cos(pose.theta);
        const fy = Math.sin(pose.theta);
        const px = -fy;
        const py = fx;
        const originX = pose.x + fx * robot.sensorForwardOffset;
        const originY = pose.y + fy * robot.sensorForwardOffset;
        const mid = (robot.sensorCount - 1) / 2;
        lineTelemetry.sensors.forEach((v, i) => {
          const offset = (i - mid) * robot.sensorSpacing;
          const sx = originX + px * offset;
          const sy = originY + py * offset;
          const [scx, scy] = toScreen(t, sx, sy);
          const shade = Math.round(255 - v * 255);
          ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(scx, scy, Math.max(2, 5 * t.scale * 4), 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      }
    } else {
      const map = isCustomRuntimeId(mapId) ? resolveCustomMazeMap(mapId) : getMazeMap(mapId);
      const robot = getMazeRobot(robotId);
      const worldW = map.cols * map.cellSize;
      const worldH = map.rows * map.cellSize;
      const t = computeTransform(w, h, worldW, worldH);

      // Floor grid
      ctx.strokeStyle = '#18181b';
      ctx.lineWidth = 1;
      for (let c = 0; c <= map.cols; c++) {
        const [x1, y1] = toScreen(t, c * map.cellSize, 0);
        const [x2, y2] = toScreen(t, c * map.cellSize, worldH);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      for (let r = 0; r <= map.rows; r++) {
        const [x1, y1] = toScreen(t, 0, r * map.cellSize);
        const [x2, y2] = toScreen(t, worldW, r * map.cellSize);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // Walls
      const segments = buildWallSegments(map);
      ctx.strokeStyle = '#e4e4e7';
      ctx.lineWidth = Math.max(2, map.wallThickness * t.scale);
      ctx.lineCap = 'square';
      for (const seg of segments) {
        const [x1, y1] = toScreen(t, seg.x1, seg.y1);
        const [x2, y2] = toScreen(t, seg.x2, seg.y2);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // Start / goal markers
      const startCenter = toScreen(t, (map.start.col + 0.5) * map.cellSize, (map.start.row + 0.5) * map.cellSize);
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(startCenter[0], startCenter[1], map.cellSize * t.scale * 0.15, 0, Math.PI * 2);
      ctx.fill();
      const goalMm = goalCenterMm(map.goal, map.cellSize);
      const goalCenter = toScreen(t, goalMm.x, goalMm.y);
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(goalCenter[0], goalCenter[1], map.cellSize * t.scale * 0.15 * Math.max(map.goal.width, map.goal.height), 0, Math.PI * 2);
      ctx.fill();

      // Trail
      if (trail.length > 1) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        trail.forEach((p, i) => {
          const [sx, sy] = toScreen(t, p.x, p.y);
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.stroke();
      }

      // Robot
      const [rx, ry] = toScreen(t, pose.x, pose.y);
      const bodyR = Math.max(4, robot.wheelBase * 0.6 * t.scale);
      ctx.fillStyle = robot.color;
      ctx.beginPath();
      ctx.arc(rx, ry, bodyR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e5e5e5';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + Math.cos(pose.theta) * bodyR * 1.8, ry + Math.sin(pose.theta) * bodyR * 1.8);
      ctx.stroke();

      // Raycast sensor lines
      if (showSensorOverlay && mazeTelemetry) {
        const bearings: [number, number][] = [
          [pose.theta, mazeTelemetry.sensors.front],
          [pose.theta - Math.PI / 2, mazeTelemetry.sensors.left],
          [pose.theta + Math.PI / 2, mazeTelemetry.sensors.right],
        ];
        ctx.strokeStyle = '#f472b6';
        ctx.lineWidth = 1.5;
        for (const [angle, dist] of bearings) {
          const hx = pose.x + Math.cos(angle) * dist;
          const hy = pose.y + Math.sin(angle) * dist;
          const [hx2, hy2] = toScreen(t, hx, hy);
          ctx.beginPath();
          ctx.moveTo(rx, ry);
          ctx.lineTo(hx2, hy2);
          ctx.stroke();
          ctx.fillStyle = '#f472b6';
          ctx.beginPath();
          ctx.arc(hx2, hy2, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  });

  return (
    <div ref={containerRef} className="h-full w-full">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
