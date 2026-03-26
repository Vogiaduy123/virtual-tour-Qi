import { degToRad, radToDeg, parseJsonResponse } from '../core/utils.js';

let env = {
  getCurrentRoomId: () => null,
  getRoomsData: () => ({}),
  getScene: (id) => null,
  getPano: () => null,
  addHotspots: (id) => { }
};

// Mail state
let pendingMailPlacement = null;
let activeMailHotspotIndex = -1;
let isMailDragActive = false;

// Mail DOM elements
let mailToolbox, mailDragIcon, mailComposerPanel, mailComposerTitle, mailComposerClose,
  mailPointTitle, mailRecipientSelect, mailRecipientInput, mailSubjectInput,
  mailBodyInput, mailComposerStatus, mailSaveBtn, mailSendBtn, mailDeleteBtn;

export function initMailFeature(dependencies) {
  env = { ...env, ...dependencies };

  const pano = env.getPano();

  // Initialize DOM elements
  mailToolbox = document.getElementById("mailToolbox");
  mailDragIcon = document.getElementById("mailDragIcon");
  mailComposerPanel = document.getElementById("mailComposerPanel");
  mailComposerTitle = document.getElementById("mailComposerTitle");
  mailComposerClose = document.getElementById("mailComposerClose");
  mailPointTitle = document.getElementById("mailPointTitle");
  mailRecipientSelect = document.getElementById("mailRecipientSelect");
  mailRecipientInput = document.getElementById("mailRecipientInput");
  mailSubjectInput = document.getElementById("mailSubjectInput");
  mailBodyInput = document.getElementById("mailBodyInput");
  mailComposerStatus = document.getElementById("mailComposerStatus");
  mailSaveBtn = document.getElementById("mailSaveBtn");
  mailSendBtn = document.getElementById("mailSendBtn");
  mailDeleteBtn = document.getElementById("mailDeleteBtn");

  if (!pano || !mailDragIcon) return;

  mailDragIcon.addEventListener("dragstart", (event) => {
    isMailDragActive = true;
    event.dataTransfer?.setData("text/plain", "mail-hotspot");
    event.dataTransfer.effectAllowed = "copy";
  });

  mailDragIcon.addEventListener("dragend", () => {
    isMailDragActive = false;
    pano.classList.remove("mail-drop-target");
  });

  mailDragIcon.addEventListener("click", () => {
    const currentRoomId = env.getCurrentRoomId();
    if (!currentRoomId) return;

    const scene = env.getScene(currentRoomId);
    const view = scene?.view?.();
    if (view && Number.isFinite(view.yaw()) && Number.isFinite(view.pitch())) {
      pendingMailPlacement = {
        yaw: radToDeg(view.yaw()),
        pitch: -radToDeg(view.pitch()),
        screenX: 0.5,
        screenY: 0.5
      };
    } else {
      pendingMailPlacement = { screenX: 0.5, screenY: 0.5 };
    }

    activeMailHotspotIndex = -1;
    openMailComposer(-1, null);
    setMailComposerStatus("Đã chọn vị trí tạo mail tại tâm góc nhìn hiện tại.");
  });

  pano.addEventListener("dragover", (event) => {
    if (!isMailDragActive) return;
    event.preventDefault();
    pano.classList.add("mail-drop-target");
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  });

  pano.addEventListener("dragleave", () => {
    pano.classList.remove("mail-drop-target");
  });

  pano.addEventListener("drop", (event) => {
    const currentRoomId = env.getCurrentRoomId();
    if (!isMailDragActive || !currentRoomId) return;

    event.preventDefault();
    pano.classList.remove("mail-drop-target");
    isMailDragActive = false;

    const placement = screenToMailCoordinates(event.clientX, event.clientY);
    if (!placement) return;

    pendingMailPlacement = placement;
    activeMailHotspotIndex = -1;
    openMailComposer(-1, null);
  });

  if (mailComposerClose) {
    mailComposerClose.addEventListener("click", closeMailComposer);
  }

  if (mailRecipientSelect) {
    mailRecipientSelect.addEventListener("change", () => {
      if (mailRecipientSelect.value) {
        mailRecipientInput.value = mailRecipientSelect.value;
      }
    });
  }

  if (mailSaveBtn) {
    mailSaveBtn.addEventListener("click", saveMailHotspot);
  }

  if (mailDeleteBtn) {
    mailDeleteBtn.addEventListener("click", deleteMailHotspot);
  }

  if (mailSendBtn) {
    mailSendBtn.addEventListener("click", sendMailFromComposer);
  }
}

