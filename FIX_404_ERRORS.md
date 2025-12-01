# 🔴 Fix 404 Errors - Environment Variable Missing

## Problem
Getting 404 errors:
- `Cannot GET /auth/check`
- `Cannot POST /auth/google`

## Root Cause
The `VITE_API_URL` environment variable is **not set** in Netlify, or the frontend was built before setting it.

## Solution

### Step 1: Set Environment Variable in Netlify

1. Go to: https://app.netlify.com/
2. Click on your site: **flirtys**
3. Go to: **Site settings** → **Environment variables**
4. Add:
   ```
   Key: VITE_API_URL
   Value: https://flirty-aspk.onrender.com/api
   ```

### Step 2: Redeploy Frontend (CRITICAL!)

After setting the variable, you **MUST redeploy**:

1. Go to **"Deploys"** tab
2. Click **"Trigger deploy"** → **"Deploy site"**
3. Wait 2-3 minutes for build to complete

**Why?** Environment variables are only available at BUILD time for Vite. Existing deployments won't have it.

### Step 3: Verify

After redeployment, check the browser console. You should see:
```
🌐 Backend API URL configured: https://flirty-aspk.onrender.com/api
```

## Your Exact Values:

**Variable Name:**
```
VITE_API_URL
```

**Variable Value:**
```
https://flirty-aspk.onrender.com/api
```

## Alternative (without /api):

If you set it without `/api`:
```
VITE_API_URL=https://flirty-aspk.onrender.com
```

The code will automatically append `/api`, so both work!

## After Fix:

- ✅ 404 errors will be gone
- ✅ Frontend will connect to backend
- ✅ Authentication will work
- ✅ All API calls will work

---

**Important**: Must redeploy after setting environment variable!
