import express from 'express';
import crypto from 'crypto';
import db from '../config/db.js';
import { verifyLicenseToken } from '../middleware/auth.middleware.js';
import {
  getMasterKey,
  generateAssetKey,
  readEncryptedPage
} from '../config/storage.js';

const router = express.Router();

// Get decryption key and encrypted page data
router.get('/page/:assetId/:pageNum', verifyLicenseToken, async (req, res) => {
  try {
    const { assetId, pageNum } = req.params;
    const pageNumber = parseInt(pageNum);

    // Get asset
    const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(assetId);
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Validate page number
    if (pageNumber < 1 || pageNumber > asset.total_pages) {
      return res.status(400).json({ error: 'Invalid page number' });
    }

    // Get encrypted page data
    const encryptedPageData = readEncryptedPage(assetId, pageNumber);

    // Get master key and generate asset key
    const masterKey = getMasterKey();
    const assetKey = generateAssetKey(masterKey, assetId);

    // Derive page-specific key
    const pageKey = crypto.createHash('sha256')
      .update(assetKey)
      .update(`page-${pageNumber}`)
      .digest();

    // Get IV
    const iv = Buffer.from(asset.iv, 'hex');

    // Zero out sensitive keys
    masterKey.fill(0);
    assetKey.fill(0);

    // Return encrypted page data, key, and IV
    res.json({
      pageNum: pageNumber,
      encryptedData: encryptedPageData.toString('base64'),
      key: pageKey.toString('base64'),
      iv: iv.toString('base64')
    });

    // Zero out page key
    pageKey.fill(0);

  } catch (error) {
    console.error('License error:', error);
    res.status(500).json({ error: 'Failed to issue license' });
  }
});

// Alternative: Get all page keys at once (for better performance)
router.get('/bulk/:assetId', verifyLicenseToken, async (req, res) => {
  try {
    const { assetId } = req.params;

    // Get asset
    const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(assetId);
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Get master key and generate asset key
    const masterKey = getMasterKey();
    const assetKey = generateAssetKey(masterKey, assetId);

    // Generate all page keys
    const pageKeys = {};
    for (let i = 1; i <= asset.total_pages; i++) {
      const pageKey = crypto.createHash('sha256')
        .update(assetKey)
        .update(`page-${i}`)
        .digest('base64');
      pageKeys[i] = pageKey;
    }

    // Zero out sensitive keys
    masterKey.fill(0);
    assetKey.fill(0);

    res.set('Cache-Control', 'no-store');
    res.json({
      assetId,
      iv: asset.iv,
      pageKeys
    });

  } catch (error) {
    console.error('Bulk license error:', error);
    res.status(500).json({ error: 'Failed to issue bulk license' });
  }
});

export default router;
