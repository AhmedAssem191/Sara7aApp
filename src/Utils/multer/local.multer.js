import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
export const uploadRoot = path.resolve('src/uploads');
export const fileValidation = { images: ['image/png', 'image/jpeg'], documents: ['application/pdf', 'application/msword'] };
export const localFileUpload = ({ customPath = 'User', validation = fileValidation.images } = {}) => multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const dir = path.join(uploadRoot, customPath, String(req.user._id));
      fs.mkdir(dir, { recursive: true }, error => cb(error, dir));
    },
    filename(req, file, cb) {
      const filename = randomUUID() + (file.mimetype === 'image/png' ? '.png' : '.jpg');
      file.finalPath = '/uploads/' + customPath + '/' + req.user._id + '/' + filename;
      cb(null, filename);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 5, fields: 0, parts: 6 },
  fileFilter(req, file, cb) {
    if (validation.includes(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error('Only PNG and JPEG images are allowed'), { status: 400 }));
  },
});
