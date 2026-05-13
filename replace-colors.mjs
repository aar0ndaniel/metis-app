import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const replacements = [
  { from: /#B0B0C0/g, to: 'var(--color-text-secondary-alt)' },
  { from: /#181818/g, to: 'var(--color-page)' },
  { from: /#2A2A35/g, to: 'var(--color-border-subtle)' },
  { from: /#F0F0F5/g, to: 'var(--color-text-on-accent)' },
  { from: /#7A7A8A/g, to: 'var(--color-text-muted-alt)' },
  { from: /#202020/g, to: 'var(--color-surface)' },
  { from: /#87976B/g, to: 'var(--color-success)' },
  { from: /#C6A24B/g, to: 'var(--color-accent)' },
  { from: /#D96B4D/g, to: 'var(--color-danger)' },
  { from: /#B7923F/g, to: 'var(--color-warning)' },
  { from: /#3A3A45/g, to: 'var(--color-border-subtle)' },
  { from: /#fff/g, to: 'var(--color-on-accent)' },
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

let totalReplaced = 0;

files.forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    let replaced = 0;
    
    replacements.forEach(r => {
      const matches = (content.match(r.from) || []).length;
      if (matches > 0) {
        content = content.replace(r.from, (match) => `'${r.to}'`);
        replaced += matches;
        totalReplaced += matches;
      }
    });
    
    if (replaced > 0) {
      fs.writeFileSync(fullPath, content);
      console.log(`✓ ${file}: ${replaced} replacements`);
    }
  } else {
    console.log(`⊘ ${file}: not found`);
  }
});

console.log(`\n✓ Total replacements: ${totalReplaced}`);
