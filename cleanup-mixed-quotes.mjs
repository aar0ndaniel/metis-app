import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const files = [
  'src/components/BootstrapModal.tsx',
  'src/components/AdvancedAnalysisModal.tsx',
  'src/components/DatasetManagerModal.tsx',
];

let totalFixed = 0;

const pattern = /'1px solid 'var\(--([^)]+)\)''/g;

files.forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    const matches = (content.match(pattern) || []).length;
    
    if (matches > 0) {
      content = content.replace(pattern, (match, varName) => {
        return `'1px solid var(--${varName})'`;
      });
      fs.writeFileSync(fullPath, content);
      console.log(`✓ ${file}: ${matches} fixes`);
      totalFixed += matches;
    }
  }
});

console.log(`\n✓ Total fixes: ${totalFixed}`);
