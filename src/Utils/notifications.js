import { decodedToken } from '../middlewares/auth.meddleware.js';
import { errorResponse } from './response/error.response.js';
const subscribers = new Map();
export function disconnectUser(userId) {
  for (const connection of subscribers.get(String(userId)) || []) connection.res.end();
}
export async function notifyUser(userId, data) {
  await Promise.all([...subscribers.get(String(userId)) || []].map(async ({ res, authorization }) => {
    try {
      const { user } = await decodedToken({ authorization });
      if (!user.notificationsEnabled) return res.end();
      if (res.writableLength > 65536) return res.end();
      res.write('event: message\ndata: ' + JSON.stringify(data) + '\n\n');
    } catch { res.end(); }
  }));
}
export function streamNotifications(req, res) {
  if (!req.user.notificationsEnabled) errorResponse({ status: 409, message: 'Notifications are disabled' });
  const id = String(req.user._id);
  const connections = subscribers.get(id) || new Set();
  if (connections.size >= 3) errorResponse({ status: 429, message: 'Too many notification streams' });
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write('event: ready\ndata: {}\n\n');
  const connection = { res, authorization: req.headers.authorization };
  connections.add(connection);
  subscribers.set(id, connections);
  let checking = false;
  const timer = setInterval(async () => {
    if (checking) return;
    checking = true;
    try {
      const { user } = await decodedToken({ authorization: req.headers.authorization });
      if (!user.notificationsEnabled) return res.end();
      res.write(': heartbeat\n\n');
    } catch { res.end(); }
    finally { checking = false; }
  }, 15000);
  timer.unref();
  res.on('close', () => { clearInterval(timer); connections.delete(connection); if (!connections.size) subscribers.delete(id); });
}
