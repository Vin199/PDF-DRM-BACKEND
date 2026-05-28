# Bulk Keys vs Per-Page Keys - Explanation & Recommendation

## Current Problem

Your frontend is **fetching keys twice**:

1. **`/license/bulk`** → Gets all 340 page keys at once
2. **`/license/page/:pageNum`** → Gets encrypted data + key (again!) for each page

This is redundant and wastes bandwidth.

---

## Two Approaches Explained

### Approach 1: Bulk Keys (Current - Needs Fix)

**How it works:**
```
User opens PDF
  ↓
GET /license/bulk/asset-123
  ↓
Receive ALL 340 keys + shared IV
  ↓
Store keys in browser memory
  ↓
User navigates to page 5
  ↓
Fetch ONLY encrypted data (no key needed)
  ↓
Decrypt using cached key
  ↓
Display page
```

**Backend API Needed:**
```javascript
// NEW ENDPOINT - Encrypted data only
GET /license/encrypted-page/:assetId/:pageNum

Response:
{
  "pageNum": 5,
  "encryptedData": "base64..." // No key! Already have it from bulk
}
```

**Pros:**
✅ Fast navigation (keys cached)
✅ Better UX (no waiting per page)
✅ Only N+1 requests total (1 bulk + N pages)
✅ Good for documents users will read fully

**Cons:**
⚠️ User gets all keys upfront
⚠️ If network intercepted, attacker has all keys
⚠️ But still needs to fetch 340 encrypted pages
⚠️ Watermark still traces back to user

**Security Analysis:**
- If attacker intercepts bulk response → Has all 340 keys
- Still needs 340 separate requests for encrypted data
- All decrypted pages have user's watermark
- Trace back to original user

---

### Approach 2: Per-Page Keys (Most Secure)

**How it works:**
```
User opens PDF
  ↓
User navigates to page 5
  ↓
GET /license/page/asset-123/5
  ↓
Receive encrypted data + key for page 5 ONLY
  ↓
Decrypt
  ↓
Display page
```

**Backend API:**
```javascript
// EXISTING ENDPOINT - Keep as is
GET /license/page/:assetId/:pageNum

Response:
{
  "pageNum": 5,
  "encryptedData": "base64...",
  "key": "base64...",  // Key for THIS page only
  "iv": "base64..."
}
```

**Pros:**
✅ User gets ONLY what they need right now
✅ Must intercept 340 requests to get all keys
✅ Can rate-limit per-page (e.g., max 10 pages/minute)
✅ Can track exactly which pages user viewed
✅ More secure (keys distributed incrementally)

**Cons:**
⚠️ 340 network requests for 340-page PDF
⚠️ Slower navigation (network wait per page)
⚠️ More server load (340 requests vs 1 bulk)
⚠️ Worse UX (visible loading per page)

**Security Analysis:**
- Attacker must intercept EVERY page request
- Only gets keys for pages they request
- Can implement rate limiting (e.g., "max 20 pages per session")
- Still traceable via watermark

---

## Recommendation: Hybrid Approach

Use **Bulk Keys with Rate Limiting**:

### Why?

1. **Better User Experience**
   - Fast page navigation
   - No loading delay per page
   - Professional feel

2. **Still Secure**
   - Watermark on every page (traces leaks)
   - License token expires (2 hours)
   - Can rate-limit bulk endpoint
   - HTTPS encrypts network traffic

3. **Practical Security**
   - A determined attacker can screenshot pages anyway
   - Physical cameras can photograph screen
   - Main defense: Watermarking (forensic evidence)

### Implementation Changes Needed:

#### Backend: Add New Endpoint for Encrypted Data Only

**File: `routes/license.routes.js`**

Add this new endpoint:

```javascript
// Get ONLY encrypted page data (key already provided in bulk)
router.get('/encrypted-page/:assetId/:pageNum', verifyLicenseToken, async (req, res) => {
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

    // Return ONLY encrypted data (no key)
    res.json({
      pageNum: pageNumber,
      encryptedData: encryptedPageData.toString('base64')
    });

  } catch (error) {
    console.error('Encrypted page error:', error);
    res.status(500).json({ error: 'Failed to fetch encrypted page' });
  }
});
```

