# PDF DRM System - Complete Setup Guide

This guide will help you set up and run the complete PDF DRM system locally.

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- A modern web browser (Chrome, Firefox, Safari, Edge)

## Quick Start

### Step 1: Setup Backend

```bash
# Navigate to backend directory
cd ~/Desktop/pdf-drm-backend

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Generate JWT secret
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env

# Initialize database and storage
npm run migrate

# Start backend server
npm start
```

Backend will run on http://localhost:3001

### Step 2: Setup Frontend

Open a NEW terminal window:

```bash
# Navigate to frontend directory
cd ~/Desktop/pdf-drm-frontend

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Start frontend development server
npm run dev
```

Frontend will run on http://localhost:5173

### Step 3: Create Admin User

1. Open http://localhost:5173 in your browser
2. Click "Register" and create a new account
3. Open a NEW terminal and run:

```bash
cd ~/Desktop/pdf-drm-backend

# Replace 'your@email.com' with your registered email
sqlite3 ./data/pdf-drm.db "UPDATE users SET is_admin = 1 WHERE email = 'your@email.com';"
```

4. Logout and login again to apply admin privileges

### Step 4: Upload Your First PDF

1. You should now see "Admin Panel" button in the header
2. Click "Admin Panel"
3. Fill in:
   - **Title**: Enter a name for your PDF
   - **PDF File**: Select a PDF file from your computer
