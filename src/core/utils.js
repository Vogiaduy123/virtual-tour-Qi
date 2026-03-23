export function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}

export async function parseJsonResponse(res) {
  const raw = await res.text();
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    const snippet = String(raw || "").slice(0, 180).replace(/\s+/g, " ").trim();
    const prefix = snippet ? `: ${snippet}` : "";
    throw new Error(`Phản hồi API không hợp lệ (HTTP ${res.status})${prefix}`);
  }
}
