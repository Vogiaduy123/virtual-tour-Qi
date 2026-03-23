const scenes = {};
const roomsData = {};

let env = {
  getViewer: () => null,
  switchRoom: (id) => {}
};

export function initScenesFeature(dependencies) {
  env = { ...env, ...dependencies };
}

export function getScenes() { 
  return scenes; 
}

export function getRoomsData() { 
  return roomsData; 
}

export function initRooms(rooms, roomSelectEl) {
  // Reset roomsData
  Object.keys(roomsData).forEach(k => delete roomsData[k]);

  // Rebuild room dropdown
  if (roomSelectEl) roomSelectEl.innerHTML = "";

  const viewer = env.getViewer();

  rooms.forEach(room => {
    roomsData[room.id] = room;

    // Create scene if new
    if (!scenes[room.id]) {
      const source = Marzipano.ImageUrlSource.fromString(room.image);
      const geometry = new Marzipano.EquirectGeometry([{ width: 4000 }]);
      const view = new Marzipano.RectilinearView({ fov: Math.PI / 2 });

      const scene = viewer.createScene({ source, geometry, view });
      scenes[room.id] = scene;
    }

    // Room option
    if (roomSelectEl) {
      const option = document.createElement("option");
      option.value = room.id;
      option.textContent = room.name;
      roomSelectEl.appendChild(option);
    }
  });

  // Add change event listener via onchange to prevent duplicate listeners
  if (roomSelectEl) {
    roomSelectEl.onchange = (e) => {
      env.switchRoom(parseInt(e.target.value));
    };
  }
}
