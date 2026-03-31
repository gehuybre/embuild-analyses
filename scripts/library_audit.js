#!/usr/bin/env node
/*
 A small heuristic library audit script.
 Scans .js/.ts/.jsx/.tsx files under specified folders for functions > 10 lines
 and reports suggestions for packages (date-fns, lodash, zod, p-limit, multer, yargs).
*/
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = [
  path.join(ROOT, 'embuild-analyses', 'src'),
  path.join(ROOT, 'src')
].filter(d => fs.existsSync(d));

const EXT = ['.js', '.ts', '.jsx', '.tsx'];
const OUT_DIR = path.join(ROOT, 'out');
const OUT_FILE = path.join(OUT_DIR, 'library-audit.json');

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'out', '.next'].includes(entry.name)) continue;
      files.push(...walk(p));
    } else if (EXT.includes(path.extname(entry.name))) {
      files.push(p);
    }
  }
  return files;
}

function simpleSuggestions(codeBlock) {
  const code = codeBlock.toLowerCase();
  const suggestions = [];
  if (/\bdate\b|\bnew Date\b|\btoISOString\b|\bformat\b/.test(code)) suggestions.push({pkg: 'date-fns', why: 'date manipulation/formatting utilities'});
  if (/\bvalidate\b|\bschema\b|\bparse\b.*\bjson\b|\btypeof\b/.test(code)) suggestions.push({pkg: 'zod', why: 'validation and schema parsing'});
  if (/\bdeepclone\b|\bdeep copy\b|\bmerge\b|\bclone\b|\bassign\b/.test(code)) suggestions.push({pkg: 'lodash', why: 'utility functions for deep copy/merge'});
  if (/\bconcurrenc|p-limit|limit\b/.test(code)) suggestions.push({pkg: 'p-limit', why: 'promise concurrency control'});
  if (/multipart|form-data|file upload|multer|multipart\/form-data/.test(code)) suggestions.push({pkg: 'multer', why: 'multipart/form-data file uploads'});
  if (/process\.argv|commander|yargs|meow\(|argparse/.test(code)) suggestions.push({pkg: 'yargs or commander', why: 'CLI argument parsing'});
  return suggestions;
}

function analyzeFile(file) {
  const out = [];
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Heuristic starts: function declaration, assigned function, or arrow block
    const isStart = /(^|\s)(function\s+\w+\s*\(|\w+\s*=\s*function\s*\(|=>\s*\{)/.test(line);
    if (!isStart) continue;
    // Walk braces to find block
    let depth = 0;
    let start = i;
    let j = i;
    let started = false;
    for (; j < lines.length; j++) {
      const l = lines[j];
      for (const ch of l) {
        if (ch === '{') { depth++; started = true }
        if (ch === '}') depth--;
      }
      if (started && depth <= 0) break;
    }
    const end = j;
    const block = lines.slice(start, end + 1).join('\n');
    const effectiveLines = block.split(/\r?\n/).filter(l => !/^\s*\/\//.test(l) && !/^\s*\/\*/.test(l) && !/^\s*$/.test(l)).length;
    if (effectiveLines > 10) {
      const suggestions = simpleSuggestions(block);
      out.push({ file, startLine: start + 1, endLine: end + 1, length: effectiveLines, suggestions });
    }
    i = end;
  }
  return out;
}

function run() {
  const results = [];
  for (const dir of SCAN_DIRS) {
    for (const file of walk(dir)) {
      try {
        const res = analyzeFile(file);
        if (res.length) results.push(...res);
      } catch (err) {
        console.error('Error analyzing', file, err.message);
      }
    }
  }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify({generatedAt: new Date().toISOString(), results}, null, 2));
  // Print summary
  if (results.length === 0) {
    console.log('✅ No long functions found that match heuristics.');
  } else {
    console.log(`⚠️ Found ${results.length} long function(s). See ${OUT_FILE} for details.`);
    for (const r of results) {
      const pkgList = [...new Set(r.suggestions.map(s => s.pkg))];
      console.log(`- ${path.relative(ROOT, r.file)}:${r.startLine}-${r.endLine} (${r.length} lines) -> suggestions: ${pkgList.join(', ') || 'none'}`);
    }
  }
  const failOn = process.argv.includes('--fail-on-suggestions');
  if (failOn && results.length > 0) {
    console.error('Failing due to suggestions.');
    process.exit(1);
  }
}

run();
