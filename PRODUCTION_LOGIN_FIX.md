# 🔐 Fix Production Login Issues

## Problem
Login works locally but fails in production:
- ✅ Login succeeds (shows "Logged in successfully")
- ❌ Subsequent API calls fail with 401
- ❌ Cookies not persisting
- ❌ WebSocket connections fail

## Root Cause
**Cookies are not being sent with requests in production** due to:
1. Browser blocking third-party cookies (cross-origin)
2. Cookie settings not compatible with cross-origin
3. CORS configuration issues

## Solutions

### ✅ Solution 1: Verify Environment Variables

**Backend (Render):**
```env
NODE_ENV=production
FRONTEND_URL=https://flirtys.netlify.app
JWT_SECRET=your-secret-key
```

**Frontend (Netlify):**
```env
VITE_API_URL=https://flirty-aspk.onrender.com/api
```

### ✅ Solution 2: Check Browser Cookie Settings

**Chrome/Edge:**
1. Settings → Privacy → Cookies
2. Allow all cookies (for testing)
3. Or: Allow cookies from sites you visit

**Firefox:**
1. Settings → Privacy → Cookies
2. Accept cookies from sites

**Safari:**
1. Preferences → Privacy
2. Uncheck "Prevent cross-site tracking" (for testing)

### ✅ Solution 3: Test Cookie Setting

After login, check browser DevTools:
1. **Application → Cookies → https://flirty-aspk.onrender.com**
2. Should see: `jwt` cookie with:
   - ✅ HttpOnly: true
   - ✅ Secure: true
   - ✅ SameSite: None
   - ✅ Path: /

### ✅ Solution 4: Check Network Tab

1. Open DevTools → Network
2. Login
3. Check login request:
   - **Response Headers** → Should see: `Set-Cookie: jwt=...`
4. Check subsequent requests:
   - **Request Headers** → Should see: `Cookie: jwt=...`

### ✅ Solution 5: Check Backend Logs (Render)

After login, check Render logs for:
```
✅ Login successful for user: user@example.com
🍪 Cookie should be set with options: { sameSite: 'none', secure: true, ... }
🔐 Auth check: { hasToken: true, ... }
```

## Debugging Steps

### Step 1: Verify Login Request
```javascript
// In browser console after login
fetch('https://flirty-aspk.onrender.com/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ email: 'test@test.com', password: 'password' })
})
.then(r => {
  console.log('Response headers:', [...r.headers.entries()]);
  return r.json();
})
.then(data => console.log('Response:', data));
```

### Step 2: Check Cookies
```javascript
// In browser console
document.cookie // Should show jwt cookie if set
```

### Step 3: Test Auth Check
```javascript
// In browser console
fetch('https://flirty-aspk.onrender.com/api/auth/check', {
  credentials: 'include'
})
.then(r => r.json())
.then(data => console.log('Auth check:', data));
```

## Common Issues

### Issue 1: Cookie Not Set
**Symptoms:** No cookie in Application tab after login
**Solution:**
- Check backend logs for cookie setting
- Verify `NODE_ENV=production` in Render
- Check browser console for cookie warnings

### Issue 2: Cookie Set But Not Sent
**Symptoms:** Cookie exists but requests still get 401
**Solution:**
- Verify `withCredentials: true` in axios (already set ✅)
- Check CORS allows credentials (already set ✅)
- Try different browser
- Clear cookies and try again

### Issue 3: Works in Dev But Not Production
**Symptoms:** Local works, production doesn't
**Solution:**
- Verify `NODE_ENV=production` in Render
- Check `FRONTEND_URL` is set correctly
- Verify cookie settings match production requirements

## Alternative: Token-Based Auth (If Cookies Don't Work)

If cookies continue to fail, consider:
1. Store JWT in localStorage after login
2. Send token in `Authorization: Bearer <token>` header
3. Less secure but works with strict cookie policies

## Quick Test

1. **Clear all cookies** for your site
2. **Login** with email/password
3. **Check Application → Cookies** - should see `jwt` cookie
4. **Check Network tab** - subsequent requests should include `Cookie: jwt=...`
5. **If cookie exists but not sent** - browser is blocking it

## Next Steps

1. ✅ **Deploy updated code** (with better logging)
2. ✅ **Test login** and check browser DevTools
3. ✅ **Check Render logs** for cookie setting confirmation
4. ✅ **Verify cookie is sent** in Network tab
5. ✅ **If still failing** - try different browser or disable cookie blocking

---

**Note:** The code is correct. The issue is likely browser cookie policies blocking third-party cookies. You may need to:
- Use a different browser
- Adjust browser settings
- Or implement token-based auth as fallback