function getCurrentMailHotspots() {
  const currentRoomId = env.getCurrentRoomId();
  const roomsData = env.getRoomsData();
  return roomsData[currentRoomId]?.mailHotspots || [];
}

function setMailComposerStatus(message, isError = false) {
  if (!mailComposerStatus) return;
  mailComposerStatus.textContent = message || "";
  mailComposerStatus.style.color = isError ? "#ff8f8f" : "#9ac7ff";
}

function refreshRecipientOptions(selected = "") {
  if (!mailRecipientSelect) return;

  const hotspots = getCurrentMailHotspots();
  const uniqueRecipients = [...new Set(hotspots.map(h => (h.recipient || "").trim()).filter(Boolean))];
  mailRecipientSelect.innerHTML = '<option value="">-- Chọn hoặc nhập mới --</option>';

  uniqueRecipients.forEach((recipient) => {
    const option = document.createElement("option");
    option.value = recipient;
    option.textContent = recipient;
    if (selected && selected === recipient) option.selected = true;
    mailRecipientSelect.appendChild(option);
  });
}

export function openMailComposer(index = -1, mailPoint = null) {
  if (!mailComposerPanel) return;

  activeMailHotspotIndex = index;
  const editing = index >= 0;

  if (mailComposerTitle) {
    mailComposerTitle.textContent = editing ? "✉️ Chỉnh sửa điểm mail" : "✉️ Tạo điểm mail mới";
  }

  const selectedPoint = mailPoint || (editing ? getCurrentMailHotspots()[index] : null) || {};

  if (mailPointTitle) mailPointTitle.value = selectedPoint.title || "";
  if (mailRecipientInput) mailRecipientInput.value = selectedPoint.recipient || "";
  if (mailSubjectInput) mailSubjectInput.value = selectedPoint.subject || "";
  if (mailBodyInput) mailBodyInput.value = selectedPoint.body || "";

  refreshRecipientOptions(selectedPoint.recipient || "");
  setMailComposerStatus(editing ? "Bạn có thể chỉnh sửa hoặc gửi mail ngay." : "Nhập thông tin rồi nhấn Lưu để tạo điểm mail.");

  if (mailDeleteBtn) {
    mailDeleteBtn.style.display = editing ? "inline-block" : "none";
  }

  mailComposerPanel.classList.remove("hidden");
}

export function closeMailComposer() {
  if (!mailComposerPanel) return;
  mailComposerPanel.classList.add("hidden");
  setMailComposerStatus("");
  pendingMailPlacement = null;
  activeMailHotspotIndex = -1;
}

export function clearFixedMailHotspots() {
  const pano = env.getPano();
  if (!pano) return;
  pano.querySelectorAll(".mail-fixed-hotspot").forEach((element) => element.remove());
}

