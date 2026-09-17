import fs from 'node:fs';
import path from 'node:path';
// Keep native image-renderer caches inside the ignored workspace cache on Windows.
if (process.platform === 'win32') {
  const cache = path.resolve('node_modules/.cache/fontconfig');
  fs.mkdirSync(cache, { recursive: true });
  const xml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
  const config = path.join(cache, 'fonts.conf');
  fs.writeFileSync(config, '<?xml version="1.0"?><fontconfig><dir>' + xml(path.join(process.env.WINDIR || 'C:/Windows', 'Fonts')) + '</dir><cachedir>' + xml(cache) + '</cachedir></fontconfig>');
  process.env.FONTCONFIG_FILE = config;
}
process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_SECRET = '12345678901234567890123456789012';
process.env.ABUSE_HASH_SECRET = 'test-abuse-secret-not-for-production';
process.env.TOKEN_USER_ACCESS_KEY = 'test-user-access-key-not-for-production';
process.env.TOKEN_USER_REFRESH_KEY = 'test-user-refresh-key-not-for-production';
process.env.TOKEN_ADMIN_ACCESS_KEY = 'test-admin-access-key-not-for-production';
process.env.TOKEN_ADMIN_REFRESH_KEY = 'test-admin-refresh-key-not-for-production';
process.env.PUBLIC_URL = 'https://sara7a.example';
process.env.WHITE_LIST = 'https://client.example';