#### Frontend: Update PDFViewer to Use Bulk Keys

**File: `PDFViewer.jsx`**

```javascript
// State to store shared IV
const [sharedIV, setSharedIV] = useState(null);

// Initialize: Fetch bulk keys
const initializeViewer = async () => {
  try {
    setManifest(viewerData.manifest);

    // Fetch all page keys in bulk
    const keysResponse = await fetch(
      `${apiUrl}/license/bulk/${viewerData.asset.id}`,
      {
        headers: {
          'X-License-Token': viewerData.licenseToken
        }
      }
    );

    if (!keysResponse.ok) {
      throw new Error('Failed to fetch decryption keys');
    }

    const keysData = await keysResponse.json();
    setPageKeys(keysData.pageKeys); // Store ALL keys
    setSharedIV(keysData.iv);       // Store shared IV

    setLoading(false);
  } catch (err) {
    setError(err.message);
    setLoading(false);
  }
};

// Render page: Use cached key, fetch only encrypted data
const renderPage = async (pageNum) => {
  try {
    if (isRenderingRef.current) return;
    isRenderingRef.current = true;

    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      isRenderingRef.current = false;
      return;
    }

    const ctx = canvas.getContext('2d');

    // Fetch ONLY encrypted data (no key)
    const pageResponse = await fetch(
      `${apiUrl}/license/encrypted-page/${manifest.assetId}/${pageNum}`,
      {
        headers: {
          'X-License-Token': viewerData.licenseToken
        }
      }
    );

    if (!pageResponse.ok) {
      throw new Error('Failed to fetch page');
    }

    const pageData = await pageResponse.json();

    // Use cached key from bulk response
    const decryptedData = await decryptPage(
      pageData.encryptedData,
      pageKeys[pageNum], // From bulk response
      sharedIV            // From bulk response
    );

    // Rest of rendering code...
    const pdf = await pdfjsLib.getDocument({ data: decryptedData }).promise;
    const page = await pdf.getPage(1);

    const viewport = page.getViewport({ scale: zoom });
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport
    };

    renderTaskRef.current = page.render(renderContext);
    await renderTaskRef.current.promise;
    renderTaskRef.current = null;

    addWatermark(ctx, canvas.width, canvas.height, userEmail, pageNum);

    isRenderingRef.current = false;

  } catch (err) {
    console.error('Render error:', err);
    setError(`Failed to render page ${pageNum}`);
    isRenderingRef.current = false;
  }
};
```

---

## Performance Comparison

### Current (Broken - Fetching Keys Twice)
```
Open PDF:
  /license/bulk        → 50KB (all keys)

Page 1:
  /license/page/1      → 500KB (encrypted + key again)

Page 2:
  /license/page/2      → 500KB (encrypted + key again)

Total for 10 pages: 50KB + (10 × 500KB) = 5.05MB
```

### Approach 1: Per-Page Keys
```
Page 1:
  /license/page/1      → 500KB (encrypted + key)

Page 2:
  /license/page/2      → 500KB (encrypted + key)

Total for 10 pages: 10 × 500KB = 5MB
```

### Approach 2: Bulk Keys (Optimized)
```
Open PDF:
  /license/bulk        → 50KB (all keys once)

Page 1:
  /encrypted-page/1    → 450KB (encrypted only)

Page 2:
  /encrypted-page/2    → 450KB (encrypted only)

Total for 10 pages: 50KB + (10 × 450KB) = 4.55MB
Savings: 500KB for 10 pages, 17MB for 340 pages!
```

---

## Security Trade-offs

### Question: "Is bulk keys less secure?"

**Answer:** Slightly less secure, but **watermarking is the real security**

**Threat Model Analysis:**

