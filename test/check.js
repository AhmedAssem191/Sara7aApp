import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['uploads', 'logger'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith('.js')) files.push(file);
  }
}
for (const root of ['src', 'config', 'test']) walk(root);
files.push('index.js');
let errors = 0;
for (const file of files) {
  const checked = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', windowsHide: true });
  if (checked.status !== 0) { console.error(checked.stderr); errors++; }
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/(?:from\s*|import\s*\(\s*)['"](\.[^'"]+)['"]/g)) {
    const target = path.resolve(path.dirname(file), match[1]);
    if (!fs.existsSync(target)) { console.error(file + ': missing import ' + match[1]); errors++; continue; }
    const relative = path.relative(process.cwd(), target);
    let current = process.cwd();
    for (const segment of relative.split(path.sep)) {
      if (!fs.readdirSync(current).includes(segment)) { console.error(file + ': incorrect import case ' + match[1]); errors++; break; }
      current = path.join(current, segment);
    }
  }
}
console.log(files.length + ' JavaScript files checked; ' + errors + ' errors');
process.exitCode = errors ? 1 : 0;