4. Click "Upload & Encrypt PDF"
5. Wait for processing (you'll see progress messages)

### Step 5: Grant Yourself Access

1. Still in Admin Panel, scroll to "Grant Access" section
2. Select your email from "Select User" dropdown
3. Select the PDF you just uploaded from "Select Asset" dropdown
4. Click "Grant Access"

### Step 6: View Your PDF

1. Click "View Content" button in the header
2. You should see your PDF in the library
3. Click "Open" to view it
4. Notice:
   - Your email watermark on each page
   - Page navigation controls
   - Zoom controls
   - You cannot select/copy text (rendered on canvas)

## Directory Structure

After setup, you'll have:

```
~/Desktop/
├── pdf-drm-backend/
│   ├── node_modules/
│   ├── config/
│   ├── routes/
│   ├── middleware/
│   ├── scripts/
│   ├── data/
│   │   └── pdf-drm.db          # SQLite database
│   ├── storage/
│   │   ├── encrypted/          # Encrypted PDF pages
│   │   ├── keys/
│   │   │   └── master.key      # Master encryption key
│   │   └── uploads/            # Temporary uploads
│   ├── .env                    # Configuration
│   ├── server.js
│   └── package.json
│
└── pdf-drm-frontend/
    ├── node_modules/
    ├── src/
    │   ├── components/
    │   ├── App.jsx
    │   └── main.jsx
    ├── .env                    # Configuration
    └── package.json
```

## Testing the System

### Test 1: Encryption Works

```bash
# Check that encrypted pages exist
ls ~/Desktop/pdf-drm-backend/storage/encrypted/

# Try to open an encrypted page (should be unreadable)
cat ~/Desktop/pdf-drm-backend/storage/encrypted/*/page-1.enc
```

### Test 2: Access Control

1. Register a second user (different email)
2. Login as second user
3. You should NOT see the PDF (no entitlement)
4. Switch to admin account
5. Grant access to second user
6. Switch back to second user
7. PDF should now be visible

### Test 3: Watermarking

1. Open a PDF
2. Take a screenshot
3. Verify your email and timestamp are visible on the page

### Test 4: License Token Expiry

1. Open a PDF and note the time
2. Wait 2+ hours
3. Try to navigate to another page
4. Should fail (license token expired)
5. Close and reopen the PDF (new token issued)

## Common Issues

### Backend won't start

```bash
# Check if port 3001 is already in use
lsof -i :3001

# Kill existing process if needed
kill -9 <PID>

# Try starting again
npm start
```

### Frontend won't start

```bash
# Check if port 5173 is already in use
lsof -i :5173

# Try different port
npm run dev -- --port 5174
```

### Database errors

```bash
# Delete and recreate database
cd ~/Desktop/pdf-drm-backend
rm -rf data/
npm run migrate
```

### Upload fails

```bash
# Check storage directories exist
ls -la ~/Desktop/pdf-drm-backend/storage/

# If not, they should be created automatically on first start
# Or manually create them:
mkdir -p ~/Desktop/pdf-drm-backend/storage/{encrypted,keys,uploads}
```

### Can't see uploaded PDF

- Ensure you're logged in as admin
- Check that upload succeeded (look for success message)
- Grant yourself entitlement in Admin Panel
- Refresh the page

## Development Workflow

### Backend Development

```bash
cd ~/Desktop/pdf-drm-backend

# Auto-reload on file changes
npm run dev

# View logs
tail -f server.log
```

### Frontend Development

```bash
cd ~/Desktop/pdf-drm-frontend

# Auto-reload enabled by default
npm run dev

# Build for production
npm run build
```

### Database Management

```bash
cd ~/Desktop/pdf-drm-backend

# Open database
sqlite3 ./data/pdf-drm.db

# Useful queries
sqlite> SELECT * FROM users;
sqlite> SELECT * FROM assets;
sqlite> SELECT * FROM entitlements;
sqlite> .quit
```

## Security Notes

### For POC/Demo

- Master encryption key stored in `storage/keys/master.key`
- Database file in `data/pdf-drm.db`
- Both stored locally (fine for demo)

### For Production

**DO NOT use this setup as-is for production!**

Required changes:
- [ ] Move master key to AWS KMS or similar HSM
- [ ] Use PostgreSQL/MySQL instead of SQLite
- [ ] Add HTTPS (Let's Encrypt)
- [ ] Implement rate limiting
- [ ] Add session management
- [ ] Enable audit logging
- [ ] Add monitoring and alerts
- [ ] Implement backup strategy
- [ ] Use environment-specific secrets management
- [ ] Add CDN for content delivery
- [ ] Implement proper CORS policies

## Next Steps

Once POC is approved, migration to AWS:

1. Setup AWS infrastructure using Terraform (see `infra/` directory)
2. Replace local storage with S3
3. Replace local master key with KMS
4. Add CloudFront with signed URLs
5. Deploy backend to EC2/ECS
6. Deploy frontend to S3 + CloudFront
7. Setup RDS for database
8. Configure CloudWatch monitoring

See `pdf-drm-backend/README.md` for detailed AWS deployment notes.

## Support

For issues:
1. Check browser console for errors
2. Check backend terminal for logs
3. Review the README files in each directory
4. Check file permissions on storage directories

## Cleanup

To remove everything:

```bash
# Stop both servers (Ctrl+C in terminals)

# Delete backend data
cd ~/Desktop/pdf-drm-backend
rm -rf node_modules data storage

# Delete frontend
cd ~/Desktop/pdf-drm-frontend
rm -rf node_modules dist

# Or remove entire directories
rm -rf ~/Desktop/pdf-drm-backend ~/Desktop/pdf-drm-frontend
```

## Demo Script

Perfect workflow for demonstrating the system:

1. **Show empty state**: Start fresh, show no PDFs
2. **Register user**: Create account
3. **Make admin**: Show SQL command
4. **Upload PDF**: Show admin panel, upload sample PDF
5. **Show encryption**: `cat storage/encrypted/*/page-1.enc` (gibberish)
6. **Show key**: `ls storage/keys/` (master.key exists)
7. **Grant access**: Use admin panel
8. **View PDF**: Show watermarked PDF in viewer
9. **Test access control**: Create 2nd user, show they can't see it
10. **Grant to 2nd user**: Show it appears for them too

Total demo time: ~5 minutes

Enjoy your PDF DRM system! 🔐📄
