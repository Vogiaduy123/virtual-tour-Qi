#!/usr/bin/env node

/**
 * Marzipano Tile Generator (Equirectangular Pyramid)
 * Slices a high-resolution equirectangular panorama into a multi-level tile pyramid.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

/**
 * Generate Equirectangular Tile Pyramid
 * @param {string} inputPath Path to original panorama image
 * @param {string} outputDir Output directory for tiles
 * @returns {Object} Marzipano geometry config
 */
async function generateEquirectangularTiles(inputPath, outputDir) {
  console.log('🎨 Starting Equirectangular tile generation...');
  console.log('📷 Input:', inputPath);
  console.log('📁 Output:', outputDir);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Load metadata
  const metadata = await sharp(inputPath).metadata();
  const maxWidth = metadata.width;
  
  if (!maxWidth) {
    throw new Error('Could not read image dimensions');
  }

  console.log(`📐 Image dimensions: ${maxWidth}x${metadata.height}`);

  // Calculate power-of-2 levels to build the pyramid smoothly
  const levels = [];
  let w = 1024;
  while (w < maxWidth) {
    levels.push({ width: w, height: Math.floor(w / 2) });
    w *= 2;
  }
  // Make sure the highest resolution uses the native image width
  if (levels.length === 0 || levels[levels.length - 1].width !== maxWidth) {
    levels.push({ width: maxWidth, height: metadata.height });
  }

  const tileSize = 512;
  
  for (let z = 0; z < levels.length; z++) {
    const levelWidth = levels[z].width;
    const levelHeight = levels[z].height;
    
    // Marzipano uses 1-based indexing for levels by default, but we will use 1-based indexing for folders here.
    const levelDir = path.join(outputDir, String(z + 1));
    console.log(`📦 Generating level ${z + 1}/${levels.length} (${levelWidth}x${levelHeight})...`);
    
    if (!fs.existsSync(levelDir)) fs.mkdirSync(levelDir, { recursive: true });

    // Resize the full image for the current pyramid level
    const levelImageBuffer = await sharp(inputPath)
      .resize(levelWidth, levelHeight, { fit: 'fill' })
      .toBuffer();
    
    const cols = Math.ceil(levelWidth / tileSize);
    const rows = Math.ceil(levelHeight / tileSize);
    
    for (let row = 0; row < rows; row++) {
      const rowDir = path.join(levelDir, String(row));
      if (!fs.existsSync(rowDir)) fs.mkdirSync(rowDir, { recursive: true });
      
      for (let col = 0; col < cols; col++) {
        const tilePath = path.join(rowDir, `${col}.jpg`);
        
        const extractWidth = Math.min(tileSize, levelWidth - col * tileSize);
        const extractHeight = Math.min(tileSize, levelHeight - row * tileSize);
        
        // Skip invalid dimensions
        if (extractWidth <= 0 || extractHeight <= 0) continue;

        try {
          await sharp(levelImageBuffer)
            .extract({ 
              left: col * tileSize, 
              top: row * tileSize, 
              width: extractWidth, 
              height: extractHeight 
            })
            .jpeg({ quality: 85, mozjpeg: true })
            .toFile(tilePath);
        } catch (err) {
          console.error(`❌ Error generating tile (z/y/x = ${z+1}/${row}/${col}):`, err.message);
          throw err;
        }
      }
    }
  }

  const config = {
    type: 'equirectangular',
    tileSize: tileSize,
    levels: levels.map(l => ({ width: l.width }))
  };

  fs.writeFileSync(
    path.join(outputDir, 'config.json'),
    JSON.stringify(config, null, 2)
  );

  console.log('✅ Tile generation complete!');
  console.log('📄 Config saved to:', path.join(outputDir, 'config.json'));

  return config;
}

// Keep the old export name `generateCubeTiles` as an alias to avoid breaking backend references if they missed update
module.exports = { 
  generateEquirectangularTiles, 
  generateCubeTiles: generateEquirectangularTiles 
};

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Usage: node generate-tiles.js <input-image> <output-dir>');
    process.exit(1);
  }

  const [input, output] = args;
  generateEquirectangularTiles(input, output).catch(console.error);
}
