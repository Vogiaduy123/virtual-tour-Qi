/**
 * Admin API Routes
 * Handles panorama upload and hotspot management
 */

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { generateCubeTiles } = require("../generate-tiles");

const router = express.Router();

const DEFAULT_UPLOADS_DIR = path.join(__dirname, "../uploads");
const RAW_UPLOAD_DIR = String(process.env.UPLOAD_DIR || "").trim();
const ENV_UPLOADS_DIR = RAW_UPLOAD_DIR
  ? (path.isAbsolute(RAW_UPLOAD_DIR) ? RAW_UPLOAD_DIR : path.resolve(__dirname, "..", RAW_UPLOAD_DIR))
  : "";

function canUseDirectory(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    fs.accessSync(dirPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveUploadsDir() {
  const candidates = [
    ENV_UPLOADS_DIR,
    DEFAULT_UPLOADS_DIR,
    path.join(os.tmpdir(), "virtual-tour-uploads")
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (canUseDirectory(candidate)) {
      if (candidate !== ENV_UPLOADS_DIR && ENV_UPLOADS_DIR) {
        console.warn(`[UPLOAD_DIR] Cannot write to ${ENV_UPLOADS_DIR}. Fallback to ${candidate}`);
      }
      return candidate;
    }
  }

  throw new Error("No writable uploads directory found. Please set UPLOAD_DIR to a writable path.");
}

const UPLOADS_DIR = resolveUploadsDir();
const MEDIA_UPLOADS_DIR = path.join(UPLOADS_DIR, "media");

if (!canUseDirectory(MEDIA_UPLOADS_DIR)) {
  throw new Error(`Cannot create/write media uploads directory: ${MEDIA_UPLOADS_DIR}`);
}

/* ===== DATA FILE ===== */
const DATA_FILE = path.join(__dirname, "../data/rooms.json");
const MINIMAP_FILE = path.join(__dirname, "../data/minimap.json");
const BUILDINGS_FILE = path.join(__dirname, "../data/buildings.json");

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

function getBuildings() {
  try {
    return JSON.parse(fs.readFileSync(BUILDINGS_FILE));
  } catch {
    return [];
  }
}

function saveBuildings(buildings) {
  fs.writeFileSync(BUILDINGS_FILE, JSON.stringify(buildings, null, 2));
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
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `panorama_${timestamp}${ext}`);
  }
});

const minimapStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
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

    let rawPath = req.file.path;
    const timestamp = Date.now();
    let outputDir = path.join("backend", "tiles", timestamp.toString());
    const roomNameInput = req.body.name || `Room ${new Date().toLocaleDateString('vi-VN')}`;
    let imageRelPath = "/uploads/" + req.file.filename;
    let tilesRelPath = `tiles/${timestamp}`;
    const buildingId = req.body.buildingId;

    if (buildingId) {
      const buildings = getBuildings();
      const building = buildings.find(b => b.id === buildingId);
      if (building) {
        const bName = building.name;
        const bUploadsDir = path.join(UPLOADS_DIR, bName);
        if (!fs.existsSync(bUploadsDir)) fs.mkdirSync(bUploadsDir, { recursive: true });
        
        const bTilesDir = path.join(__dirname, "..", "backend", "tiles", bName);
        if (!fs.existsSync(bTilesDir)) fs.mkdirSync(bTilesDir, { recursive: true });

        const newRawPath = path.join(bUploadsDir, req.file.filename);
        if (fs.existsSync(rawPath)) {
          fs.renameSync(rawPath, newRawPath);
          rawPath = newRawPath;
        }

        outputDir = path.join("backend", "tiles", bName, timestamp.toString());
        imageRelPath = `/uploads/${bName}/${req.file.filename}`;
        tilesRelPath = `tiles/${bName}/${timestamp}`;
      }
    }

    console.log("📥 Panorama uploaded:", rawPath);
    console.log("🎨 Generating tiles...");

    try {
      const config = await generateCubeTiles(rawPath, outputDir);
      
      console.log("✅ Tiles generated successfully!");
      console.log("📁 Output:", outputDir);

      // Save room info to rooms.json
      const rooms = getRooms();
      const room = {
        id: timestamp,
        name: roomNameInput,
        image: imageRelPath,
        tilesPath: tilesRelPath,
        tilesConfig: config,
        floor: req.body.floor ? Number(req.body.floor) : 1,
        hotspots: []
      };
      
      if (buildingId) {
        room.buildingId = buildingId;
      }

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
  const { yaw, pitch, target, rotation, color, iconUrl } = req.body;

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
  if (iconUrl !== undefined && String(iconUrl).trim() !== "") hotspot.iconUrl = String(iconUrl).trim();

  room.hotspots.push(hotspot);
  saveRooms(rooms);

  console.log(`✅ Hotspot added to room ${roomId}`);
  res.json({ success: true, hotspots: room.hotspots });
});

