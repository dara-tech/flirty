# ⚡ QUICK CORS FIX - Render Environment Variable

## Your URLs:
- **Frontend**: `https://flirtys.netlify.app`
- **Backend**: `https://flirty-aspk.onrender.com`

## Fix: Set Environment Variable in Render

### Step-by-Step:

1. **Open Render Dashboard**
   - Go to: https://dashboard.render.com/
   - Click on your backend service (flirty-aspk)

2. **Go to Environment Tab**
   - Left sidebar → Click **"Environment"**

3. **Add Environment Variable**
   ```
   Key: FRONTEND_URL
   Value: https://flirtys.netlify.app
   ```

4. **Save & Redeploy**
   - Click **"Save Changes"**
   - Render will auto-redeploy
   - Wait 2-3 minutes for deployment

5. **Test**
   - Refresh your Netlify frontend
   - CORS errors should be gone

## Environment Variable Format:

```
FRONTEND_URL=https://flirtys.netlify.app
```

**⚠️ Important**:
- ✅ Include `https://`
- ✅ No trailing slash
- ✅ Exact match (case-sensitive)

## After Setting:

The backend will automatically allow requests from `https://flirtys.netlify.app`.

## Verify:

After deployment, check backend logs in Render. You should see:
- Server running
- CORS checks allowing your Netlify URL

---

**Time to fix**: ~2 minutes
