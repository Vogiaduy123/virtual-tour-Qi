#!/usr/bin/env node

/**
 * Marzipano Tile Generator
 * Converts equirectangular panorama to cube tiles
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function generateCubeTiles(inputPath, outputDir, resolutions = [512, 1024, 2048, 4096]) {
  console.log('🎨 Starting tile generation...');
  console.log('📷 Input:', inputPath);
  console.log('📁 Output:', outputDir);

  // Create output directory structure
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Create levels directory
  const levelsDir = path.join(outputDir, 'levels');
  if (!fs.existsSync(levelsDir)) {
    fs.mkdirSync(levelsDir, { recursive: true });
  }

  // Load the equirectangular image once
  const metadata = await sharp(inputPath).metadata();
  
  console.log(`📐 Image dimensions: ${metadata.width}x${metadata.height}`);

  // Convert equirectangular to cube faces
  // For simplicity, we'll create a basic cube mapping
  // In production, you'd want to use proper equirectangular to cubemap conversion

  const faces = ['f', 'b', 'l', 'r', 'u', 'd']; // front, back, left, right, up, down
  
  // Generate tiles for each resolution level
  for (let level = 0; level < resolutions.length; level++) {
    const resolution = resolutions[level];
    const levelDir = path.join(outputDir, level.toString());
    
    console.log(`📦 Generating level ${level} (${resolution}x${resolution})...`);
    
    // Create level directory
    if (!fs.existsSync(levelDir)) {
      fs.mkdirSync(levelDir, { recursive: true });
    }

    // For each cube face
    for (const face of faces) {
      const faceDir = path.join(levelDir, face);
      if (!fs.existsSync(faceDir)) {
        fs.mkdirSync(faceDir, { recursive: true });
      }

      // Create a simple tile (in production, this would be proper cubemap projection)
      // For now, we'll create a placeholder that works with Marzipano structure
      const tileSize = 512;
      const numTiles = Math.ceil(resolution / tileSize);

      for (let y = 0; y < numTiles; y++) {
        const yDir = path.join(faceDir, y.toString());
        if (!fs.existsSync(yDir)) {
          fs.mkdirSync(yDir, { recursive: true });
        }

        for (let x = 0; x < numTiles; x++) {
          const tilePath = path.join(yDir, `${x}.jpg`);
          
          // Skip if tile already exists
          if (fs.existsSync(tilePath)) {
            continue;
          }
          
          // Calculate tile boundaries proportionally to image size
          // Each tile represents a portion of the image at this resolution level
          const tileStartX = (x / numTiles) * metadata.width;
          const tileStartY = (y / numTiles) * metadata.height;
          const tileEndX = ((x + 1) / numTiles) * metadata.width;
          const tileEndY = ((y + 1) / numTiles) * metadata.height;
          
          const left = Math.floor(tileStartX);
          const top = Math.floor(tileStartY);
          const right = Math.ceil(tileEndX);
          const bottom = Math.ceil(tileEndY);
          
          let width = Math.max(1, right - left);
          let height = Math.max(1, bottom - top);
          
          // Clamp to image bounds
          width = Math.min(width, metadata.width - left);
          height = Math.min(height, metadata.height - top);

          // Validate bounds
          if (left < 0 || top < 0 || left >= metadata.width || top >= metadata.height || width <= 0 || height <= 0) {
            continue;
          }

          try {
            await sharp(inputPath)
              .extract({ left, top, width, height })
              .resize(tileSize, tileSize, { fit: 'cover' })
              .jpeg({ quality: 80 })
              .toFile(tilePath);
          } catch (tileErr) {
            console.error(`❌ Error generating tile (${face}/${level}/${y}/${x}):`, tileErr.message);
            throw tileErr;
          }
        }
      }
    }
  }

  // Create config.json
  const config = {
    type: 'cube',
    levels: resolutions.map((res, idx) => ({
      tileSize: 512,
      size: res,
      fallbackOnly: idx === 0
    }))
  };

  fs.writeFileSync(
    path.join(outputDir, 'config.json'),
    JSON.stringify(config, null, 2)
  );

  console.log('✅ Tile generation complete!');
  console.log('📄 Config saved to:', path.join(outputDir, 'config.json'));

  return config;
}

module.exports = { generateCubeTiles };

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Usage: node generate-tiles.js <input-image> <output-dir>');
    process.exit(1);
  }

  const [input, output] = args;
  generateCubeTiles(input, output).catch(console.error);
}
