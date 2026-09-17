import fs from 'node:fs';
import path from 'node:path';
import morgan from 'morgan';
export function attachRouterWithLogger(app, routerPath, router, logFileName) {
  const directory = path.resolve('src/logger');
  fs.mkdirSync(directory, { recursive: true });
  const logStream = fs.createWriteStream(path.join(directory, path.basename(logFileName)), { flags: 'a' });
  logStream.on('error', error => console.error('Log write failed:', error.code));
  app.use(routerPath, morgan('combined', { stream: logStream }), router);
  return logStream;
}
