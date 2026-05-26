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

// Encrypt data using AES-256-CBC
export function encryptData(data, key, iv) {
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  return encrypted;
}

// Decrypt data using AES-256-CBC
export function decryptData(encryptedData, key, iv) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final()
  ]);
  return decrypted;
}

// Get asset storage path
export function getAssetPath(assetId) {
  return path.join(storagePaths.encrypted, assetId);
}

// Save encrypted page
export function saveEncryptedPage(assetId, pageNum, encryptedData) {
  const assetDir = getAssetPath(assetId);
  if (!fs.existsSync(assetDir)) {
    fs.mkdirSync(assetDir, { recursive: true });
  }

  const pagePath = path.join(assetDir, `page-${pageNum}.enc`);
  fs.writeFileSync(pagePath, encryptedData);
  return pagePath;
}

// Read encrypted page
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
