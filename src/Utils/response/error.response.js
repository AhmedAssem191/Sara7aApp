import { NODE_ENV } from '../../../config/config.service.js';
import { cleanupRequestUploads } from '../multer/cleanup.js';
export const errorResponse = ({ message = 'Request failed', status = 400, extra }) => {
  const error = new Error(typeof message === 'string' ? message : message?.message || 'Request failed');
  error.status = status; error.extra = extra || message?.details; throw error;
};
export const BadRequestException = (message, extra) => errorResponse({ message, status: 400, extra });
export const conflictException = (message, extra) => errorResponse({ message, status: 409, extra });
export const unauthorizedException = (message = 'Authentication required') => errorResponse({ message, status: 401 });
export const ForbiddenException = (message = 'Forbidden') => errorResponse({ message, status: 403 });
export const NotFoundException = (message = 'Not found') => errorResponse({ message, status: 404 });
export const globalErrorHandler = async (error, req, res, next) => {
  await cleanupRequestUploads(req).catch(() => console.error('Upload cleanup failed'));
  if (res.headersSent) return next(error);
  let status = error.status || 500;
  let message = error.message;
  if (['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name)) { status = 401; message = 'Invalid or expired token'; }
  if (['ValidationError', 'CastError'].includes(error.name)) { status = 400; message = 'Invalid request data'; }
  if (error.code === 11000) { status = 409; message = 'Resource already exists'; }
  if (error.name === 'MulterError') { status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400; message = error.code === 'LIMIT_FILE_SIZE' ? 'Maximum file size is 5 MB' : 'Invalid upload'; }
  if (!Number.isInteger(status) || status < 400 || status > 599) status = 500;
  if (status >= 500) {
    if (NODE_ENV !== 'test') console.error('Request failed:', error.name);
    message = status === 503 ? 'Service temporarily unavailable; please retry' : 'Internal server error';
  }
  return res.status(status).json({ message, status, ...(error.extra && status < 500 ? { details: error.extra } : {}) });
};
