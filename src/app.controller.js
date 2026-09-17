import mongoose from 'mongoose';
import path from 'node:path';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { authRouter, messageRouter, userRouter } from './modules/index.js';
import { globalErrorHandler, NotFoundException } from './Utils/response/error.response.js';
import { corsOptions } from './Utils/cors/cors.utils.js';
import { customRateLimiter } from './middlewares/rateLimtter.meddleware.js';
import { NODE_ENV, TRUST_PROXY } from '../config/config.service.js';
import { publicProfile, profileQR } from './modules/User/user.service.js';
import { validation } from './middlewares/validation.middleware.js';
import { handleSchema } from './modules/User/user.validation.js';

// App construction has no database or network side effects.
export default async function bootstrap(app, express) {
  if (TRUST_PROXY) app.set('trust proxy', TRUST_PROXY.split(',').map(v => v.trim()));
  app.disable('x-powered-by');
  app.use(helmet(), cors(corsOptions()), express.json({ limit: '32kb' }));
  if (NODE_ENV !== 'test') app.use(morgan('tiny'));
  app.get('/health/live', (req, res) => res.json({ status: 'ok' }));
  app.get('/health/ready', (req, res) => res.status(mongoose.connection.readyState === 1 ? 200 : 503).json({ ready: mongoose.connection.readyState === 1 }));
  app.use(customRateLimiter);
  app.get('/', (req, res) => res.json({ message: 'Sara7a API' }));
  app.use('/uploads', express.static(path.resolve('src/uploads'), { dotfiles: 'deny' }));
  app.get('/u/:handle/qr', validation(handleSchema), profileQR);
  app.get('/u/:handle', validation(handleSchema), publicProfile);
  app.use('/auth', authRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/user', userRouter);
  app.use('/api/message', messageRouter);
  app.use((req, res) => NotFoundException());
  app.use(globalErrorHandler);
  return app;
}
