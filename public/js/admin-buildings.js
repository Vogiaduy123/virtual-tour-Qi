let buildings = [];
let allRooms = [];
let currentAssignBuildingId = null;

// ===== INIT =====
document.addEventListener("DOMContentLoaded", async () => {
  await refreshData();
});

async function refreshData() {
  try {
    const [bRes, rRes] = await Promise.all([
      fetch('/api/admin/buildings').then(r => r.json()),
      fetch('/api/rooms').then(r => r.json())
    ]);
    
    if (bRes && bRes.success) {
      buildings = bRes.buildings;
    }
    allRooms = Array.isArray(rRes) ? rRes : [];
    
    renderBuildings();
  } catch (err) {
    console.error("Lỗi khi tải dữ liệu:", err);
  }
}

// ===== RENDER BUILDINGS =====
function renderBuildings() {
  const container = document.getElementById('buildingsList');
  container.innerHTML = "";
  if (buildings.length === 0) {
    container.innerHTML = `<div style="text-align:center;color:#7f8c8d;padding:30px">Chưa có tòa nhà nào. Nhập tên và bấm "+ Thêm Tòa Nhà".</div>`;
    return;
  }

  buildings.forEach(b => {
    const roomCount = allRooms.filter(r => r.buildingId === b.id).length;

    const card = document.createElement("div");
    card.className = "building-card";
    card.innerHTML = `
      <div class="building-card-info">
        <div class="building-card-name">🏢 ${b.name}</div>
        <div class="building-card-meta">${roomCount} phòng đã gán</div>
      </div>
      <div class="building-card-actions">
        <button class="btn btn-success btn-small"
          onclick="openAssignModal('${escAttr(b.id)}')">🏠 Gán Phòng</button>
        <button class="btn btn-edit btn-small"
          onclick="editBuilding('${escAttr(b.id)}', '${escAttr(b.name)}')">✏️ Đổi tên</button>
        <button class="btn btn-danger btn-small"
          onclick="deleteBuilding('${escAttr(b.id)}', '${escAttr(b.name)}')">🗑️ Xóa</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function escAttr(str) {
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// ===== ADD BUILDING =====
async function addBuilding() {
  const input = document.getElementById('newBuildingName');
  const name = input.value.trim();
  if (!name) return alert("Vui lòng nhập tên tòa nhà!");

  try {
    const res = await fetch('/api/admin/buildings', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    }).then(r => r.json());

    if (res && res.success) {
      input.value = "";
      await refreshData();
    } else {
      alert(res.error || "Thêm thất bại");
    }
  } catch (err) {
    alert("Lỗi khi thêm tòa nhà.");
  }
}

// ===== EDIT BUILDING =====
async function editBuilding(id, currentName) {
  const newName = prompt(`Đổi tên tòa nhà "${currentName}" thành:`, currentName);
  if (!newName || newName.trim() === "" || newName.trim() === currentName) return;
  if (!confirm(`Xác nhận đổi tên từ "${currentName}" → "${newName.trim()}"?\nSẽ cập nhật thư mục lưu trữ của các phòng liên quan.`)) return;

  try {
    const res = await fetch(`/api/admin/buildings/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() })
    }).then(r => r.json());

    if (res && res.success) {
      await refreshData();
    } else {
      alert(res.error || "Sửa thất bại.");
    }
  } catch (err) {
    alert("Lỗi khi cập nhật tên tòa nhà.");
  }
}

// ===== DELETE BUILDING =====
async function deleteBuilding(id, name) {
  if (!confirm(`⚠️ Xóa Tòa nhà "${name}"?\n- Các phòng thuộc tòa nhà này sẽ trở thành "Phòng rời".\n- File trên server vẫn giữ nguyên.`)) return;

  try {
    const res = await fetch(`/api/admin/buildings/${id}`, {
      method: "DELETE"
    }).then(r => r.json());

    if (res && res.success) {
      await refreshData();
    } else {
      alert(res.error || "Xóa thất bại.");
    }
  } catch (err) {
    alert("Lỗi khi xóa tòa nhà.");
  }
}

// ===== ASSIGN ROOMS MODAL =====
function openAssignModal(buildingId) {
  currentAssignBuildingId = buildingId;
  const building = buildings.find(b => b.id === buildingId);
  document.getElementById('assignModalTitle').textContent = `🏠 Gán phòng vào: ${building?.name || '?'}`;
  renderRoomCheckList(buildingId);
  document.getElementById('assignModal').classList.add('active');
}

