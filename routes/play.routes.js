import express from 'express';
import crypto from 'crypto';
import db from '../config/db.js';
import { verifyToken } from '../middleware/auth.middleware.js';
import { getMasterKey, unwrapContentKey, generateSignedURL } from '../config/storage.js';

const router = express.Router();

// Play request - wraps content key with device public key
router.post('/:assetId', verifyToken, async (req, res) => {
  try {
    const { assetId } = req.params;
    const { deviceId } = req.body;
    const userId = req.user.userId; // JWT payload uses 'userId' not 'id'

    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID is required' });
    }

    // Check entitlement
    const entitlement = db.prepare(`
      SELECT * FROM entitlements WHERE user_id = ? AND asset_id = ?
    `).get(userId, assetId);

    if (!entitlement) {
      return res.status(403).json({ error: 'Access denied: No entitlement for this content' });
    }

    // Get asset metadata
    const asset = db.prepare(`
      SELECT id, title, wrapped_content_key, iv, total_pages, file_size
      FROM assets WHERE id = ?
    `).get(assetId);

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Get device public key
    const deviceKey = db.prepare(`
      SELECT public_key FROM device_keys WHERE user_id = ? AND device_id = ?
    `).get(userId, deviceId);

    if (!deviceKey) {
      return res.status(403).json({
        error: 'Device not registered. Please register this device first.'
      });
    }

    // Unwrap content key with master key
    const masterKey = getMasterKey();
    const contentKey = unwrapContentKey(asset.wrapped_content_key, masterKey);

    // Import device public key (JWK format)
    const publicKeyJWK = JSON.parse(deviceKey.public_key);

    // Convert content key to format suitable for RSA encryption
    // RSA-OAEP can only encrypt data up to keySize - 2*hashSize - 2
    // For 2048-bit RSA with SHA-256: 2048/8 - 2*32 - 2 = 190 bytes max
    // Our content key is 32 bytes, so it fits

    // Use node crypto to perform RSA-OAEP encryption
    const publicKey = crypto.createPublicKey({
      key: publicKeyJWK,
      format: 'jwk'
    });

    const encryptedContentKey = crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      },
      contentKey
    );

    // Zero out sensitive data
    contentKey.fill(0);
    masterKey.fill(0);

    // Generate signed URL for encrypted content
    const { token, expires } = generateSignedURL(assetId, 15); // 15-minute expiry

    // Log access
    db.prepare(`
      INSERT INTO access_logs (user_id, asset_id, accessed_at, ip_address)
      VALUES (?, ?, CURRENT_TIMESTAMP, ?)
    `).run(userId, assetId, req.ip || 'unknown');

    res.json({
      assetId: asset.id,
      title: asset.title,
      totalPages: asset.total_pages,
      fileSize: asset.file_size,
      iv: asset.iv,
      encryptedContentKey: encryptedContentKey.toString('base64'),
      signedUrl: {
        token,
        expires
      }
    });

  } catch (error) {
    console.error('Play request error:', error);
    res.status(500).json({ error: 'Failed to process play request' });
  }
});

export default router;
