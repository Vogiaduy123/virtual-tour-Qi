const fs = require('fs');

const file = fs.readFileSync('public/admin-rooms.html', 'utf8');

// Find the last <script> tag that contains the main logic.
// The file has some early scripts like admin-runtime-config.js.
// We want the big inline one.
const scriptRegex = /<script>([\s\S]*?)<\/script>/g;
let match;
let lastMatch = null;

while ((match = scriptRegex.exec(file)) !== null) {
  lastMatch = match;
}

if (lastMatch) {
  if (!fs.existsSync('public/js')) {
    fs.mkdirSync('public/js', { recursive: true });
  }
  fs.writeFileSync('public/js/admin-rooms.js', lastMatch[1].trim());
  const newFile = file.replace(lastMatch[0], '<script src="/js/admin-rooms.js"></script>');
  fs.writeFileSync('public/admin-rooms.html', newFile);
  console.log('✅ Successfully extracted JS to public/js/admin-rooms.js');
} else {
  console.log('❌ No scripts found');
}
