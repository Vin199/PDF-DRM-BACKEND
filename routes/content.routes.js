import express from 'express';
import jwt from 'jsonwebtoken';
import db from '../config/db.js';
import { verifyToken } from '../middleware/auth.middleware.js';
import { readManifest } from '../config/storage.js';

const router = express.Router();

// Play endpoint - issues license token and returns manifest
router.post('/play/:assetId', verifyToken, async (req, res) => {
  try {
    const { assetId } = req.params;
    const userId = req.user.userId;

    // Check if asset exists
    const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(assetId);
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Check entitlement
    const entitlement = db.prepare(
      'SELECT * FROM entitlements WHERE user_id = ? AND asset_id = ?'
    ).get(userId, assetId);

    if (!entitlement) {
      return res.status(403).json({ error: 'Not entitled to access this content' });
    }

    // Generate license token (used for page key requests)
    const licenseToken = jwt.sign(
      {
        userId,
        assetId,
        sessionId: Date.now()
      },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // Read manifest
    const manifest = readManifest(assetId);

    // Return manifest and license token
    res.json({
      licenseToken,
      manifest,
      asset: {
        id: asset.id,
        title: asset.title,
        totalPages: asset.total_pages
      }
    });
  } catch (error) {
    console.error('Play error:', error);
    res.status(500).json({ error: 'Failed to initialize playback' });
  }
});

// Get asset list
router.get('/list', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get all assets user is entitled to
    const assets = db.prepare(`
      SELECT a.* FROM assets a
      INNER JOIN entitlements e ON a.id = e.asset_id
      WHERE e.user_id = ?
      ORDER BY a.created_at DESC
    `).all(userId);

    res.json({ assets });
  } catch (error) {
    console.error('List error:', error);
    res.status(500).json({ error: 'Failed to fetch content list' });
  }
});

// Check if user is admin
router.get('/is-admin', verifyToken, (req, res) => {
  try {
    const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.user.userId);
    res.json({ isAdmin: Boolean(user?.is_admin) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check admin status' });
  }
});

export default router;
