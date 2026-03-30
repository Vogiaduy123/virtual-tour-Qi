let buildings = [];

async function loadBuildings() {
  try {
    const rawRes = await fetch('/api/buildings');
    const res = await rawRes.json();
    if (res && res.success) {
      buildings = res.buildings;
      renderBuildings();
    }
  } catch (err) {
    console.error("Lỗi khi load tòa nhà:", err);
    alert("Không thể tải danh sách Tòa nhà.");
  }
}

function renderBuildings() {
  const container = document.getElementById('buildingsList');
  container.innerHTML = "";
  if (buildings.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: #7f8c8d; padding: 20px;">Chưa có tòa nhà nào.</div>`;
    return;
  }

  buildings.forEach(b => {
    const div = document.createElement("div");
    div.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 15px; border: 1px solid #e1e8ed; border-radius: 8px; background: #fff;";
    
    // Safely escape the name for onclick passing
    const escapedId = b.id.replace(/'/g, "\\'");
    const escapedName = b.name.replace(/'/g, "\\'");

    div.innerHTML = `
      <div style="font-weight: 600; font-size: 16px; color: #2c3e50;">🏢 ${b.name}</div>
      <div style="display: flex; gap: 10px;">
        <button class="btn btn-small" style="background: #3498db; color: white; margin: 0;" onclick="editBuilding('${escapedId}', '${escapedName}')">✏️ Sửa Tên</button>
        <button class="btn btn-small" style="background: #e74c3c; color: white; margin: 0;" onclick="deleteBuilding('${escapedId}', '${escapedName}')">🗑️ Xóa</button>
      </div>
    `;
    container.appendChild(div);
  });
}

async function addBuilding() {
  const input = document.getElementById('newBuildingName');
  const name = input.value.trim();
  if (!name) return alert("Vui lòng nhập tên tòa nhà!");

  try {
    const rawRes = await fetch('/api/buildings', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    const res = await rawRes.json();
    if (res && res.success) {
      input.value = "";
      alert("Đã thêm tòa nhà: " + name);
      loadBuildings();
    } else {
      alert(res.error || "Thêm thất bại");
    }
  } catch (err) {
    console.error(err);
    alert("Lỗi khi thêm tòa nhà.");
  }
}

async function editBuilding(id, currentName) {
  const newName = prompt(`Đổi tên tòa nhà "${currentName}" thành:`, currentName);
  if (!newName || newName.trim() === "" || newName === currentName) return;

  if (!confirm(`Xác nhận đổi tên từ "${currentName}" sang "${newName}"?\nViệc này cũng sẽ cập nhật thư mục lưu trữ của các phòng liên quan.`)) return;

  try {
    const rawRes = await fetch(`/api/buildings/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() })
    });
    const res = await rawRes.json();
    if (res && res.success) {
      alert("Đã đổi tên thành công!");
      loadBuildings();
    } else {
      alert(res.error || "Sửa thất bại.");
    }
  } catch (err) {
    console.error(err);
    alert("Lỗi khi cập nhật tên tòa nhà.");
  }
}

async function deleteBuilding(id, name) {
  if (!confirm(`⚠️ CHÚ Ý: Bạn có chắc chắn muốn xóa Tòa nhà "${name}"?\n- Các phòng thuộc tòa nhà này sẽ biến thành "Phòng rời" (không thuộc tòa nhà nào).\n- File trên server vẫn giữ nguyên.`)) return;

  try {
    const rawRes = await fetch(`/api/buildings/${id}`, {
      method: "DELETE"
    });
    const res = await rawRes.json();
    if (res && res.success) {
      alert("Đã xóa tòa nhà.");
      loadBuildings();
    } else {
      alert(res.error || "Xóa thất bại.");
    }
  } catch (err) {
    console.error(err);
    alert("Lỗi khi xóa tòa nhà.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadBuildings();
});