export function resolveFixedMailPoint(mailPoint, sceneOverride = null) {
  const normalized = { ...(mailPoint || {}) };
  const pano = env.getPano();
  const currentRoomId = env.getCurrentRoomId();

  const hasScreenCoords = Number.isFinite(Number(normalized.screenX)) && Number.isFinite(Number(normalized.screenY));
  if (hasScreenCoords) {
    normalized.screenX = Math.max(0, Math.min(1, Number(normalized.screenX)));
    normalized.screenY = Math.max(0, Math.min(1, Number(normalized.screenY)));
    return normalized;
  }

  if (!pano) {
    normalized.screenX = 0.5;
    normalized.screenY = 0.5;
    return normalized;
  }

  const scene = sceneOverride || env.getScene(currentRoomId);
  const view = scene?.view?.();
  const rect = pano.getBoundingClientRect();

  if (!view || !rect.width || !rect.height || typeof view.coordinatesToScreen !== "function") {
    normalized.screenX = 0.5;
    normalized.screenY = 0.5;
    return normalized;
  }

  if (!Number.isFinite(Number(normalized.yaw)) || !Number.isFinite(Number(normalized.pitch))) {
    normalized.screenX = 0.5;
    normalized.screenY = 0.5;
    return normalized;
  }

  const projected = view.coordinatesToScreen({
    yaw: degToRad(Number(normalized.yaw)),
    pitch: degToRad(-Number(normalized.pitch))
  });

  if (!projected || !Number.isFinite(projected.x) || !Number.isFinite(projected.y)) {
    normalized.screenX = 0.5;
    normalized.screenY = 0.5;
    return normalized;
  }

  const center = view.coordinatesToScreen({ yaw: view.yaw(), pitch: view.pitch() });
  const isCenterOrigin = center && Number.isFinite(center.x) && Number.isFinite(center.y)
    ? Math.abs(center.x) < 5 && Math.abs(center.y) < 5
    : false;

  const candidateScales = [1];
  const dpr = window.devicePixelRatio || 1;
  if (Math.abs(dpr - 1) > 0.01) {
    candidateScales.push(dpr);
  }

  let best = null;
  for (const scale of candidateScales) {
    const x = isCenterOrigin
      ? projected.x / scale + rect.width / 2
      : projected.x / scale;
    const y = isCenterOrigin
      ? projected.y / scale + rect.height / 2
      : projected.y / scale;

    const overflowX = Math.max(0, -x) + Math.max(0, x - rect.width);
    const overflowY = Math.max(0, -y) + Math.max(0, y - rect.height);
    const score = overflowX + overflowY;

    const candidate = { x, y, score };
    if (!best || candidate.score < best.score) {
      best = candidate;
    }
  }

  const finalX = best ? best.x : rect.width / 2;
  const finalY = best ? best.y : rect.height / 2;

  normalized.screenX = Math.max(0, Math.min(1, finalX / rect.width));
  normalized.screenY = Math.max(0, Math.min(1, finalY / rect.height));
  return normalized;
}

export function projectMailScreenPointToPanorama(pixelX, pixelY, sceneOverride = null) {
  const pano = env.getPano();
  if (!pano) return null;

  const currentRoomId = env.getCurrentRoomId();
  const scene = sceneOverride || env.getScene(currentRoomId);
  const view = scene?.view?.();
  if (!view || typeof view.screenToCoordinates !== "function") {
    return null;
  }

  const rect = pano.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }

  const targetX = Math.max(0, Math.min(rect.width, Number(pixelX)));
  const targetY = Math.max(0, Math.min(rect.height, Number(pixelY)));

  const scales = [1];
  const dpr = window.devicePixelRatio || 1;
  if (Math.abs(dpr - 1) > 0.01) {
    scales.push(dpr);
  }

  const centerProjected = typeof view.coordinatesToScreen === "function"
    ? view.coordinatesToScreen({ yaw: view.yaw(), pitch: view.pitch() })
    : null;

  const isCenterOrigin = centerProjected && Number.isFinite(centerProjected.x) && Number.isFinite(centerProjected.y)
    ? Math.abs(centerProjected.x) < 5 && Math.abs(centerProjected.y) < 5
    : true;

  let best = null;

  for (const scale of scales) {
    const inputCandidates = [
      { x: (targetX - rect.width / 2) * scale, y: (targetY - rect.height / 2) * scale },
      { x: targetX * scale, y: targetY * scale }
    ];

    for (const input of inputCandidates) {
      const coords = view.screenToCoordinates(input);
      if (!coords) continue;
      if (!Number.isFinite(coords.yaw) || !Number.isFinite(coords.pitch)) continue;

      let error = 0;
      if (typeof view.coordinatesToScreen === "function") {
        const projected = view.coordinatesToScreen({ yaw: coords.yaw, pitch: coords.pitch });
        if (projected && Number.isFinite(projected.x) && Number.isFinite(projected.y)) {
          const cssX = isCenterOrigin
            ? projected.x / scale + rect.width / 2
            : projected.x / scale;
          const cssY = isCenterOrigin
            ? projected.y / scale + rect.height / 2
            : projected.y / scale;
          error = Math.hypot(cssX - targetX, cssY - targetY);
        } else {
          error = Number.POSITIVE_INFINITY;
        }
      }

      const candidate = {
        yaw: radToDeg(coords.yaw),
        pitch: -radToDeg(coords.pitch),
        screenX: Math.max(0, Math.min(1, targetX / rect.width)),
        screenY: Math.max(0, Math.min(1, targetY / rect.height)),
        error
      };

      if (!best || candidate.error < best.error) {
        best = candidate;
      }
    }
  }

  if (!best) return null;

  return {
    yaw: best.yaw,
    pitch: best.pitch,
    screenX: best.screenX,
    screenY: best.screenY
  };
}

