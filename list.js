const fs = require('fs');
const lines = fs.readFileSync('public/admin-rooms.html', 'utf8').split('\n');
lines.forEach((line, i) => {
  if (line.includes('/* ===')) console.log(`${i+1}: ${line.trim()}`);
});
