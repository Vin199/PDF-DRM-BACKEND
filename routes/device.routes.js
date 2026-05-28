import express from 'express';
import db from '../config/db.js';
import { verifyToken } from '../middleware/auth.middleware.js';

const router = express.Router();

// Register device public key
router.post('/register', verifyToken, (req, res) => {
  try {
    const { deviceId, publicKey } = req.body;
    const userId = req.user.userId; // JWT payload uses 'userId' not 'id'

    if (!deviceId || !publicKey) {
      return res.status(400).json({ error: 'Device ID and public key are required' });
    }

    // Validate public key is in JWK format
    try {
      const jwk = JSON.parse(publicKey);
      if (!jwk.kty || !jwk.n || !jwk.e) {
        return res.status(400).json({ error: 'Invalid JWK format' });
      }
    } catch (e) {
      return res.status(400).json({ error: 'Public key must be valid JSON (JWK format)' });
    }

    // Upsert device key
    const stmt = db.prepare(`
      INSERT INTO device_keys (user_id, device_id, public_key, registered_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, device_id)
      DO UPDATE SET public_key = excluded.public_key, registered_at = CURRENT_TIMESTAMP
    `);

    stmt.run(userId, deviceId, publicKey);

    res.json({
      message: 'Device registered successfully',
      deviceId,
      userId
    });
  } catch (error) {
    console.error('Device registration error:', error);
    res.status(500).json({ error: 'Device registration failed' });
  }
});

// Get user's registered devices
router.get('/list', verifyToken, (req, res) => {
  try {
    const userId = req.user.userId;

    const devices = db.prepare(`
      SELECT device_id, registered_at
      FROM device_keys
      WHERE user_id = ?
      ORDER BY registered_at DESC
    `).all(userId);

    res.json({ devices });
  } catch (error) {
    console.error('Device list error:', error);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

// Revoke a device
router.delete('/revoke/:deviceId', verifyToken, (req, res) => {
  try {
    const userId = req.user.userId;
    const { deviceId } = req.params;

    const stmt = db.prepare(`
      DELETE FROM device_keys
      WHERE user_id = ? AND device_id = ?
    `);

    const result = stmt.run(userId, deviceId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json({ message: 'Device revoked successfully' });
  } catch (error) {
    console.error('Device revocation error:', error);
    res.status(500).json({ error: 'Failed to revoke device' });
  }
});

export default router;