export function resolveMailPointToPanorama(mailPoint, sceneOverride = null) {
  const source = mailPoint || {};
  if (Number.isFinite(Number(source.yaw)) && Number.isFinite(Number(source.pitch))) {
    return {
      yaw: Number(source.yaw),
      pitch: Number(source.pitch)
    };
  }

  const screenX = Number(source.screenX);
  const screenY = Number(source.screenY);
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) {
    return null;
  }

  const pano = env.getPano();
  if (!pano) return null;
  const rect = pano.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }

  const px = Math.max(0, Math.min(1, screenX)) * rect.width;
  const py = Math.max(0, Math.min(1, screenY)) * rect.height;
  const projected = projectMailScreenPointToPanorama(px, py, sceneOverride);
  if (projected) {
    return {
      yaw: projected.yaw,
      pitch: projected.pitch
    };
  }

  return null;
}

export function createFixedMailHotspot(index, mailPoint) {
  const pano = env.getPano();
  if (!pano) return;

  const el = document.createElement("button");
  el.type = "button";
  el.className = "mail-hotspot mail-fixed-hotspot";
  el.title = mailPoint.title || "Điểm gửi mail";
  el.textContent = "✉️";
  el.style.left = `${Math.max(0, Math.min(1, Number(mailPoint.screenX))) * 100}%`;
  el.style.top = `${Math.max(0, Math.min(1, Number(mailPoint.screenY))) * 100}%`;

  el.onclick = (event) => {
    event.stopPropagation();
    openMailComposer(index, mailPoint);
  };

  pano.appendChild(el);
}

export function createPanoramaMailHotspot(container, index, mailPoint) {
  if (!container) return;

  const el = document.createElement("button");
  el.type = "button";
  el.className = "mail-hotspot";
  el.title = mailPoint.title || "Điểm gửi mail";
  el.textContent = "✉️";

  el.onclick = (event) => {
    event.stopPropagation();
    openMailComposer(index, mailPoint);
  };

  container.createHotspot(el, {
    yaw: degToRad(Number(mailPoint.yaw)),
    pitch: degToRad(-Number(mailPoint.pitch))
  });
}

function screenToMailCoordinates(clientX, clientY) {
  const currentRoomId = env.getCurrentRoomId();
  const pano = env.getPano();
  if (!currentRoomId || !pano) return null;

  const rect = pano.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const relativeX = clientX - rect.left;
  const relativeY = clientY - rect.top;

  const projected = projectMailScreenPointToPanorama(relativeX, relativeY);
  if (projected) {
    return projected;
  }

  const scene = env.getScene(currentRoomId);
  const view = scene?.view?.();
  if (!view || !Number.isFinite(view.yaw()) || !Number.isFinite(view.pitch())) {
    return null;
  }

  return {
    yaw: radToDeg(view.yaw()),
    pitch: -radToDeg(view.pitch()),
    screenX: Math.max(0, Math.min(1, relativeX / rect.width)),
    screenY: Math.max(0, Math.min(1, relativeY / rect.height))
  };
}

