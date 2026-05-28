# PDF DRM System - API Security Analysis

## Complete API Breakdown & Security Implications

---

## 1. Authentication APIs

### POST `/auth/register`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "plaintext_password",
  "name": "User Name"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "abc123",
    "email": "user@example.com",
    "name": "User Name"
  }
}
```

**What's in it:**
- `token`: JWT containing `{userId, email}`, signed with JWT_SECRET
- `user`: Basic user info (no password)

**Security Analysis:**
- ⚠️ **If intercepted**: Attacker gets JWT token and can impersonate user
- ✅ **Mitigation**: Use HTTPS in production to encrypt traffic
- ✅ **JWT expires**: Token valid for 7 days, then must re-login
- ✅ **Password**: Never returned, only bcrypt hash stored in DB

**Attack Scenario:**
```
If attacker gets JWT → They can:
- Login as that user
- View PDFs user is entitled to
- BUT: Watermark still shows original user's email (traces back to them!)
```

---

### POST `/auth/login`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "plaintext_password"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "abc123",
    "email": "user@example.com",
    "name": "User Name"
  }
}
```

**Same security implications as register**

---

## 2. Content Discovery APIs

### GET `/content/list`

**Request Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "assets": [
    {
      "id": "asset-uuid-123",
      "title": "The Accidental CTO",
      "iv": "a1b2c3d4e5f6...",
      "total_pages": 340,
      "file_size": 5242880,
      "status": "ready",
      "created_at": "2025-05-26T10:30:00.000Z"
    }
  ]
}
```

**What's in it:**
- Asset metadata only (title, page count, size)
- `iv`: Initialization Vector (used for decryption, but useless alone)
- NO decryption keys
- NO encrypted content

**Security Analysis:**
- ✅ **If intercepted**: Attacker only learns what PDFs exist
- ✅ **Cannot decrypt**: No keys provided
- ✅ **Cannot access**: Still needs entitlement check
- ⚠️ **Information disclosure**: They know PDF titles and page counts

**Attack Scenario:**
```
If attacker gets this response → They can:
- Know which PDFs exist in the system
- Know page counts
BUT CANNOT:
- Access the PDFs
- Decrypt any content
- Bypass entitlement checks
```

---

### POST `/content/play/:assetId`

**Request Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "licenseToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ4eHgiLCJhc3NldElkIjoieXl5Iiwic2Vzc2lvbklkIjoxNzE2NzI1NDAwMDAwfQ.signature",
  "manifest": {
    "assetId": "asset-uuid-123",
    "title": "The Accidental CTO",
    "totalPages": 340,
    "pages": [
      {
        "pageNum": 1,
        "size": 45678
      },
      {
        "pageNum": 2,
        "size": 46123
      }
      // ... all pages
    ]
  },
  "asset": {
    "id": "asset-uuid-123",
    "title": "The Accidental CTO",
    "totalPages": 340
  }
}
```

**What's in it:**
- `licenseToken`: JWT that allows fetching page keys (expires in 2 hours)
- `manifest`: List of all pages with sizes (NO keys, NO encrypted data)
- Basic asset info

**Security Analysis:**
- ⚠️ **If intercepted**: Attacker gets license token valid for 2 hours
- ✅ **Time-limited**: Token expires after 2 hours
- ✅ **Asset-specific**: Token only works for this specific PDF
- ✅ **Still need encrypted data**: Token alone doesn't give content

**Attack Scenario:**
```
If attacker gets license token → They can:
- Request page keys for this PDF (for 2 hours)
- Request encrypted pages
BUT:
- Still get watermarked with ORIGINAL user's email
- Activity traceable back to original user
- Token expires in 2 hours
```

---

## 3. License Server APIs (MOST CRITICAL)

### GET `/license/page/:assetId/:pageNum`

**Request Headers:**
```
X-License-Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "pageNum": 1,
  "encryptedData": "base64_encoded_encrypted_pdf_page_data...",
  "key": "base64_encoded_32_byte_decryption_key",
  "iv": "base64_encoded_16_byte_iv"
}
```

**What's in it:**
- `encryptedData`: The actual encrypted PDF page (base64 encoded)
- `key`: The AES-256 decryption key for THIS page
- `iv`: Initialization vector for decryption

**Security Analysis:**
- 🔴 **CRITICAL**: This response contains BOTH encrypted data AND key!
- ⚠️ **If intercepted**: Attacker can decrypt THIS page
- ✅ **Watermark protection**: Even decrypted, page has watermark with user's email
- ✅ **Page-by-page**: Must fetch each page individually (340 requests for 340 pages)
- ✅ **Time-limited**: License token expires in 2 hours
- ✅ **Traceable**: Watermark identifies the original user

**Attack Scenario:**
```
If attacker intercepts this response → They can:
1. Decode base64 encryptedData
2. Decode base64 key and iv
3. Decrypt the page using AES-256-CBC
4. Reconstruct the PDF page
5. BUT: Page contains watermark with original user's email + timestamp

To steal entire PDF:
- Must intercept all 340 page requests
- Must decrypt each one
- Must reassemble into PDF
- Result: PDF with watermarks on every page identifying the thief
```

