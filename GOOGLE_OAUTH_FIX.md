# 🔧 Fix Google OAuth Configuration for Production

## Problem
Getting error: `[GSI_LOGGER]: The given origin is not allowed for the given client ID`

This means your production domain (`https://flirtys.netlify.app`) is not added to Google OAuth authorized origins.

## Solution

### Step 1: Go to Google Cloud Console

1. Visit: https://console.cloud.google.com/
2. Select your project (or create one)
3. Navigate to: **APIs & Services** → **Credentials**

### Step 2: Find Your OAuth 2.0 Client ID

1. Look for: `283732145047-tu9sdui7iasnf8ul0a0vr4lq3fj190d5.apps.googleusercontent.com`
2. Click on it to edit

### Step 3: Add Authorized JavaScript Origins

Under **Authorized JavaScript origins**, add:
```
https://flirtys.netlify.app
```

Also add for development (if not already):
```
http://localhost:5173
http://localhost:5174
```

### Step 4: Add Authorized Redirect URIs (if needed)

Under **Authorized redirect URIs**, add:
```
https://flirtys.netlify.app
http://localhost:5173
http://localhost:5174
```

### Step 5: Save and Wait

1. Click **Save**
2. Wait **5-10 minutes** for changes to propagate
3. Clear browser cache and try again

## Environment Variables

### Frontend (Netlify)
Add to environment variables:
```env
VITE_GOOGLE_CLIENT_ID=283732145047-tu9sdui7iasnf8ul0a0vr4lq3fj190d5.apps.googleusercontent.com
```

### Backend (Render)
Already set (or add):
```env
GOOGLE_CLIENT_ID=283732145047-tu9sdui7iasnf8ul0a0vr4lq3fj190d5.apps.googleusercontent.com
```

## After Configuration

1. **Redeploy frontend** on Netlify (to pick up env var if added)
2. **Test Google Sign-In** - should work now
3. **Check console** - errors should be gone

## Note

- ✅ **Email/password login works** regardless of Google OAuth config
- ⚠️ **Google Sign-In requires** proper OAuth configuration
- 🔄 **Changes take 5-10 minutes** to propagate

---

**Quick Test:** Try email/password login - it should work fine even if Google Sign-In isn't configured yet.
