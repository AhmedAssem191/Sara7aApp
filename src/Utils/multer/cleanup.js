import fs from 'node:fs/promises';
import path from 'node:path';
import { uploadRoot } from './local.multer.js';
export async function removeUpload(filePath) {
  if (!filePath || typeof filePath !== 'string' || /^https?:/i.test(filePath)) return;
  const target = path.isAbsolute(filePath) && !filePath.startsWith('/uploads/')
    ? path.resolve(filePath) : path.resolve('src', filePath.replace(/^\//, ''));
  const relative = path.relative(uploadRoot, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unsafe upload path');
  await fs.unlink(target).catch(error => { if (error.code !== 'ENOENT') throw error; });
}
export async function cleanupRequestUploads(req) {
  if (req.uploadsCommitted) return;
  await Promise.all((req.files || (req.file ? [req.file] : [])).map(file => removeUpload(file.path)));
}
export async function removeUserUploads(userId) {
  if (!/^[a-f0-9]{24}$/i.test(String(userId))) throw new Error('Invalid upload owner');
  const root = path.resolve(uploadRoot, 'User');
  const target = path.resolve(root, String(userId));
  if (path.dirname(target) !== root) throw new Error('Unsafe upload directory');
  await fs.rm(target, { recursive: true, force: true });
}
