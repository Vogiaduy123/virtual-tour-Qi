/**
 * Admin API Routes
 * Handles panorama upload and hotspot management
 */

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { generateCubeTiles } = require("../generate-tiles");

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, "../uploads");
const MEDIA_UPLOADS_DIR = path.join(UPLOADS_DIR, "media");

if (!fs.existsSync(MEDIA_UPLOADS_DIR)) {
  fs.mkdirSync(MEDIA_UPLOADS_DIR, { recursive: true });
}

/* ===== DATA FILE ===== */
const DATA_FILE = path.join(__dirname, "../data/rooms.json");
const MINIMAP_FILE = path.join(__dirname, "../data/minimap.json");

function getRooms() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE));
  } catch {
    return [];
  }
}

function saveRooms(rooms) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(rooms, null, 2));
}

function getMinimap() {
  try {
    const data = JSON.parse(fs.readFileSync(MINIMAP_FILE));
    // Convert old format to new format if needed
    if (!data.floors) {
      return {
        floors: [
          {
            id: 1,
            name: "Tầng 1",
            image: data.image || "",
            markers: data.markers || []
          }
        ]
      };
    }
    return data;
  } catch {
    return { floors: [] };
  }
}

function saveMinimap(data) {
  fs.writeFileSync(MINIMAP_FILE, JSON.stringify(data, null, 2));
}

/* ===== MULTER CONFIG ===== */
const panoramaStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads"),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `panorama_${timestamp}${ext}`);
  }
});

const minimapStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads"),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `minimap_${timestamp}${ext}`);
  }
});

const mediaStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MEDIA_UPLOADS_DIR),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `media_${timestamp}_${sanitized}`);
  }
});

const uploadPanorama = multer({ 
  storage: panoramaStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png' || file.mimetype === 'image/webp') {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG and WEBP files are allowed'));
    }
  }
});

const uploadMinimap = multer({
  storage: minimapStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png' || file.mimetype === 'image/webp') {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG and WEBP files are allowed'));
    }
  }
});

const uploadMedia = multer({
  storage: mediaStorage,
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'application/pdf',
      'video/mp4', 'video/webm',
      'model/gltf-binary', 'model/gltf+json'
    ];
    if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(glb|gltf)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed. Allowed: images, PDF, videos, 3D models (GLB/GLTF)'));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

function uploadMediaWithJsonError(req, res, next) {
  uploadMedia.single("media")(req, res, err => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ success: false, error: "File quá lớn (tối đa 50MB)" });
      }
      return res.status(400).json({ success: false, error: err.message });
    }

    return res.status(400).json({ success: false, error: err.message || "Upload failed" });
  });
}

