const fs = require('fs');
const path = require('path');
const root = process.cwd();
const inFile = path.join(root, 'out', 'library-audit.json');
const outFile = path.join(root, 'docs', 'files', 'library-audit-triage.md');
if (!fs.existsSync(inFile)) {
  console.error('Input audit file not found:', inFile);
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const results = data.results.filter(r => r.suggestions && r.suggestions.length > 0);
results.sort((a,b) => b.length - a.length);
const top = results.slice(0, 10);
let out = '# Library Audit Triage\n\n';
out += 'This triage was generated automatically. Review and adjust priorities before applying changes.\n\n';

top.forEach(r => {
  const pkgs = [...new Set(r.suggestions.map(s => s.pkg))];
  const reasons = [...new Set(r.suggestions.map(s => s.why))];
  const reason = reasons.slice(0,2).join('; ');
  const priority = (pkgs.includes('zod') || pkgs.includes('date-fns')) ? 'P0' : 'P1';
  const effort = pkgs.includes('zod') ? 'med' : (pkgs.includes('p-limit') ? 'low' : 'low');
  const owner = pkgs.includes('p-limit') ? 'backend' : 'frontend';
  out += `- [${priority}] ${path.relative(root, r.file)}:${r.startLine}-${r.endLine} — ${pkgs.join(', ')} — ${reason} — ${r.length} lines — effort: ${effort} — owner: ${owner}\n`;
});
fs.writeFileSync(outFile, out);
console.log('Wrote triage to', outFile);
