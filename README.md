# PDF DRM Backend - Local Storage POC

A complete end-to-end PDF Digital Rights Management system with local encrypted storage. This is a proof-of-concept implementation that stores all encrypted content locally on the machine.

## Features

- ✅ **End-to-End Encryption**: PDFs are encrypted page-by-page using AES-256-CBC
- ✅ **Local Key Management**: Master encryption key stored securely on local filesystem
- ✅ **User Authentication**: JWT-based authentication system
- ✅ **Admin Panel**: Web interface for uploading PDFs and managing access
- ✅ **Entitlement System**: Control which users can access which PDFs
- ✅ **Watermarking**: Dynamic watermarks with user email and timestamp
- ✅ **Page-by-Page Decryption**: Content never stored decrypted on disk
- ✅ **License Tokens**: Temporary tokens for secure page key distribution

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        UPLOAD FLOW                          │
├─────────────────────────────────────────────────────────────┤
│  1. Admin uploads PDF via web interface                     │
│  2. Backend splits PDF into individual pages                │
│  3. Each page encrypted with unique derived key             │
│  4. Encrypted pages stored in ./storage/encrypted/          │
│  5. Master key stored in ./storage/keys/master.key          │
│  6. Metadata saved to SQLite database                       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      PLAYBACK FLOW                          │
├─────────────────────────────────────────────────────────────┤
│  1. User requests to view PDF (must be entitled)            │
│  2. Backend issues license token (JWT, 2-hour expiry)       │
│  3. Frontend requests encrypted page + decryption key       │
│  4. Backend validates license token                         │
│  5. Backend derives page key from master key                │
│  6. Frontend decrypts page in browser using Web Crypto API  │
│  7. PDF rendered on canvas with watermark                   │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: SQLite (better-sqlite3)
- **PDF Processing**: pdf-lib
- **Encryption**: Node.js crypto module (AES-256-CBC)
- **Authentication**: JWT (jsonwebtoken)
- **File Upload**: Multer

## Installation

### 1. Install Dependencies

```bash
cd pdf-drm-backend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set:
```bash
PORT=3001
JWT_SECRET=$(openssl rand -hex 32)
FRONTEND_URL=http://localhost:5173
```

### 3. Initialize Database

```bash
npm run migrate
```

This creates:
- `./data/pdf-drm.db` - SQLite database
- `./storage/encrypted/` - Encrypted PDF pages
- `./storage/keys/` - Master encryption key
- `./storage/uploads/` - Temporary upload directory

### 4. Create Admin User

Start the server:
```bash
npm start
```

Then register a user via the frontend, and make them admin using:
```bash
# Using the migrate endpoint, first register a user through the frontend
# Then make them admin by directly updating the database:
sqlite3 ./data/pdf-drm.db "UPDATE users SET is_admin = 1 WHERE email = 'your@email.com';"
```

Alternatively, you can register as admin from the start by modifying the registration route temporarily.

## API Endpoints

### Public Endpoints

- `POST /auth/register` - Register new user
- `POST /auth/login` - Login and get JWT token

### User Endpoints (Requires JWT)

- `GET /content/list` - List entitled PDFs
- `POST /content/play/:assetId` - Request playback (issues license token)
- `GET /content/is-admin` - Check if current user is admin

### License Endpoints (Requires License Token)

- `GET /license/page/:assetId/:pageNum` - Get encrypted page + decryption key
- `GET /license/bulk/:assetId` - Get all page keys for asset (faster)

### Admin Endpoints (Requires Admin Role)

- `POST /admin/upload` - Upload and encrypt PDF
- `POST /admin/entitle` - Grant user access to PDF
- `DELETE /admin/entitle` - Revoke user access
- `POST /admin/make-admin` - Make user an admin
- `GET /admin/users` - List all users
- `GET /admin/assets` - List all assets

## Security Features

### Encryption

- **Master Key**: 256-bit randomly generated, stored with 0600 permissions
- **Asset Keys**: Derived from master key using PBKDF2 (100k iterations)
- **Page Keys**: SHA-256 hash of (asset key + page number)
- **Algorithm**: AES-256-CBC with random IV per asset

### Key Management

```
Master Key (256-bit)
  └─> Asset Key (PBKDF2 with assetId as salt)
       └─> Page 1 Key (SHA256(assetKey + "page-1"))
       └─> Page 2 Key (SHA256(assetKey + "page-2"))
       └─> Page N Key (SHA256(assetKey + "page-N"))
