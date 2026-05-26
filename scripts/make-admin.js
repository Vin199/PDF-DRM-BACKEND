#!/usr/bin/env node

import db from '../config/db.js';

const email = process.argv[2];

if (!email) {
  console.log('Usage: node scripts/make-admin.js <email>');
  console.log('Example: node scripts/make-admin.js admin@example.com');
  process.exit(1);
}

try {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());

  if (!user) {
    console.error(`❌ User not found: ${email}`);
    console.log('\nAvailable users:');
    const users = db.prepare('SELECT email FROM users').all();
    users.forEach(u => console.log(`  - ${u.email}`));
    process.exit(1);
  }

  if (user.is_admin) {
    console.log(`✓ ${email} is already an admin`);
    process.exit(0);
  }

  db.prepare('UPDATE users SET is_admin = 1 WHERE email = ?').run(email.toLowerCase());

  console.log(`✓ ${email} is now an admin`);
  console.log('\nPlease logout and login again to apply changes.');

} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
