import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Storage paths
export const storagePaths = {
  root: process.env.STORAGE_PATH || path.join(__dirname, '../storage'),
  encrypted: process.env.ENCRYPTED_CONTENT_PATH || path.join(__dirname, '../storage/encrypted'),
  keys: process.env.KEYS_PATH || path.join(__dirname, '../storage/keys'),
  uploads: process.env.UPLOADS_PATH || path.join(__dirname, '../storage/uploads')
};

// Initialize storage directories
export function initializeStorage() {
  Object.values(storagePaths).forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  });
}

// Get or create master encryption key
export function getMasterKey() {
  const masterKeyPath = process.env.MASTER_KEY_FILE ||
    path.join(storagePaths.keys, 'master.key');

  if (fs.existsSync(masterKeyPath)) {
    return fs.readFileSync(masterKeyPath);
  }

  // Generate new master key (256-bit)
  const masterKey = crypto.randomBytes(32);
  fs.writeFileSync(masterKeyPath, masterKey, { mode: 0o600 });
  console.log('Generated new master encryption key');

  return masterKey;
}

// Generate content encryption key (CEK) for a specific asset
export function generateAssetKey(masterKey, assetId) {
  // Derive asset-specific key from master key
  return crypto.pbkdf2Sync(
    masterKey,
    assetId,
    100000,
    32,
    'sha256'
  );
}

// Generate random content key for envelope encryption
export function generateContentKey() {
  return crypto.randomBytes(32); // 256-bit key for AES-256-GCM
}

// Wrap content key with master key using AES-256-GCM
export function wrapContentKey(contentKey, masterKey) {
  const iv = crypto.randomBytes(12); // GCM uses 12-byte IV
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);

  const encrypted = Buffer.concat([
    cipher.update(contentKey),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  // Return iv + authTag + encrypted combined
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

// Unwrap content key with master key
export function unwrapContentKey(wrappedKey, masterKey) {
  const buffer = Buffer.from(wrappedKey, 'base64');

  const iv = buffer.slice(0, 12);
  const authTag = buffer.slice(12, 28);
  const encrypted = buffer.slice(28);

  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
  decipher.setAuthTag(authTag);

  const contentKey = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);

  return contentKey;
}

// Encrypt data using AES-256-GCM
export function encryptData(data, key, iv) {
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Return encrypted + authTag combined
  return Buffer.concat([encrypted, authTag]);
}

// Decrypt data using AES-256-GCM
export function decryptData(encryptedData, key, iv) {
  // Last 16 bytes are auth tag
  const encrypted = encryptedData.slice(0, -16);
  const authTag = encryptedData.slice(-16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);
  return decrypted;
}

// Get asset storage path
export function getAssetPath(assetId) {
  return path.join(storagePaths.encrypted, assetId);
}

// Save encrypted PDF (entire file)
export function saveEncryptedPDF(assetId, encryptedData) {
  const assetDir = getAssetPath(assetId);
  if (!fs.existsSync(assetDir)) {
    fs.mkdirSync(assetDir, { recursive: true });
  }

  const pdfPath = path.join(assetDir, 'content.enc');
  fs.writeFileSync(pdfPath, encryptedData);
  return pdfPath;
}

// Read entire encrypted PDF
export function readEncryptedPDF(assetId) {
  const pdfPath = path.join(getAssetPath(assetId), 'content.enc');
  if (!fs.existsSync(pdfPath)) {
    throw new Error('Encrypted PDF not found');
  }
  return fs.readFileSync(pdfPath);
}

// Read chunk of encrypted PDF (for streaming)
export function readEncryptedPDFChunk(assetId, start, end) {
  const pdfPath = path.join(getAssetPath(assetId), 'content.enc');
  if (!fs.existsSync(pdfPath)) {
    throw new Error('Encrypted PDF not found');
  }

  const fileHandle = fs.openSync(pdfPath, 'r');
  const length = end ? (end - start + 1) : undefined;
  const buffer = Buffer.alloc(length || fs.statSync(pdfPath).size - start);

  fs.readSync(fileHandle, buffer, 0, buffer.length, start);
  fs.closeSync(fileHandle);

  return buffer;
}

// Save encrypted page (legacy - for backward compatibility)
export function saveEncryptedPage(assetId, pageNum, encryptedData) {
  const assetDir = getAssetPath(assetId);
  if (!fs.existsSync(assetDir)) {
    fs.mkdirSync(assetDir, { recursive: true });
  }

  const pagePath = path.join(assetDir, `page-${pageNum}.enc`);
  fs.writeFileSync(pagePath, encryptedData);
  return pagePath;
}

// Read encrypted page (legacy - for backward compatibility)
export function readEncryptedPage(assetId, pageNum) {
  const pagePath = path.join(getAssetPath(assetId), `page-${pageNum}.enc`);
  if (!fs.existsSync(pagePath)) {
    throw new Error('Page not found');
  }
  return fs.readFileSync(pagePath);
}

// Save manifest
export function saveManifest(assetId, manifest) {
  const assetDir = getAssetPath(assetId);
  if (!fs.existsSync(assetDir)) {
    fs.mkdirSync(assetDir, { recursive: true });
  }

  const manifestPath = path.join(assetDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifestPath;
}

// Read manifest
export function readManifest(assetId) {
  const manifestPath = path.join(getAssetPath(assetId), 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Manifest not found');
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

// Delete asset (cleanup)
export function deleteAsset(assetId) {
  const assetDir = getAssetPath(assetId);
  if (fs.existsSync(assetDir)) {
    fs.rmSync(assetDir, { recursive: true, force: true });
  }
}

// Generate HMAC signed URL
export function generateSignedURL(assetId, expiryMinutes = 15) {
  const signingSecret = process.env.SIGNING_SECRET || 'default-signing-secret-change-me';
  const expires = Date.now() + (expiryMinutes * 60 * 1000);

  const message = `${assetId}:${expires}`;
  const signature = crypto
    .createHmac('sha256', signingSecret)
    .update(message)
    .digest('hex');

  return {
    token: signature,
    expires
  };
}

// Verify HMAC signed URL
export function verifySignedURL(assetId, token, expires) {
  const signingSecret = process.env.SIGNING_SECRET || 'default-signing-secret-change-me';

  // Check expiry
  if (Date.now() > expires) {
    return { valid: false, reason: 'expired' };
  }

  // Recompute signature
  const message = `${assetId}:${expires}`;
  const expectedSignature = crypto
    .createHmac('sha256', signingSecret)
    .update(message)
    .digest('hex');

  // Timing-safe comparison
  const valid = crypto.timingSafeEqual(
    Buffer.from(token, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );

  return { valid, reason: valid ? null : 'invalid_signature' };
}