async function saveMailHotspot() {
  const currentRoomId = env.getCurrentRoomId();
  if (!currentRoomId) return;

  const payload = {
    title: mailPointTitle?.value?.trim() || "Gửi mail",
    recipient: mailRecipientInput?.value?.trim() || "",
    subject: mailSubjectInput?.value?.trim() || "",
    body: mailBodyInput?.value?.trim() || ""
  };

  if (activeMailHotspotIndex >= 0) {
    const current = getCurrentMailHotspots()[activeMailHotspotIndex];
    if (!current) return;

    const resolvedPoint = resolveMailPointToPanorama(current);
    if (resolvedPoint) {
      payload.yaw = Number(resolvedPoint.yaw);
      payload.pitch = Number(resolvedPoint.pitch);
    } else {
      const fixedCurrent = resolveFixedMailPoint(current);
      payload.screenX = Number(fixedCurrent.screenX);
      payload.screenY = Number(fixedCurrent.screenY);
    }
  } else if (pendingMailPlacement) {
    if (Number.isFinite(Number(pendingMailPlacement.yaw)) && Number.isFinite(Number(pendingMailPlacement.pitch))) {
      payload.yaw = Number(pendingMailPlacement.yaw);
      payload.pitch = Number(pendingMailPlacement.pitch);
    }

    if (Number.isFinite(Number(pendingMailPlacement.screenX)) && Number.isFinite(Number(pendingMailPlacement.screenY))) {
      payload.screenX = Number(pendingMailPlacement.screenX);
      payload.screenY = Number(pendingMailPlacement.screenY);
    }
  } else {
    const scene = env.getScene(currentRoomId);
    const view = scene?.view?.();
    if (view && Number.isFinite(view.yaw()) && Number.isFinite(view.pitch())) {
      payload.yaw = radToDeg(view.yaw());
      payload.pitch = -radToDeg(view.pitch());
    } else {
      payload.screenX = 0.5;
      payload.screenY = 0.5;
    }
  }

  try {
    let res;
    if (activeMailHotspotIndex >= 0) {
      res = await fetch(`/api/rooms/${currentRoomId}/mail-hotspots/${activeMailHotspotIndex}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch(`/api/rooms/${currentRoomId}/mail-hotspots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }

    const data = await parseJsonResponse(res);
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Lưu điểm mail thất bại");
    }

    if (data.room) {
      const roomsData = env.getRoomsData();
      roomsData[currentRoomId] = data.room;
      env.addHotspots(currentRoomId);
    }

    pendingMailPlacement = null;
    setMailComposerStatus("Đã lưu điểm mail thành công.");
    refreshRecipientOptions(payload.recipient);
  } catch (err) {
    setMailComposerStatus(err.message || "Lưu điểm mail thất bại.", true);
  }
}

async function deleteMailHotspot() {
  const currentRoomId = env.getCurrentRoomId();
  if (!currentRoomId || activeMailHotspotIndex < 0) return;

  try {
    const res = await fetch(`/api/rooms/${currentRoomId}/mail-hotspots/${activeMailHotspotIndex}`, {
      method: "DELETE"
    });
    const data = await parseJsonResponse(res);

    if (!res.ok || !data.success) {
      throw new Error(data.error || "Xóa điểm mail thất bại");
    }

    if (data.room) {
      const roomsData = env.getRoomsData();
      roomsData[currentRoomId] = data.room;
      env.addHotspots(currentRoomId);
    }

    closeMailComposer();
  } catch (err) {
    setMailComposerStatus(err.message || "Xóa điểm mail thất bại.", true);
  }
}

async function sendMailFromComposer() {
  const to = mailRecipientInput?.value?.trim();
  const subject = mailSubjectInput?.value?.trim();
  const body = mailBodyInput?.value?.trim();

  if (!to || !subject || !body) {
    setMailComposerStatus("Vui lòng nhập đủ người nhận, tiêu đề và nội dung.", true);
    return;
  }

  const currentRoomId = env.getCurrentRoomId();

  try {
    setMailComposerStatus("Đang gửi mail...");

    const selectedPoint =
      activeMailHotspotIndex >= 0
        ? getCurrentMailHotspots()[activeMailHotspotIndex]
        : null;
    const pointCoords = selectedPoint || pendingMailPlacement || {};

    const roomsData = env.getRoomsData();
    const notes = [
      {
        roomName: roomsData[currentRoomId]?.name || "Không xác định",
        content: body,
        yaw: pointCoords.yaw,
        pitch: pointCoords.pitch,
        screenX: pointCoords.screenX,
        screenY: pointCoords.screenY,
        time: new Date().toISOString()
      }
    ];

    const res = await fetch("/api/mail/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to,
        subject: subject || "GHI CHÚ TỪ VIRTUAL TOUR",
        body,
        pageUrl: window.location.href,
        summary: body,
        notes,
        format: "virtual-tour-note"
      })
    });

    const data = await parseJsonResponse(res);
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Gửi mail thất bại");
    }

    setMailComposerStatus("Đã gửi mail thành công.");
  } catch (err) {
    setMailComposerStatus(err.message || "Gửi mail thất bại.", true);
  }
}