```

Keys are:
- Never logged
- Zeroed out after use (`buffer.fill(0)`)
- Never sent to frontend (only encrypted data + keys for specific pages)

### Authentication & Authorization

1. **User Auth**: JWT tokens (7-day expiry)
2. **License Tokens**: Separate JWT for playback sessions (2-hour expiry)
3. **Admin Role**: Boolean flag in database (`is_admin`)
4. **Entitlements**: Many-to-many relationship (users ↔ assets)

### File Storage

```
storage/
├── encrypted/
│   └── {asset-id}/
│       ├── manifest.json      # Page metadata
│       ├── page-1.enc          # Encrypted page 1
│       ├── page-2.enc          # Encrypted page 2
│       └── page-N.enc          # Encrypted page N
├── keys/
│   └── master.key              # Master encryption key (600 perms)
└── uploads/
    └── {temp-uploads}          # Cleaned after processing
```

## Database Schema

```sql
-- Users
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,        -- bcrypt hash
  name TEXT,
  is_admin INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Assets (PDFs)
CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  iv TEXT NOT NULL,              -- Initialization vector (hex)
  total_pages INTEGER NOT NULL,
  file_size INTEGER,
  status TEXT DEFAULT 'ready',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Entitlements (Access Control)
CREATE TABLE entitlements (
  user_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, asset_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (asset_id) REFERENCES assets(id)
);

-- Access Logs (Analytics)
CREATE TABLE access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  page_num INTEGER,
  accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT,
  user_agent TEXT
);
```

## Development

```bash
# Start with auto-reload
npm run dev

# Run migrations
npm run migrate

# Production
npm start
```

## Production Deployment Notes

### Moving to AWS

When ready to deploy to production with AWS:

1. Replace local storage with S3 (`config/storage.js`)
2. Replace master key with AWS KMS
3. Add CloudFront for encrypted content delivery
4. Add signed URLs/cookies for S3 access
5. Use RDS instead of SQLite
6. Add ALB/EC2 Auto Scaling

See `infra/` directory for Terraform templates (currently for AWS deployment).

### Security Hardening

For production:

- [ ] Use HTTPS (Let's Encrypt)
- [ ] Add rate limiting
- [ ] Implement CORS properly
- [ ] Add CSP headers
- [ ] Enable audit logging
- [ ] Rotate JWT secrets
- [ ] Add 2FA for admins
- [ ] Implement session management
- [ ] Add IP whitelisting for admin panel
- [ ] Encrypt database at rest

## Testing the POC

### 1. Start Backend
```bash
cd pdf-drm-backend
npm install
npm run migrate
npm start
```

### 2. Start Frontend
```bash
cd pdf-drm-frontend
npm install
npm run dev
```

### 3. Create Admin User
- Register at http://localhost:5173
- Make yourself admin:
  ```bash
  sqlite3 ./data/pdf-drm.db "UPDATE users SET is_admin = 1 WHERE email = 'your@email.com';"
  ```
- Logout and login again

### 4. Upload PDF
- Click "Admin Panel"
- Upload a PDF file with a title
- Wait for encryption to complete

### 5. Grant Access
- In Admin Panel, select a user and asset
- Click "Grant Access"

### 6. View PDF
- Click "View Content"
- Open the PDF
- Notice the watermark with your email

## License

MIT

## Support

For issues or questions, please check the documentation or create an issue in the repository.
