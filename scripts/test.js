// Initialize test-only environment before starting Node so native libraries see it too.
import '../test/setup.js';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const files = process.argv.slice(2);
if (!files.length) files.push(...fs.readdirSync('test').filter(name => name.endsWith('.test.js')).sort().map(name => 'test/' + name));
const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...files], { env: process.env, stdio: 'inherit', windowsHide: true });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