**Proof of Concept Decryption (What attacker could do):**
```javascript
// If attacker captures network response
const response = {
  encryptedData: "base64...",
  key: "base64...",
  iv: "base64..."
};

// Convert from base64
const encrypted = Uint8Array.from(atob(response.encryptedData), c => c.charCodeAt(0));
const key = Uint8Array.from(atob(response.key), c => c.charCodeAt(0));
const iv = Uint8Array.from(atob(response.iv), c => c.charCodeAt(0));

// Decrypt using Web Crypto API
const cryptoKey = await crypto.subtle.importKey('raw', key, {name: 'AES-CBC'}, false, ['decrypt']);
const decrypted = await crypto.subtle.decrypt({name: 'AES-CBC', iv}, cryptoKey, encrypted);

// Result: Decrypted PDF page (but with watermark!)
```

---

### GET `/license/bulk/:assetId`

**Request Headers:**
```
X-License-Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "assetId": "asset-uuid-123",
  "iv": "base64_encoded_iv",
  "pageKeys": {
    "1": "base64_encoded_key_for_page_1",
    "2": "base64_encoded_key_for_page_2",
    "3": "base64_encoded_key_for_page_3",
    // ... all 340 pages
    "340": "base64_encoded_key_for_page_340"
  }
}
```

**What's in it:**
- ALL decryption keys for ALL pages at once
- Shared IV for the asset
- NO encrypted data (must still fetch from `/license/page/...`)

**Security Analysis:**
- 🔴 **HIGH RISK**: Provides all keys in one response
- ⚠️ **If intercepted**: Attacker can decrypt all pages (if they also get encrypted data)
- ✅ **Still need encrypted data**: Keys alone are useless
- ✅ **Watermark protection**: Decrypted pages still watermarked
- ✅ **Traceable**: Original user's email on every page

**Attack Scenario:**
```
If attacker intercepts bulk license response → They can:
1. Get all 340 decryption keys
2. Still need to fetch 340 encrypted pages from storage
3. Decrypt each page
4. Reassemble PDF
5. BUT: Every page watermarked with original user's info

Complete attack requires:
- Bulk license response (keys)
- All 340 page requests (encrypted data)
- Decryption process
- Result: PDF with watermarks identifying the attacker
```

---

## 4. Admin APIs

### POST `/admin/upload`

**Request:**
```
Content-Type: multipart/form-data

pdf: [binary PDF file]
title: "Document Title"
```

**Response:**
```json
{
  "success": true,
  "asset": {
    "id": "new-asset-uuid",
    "title": "Document Title",
    "totalPages": 340,
    "fileSize": 5242880
  }
}
```

**Security Analysis:**
- ✅ **Admin only**: Requires `is_admin = 1` in database
- ✅ **No sensitive data**: Response only contains metadata

---

### POST `/admin/entitle`

**Request:**
```json
{
  "email": "user@example.com",
  "assetId": "asset-uuid-123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Entitlement granted"
}
```

**Security Analysis:**
- ✅ **Admin only**: Requires admin role
- ✅ **No sensitive data**: Simple success message

---

## Complete Attack Surface Analysis

### Scenario 1: Attacker Intercepts Network Traffic (No HTTPS)

**What they can capture:**
1. JWT tokens (can impersonate user)
2. License tokens (can fetch pages)
3. Encrypted page data + keys
4. All page keys (bulk endpoint)

**What they CAN do:**
- ✅ Login as the user
- ✅ Fetch all pages
- ✅ Decrypt all pages
- ✅ Reconstruct the PDF

**What they CANNOT avoid:**
- 🔴 **Watermark**: Every page has victim's email + timestamp
- 🔴 **Traceability**: PDF proves who leaked it
- 🔴 **Legal evidence**: Watermark is forensic proof

**Mitigation:**
- Use HTTPS (encrypts all network traffic)
- Token expiry (2 hours for license, 7 days for JWT)
- Watermarking (traces leaks back to source)

---

### Scenario 2: Attacker Has Valid Account

**What they can do:**
- ✅ Login normally
- ✅ View entitled PDFs
- ✅ Decrypt and view pages

**What leaves evidence:**
- 🔴 Every page they view has THEIR email watermarked
- 🔴 Screenshots/recordings show their identity
- 🔴 Cannot remove watermark (embedded in canvas)

---

### Scenario 3: Attacker Breaches File Storage

**What they find:**
```
storage/encrypted/asset-123/
  ├── page-1.enc
  ├── page-2.enc
  └── manifest.json
```

**What they CAN do:**
- ✅ Copy encrypted files

**What they CANNOT do:**
- ❌ Decrypt files (no keys)
- ❌ Keys are NOT stored in storage
- ❌ Keys are derived from master key at runtime
- ❌ Master key requires system access

---

### Scenario 4: Attacker Breaches Database

**What they find:**
```sql
SELECT * FROM assets;
-- id, title, iv, total_pages, file_size, status
```