// UPDATE hotspot
router.patch("/rooms/:roomId/hotspots/:index", (req, res) => {
  const roomId = Number(req.params.roomId);
  const index = Number(req.params.index);
  const { yaw, pitch, target, rotation, color, iconUrl } = req.body;

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
  if (iconUrl !== undefined) {
    const normalizedIconUrl = String(iconUrl || "").trim();
    if (normalizedIconUrl) {
      room.hotspots[index].iconUrl = normalizedIconUrl;
    } else {
      delete room.hotspots[index].iconUrl;
    }
  }

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
// UPDATE room basic properties (including buildingId)
router.patch("/rooms/:roomId", (req, res) => {
  const roomId = Number(req.params.roomId);
  const { name, buildingId } = req.body;

  const rooms = getRooms();
  const room = rooms.find(r => r.id === roomId);

  if (!room) {
    return res.status(404).json({ success: false, error: "Room not found" });
  }

  // Update simple properties
  if (name !== undefined) {
    if (String(name).trim() === "") {
      return res.status(400).json({ success: false, error: "Room name cannot be empty" });
    }
    room.name = String(name).trim();
  }

  // Update building if requested
  if (buildingId !== undefined) {
    const oldBuildingId = room.buildingId;
    
    // Only proceed if building actually changes
    if (buildingId !== oldBuildingId) {
      const buildings = getBuildings();
      
      let oldBName = null;
      if (oldBuildingId) {
        const oldB = buildings.find(b => b.id === oldBuildingId);
        if (oldB) oldBName = oldB.name;
      }
      
      let newBName = null;
      if (buildingId) {
        const newB = buildings.find(b => b.id === buildingId);
        if (!newB) {
          return res.status(400).json({ success: false, error: "New building not found" });
        }
        newBName = newB.name;
      }

      // Calculate old paths
      let oldImagePhysPath = path.join(UPLOADS_DIR, path.basename(room.image));
      if (oldBName && room.image.includes(`/uploads/${oldBName}/`)) {
        oldImagePhysPath = path.join(UPLOADS_DIR, oldBName, path.basename(room.image));
      } else if (room.image.includes("/uploads/")) {
        // Fallback for custom nested path inside uploads if oldBName was missing but it was in a folder
        const rel = room.image.replace("/uploads/", "");
        oldImagePhysPath = path.join(UPLOADS_DIR, rel);
      }

      let oldTilesPhysPath = path.join(__dirname, "..", "backend", room.tilesPath);

      // Now determine the new locations
      let newImageRel = `/uploads/${path.basename(room.image)}`;
      let newTilesRel = `tiles/${roomId}`;
      let newImagePhysPath = path.join(UPLOADS_DIR, path.basename(room.image));
      let newTilesPhysPath = path.join(__dirname, "..", "backend", "tiles", roomId.toString());

      if (newBName) {
        newImageRel = `/uploads/${newBName}/${path.basename(room.image)}`;
        newImagePhysPath = path.join(UPLOADS_DIR, newBName, path.basename(room.image));
        newTilesRel = `tiles/${newBName}/${roomId}`;
        newTilesPhysPath = path.join(__dirname, "..", "backend", "tiles", newBName, roomId.toString());
        
        // Ensure new directories exist
        const bUploadsDir = path.join(UPLOADS_DIR, newBName);
        if (!fs.existsSync(bUploadsDir)) fs.mkdirSync(bUploadsDir, { recursive: true });
        
        const bTilesDir = path.join(__dirname, "..", "backend", "tiles", newBName);
        if (!fs.existsSync(bTilesDir)) fs.mkdirSync(bTilesDir, { recursive: true });
      }

      // Move files
      if (fs.existsSync(oldImagePhysPath) && oldImagePhysPath !== newImagePhysPath) {
        try {
          fs.renameSync(oldImagePhysPath, newImagePhysPath);
        } catch (err) {
          console.error("Failed to move room image:", err);
        }
      }

      if (fs.existsSync(oldTilesPhysPath) && oldTilesPhysPath !== newTilesPhysPath) {
        try {
          fs.renameSync(oldTilesPhysPath, newTilesPhysPath);
        } catch (err) {
          console.error("Failed to move room tiles:", err);
        }
      }

      // Update room object
      room.image = newImageRel;
      room.tilesPath = newTilesRel;
      if (buildingId) {
        room.buildingId = buildingId;
      } else {
        delete room.buildingId;
      }
    }
  }

  saveRooms(rooms);
  res.json({ success: true, room });
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
  const { yaw, pitch, title, description, mediaUrl, mediaType, highlightPolygon } = req.body;

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
  
  if (highlightPolygon !== undefined) {
    mediaHotspot.highlightPolygon = highlightPolygon;
  }

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
  const { yaw, pitch, title, description, mediaUrl, mediaType, highlightPolygon } = req.body;

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
  if (highlightPolygon !== undefined) room.mediaHotspots[index].highlightPolygon = highlightPolygon;

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

/* ===== BUILDINGS MANAGEMENT ===== */

// Get all buildings
router.get("/buildings", (req, res) => {
  res.json({ success: true, buildings: getBuildings() });
});

// Add a building
router.post("/buildings", (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== "string" || name.trim() === "") {
    return res.status(400).json({ success: false, error: "Invalid building name" });
  }

  const buildings = getBuildings();
  const id = "bldg_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
  const newBuilding = {
    id,
    name: name.trim(),
    createdAt: new Date().toISOString()
  };

  buildings.push(newBuilding);
  saveBuildings(buildings);

  // Initializing folders
  const buildingUploadsDir = path.join(UPLOADS_DIR, newBuilding.name);
  if (!fs.existsSync(buildingUploadsDir)) {
    fs.mkdirSync(buildingUploadsDir, { recursive: true });
  }
  const buildingTilesDir = path.join(__dirname, "..", "backend", "tiles", newBuilding.name);
  if (!fs.existsSync(buildingTilesDir)) {
    fs.mkdirSync(buildingTilesDir, { recursive: true });
  }

  res.json({ success: true, building: newBuilding });
});

// Rename a building
router.put("/buildings/:id", (req, res) => {
  const buildingId = req.params.id;
  const { name } = req.body;

  if (!name || typeof name !== "string" || name.trim() === "") {
    return res.status(400).json({ success: false, error: "Invalid building name" });
  }

  const buildings = getBuildings();
  const building = buildings.find(b => b.id === buildingId);

  if (!building) {
    return res.status(404).json({ success: false, error: "Building not found" });
  }

  const oldName = building.name;
  const newName = name.trim();

  // If name changed, we physically rename the folders
  if (oldName !== newName) {
    const oldUploadDir = path.join(UPLOADS_DIR, oldName);
    const newUploadDir = path.join(UPLOADS_DIR, newName);
    
    if (fs.existsSync(oldUploadDir)) {
      try {
        fs.renameSync(oldUploadDir, newUploadDir);
      } catch (err) {
        console.error("Failed to rename upload dir:", err);
      }
    } else if (!fs.existsSync(newUploadDir)) {
      fs.mkdirSync(newUploadDir, { recursive: true });
    }

    const oldTilesDir = path.join(__dirname, "..", "backend", "tiles", oldName);
    const newTilesDir = path.join(__dirname, "..", "backend", "tiles", newName);

    if (fs.existsSync(oldTilesDir)) {
      try {
        fs.renameSync(oldTilesDir, newTilesDir);
      } catch (err) {
        console.error("Failed to rename tiles dir:", err);
      }
    } else if (!fs.existsSync(newTilesDir)) {
        fs.mkdirSync(newTilesDir, { recursive: true });
    }

    // Update rooms belonging to this building
    const rooms = getRooms();
    let roomsUpdated = false;
    for (const room of rooms) {
      if (room.buildingId === buildingId) {
        if (room.image && room.image.includes(`/uploads/${oldName}/`)) {
          room.image = room.image.replace(`/uploads/${oldName}/`, `/uploads/${newName}/`);
        }
        if (room.tilesPath && room.tilesPath.includes(`tiles/${oldName}/`)) {
          room.tilesPath = room.tilesPath.replace(`tiles/${oldName}/`, `tiles/${newName}/`);
        }
        roomsUpdated = true;
      }
    }
    if (roomsUpdated) saveRooms(rooms);

    building.name = newName;
    saveBuildings(buildings);
  }

  res.json({ success: true, building });
});

// Delete a building
router.delete("/buildings/:id", (req, res) => {
  const buildingId = req.params.id;
  const buildings = getBuildings();
  const index = buildings.findIndex(b => b.id === buildingId);

  if (index === -1) {
    return res.status(404).json({ success: false, error: "Building not found" });
  }

  // Handle rooms assigned to this deleted building
  const rooms = getRooms();
  let roomsUpdated = false;
  for (const r of rooms) {
    if (r.buildingId === buildingId) {
      delete r.buildingId;
      roomsUpdated = true;
    }
  }
  if (roomsUpdated) saveRooms(rooms);

  buildings.splice(index, 1);
  saveBuildings(buildings);

  res.json({ success: true });
});

module.exports = router;