/* ===== UPLOAD PANORAMA ===== */
router.post("/upload-panorama", uploadPanorama.single("panorama"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No panorama file uploaded" });
    }

    const rawPath = req.file.path;
    const timestamp = Date.now();
    const outputDir = path.join("backend", "tiles", timestamp.toString());
    const roomNameInput = req.body.name || `Room ${new Date().toLocaleDateString('vi-VN')}`;

    console.log("📥 Panorama uploaded:", rawPath);
    console.log("🎨 Generating tiles...");

    try {
      await generateCubeTiles(rawPath, outputDir, [512, 1024, 2048, 4096]);
      
      console.log("✅ Tiles generated successfully!");
      console.log("📁 Output:", outputDir);

      // Save room info to rooms.json
      const rooms = getRooms();
      const room = {
        id: timestamp,
        name: roomNameInput,
        image: "/uploads/" + req.file.filename,
        tilesPath: `tiles/${timestamp}`,
        floor: req.body.floor ? Number(req.body.floor) : 1,
        hotspots: []
      };

      rooms.push(room);
      saveRooms(rooms);

      console.log("💾 Room saved to rooms.json");

      res.json({
        success: true,
        rawPath: rawPath,
        tilesPath: outputDir,
        room: room,
        response: { tilesPath: `tiles/${timestamp}` }
      });

    } catch (tileError) {
      console.error("❌ Tile generation error:", tileError.message);
      res.status(500).json({
        success: false,
        error: "Failed to generate tiles",
        details: tileError.message
      });
    }

  } catch (error) {
    console.error("❌ Upload error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/* ===== HOTSPOT MANAGEMENT ===== */

// GET hotspots for a room
router.get("/rooms/:roomId/hotspots", (req, res) => {
  const roomId = Number(req.params.roomId);
  const rooms = getRooms();
  const room = rooms.find(r => r.id === roomId);

  if (!room) {
    return res.status(404).json({ success: false, error: "Room not found" });
  }

  res.json({ success: true, hotspots: room.hotspots || [] });
});

// ADD hotspot
router.put("/rooms/:roomId/hotspots", (req, res) => {
  const roomId = Number(req.params.roomId);
  const { yaw, pitch, target, rotation, color } = req.body;

  if ([yaw, pitch, target].some(v => v === undefined || v === null || v === "")) {
    return res.status(400).json({ success: false, error: "Missing yaw/pitch/target" });
  }

  const rooms = getRooms();
  const room = rooms.find(r => r.id === roomId);

  if (!room) {
    return res.status(404).json({ success: false, error: "Room not found" });
  }

  if (!room.hotspots) {
    room.hotspots = [];
  }

  const hotspot = {
    yaw: Number(yaw),
    pitch: Number(pitch),
    target: Number(target)
  };

  if (rotation !== undefined) hotspot.rotation = Number(rotation);
  if (color !== undefined) hotspot.color = color;

  room.hotspots.push(hotspot);
  saveRooms(rooms);

  console.log(`✅ Hotspot added to room ${roomId}`);
  res.json({ success: true, hotspots: room.hotspots });
});

// UPDATE hotspot
router.patch("/rooms/:roomId/hotspots/:index", (req, res) => {
  const roomId = Number(req.params.roomId);
  const index = Number(req.params.index);
  const { yaw, pitch, target, rotation, color } = req.body;

  const rooms = getRooms();
  const room = rooms.find(r => r.id === roomId);

  if (!room) {
    return res.status(404).json({ success: false, error: "Room not found" });
  }

  if (!room.hotspots || index < 0 || index >= room.hotspots.length) {
    return res.status(400).json({ success: false, error: "Invalid hotspot index" });
  }

  if (yaw !== undefined) room.hotspots[index].yaw = yaw;
  if (pitch !== undefined) room.hotspots[index].pitch = pitch;
  if (target !== undefined) room.hotspots[index].target = target;
  if (rotation !== undefined) room.hotspots[index].rotation = rotation;
  if (color !== undefined) room.hotspots[index].color = color;

  saveRooms(rooms);

  console.log(`✅ Hotspot ${index} updated in room ${roomId}`);
  res.json({ success: true, hotspots: room.hotspots });
});

// DELETE hotspot
router.delete("/rooms/:roomId/hotspots/:index", (req, res) => {
  const roomId = Number(req.params.roomId);
  const index = Number(req.params.index);

  const rooms = getRooms();
  const room = rooms.find(r => r.id === roomId);

  if (!room) {
    return res.status(404).json({ success: false, error: "Room not found" });
  }

  if (!room.hotspots || index < 0 || index >= room.hotspots.length) {
    return res.status(400).json({ success: false, error: "Invalid hotspot index" });
  }

  room.hotspots.splice(index, 1);
  saveRooms(rooms);

  console.log(`✅ Hotspot ${index} deleted from room ${roomId}`);
  res.json({ success: true, hotspots: room.hotspots });
});

// DELETE room
router.delete("/rooms/:roomId", (req, res) => {
  const roomId = Number(req.params.roomId);
  const rooms = getRooms();
  const roomIndex = rooms.findIndex(r => r.id === roomId);

  if (roomIndex === -1) {
    return res.status(404).json({ success: false, error: "Room not found" });
  }

  const room = rooms[roomIndex];
  
  // Remove room from array
  rooms.splice(roomIndex, 1);
  saveRooms(rooms);

  // Remove room from minimap markers
  try {
    const minimap = getMinimap();
    if (minimap.floors) {
      minimap.floors.forEach(floor => {
        if (floor.markers) {
          floor.markers = floor.markers.filter(m => m.roomId !== roomId);
        }
      });
      saveMinimap(minimap);
    }
  } catch (err) {
    console.warn("⚠️ Failed to update minimap:", err.message);
  }

  // Optional: Delete tiles directory
  if (room.tilesPath) {
    const tilesDir = path.join(__dirname, "..", "backend", room.tilesPath);
    if (fs.existsSync(tilesDir)) {
      fs.rmSync(tilesDir, { recursive: true, force: true });
      console.log(`🗑️ Deleted tiles: ${tilesDir}`);
    }
  }

  // Optional: Delete uploaded panorama image
  if (room.image && room.image.startsWith('/uploads/')) {
    const imagePath = path.join(__dirname, "..", room.image);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
      console.log(`🗑️ Deleted image: ${imagePath}`);
    }
  }

  // Delete all media files associated with this room
  if (room.mediaHotspots && room.mediaHotspots.length > 0) {
    room.mediaHotspots.forEach((media, idx) => {
      if (media.mediaUrl) {
        const mediaPath = path.join(__dirname, "..", media.mediaUrl.replace(/^\//, ""));
        try {
          if (fs.existsSync(mediaPath)) {
            fs.unlinkSync(mediaPath);
            console.log(`🗑️ Deleted media file ${idx}: ${mediaPath}`);
          }
        } catch (err) {
          console.error(`⚠️ Failed to delete media file ${idx}: ${err.message}`);
        }
      }
    });
  }

  console.log(`✅ Room ${roomId} deleted`);
  res.json({ success: true, message: "Room deleted successfully" });
});

/* ===== MEDIA HOTSPOT MANAGEMENT ===== */

// Upload media file
router.post("/media/upload", uploadMediaWithJsonError, (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No media file uploaded" });
    }

    const mediaInfo = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      url: `/uploads/media/${req.file.filename}`,
      type: req.file.mimetype,
      size: req.file.size
    };

    console.log("📁 Media uploaded:", mediaInfo.url);
    res.json({ success: true, media: mediaInfo });
  } catch (err) {
    console.error("❌ Media upload error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add media hotspot to room
router.post("/rooms/:roomId/media-hotspots", (req, res) => {
  const roomId = Number(req.params.roomId);
  const { yaw, pitch, title, description, mediaUrl, mediaType } = req.body;

  // Validate required fields - mediaUrl can be empty for 'note' type
  if (yaw === undefined || yaw === null || yaw === "" ||
      pitch === undefined || pitch === null || pitch === "" ||
      title === undefined || title === null || title === "" ||
      mediaType === undefined || mediaType === null || mediaType === "") {
    return res.status(400).json({ success: false, error: "Missing required fields" });
  }

  // For non-note types, mediaUrl is required
  if (mediaType !== 'note' && (mediaUrl === undefined || mediaUrl === null || mediaUrl === "")) {
    return res.status(400).json({ success: false, error: "mediaUrl is required for this media type" });
  }

  const rooms = getRooms();
  const room = rooms.find(r => r.id === roomId);

  if (!room) {
    return res.status(404).json({ success: false, error: "Room not found" });
  }

  if (!room.mediaHotspots) {
    room.mediaHotspots = [];
  }

  const mediaHotspot = {
    yaw: Number(yaw),
    pitch: Number(pitch),
    title,
    description: description || "",
    mediaUrl,
    mediaType
  };

  room.mediaHotspots.push(mediaHotspot);
  saveRooms(rooms);

  console.log(`✅ Media hotspot added to room ${roomId}`);
  res.json({ success: true, mediaHotspots: room.mediaHotspots });
});

// Get media hotspots for a room
router.get("/rooms/:roomId/media-hotspots", (req, res) => {
  const roomId = Number(req.params.roomId);
  const rooms = getRooms();
  const room = rooms.find(r => r.id === roomId);
 
  if (!room) {
    return res.status(404).json({ success: false, error: "Room not found" });
  }

  res.json({ success: true, mediaHotspots: room.mediaHotspots || [] });
});

// Update media hotspot
router.patch("/rooms/:roomId/media-hotspots/:index", (req, res) => {
  const roomId = Number(req.params.roomId);
  const index = Number(req.params.index);
  const { yaw, pitch, title, description, mediaUrl, mediaType } = req.body;

  const rooms = getRooms();
  const room = rooms.find(r => r.id === roomId);

  if (!room) {
    return res.status(404).json({ success: false, error: "Room not found" });
  }

  if (!room.mediaHotspots || index < 0 || index >= room.mediaHotspots.length) {
    return res.status(400).json({ success: false, error: "Invalid media hotspot index" });
  }

  // If updating with a new media file, delete the old one
  if (mediaUrl !== undefined && mediaUrl !== room.mediaHotspots[index].mediaUrl) {
    const oldMediaUrl = room.mediaHotspots[index].mediaUrl;
    if (oldMediaUrl) {
      const oldFilePath = path.join(__dirname, "..", oldMediaUrl.replace(/^\//, ""));
      try {
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
          console.log(`🗑️ Deleted old media file: ${oldFilePath}`);
        }
      } catch (err) {
        console.error(`⚠️ Failed to delete old media file: ${err.message}`);
      }
    }
  }

  // Update existing media hotspot
  if (yaw !== undefined) room.mediaHotspots[index].yaw = Number(yaw);
  if (pitch !== undefined) room.mediaHotspots[index].pitch = Number(pitch);
  if (title !== undefined) room.mediaHotspots[index].title = title;
  if (description !== undefined) room.mediaHotspots[index].description = description;
  if (mediaUrl !== undefined) room.mediaHotspots[index].mediaUrl = mediaUrl;
  if (mediaType !== undefined) room.mediaHotspots[index].mediaType = mediaType;

  saveRooms(rooms);

  console.log(`✅ Media hotspot ${index} updated in room ${roomId}`);
  res.json({ success: true, mediaHotspots: room.mediaHotspots });
});

// Delete media hotspot
router.delete("/rooms/:roomId/media-hotspots/:index", (req, res) => {
  const roomId = Number(req.params.roomId);
  const index = Number(req.params.index);

  const rooms = getRooms();
  const room = rooms.find(r => r.id === roomId);

  if (!room) {
    return res.status(404).json({ success: false, error: "Room not found" });
  }

  if (!room.mediaHotspots || index < 0 || index >= room.mediaHotspots.length) {
    return res.status(400).json({ success: false, error: "Invalid media hotspot index" });
  }

  // Delete the associated media file to free up memory
  const mediaUrl = room.mediaHotspots[index].mediaUrl;
  if (mediaUrl) {
    const filePath = path.join(__dirname, "..", mediaUrl.replace(/^\//, ""));
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Deleted media file: ${filePath}`);
      }
    } catch (err) {
      console.error(`⚠️ Failed to delete media file: ${err.message}`);
    }
  }

  room.mediaHotspots.splice(index, 1);
  saveRooms(rooms);

  console.log(`✅ Media hotspot ${index} deleted from room ${roomId}`);
  res.json({ success: true, mediaHotspots: room.mediaHotspots });
});

/* ===== MINIMAP MANAGEMENT ===== */
// Get minimap data (all floors or specific floor)
router.get("/minimap", (req, res) => {
  const minimap = getMinimap();
  const floorId = req.query.floor ? Number(req.query.floor) : null;
  
  if (floorId) {
    const floor = minimap.floors.find(f => f.id === floorId);
    if (!floor) {
      return res.status(404).json({ success: false, error: "Floor not found" });
    }
    res.json({ success: true, floor });
  } else {
    res.json({ success: true, minimap });
  }
});

// Upload minimap image for specific floor
router.post("/minimap/upload-image", uploadMinimap.single("minimap"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No minimap file uploaded" });
  }

  const floorId = req.body.floorId ? Number(req.body.floorId) : 1;
  const floorName = req.body.floorName || `Tầng ${floorId}`;
  const minimap = getMinimap();
  
  let floor = minimap.floors.find(f => f.id === floorId);
  if (!floor) {
    floor = {
      id: floorId,
      name: floorName,
      image: "",
      markers: []
    };
    minimap.floors.push(floor);
  }
  
  floor.image = `/uploads/${req.file.filename}`;
  saveMinimap(minimap);

  res.json({ success: true, floor, minimap });
});

// Save minimap for specific floor
router.put("/minimap/floor/:floorId", (req, res) => {
  const floorId = Number(req.params.floorId);
  const { image, markers, floorName } = req.body;

  if (!image) {
    return res.status(400).json({ success: false, error: "Missing minimap image" });
  }

  if (!Array.isArray(markers)) {
    return res.status(400).json({ success: false, error: "Markers must be an array" });
  }

  let normalizedMarkers;
  try {
    normalizedMarkers = markers.map((m, idx) => {
      const x = Number(m.x);
      const y = Number(m.y);
      const roomId = Number(m.roomId);

      if (Number.isNaN(x) || Number.isNaN(y)) {
        throw new Error(`Marker ${idx} missing x/y`);
      }

      return {
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
        roomId
      };
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }

  const minimap = getMinimap();
  let floor = minimap.floors.find(f => f.id === floorId);
  
  if (!floor) {
    floor = {
      id: floorId,
      name: floorName || `Tầng ${floorId}`,
      image: "",
      markers: []
    };
    minimap.floors.push(floor);
  }
  
  floor.image = image;
  floor.markers = normalizedMarkers;
  if (floorName) floor.name = floorName;
  
  saveMinimap(minimap);
  res.json({ success: true, floor, minimap });
});

// Rename minimap floor
router.patch("/minimap/floor/:floorId/name", (req, res) => {
  const floorId = Number(req.params.floorId);
  const floorName = typeof req.body.floorName === "string" ? req.body.floorName.trim() : "";

  if (!floorName) {
    return res.status(400).json({ success: false, error: "Floor name is required" });
  }

  const minimap = getMinimap();
  const floor = minimap.floors.find(f => f.id === floorId);

  if (!floor) {
    return res.status(404).json({ success: false, error: "Floor not found" });
  }

  floor.name = floorName;
  saveMinimap(minimap);

  res.json({ success: true, floor, minimap });
});

// Delete floor
router.delete("/minimap/floor/:floorId", (req, res) => {
  const floorId = Number(req.params.floorId);
  const minimap = getMinimap();
  
  const index = minimap.floors.findIndex(f => f.id === floorId);
  if (index === -1) {
    return res.status(404).json({ success: false, error: "Floor not found" });
  }
  
  minimap.floors.splice(index, 1);
  saveMinimap(minimap);
  
  res.json({ success: true, minimap });
});

/* ===== TOUR SCENARIO ROUTES ===== */
const TOUR_SCENARIO_FILE = path.join(__dirname, "../data/tour-scenario.json");

function getTourScenario() {
  try {
    return JSON.parse(fs.readFileSync(TOUR_SCENARIO_FILE));
  } catch {
    return null;
  }
}

function saveTourScenario(scenario) {
  fs.writeFileSync(TOUR_SCENARIO_FILE, JSON.stringify(scenario, null, 2));
}

// Get tour scenario
router.get("/tour-scenario", (req, res) => {
  const scenario = getTourScenario();
  if (scenario) {
    res.json({ success: true, scenario });
  } else {
    res.json({ success: false, message: "No scenario found" });
  }
});

// Save tour scenario
router.post("/tour-scenario", (req, res) => {
  const scenario = req.body;
  
  if (!scenario || !scenario.name) {
    return res.status(400).json({ success: false, error: "Invalid scenario data" });
  }
  
  saveTourScenario(scenario);
  res.json({ success: true, scenario });
});

// Delete tour scenario
router.delete("/tour-scenario", (req, res) => {
  try {
    if (fs.existsSync(TOUR_SCENARIO_FILE)) {
      fs.unlinkSync(TOUR_SCENARIO_FILE);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
