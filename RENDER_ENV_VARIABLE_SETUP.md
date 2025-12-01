# 🚨 CRITICAL: Set Environment Variable in Render

## Problem
Your frontend `https://flirtys.netlify.app` is being blocked by CORS (500 error).

## Root Cause
The `FRONTEND_URL` environment variable is **not set** in your Render backend service.

## Solution (2 minutes)

### 1. Go to Render Dashboard
Open: https://dashboard.render.com/web/flirty-aspk (or find your backend service)

### 2. Click "Environment" Tab
On the left sidebar, click **"Environment"**

### 3. Add This Environment Variable:
```
Key: FRONTEND_URL
Value: https://flirtys.netlify.app
```

**EXACTLY as shown above** - no trailing slash, include `https://`

### 4. Save Changes
- Click **"Save Changes"** button
- Render will automatically redeploy your backend

### 5. Wait for Redeployment
- Wait 2-3 minutes for deployment to complete
- You'll see a green "Live" status when done

### 6. Test Your Frontend
- Refresh `https://flirtys.netlify.app`
- CORS errors should be gone!

## Quick Copy-Paste:

**Variable Name:**
```
FRONTEND_URL
```

**Variable Value:**
```
https://flirtys.netlify.app
```

## Verification:

After setting, check the Render logs. You should see:
- Server starting
- Database connected
- CORS allowing requests from `https://flirtys.netlify.app`

## Still Getting Errors?

1. Double-check the URL is exactly: `https://flirtys.netlify.app`
2. Make sure there's no trailing slash
3. Verify `NODE_ENV=production` is set
4. Check Render logs for CORS messages

---

**This will fix the CORS 500 error immediately after redeployment.**
