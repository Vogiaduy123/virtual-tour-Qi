const fs = require('fs');
const path = require('path');

const publicDir = 'public';
const adminDir = path.join(publicDir, 'admin');
const jsDir = path.join(publicDir, 'js');

if (!fs.existsSync(adminDir)) fs.mkdirSync(adminDir, { recursive: true });
if (!fs.existsSync(jsDir)) fs.mkdirSync(jsDir, { recursive: true });

const files = fs.readdirSync(publicDir);

const replaceMap = {
  '"admin-runtime-config.js"': '"/js/admin-runtime-config.js"',
  '"admin-api-base.js"': '"/js/admin-api-base.js"',
  '"admin-rooms.js"': '"/js/admin-rooms.js"',
  '"admin-upload.html"': '"/admin/upload.html"',
  '"admin-rooms.html"': '"/admin/rooms.html"',
  '"admin-minimap.html"': '"/admin/minimap.html"',
  '"admin-tour.html"': '"/admin/tour.html"',
  '"admin.html"': '"/admin/index.html"',
  '"admin-drag.html"': '"/admin/drag.html"',
  '"admin-api-config.html"': '"/admin/api-config.html"'
};

// Process files in public/
files.forEach(file => {
  const fullPath = path.join(publicDir, file);
  if (!fs.statSync(fullPath).isFile()) return;

  if (file === 'admin-api.js') {
    if (!fs.existsSync('backend')) fs.mkdirSync('backend');
    fs.renameSync(fullPath, 'backend/admin-api.js');
    console.log(`✅ Moved ${file} to backend/`);
    return;
  }

  if (file.endsWith('.js')) {
    fs.renameSync(fullPath, path.join(jsDir, file));
    console.log(`✅ Moved ${file} to public/js/`);
    return;
  }

  if (file.endsWith('.html')) {
    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Replace all exact string matches
    Object.keys(replaceMap).forEach(key => {
      content = content.replace(new RegExp(key, 'g'), replaceMap[key]);
      // Also do single quotes
      const sqKey = key.replace(/"/g, "'");
      const sqVal = replaceMap[key].replace(/"/g, "'");
      content = content.replace(new RegExp(sqKey, 'g'), sqVal);
    });

    const newName = file === 'admin.html' ? 'index.html' : file.replace('admin-', '');
    fs.writeFileSync(path.join(adminDir, newName), content);
    fs.unlinkSync(fullPath);
    console.log(`✅ Moved and transformed ${file} to public/admin/${newName}`);
  }
});

// Update server.js
let serverContent = fs.readFileSync('server.js', 'utf8');
serverContent = serverContent.replace('require("./public/admin-api")', 'require("./backend/admin-api")');
fs.writeFileSync('server.js', serverContent);
console.log('✅ Updated server.js references');

// Update src/index.html
if (fs.existsSync('src/index.html')) {
  let indexContent = fs.readFileSync('src/index.html', 'utf8');
  Object.keys(replaceMap).forEach(key => {
    indexContent = indexContent.replace(new RegExp(key, 'g'), replaceMap[key]);
  });
  fs.writeFileSync('src/index.html', indexContent);
  console.log('✅ Updated src/index.html references');
}

