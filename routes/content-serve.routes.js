import express from 'express';
import fs from 'fs';
import db from '../config/db.js';
import { readEncryptedPDF, verifySignedURL, getAssetPath } from '../config/storage.js';
import path from 'path';

const router = express.Router();

// Middleware to verify signed URL
const verifySignature = (req, res, next) => {
  const { assetId } = req.params;
  const { token, expires } = req.query;

  if (!token || !expires) {
    return res.status(403).json({ error: 'Missing signature parameters' });
  }

  const verification = verifySignedURL(assetId, token, parseInt(expires));

  if (!verification.valid) {
    return res.status(403).json({
      error: verification.reason === 'expired' ? 'Signed URL expired' : 'Invalid signature'
    });
  }

  next();
};

// Serve entire encrypted PDF
router.get('/full/:assetId', verifySignature, (req, res) => {
  try {
    const { assetId } = req.params;

    // Check if asset exists
    const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(assetId);
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const encryptedPDF = readEncryptedPDF(assetId);

    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Length': encryptedPDF.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff'
    });

    res.send(encryptedPDF);

  } catch (error) {
    console.error('Serve content error:', error);
    res.status(500).json({ error: 'Failed to serve content' });
  }
});

// Serve encrypted PDF in chunks (for progressive loading)
router.get('/chunk/:assetId', verifySignature, (req, res) => {
  try {
    const { assetId } = req.params;
    const { start, end } = req.query;

    if (!start) {
      return res.status(400).json({ error: 'Start parameter is required' });
    }

    // Check if asset exists
    const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(assetId);
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const pdfPath = path.join(getAssetPath(assetId), 'content.enc');
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({ error: 'Encrypted content not found' });
    }

    const stats = fs.statSync(pdfPath);
    const fileSize = stats.size;

    const startByte = parseInt(start);
    const endByte = end ? parseInt(end) : Math.min(startByte + 5 * 1024 * 1024, fileSize - 1); // 5MB chunks default

    if (startByte >= fileSize || startByte < 0) {
      return res.status(416).json({ error: 'Invalid range' });
    }

    const actualEnd = Math.min(endByte, fileSize - 1);
    const chunkSize = actualEnd - startByte + 1;

    // Read chunk
    const buffer = Buffer.alloc(chunkSize);
    const fileHandle = fs.openSync(pdfPath, 'r');
    fs.readSync(fileHandle, buffer, 0, chunkSize, startByte);
    fs.closeSync(fileHandle);

    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Length': chunkSize,
      'Content-Range': `bytes ${startByte}-${actualEnd}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'X-Total-Size': fileSize
    });

    res.status(206).send(buffer); // 206 Partial Content

  } catch (error) {
    console.error('Serve chunk error:', error);
    res.status(500).json({ error: 'Failed to serve chunk' });
  }
});

// Get page ranges for chunk-based loading (helper endpoint)
router.get('/page-ranges/:assetId', verifySignature, async (req, res) => {
  try {
    const { assetId } = req.params;
    const { pagesPerChunk = 5 } = req.query;

    const asset = db.prepare('SELECT total_pages FROM assets WHERE id = ?').get(assetId);
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const totalPages = asset.total_pages;
    const chunkSize = parseInt(pagesPerChunk);
    const ranges = [];

    for (let i = 1; i <= totalPages; i += chunkSize) {
      ranges.push({
        chunkIndex: Math.floor((i - 1) / chunkSize),
        startPage: i,
        endPage: Math.min(i + chunkSize - 1, totalPages)
      });
    }

    res.json({ totalPages, pagesPerChunk: chunkSize, ranges });

  } catch (error) {
    console.error('Page ranges error:', error);
    res.status(500).json({ error: 'Failed to calculate page ranges' });
  }
});

export default router;
