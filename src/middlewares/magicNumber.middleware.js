import { fileTypeFromFile } from 'file-type';
import { BadRequestException } from '../Utils/response/error.response.js';
export const magicNumberValidation = (allowed = []) => async (req, res, next) => {
  for (const file of req.files || (req.file ? [req.file] : [])) {
    const type = await fileTypeFromFile(file.path);
    if (!type || !allowed.includes(type.mime) || type.mime !== file.mimetype) BadRequestException('Invalid image content');
  }
  next();
};
