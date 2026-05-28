# PDF DRM System - Quick Reference Card

## 🚀 Start the System

```bash
# Terminal 1: Backend
cd ~/Desktop/pdf-drm-backend && npm start

# Terminal 2: Frontend
cd ~/Desktop/pdf-drm-frontend && npm run dev

# Access: http://localhost:5173
```

## 🔑 First Time Setup

```bash
# Backend setup
cd ~/Desktop/pdf-drm-backend
npm install
npm run migrate
npm start

# Frontend setup (new terminal)
cd ~/Desktop/pdf-drm-frontend
npm install
npm run dev

# Make yourself admin (after registering)
cd ~/Desktop/pdf-drm-backend
npm run make-admin your@email.com
```

## 📝 Common Commands

### Backend

```bash
# Start server
npm start

# Start with auto-reload
npm run dev

# Initialize database
npm run migrate

# Make user admin
npm run make-admin email@example.com

# View database
sqlite3 ./data/pdf-drm.db
```

### Frontend

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 🔧 Troubleshooting

### Port already in use

```bash
# Backend (port 3001)
lsof -i :3001
kill -9 <PID>

# Frontend (port 5173)
lsof -i :5173
kill -9 <PID>
```

### Reset database

```bash
cd ~/Desktop/pdf-drm-backend
rm -rf data/ storage/
npm run migrate
```

### Can't upload PDF

```bash
# Check storage directories
ls -la ~/Desktop/pdf-drm-backend/storage/

# They should exist, if not restart backend
```

## 📂 Important Files

```
Backend:
  .env                        # Configuration
  data/pdf-drm.db            # Database
  storage/encrypted/          # Encrypted PDFs
  storage/keys/master.key    # Master encryption key

Frontend:
  .env                        # API URL config
```

## 🔐 Security

### Encrypted files location

```bash
# View encrypted assets
ls ~/Desktop/pdf-drm-backend/storage/encrypted/

# Try to read (should be gibberish)
cat ~/Desktop/pdf-drm-backend/storage/encrypted/*/page-1.enc
```

### Master key location

```bash
# Location (600 permissions)
~/Desktop/pdf-drm-backend/storage/keys/master.key

# DO NOT commit this to git!
```

## 🎯 User Workflows

### Admin Workflow

1. Login with admin account
2. Click "Admin Panel"
3. Upload PDF → Wait for encryption
4. Grant access to users
5. View usage in tables

### Regular User Workflow

1. Login
2. See your entitled PDFs
3. Click "Open" to view
4. Navigate with prev/next
5. Use zoom controls

## 🐛 Debug

### Check backend logs

```bash
cd ~/Desktop/pdf-drm-backend
# Logs appear in terminal where npm start was run
```

### Check frontend errors

```bash
# Open browser dev tools (F12)
# Check Console tab
```

### Database queries

```bash
cd ~/Desktop/pdf-drm-backend
sqlite3 ./data/pdf-drm.db

# Useful queries:
SELECT * FROM users;
SELECT * FROM assets;
SELECT * FROM entitlements;
SELECT email, is_admin FROM users;
.quit
```

## 📊 System Status

### Check if running

```bash
# Backend
curl http://localhost:3001/health

# Should return: {"ok":true,"timestamp":"..."}
```

### Check storage usage

```bash
cd ~/Desktop/pdf-drm-backend
du -sh storage/*

# Shows size of encrypted/, keys/, uploads/
```

## 🎬 Demo Script (5 min)

1. **Setup** (30s)
   - Both servers running
   - Logged in as admin

2. **Upload** (1m)
   - Admin Panel → Upload PDF
   - Show encryption progress

3. **Security** (1m)
   ```bash
   cat storage/encrypted/*/page-1.enc
   ```
   - Explain: This is what's stored (encrypted)

4. **Access Control** (1.5m)
   - Register 2nd user
   - Show they can't see PDF
   - Grant access
   - Show it appears

5. **Watermark** (1m)
   - Open PDF
   - Show email watermark
   - Explain traceability

## 💡 Pro Tips

- Always logout/login after making someone admin
- Check backend terminal for encryption progress
- Encrypted files are in format: `page-{num}.enc`
- License tokens expire after 2 hours
- Can't copy text (canvas rendering)
- Watermark includes email + timestamp

## 📞 Quick Help

| Issue | Solution |
|-------|----------|
| Can't login | Check email/password, check backend running |
| Can't see PDFs | Check entitlements in admin panel |
| Upload fails | Check you're admin, check file is PDF |
| Can't decrypt | Check license token valid, check master.key exists |
| Page won't load | Refresh page, check network tab in dev tools |

## 🔗 URLs

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001
- **Health Check**: http://localhost:3001/health

## 📖 Full Documentation

- Setup Guide: `~/Desktop/SETUP_GUIDE.md`
- System Summary: `~/Desktop/PDF_DRM_SYSTEM_SUMMARY.md`
- Backend README: `~/Desktop/pdf-drm-backend/README.md`
- Frontend README: `~/Desktop/pdf-drm-frontend/README.md`

---

**Keep this handy during development and demos!** 📌
