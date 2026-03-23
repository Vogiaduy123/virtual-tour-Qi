import { radToDeg } from '../core/utils.js';

let env = {
  getCurrentRoomId: () => null,
  getScenes: () => ({}),
  getPano: () => null
};

// Compass elements
let compassContainer, compassCanvas;
let compassCtx = null;
let viewerUiAnimId = null;
let northOffset = 0;

export function initCompass(dependencies) {
  env = { ...env, ...dependencies };

  compassContainer = document.getElementById("compassContainer");
  compassCanvas = document.getElementById("compassCanvas");

  if (compassCanvas) {
    compassCtx = compassCanvas.getContext("2d");
  }
  startViewerUiLoop();
}

function startViewerUiLoop() {
  if (viewerUiAnimId) cancelAnimationFrame(viewerUiAnimId);
  const draw = () => {
    syncHotspotRollCompensation();
    drawCompass();
    viewerUiAnimId = requestAnimationFrame(draw);
  };
  viewerUiAnimId = requestAnimationFrame(draw);
}

function syncHotspotRollCompensation() {
  const currentRoomId = env.getCurrentRoomId();
  const pano = env.getPano();
  if (!pano || !currentRoomId) return;

  const scenes = env.getScenes();
  const scene = scenes[currentRoomId];
  const view = scene?.view?.();
  if (!view) return;

  const roll = typeof view.roll === "function" ? view.roll() : 0;
  const compensationDeg = Number.isFinite(roll) ? -radToDeg(roll) : 0;
  pano.style.setProperty("--hotspot-roll-compensation", `${compensationDeg}deg`);
}

function drawCompass() {
  const currentRoomId = env.getCurrentRoomId();
  if (!compassCtx || !currentRoomId) return;
  const scenes = env.getScenes();
  const scene = scenes[currentRoomId];
  if (!scene || !scene.view()) return;

  const view = scene.view();
  const yaw = view.yaw();
  const fov = view.fov();

  const ctx = compassCtx;
  const w = compassCanvas.width;
  const h = compassCanvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(cx, cy) - 6;

  ctx.clearRect(0, 0, w, h);

  // Outer ring
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.stroke();

  // Inner ring
  ctx.beginPath();
  ctx.arc(cx, cy, r - 12, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.stroke();

  // North mark 'N'
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "bold 22px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", cx, cy - r + 24);

  // FOV wedge
  const heading = yaw + northOffset;
  const start = heading - fov / 2;
  const end = heading + fov / 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r - 18, start, end);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fill();

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fill();
}