function closeAssignModal() {
  document.getElementById('assignModal').classList.remove('active');
  currentAssignBuildingId = null;
}

function renderRoomCheckList(buildingId) {
  const list = document.getElementById('roomCheckList');
  list.innerHTML = "";

  if (allRooms.length === 0) {
    list.innerHTML = `<div style="color:#7f8c8d;text-align:center;padding:20px">Chưa có phòng nào trong hệ thống.</div>`;
    return;
  }

  // Sort: rooms in this building first
  const sorted = [...allRooms].sort((a, b) => {
    const aIn = a.buildingId === buildingId;
    const bIn = b.buildingId === buildingId;
    if (aIn && !bIn) return -1;
    if (!aIn && bIn) return 1;
    return 0;
  });

  sorted.forEach(room => {
    const isChecked = room.buildingId === buildingId;
    const otherBuilding = room.buildingId && room.buildingId !== buildingId
      ? buildings.find(b => b.id === room.buildingId)
      : null;

    const badgeHtml = otherBuilding
      ? `<span style="font-size:11px;color:#e74c3c;background:#fdebd0;padding:2px 6px;border-radius:10px;font-weight:600">⚠️ ${otherBuilding.name}</span>`
      : isChecked
        ? `<span style="font-size:11px;color:#27ae60;background:#e8f5e9;padding:2px 6px;border-radius:10px;font-weight:600">✓ Tòa này</span>`
        : `<span style="font-size:11px;color:#7f8c8d;background:#ecf0f1;padding:2px 6px;border-radius:10px">Phòng rời</span>`;

    const item = document.createElement("label");
    item.className = "room-check-item";
    item.innerHTML = `
      <input type="checkbox" class="room-cb" data-id="${room.id}" ${isChecked ? 'checked' : ''}>
      <div class="room-check-label">
        <div class="room-check-name">🏠 ${room.name}</div>
        <div class="room-check-info">Tầng ${room.floor || 1} &nbsp;${badgeHtml}</div>
      </div>
    `;
    item.querySelector('input').addEventListener('change', updateSelectedCount);
    list.appendChild(item);
  });

  updateSelectedCount();
  updateSelectAllState();
}

function updateSelectedCount() {
  const total = document.querySelectorAll('.room-cb:checked').length;
  const el = document.getElementById('selectedCount');
  if (el) el.textContent = `${total} đã chọn`;
  updateSelectAllState();
}

function updateSelectAllState() {
  const all = document.querySelectorAll('.room-cb');
  const checked = document.querySelectorAll('.room-cb:checked');
  const selectAll = document.getElementById('selectAllRooms');
  if (!selectAll || all.length === 0) return;
  selectAll.indeterminate = checked.length > 0 && checked.length < all.length;
  selectAll.checked = checked.length === all.length;
}

function toggleSelectAll() {
  const selectAll = document.getElementById('selectAllRooms');
  document.querySelectorAll('.room-cb').forEach(cb => cb.checked = selectAll.checked);
  updateSelectedCount();
}

// ===== SAVE ASSIGNMENT =====
async function saveAssignment() {
  if (!currentAssignBuildingId) return;

  const checkedIds = Array.from(document.querySelectorAll('.room-cb:checked'))
    .map(cb => cb.dataset.id);

  const building = buildings.find(b => b.id === currentAssignBuildingId);

  if (!confirm(`Gán ${checkedIds.length} phòng vào "${building?.name}"?\nCác file ảnh và tiles sẽ được di chuyển tự động.`)) return;

  try {
    const loadingEl = document.getElementById('assignModalTitle');
    const origTitle = loadingEl.textContent;
    loadingEl.textContent = '⏳ Đang xử lý...';

    const res = await fetch(`/api/admin/buildings/${currentAssignBuildingId}/assign-rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomIds: checkedIds })
    }).then(r => r.json());

    loadingEl.textContent = origTitle;

    if (res && res.success) {
      const errMsg = res.errors && res.errors.length > 0
        ? `\n⚠️ Một số lỗi nhỏ:\n${res.errors.join('\n')}`
        : '';
      alert(`✅ Đã gán ${checkedIds.length} phòng thành công!${errMsg}`);
      closeAssignModal();
      await refreshData();
    } else {
      alert("Lỗi: " + (res?.error || "Không rõ"));
    }
  } catch (err) {
    console.error(err);
    alert("Lỗi khi gán phòng: " + err.message);
  }
}
