# 🔐 Fix 401 Authentication Errors

## Problem
Getting 401 (Unauthorized) errors on multiple API endpoints:
- `/auth/check`
- `/users`
- `/contacts`
- `/last-messages`
- `/my-groups`

## Root Causes

### 1. **No Authentication Cookie**
- User is not logged in
- Cookie expired (7 days default)
- Cookie was cleared by browser

### 2. **Cookie Not Being Sent**
- Browser blocking third-party cookies
- CORS not configured correctly
- `withCredentials` not set (but it is set ✅)

### 3. **Session Expired**
- JWT token expired
- Backend restarted and lost session
- Cookie settings changed

## Solutions Implemented

### ✅ 1. Global 401 Error Handling
- Added automatic auth state clearing on 401 errors
- Prevents infinite error loops
- Clears socket connection on session expiry

### ✅ 2. Better Error Messages
- Console warnings for session expiry
- Silent handling for `/auth/check` (expected when not logged in)

## What You Need to Do

### **If You're Getting 401 Errors:**

1. **Check if you're logged in:**
   - Go to login page
   - Log in again
   - Check browser console for cookie warnings

2. **Check Browser Cookie Settings:**
   - Chrome: Settings → Privacy → Cookies
   - Make sure third-party cookies are allowed (for cross-origin)
   - Or use same domain for frontend/backend

3. **Check Environment Variables:**
   - **Backend (Render):** `FRONTEND_URL` must be set to your Netlify URL
   - **Frontend (Netlify):** `VITE_API_URL` must be set to your Render backend URL

4. **Clear Browser Data:**
   - Clear cookies for your site
   - Try logging in again

5. **Check Network Tab:**
   - Open DevTools → Network
   - Check if cookies are being sent in requests
   - Look for `Cookie` header in request headers

## Production Cookie Requirements

For separate hosting (Netlify + Render):
- ✅ `sameSite: 'none'` (set in backend)
- ✅ `secure: true` (set in backend)
- ✅ `withCredentials: true` (set in frontend axios)
- ✅ CORS `credentials: true` (set in backend)

## Testing

1. **Login:**
   ```bash
   # Should set cookie in browser
   POST /api/auth/login
   ```

2. **Check Auth:**
   ```bash
   # Should return user data
   GET /api/auth/check
   ```

3. **Other Endpoints:**
   ```bash
   # Should work after login
   GET /api/users
   GET /api/contacts
   ```

## If Still Not Working

1. **Check Backend Logs (Render):**
   - Look for CORS errors
   - Check if cookies are being received
   - Verify JWT_SECRET is set

2. **Check Frontend Console:**
   - Look for cookie warnings
   - Check network requests
   - Verify `withCredentials: true` in requests

3. **Test Cookie Manually:**
   ```javascript
   // In browser console
   document.cookie // Should show 'jwt=...' if logged in
   ```

## Quick Fix

**If you just need to log in again:**
1. Go to login page
2. Enter credentials
3. Check if cookie is set
4. Try accessing protected routes

---

**Note:** 401 errors on `/auth/check` are **normal** when not logged in. Other 401 errors indicate you need to log in.
