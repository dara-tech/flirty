# 🔴 URGENT CORS FIX - Quick Solution

## Problem
Your frontend at `https://flirtys.netlify.app` is being blocked by CORS.

## Solution: Set Environment Variable in Render

### Steps to Fix:

1. **Go to Render Dashboard**
   - Open: https://dashboard.render.com/
   - Navigate to your backend service

2. **Open Environment Tab**
   - Click on your service
   - Click **"Environment"** tab on the left

3. **Add/Update Environment Variable**
   - **Variable Name**: `FRONTEND_URL`
   - **Value**: `https://flirtys.netlify.app`
   - Click **"Save Changes"**

4. **Redeploy Backend**
   - After saving, Render will automatically redeploy
   - OR click **"Manual Deploy"** → **"Deploy latest commit"**

5. **Verify**
   - Wait for deployment to complete
   - Try accessing your frontend again
   - Check backend logs to see CORS allow messages

## Environment Variable to Set:

```env
FRONTEND_URL=https://flirtys.netlify.app
```

**Important**: 
- Use exactly `https://flirtys.netlify.app` (with `https://`)
- No trailing slash
- Case-sensitive

## Verify It's Set:

After setting, check the backend logs. You should see:
```
🌐 Server is running on port 5002 ✅
📍 Environment: production
```

When a request comes in, you'll see CORS logs showing if the origin is allowed.

## Still Not Working?

1. Check Render logs for CORS messages
2. Verify `FRONTEND_URL` is exactly: `https://flirtys.netlify.app`
3. Make sure no trailing slash
4. Redeploy after setting the variable
