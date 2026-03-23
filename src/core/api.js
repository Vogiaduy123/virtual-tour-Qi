import { parseJsonResponse } from './utils.js';

export async function fetchRooms() {
  const res = await fetch("/api/rooms");
  return parseJsonResponse(res);
}

export async function fetchMinimap() {
  const res = await fetch("/api/admin/minimap");
  return parseJsonResponse(res);
}

export async function fetchSensors() {
  const res = await fetch("/api/sensors");
  return parseJsonResponse(res);
}
