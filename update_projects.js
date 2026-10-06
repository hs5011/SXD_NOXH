const fs = require('fs');

const appDataPath = './src/data/appData.ts';
let content = fs.readFileSync(appDataPath, 'utf8');

const agenciesToClear = [
  'Sở Quy hoạch Kiến trúc',
  'Sở NNMT',
  'Sở Tài chính',
  'UBND TP',
  'HĐND TP',
  'Công an TP (PCCC)'
];

const lines = content.split('\n');
const newLines = lines.map(line => {
  if (line.includes('currentAgency:')) {
    const match = line.match(/currentAgency:\s*"([^"]+)"/);
    if (match && agenciesToClear.includes(match[1])) {
      // Remove currentDepartment: "...",
      return line.replace(/currentDepartment:\s*"[^"]+",\s*/, '');
    }
  }
  return line;
});

fs.writeFileSync(appDataPath, newLines.join('\n'));
console.log('Updated appData.ts');
