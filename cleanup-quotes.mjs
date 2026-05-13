import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Fix patterns: remove extra quotes around var()
const fixPatterns = [
  { pattern: /''var\(--([^)]+)\)''/g, replacement: `'var(--$1)'` },
];

const files = [
  'src/components/BootstrapModal.tsx',
  'src/components/AdvancedAnalysisModal.tsx',
  'src/components/DatasetManagerModal.tsx',
  'src/App.tsx',
  'src/components/AppLogo.tsx',
  'src/pages/WorkspaceHome.tsx',
  'src/components/DiagnosticsConsole.tsx',
];

let totalFixed = 0;

files.forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    let fixed = 0;
    
    fixPatterns.forEach(r => {
      const matches = (content.match(r.pattern) || []).length;
      if (matches > 0) {
        content = content.replace(r.pattern, r.replacement);
        fixed += matches;
        totalFixed += matches;
      }
    });
    
    if (fixed > 0) {
      fs.writeFileSync(fullPath, content);
      console.log(`✓ ${file}: ${fixed} fixes`);
    }
  }
});

console.log(`\n✓ Total fixes: ${totalFixed}`);
