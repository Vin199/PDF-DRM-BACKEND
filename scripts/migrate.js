import db from '../config/db.js';

console.log('Running database migrations...');

try {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT,
      is_admin INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Assets table
  db.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      wrapped_content_key TEXT NOT NULL,
      iv TEXT NOT NULL,
      total_pages INTEGER NOT NULL,
      file_size INTEGER,
      status TEXT DEFAULT 'ready',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Device keys table
  db.exec(`
    CREATE TABLE IF NOT EXISTS device_keys (
      user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      public_key TEXT NOT NULL,
      registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, device_id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Entitlements table
  db.exec(`
    CREATE TABLE IF NOT EXISTS entitlements (
      user_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, asset_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (asset_id) REFERENCES assets(id)
    )
  `);

  // Access logs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS access_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      page_num INTEGER,
      accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ip_address TEXT,
      user_agent TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (asset_id) REFERENCES assets(id)
    )
  `);

  console.log('✓ Database migrations completed successfully');
} catch (error) {
  console.error('✗ Migration failed:', error);
  process.exit(1);
}
