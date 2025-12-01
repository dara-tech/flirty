# 🔴 URGENT: Fix 404 Errors - Set Environment Variable in Netlify

## Problem
You're getting 404 errors:
- `Cannot GET /auth/check`
- `Cannot POST /auth/google`

This means the frontend can't find the backend API routes.

## Root Cause
The `VITE_API_URL` environment variable is **not set correctly** in Netlify, or the frontend build doesn't have it.

## Solution

### Set Environment Variable in Netlify

1. **Go to Netlify Dashboard**
   - Open: https://app.netlify.com/
   - Click on your site (flirtys)

2. **Go to Site Settings**
   - Click **"Site settings"** (gear icon)
   - Left sidebar → Click **"Environment variables"**

3. **Add/Update Environment Variable**
   ```
   Key: VITE_API_URL
   Value: https://flirty-aspk.onrender.com/api
   ```
   
   **OR** (without `/api` - code will add it automatically):
   ```
   Key: VITE_API_URL
   Value: https://flirty-aspk.onrender.com
   ```

4. **Redeploy Frontend**
   - After adding/updating, you MUST redeploy:
   - Go to **"Deploys"** tab
   - Click **"Trigger deploy"** → **"Deploy site"**
   - Wait for build to complete

## Important Notes

- ✅ Variable name **must** start with `VITE_` prefix
- ✅ After setting, **must redeploy** for it to take effect
- ✅ Can include `/api` or not - code handles both
- ✅ Use your exact backend URL: `https://flirty-aspk.onrender.com`

## After Redeployment

The frontend will:
- ✅ Connect to `https://flirty-aspk.onrender.com/api`
- ✅ Make requests to correct routes like `/api/auth/check`
- ✅ 404 errors will be resolved

---

**Time to fix**: ~3 minutes (1 min to set variable + 2 min for redeploy)
