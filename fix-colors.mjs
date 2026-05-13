import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const replacements = [
  // Color mappings - exact hex to var conversion
  { from: `'#B0B0C0'`, to: `'var(--color-text-secondary-alt)'` },
  { from: `"#B0B0C0"`, to: `"var(--color-text-secondary-alt)"` },
  { from: `'#181818'`, to: `'var(--color-page)'` },
  { from: `"#181818"`, to: `"var(--color-page)"` },
  { from: `'#2A2A35'`, to: `'var(--color-border-subtle)'` },
  { from: `"#2A2A35"`, to: `"var(--color-border-subtle)"` },
  { from: `'#F0F0F5'`, to: `'var(--color-text-on-accent)'` },
  { from: `"#F0F0F5"`, to: `"var(--color-text-on-accent)"` },
  { from: `'#7A7A8A'`, to: `'var(--color-text-muted-alt)'` },
  { from: `"#7A7A8A"`, to: `"var(--color-text-muted-alt)"` },
  { from: `'#202020'`, to: `'var(--color-surface)'` },
  { from: `"#202020"`, to: `"var(--color-surface)"` },
  { from: `'#87976B'`, to: `'var(--color-success)'` },
  { from: `"#87976B"`, to: `"var(--color-success)"` },
  { from: `'#C6A24B'`, to: `'var(--color-accent)'` },
  { from: `"#C6A24B"`, to: `"var(--color-accent)"` },
  { from: `'#D96B4D'`, to: `'var(--color-danger)'` },
  { from: `"#D96B4D"`, to: `"var(--color-danger)"` },
  { from: `'#B7923F'`, to: `'var(--color-warning)'` },
  { from: `"#B7923F"`, to: `"var(--color-warning)"` },
  { from: `'#fff'`, to: `'var(--color-on-accent)'` },
  { from: `"#fff"`, to: `"var(--color-on-accent)"` },
  { from: `'#3A3A45'`, to: `'var(--color-border-subtle)'` },
  { from: `"#3A3A45"`, to: `"var(--color-border-subtle)"` },
  // Also handle rgba patterns
  { from: /rgba\(170,17,85,0\.12\)/g, to: `rgba(var(--color-danger-rgb), 0.12)` },
  { from: /rgba\(170,17,85,0\.25\)/g, to: `rgba(var(--color-danger-rgb), 0.25)` },
  { from: /rgba\(217,107,77,0\.36\)/g, to: `rgba(var(--color-danger-rgb), 0.36)` },
  { from: /rgba\(217,107,77,0\.16\)/g, to: `rgba(var(--color-danger-rgb), 0.16)` },
];

const files = [
  'src/components/BootstrapModal.tsx',
  'src/components/AdvancedAnalysisModal.tsx',
  'src/components/DatasetManagerModal.tsx',
  'src/App.tsx',
  'src/components/AppLogo.tsx',
  'src/pages/WorkspaceHome.tsx',
];

let totalReplaced = 0;

files.forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    let replaced = 0;
    
    replacements.forEach(r => {
      if (typeof r.from === 'string') {
        const matches = (content.match(new RegExp(r.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        if (matches > 0) {
          content = content.replaceAll(r.from, r.to);
          replaced += matches;
          totalReplaced += matches;
        }
      } else {
        const matches = (content.match(r.from) || []).length;
        if (matches > 0) {
          content = content.replace(r.from, r.to);
          replaced += matches;
          totalReplaced += matches;
        }
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