| Attack Vector | Per-Page Keys | Bulk Keys | Real Defense |
|---------------|---------------|-----------|--------------|
| Network intercept | Must capture 340 requests | Capture 1 bulk + 340 pages | **HTTPS** |
| Bulk download | Slow (rate limiting) | Fast | **Watermark** |
| Screenshot | Can't prevent | Can't prevent | **Watermark** |
| Screen record | Can't prevent | Can't prevent | **Watermark** |
| Physical camera | Can't prevent | Can't prevent | **Watermark** |

**Key Insight:**
- Any user with legitimate access can already view and screenshot all pages
- The security model is: "Accept users can copy, but trace it back to them"
- Watermark provides **forensic evidence** and **legal deterrent**

---

## Recommendation for Your POC

### Option A: Keep Current (Per-Page) - More Secure Demo
**Remove bulk endpoint entirely**

Pros for demo:
- ✅ Can say "each key distributed individually"
- ✅ Can demonstrate rate limiting
- ✅ Can show access logs per page
- ✅ More impressive security story

Implementation:
- Remove `/license/bulk` endpoint
- Keep only `/license/page/:assetId/:pageNum`
- Update frontend to not call bulk

### Option B: Switch to Bulk - Better UX Demo
**Remove per-page endpoint, use bulk**

Pros for demo:
- ✅ Fast, smooth page navigation
- ✅ Professional user experience
- ✅ Shows you understand UX trade-offs
- ✅ Still secure with watermarking

Implementation:
- Add `/license/encrypted-page/:assetId/:pageNum`
- Keep `/license/bulk`
- Update frontend to use bulk keys

### Option C: Hybrid - Best of Both
**Keep both, let admin choose per-document**

Pros for demo:
- ✅ Show flexibility
- ✅ "High security mode" vs "Performance mode"
- ✅ Can discuss trade-offs intelligently
- ✅ Production-ready thinking

Implementation:
- Add `security_level` field to assets table
- If `high_security` → use per-page
- If `standard` → use bulk
- Frontend checks asset security level

---

## My Recommendation: Option B (Bulk Keys)

**Why?**

1. **Better Demo Experience**
   - Smooth, professional feel
   - No loading delays

2. **Honest Security Discussion**
   - "We prioritize UX, backed by watermarking"
   - "Forensic evidence over obscurity"
   - Shows mature security thinking

3. **Real-World Approach**
   - Services like Netflix, Spotify use similar models
   - DRM + Watermarking is industry standard
   - Perfect protection impossible, traceability is key

4. **Still Very Secure**
   - HTTPS encrypts network (production)
   - Token expires (2 hours)
   - Watermark traces leaks
   - Rate limit bulk endpoint (once per session)

---

## Implementation Guide

### Step 1: Add New Backend Endpoint

```bash
cd ~/Desktop/pdf-drm-backend
```

Edit `routes/license.routes.js`, add:

```javascript
// Add after existing endpoints
router.get('/encrypted-page/:assetId/:pageNum', verifyLicenseToken, async (req, res) => {
  try {
    const { assetId, pageNum } = req.params;
    const pageNumber = parseInt(pageNum);

    const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(assetId);
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    if (pageNumber < 1 || pageNumber > asset.total_pages) {
      return res.status(400).json({ error: 'Invalid page number' });
    }

    const encryptedPageData = readEncryptedPage(assetId, pageNumber);

    res.json({
      pageNum: pageNumber,
      encryptedData: encryptedPageData.toString('base64')
    });

  } catch (error) {
    console.error('Encrypted page error:', error);
    res.status(500).json({ error: 'Failed to fetch encrypted page' });
  }
});
```

Restart backend:
```bash
npm start
```

### Step 2: Update Frontend

I can update the PDFViewer.jsx for you if you want! Just let me know.

---

## Summary

**Current State:** Fetching keys twice (wasteful)

**Your Question:** "Why bulk keys?"
**Answer:** Better performance, less network traffic

**Security:** Slightly less secure, but watermark is main defense anyway

**My Recommendation:** Use bulk keys approach
- Add `/encrypted-page` endpoint (data only)
- Use bulk keys from `/bulk` endpoint
- Fast navigation, still secure with watermarking

**Want me to implement it?** I can update your code right now! 🚀
