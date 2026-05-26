import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { PDFDocument } from 'pdf-lib';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/db.js';
import { verifyToken } from '../middleware/auth.middleware.js';
import {
  storagePaths,
  getMasterKey,
  generateAssetKey,
  encryptData,
  saveEncryptedPage,
  saveManifest
} from '../config/storage.js';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, storagePaths.uploads);
    },
    filename: (req, file, cb) => {
      const uniqueName = `${Date.now()}-${file.originalname}`;
      cb(null, uniqueName);
    }
  }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);

  if (!user || !user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
};

// Initialize database tables
router.get('/migrate', (req, res) => {
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
        iv TEXT NOT NULL,
        total_pages INTEGER NOT NULL,
        file_size INTEGER,
        status TEXT DEFAULT 'ready',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

    // Access logs table (for analytics and piracy detection)
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

    res.json({ success: true, message: 'Database initialized' });
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ error: 'Migration failed' });
  }
});

// Upload and process PDF
router.post('/upload', verifyToken, isAdmin, upload.single('pdf'), async (req, res) => {
  let tempFilePath = null;
  let assetId = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const { title } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    tempFilePath = req.file.path;
    assetId = uuidv4();

    console.log(`Processing PDF upload: ${title} (${assetId})`);

    // Read and parse PDF
    const pdfBytes = fs.readFileSync(tempFilePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const totalPages = pdfDoc.getPageCount();

    console.log(`PDF has ${totalPages} pages`);

    // Get master key and generate asset-specific key
    const masterKey = getMasterKey();
    const assetKey = generateAssetKey(masterKey, assetId);
    const iv = crypto.randomBytes(16);

    // Process and encrypt each page
    console.log('Encrypting pages...');
    const manifest = {
      assetId,
      title,
      totalPages,
      pages: []
    };

    for (let i = 0; i < totalPages; i++) {
      const pageNum = i + 1;

      // Create single-page PDF
      const singlePageDoc = await PDFDocument.create();
      const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [i]);
      singlePageDoc.addPage(copiedPage);
      const singlePageBytes = await singlePageDoc.save();

      // Derive page-specific key
      const pageKey = crypto.createHash('sha256')
        .update(assetKey)
        .update(`page-${pageNum}`)
        .digest();

      // Encrypt page
      const encryptedPage = encryptData(singlePageBytes, pageKey, iv);

      // Save encrypted page
      saveEncryptedPage(assetId, pageNum, encryptedPage);

      manifest.pages.push({
        pageNum,
        size: encryptedPage.length
      });

      // Zero out sensitive data
      pageKey.fill(0);
    }

    // Save manifest
    saveManifest(assetId, manifest);

    // Store metadata in database
    const stmt = db.prepare(`
      INSERT INTO assets (id, title, iv, total_pages, file_size, status)
      VALUES (?, ?, ?, ?, ?, 'ready')
    `);

    stmt.run(
      assetId,
      title,
      iv.toString('hex'),
      totalPages,
      pdfBytes.length
    );

    // Cleanup
    assetKey.fill(0);
    masterKey.fill(0);
    fs.unlinkSync(tempFilePath);

    console.log(`✓ Upload complete: ${assetId}`);

    res.json({
      success: true,
      asset: {
        id: assetId,
        title,
        totalPages,
        fileSize: pdfBytes.length
      }
    });

  } catch (error) {
    console.error('Upload error:', error);

    // Cleanup on error
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    if (assetId) {
      // Remove partial asset data
      try {
        db.prepare('DELETE FROM assets WHERE id = ?').run(assetId);
      } catch (e) {}
    }

    res.status(500).json({ error: 'Failed to process PDF: ' + error.message });
  }
});

// Grant entitlement
router.post('/entitle', verifyToken, isAdmin, (req, res) => {
  try {
    const { email, assetId } = req.body;

    if (!email || !assetId) {
      return res.status(400).json({ error: 'Email and assetId are required' });
    }

    // Find user
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if asset exists
    const asset = db.prepare('SELECT id FROM assets WHERE id = ?').get(assetId);
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Grant entitlement (ignore if already exists)
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO entitlements (user_id, asset_id)
      VALUES (?, ?)
    `);
    const result = stmt.run(user.id, assetId);

    res.json({
      success: true,
      message: result.changes > 0 ? 'Entitlement granted' : 'Already entitled'
    });
  } catch (error) {
    console.error('Entitlement error:', error);
    res.status(500).json({ error: 'Failed to grant entitlement' });
  }
});

// Revoke entitlement
router.delete('/entitle', verifyToken, isAdmin, (req, res) => {
  try {
    const { email, assetId } = req.body;

    if (!email || !assetId) {
      return res.status(400).json({ error: 'Email and assetId are required' });
    }

    // Find user
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Revoke entitlement
    const stmt = db.prepare('DELETE FROM entitlements WHERE user_id = ? AND asset_id = ?');
    const result = stmt.run(user.id, assetId);

    res.json({
      success: true,
      message: result.changes > 0 ? 'Entitlement revoked' : 'Not entitled'
    });
  } catch (error) {
    console.error('Revoke error:', error);
    res.status(500).json({ error: 'Failed to revoke entitlement' });
  }
});

// Make user admin
router.post('/make-admin', verifyToken, isAdmin, (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const stmt = db.prepare('UPDATE users SET is_admin = 1 WHERE email = ?');
    const result = stmt.run(email.toLowerCase());

    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, message: 'User is now an admin' });
  } catch (error) {
    console.error('Make admin error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// List all users (for testing)
router.get('/users', verifyToken, isAdmin, (req, res) => {
  try {
    const users = db.prepare('SELECT id, email, name, is_admin, created_at FROM users').all();
    res.json({ users });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// List all assets (for testing)
router.get('/assets', verifyToken, isAdmin, (req, res) => {
  try {
    const assets = db.prepare('SELECT * FROM assets').all();
    res.json({ assets });
  } catch (error) {
    console.error('List assets error:', error);
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

export default router;
