import express from 'express';
import mongoose from 'mongoose';
import bootstrap from './src/app.controller.js';
import connectDB from './src/DB/connection.js';
import { PORT, validateConfig } from './config/config.service.js';

try {
  validateConfig();
  await connectDB();
  const app = await bootstrap(express(), express);
  const server = app.listen(PORT, () => console.log('Sara7a API listening on port ' + PORT));
  server.on('error', async error => { console.error('HTTP server failed:', error.code); await mongoose.disconnect(); process.exitCode = 1; });
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 10000).unref();
    server.close(async () => { await mongoose.disconnect(); clearTimeout(deadline); process.exit(0); });
    server.closeIdleConnections();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  console.error('Startup failed:', error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
}