**What they get:**
- Asset metadata (titles, page counts)
- IVs (initialization vectors)
- User emails and password hashes

**What they CANNOT do:**
- ❌ Decrypt content (no keys in database)
- ❌ Generate page keys (need master key)
- ❌ Access encrypted files (need keys)

---

## Security Weaknesses & Mitigations

### Weakness 1: Keys Sent Over Network

**Current:**
```
Backend sends: encryptedData + key + iv
```

**Risk:**
- If intercepted, attacker can decrypt

**Mitigations Implemented:**
- ⚠️ Time-limited tokens (2-hour expiry)
- ✅ Watermarking (traceability)
- ✅ Page-by-page (must intercept 340 requests)

**Production Mitigation:**
- ✅ Use HTTPS (encrypt network traffic)
- ✅ Certificate pinning (mobile apps)
- ✅ VPN requirements for sensitive content

---

### Weakness 2: Bulk License Endpoint

**Current:**
```
Returns all 340 page keys in one response
```

**Risk:**
- If intercepted, attacker has all keys

**Mitigations Implemented:**
- ⚠️ Still need encrypted data (340 separate requests)
- ✅ License token expires (2 hours)
- ✅ Watermarking on all pages

**Production Mitigation:**
- Consider removing bulk endpoint
- Require per-page key requests
- Add rate limiting (max N pages per minute)

---

### Weakness 3: Watermark Can Be Cropped

**Current:**
```
Watermark is diagonal across center
```

**Risk:**
- User could crop PDF pages to remove watermark

**Mitigations:**
- ✅ Multiple watermarks (add corners too)
- ✅ Invisible watermarks (steganography)
- ✅ Watermark in metadata
- ✅ Screenshot detection

---

## Recommended Production Enhancements

### 1. Network Security
```
✅ Enforce HTTPS only
✅ Add HSTS headers
✅ Certificate pinning (mobile)
✅ TLS 1.3 minimum
```

### 2. Key Management
```
✅ Migrate to AWS KMS (no keys in app)
✅ Keys never leave HSM
✅ Audit all key operations
✅ Key rotation policy
```

### 3. Rate Limiting
```
✅ Max 10 pages per minute
✅ Max 100 pages per session
✅ Block suspicious patterns
✅ IP-based throttling
```

### 4. Enhanced Watermarking
```
✅ Multiple visible watermarks (corners + center)
✅ Invisible steganographic watermarks
✅ Embed user ID in PDF metadata
✅ Session ID in watermark
```

### 5. Monitoring & Alerts
```
✅ Log all page access
✅ Alert on bulk downloads
✅ Detect screenshot activity
✅ Track unusual access patterns
```

### 6. DRM Hardening
```
✅ Widevine L1 (hardware DRM)
✅ PlayReady support
✅ FairPlay (Apple devices)
✅ Prevent screen recording (native apps)
```

---

## Summary: What's Safe and What's Not

### ✅ Safe from Casual Users
- Cannot copy text
- Cannot save PDF directly
- Cannot remove watermarks easily
- Context menu disabled

### ⚠️ Vulnerable to Determined Attackers (Network Intercept)
- Can capture keys from network traffic
- Can decrypt individual pages
- Can reconstruct PDF
- BUT: Watermark still traces back to them

### ✅ Safe from Storage Breach
- Encrypted files useless without keys
- Keys not stored in database or filesystem
- Master key required (runtime only)

### ✅ Forensic Evidence
- Every page watermarked with user email
- Timestamps prove when accessed
- Cannot be removed without obvious tampering
- Legal evidence if leak occurs

---

## Real-World Attack Scenarios

### Attack 1: Screen Recording
**Method:** Record screen while viewing PDF
**Detection:** Can add screen recording detection (JavaScript APIs)
**Evidence:** Watermark visible in recording
**Mitigation:** Native apps can prevent screen recording

### Attack 2: Browser Extension Intercept
**Method:** Browser extension captures decrypted canvas
**Detection:** Difficult to prevent in browser
**Evidence:** Watermark still present
**Mitigation:** Native app or Electron with DRM

### Attack 3: Physical Camera
**Method:** Photograph screen
**Detection:** Impossible to prevent
**Evidence:** Watermark visible in photos
**Mitigation:** None - watermark provides traceability

---

## Conclusion

**The system is secure against:**
- ✅ Storage breaches (encryption)
- ✅ Database breaches (no keys stored)
- ✅ Unauthorized access (entitlements)
- ✅ Casual copying (canvas rendering)

**The system provides forensic evidence against:**
- ✅ Screenshots (watermarked)
- ✅ Screen recordings (watermarked)
- ✅ Network intercepts (watermarked)
- ✅ Any form of content theft (traceable to user)

**For production security:**
- Add HTTPS (encrypts network traffic)
- Migrate to AWS KMS (hardware key security)
- Add rate limiting (prevents bulk downloads)
- Consider native app (stronger DRM)

**The key insight:**
The system accepts that determined attackers can eventually access content, but ensures ALL copies are watermarked with the identity of the person who leaked it. This provides legal deterrent and forensic evidence.
