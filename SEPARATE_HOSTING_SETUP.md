# Separate Hosting Setup Summary

## What Was Changed

### ✅ Backend (Render)

1. **CORS Configuration** (`backend/src/index.js`)
   - Now reads `FRONTEND_URL` from environment variable
   - Allows your Netlify frontend URL
   - Maintains support for localhost development

2. **Socket.IO CORS** (`backend/src/lib/socket.js`)
   - Matches Express CORS configuration
   - Reads `FRONTEND_URL` from environment variable
   - Allows WebSocket connections from Netlify

3. **Cookie Settings** (`backend/src/lib/until.js`)
   - Changed to `sameSite: 'none'` for cross-origin
   - Requires `secure: true` (HTTPS only)
   - Works with separate frontend/backend domains

### ✅ Frontend (Netlify)

1. **API Configuration** (`frontend/src/lib/axois.js`)
   - Reads `VITE_API_URL` from environment variable
   - Falls back to relative path if not set
   - Supports both separate and same-domain hosting

2. **Socket.IO Configuration** (`frontend/src/store/useAuthStore.js`)
   - Reads `VITE_API_URL` from environment variable
   - Connects to backend for WebSocket
   - Removes `/api` suffix automatically

## Environment Variables Needed

### Backend (Render Dashboard)

```env
FRONTEND_URL=https://your-app-name.netlify.app
```

Plus all your existing variables (MONGODB_URI, JWT_SECRET, etc.)

### Frontend (Netlify Dashboard)

```env
VITE_API_URL=https://your-backend-name.onrender.com
```

**Important**: Variable name must start with `VITE_` for Vite to expose it.

## Quick Deployment Steps

### 1. Deploy Backend First (Render)

1. Connect repository to Render
2. Set environment variables (including a placeholder for `FRONTEND_URL`)
3. Deploy and get backend URL: `https://your-backend.onrender.com`

### 2. Deploy Frontend (Netlify)

1. Connect repository to Netlify
2. Set build settings:
   - Build command: `npm run build`
   - Publish directory: `frontend/dist`
3. Set environment variable:
   - `VITE_API_URL=https://your-backend.onrender.com`
4. Deploy and get frontend URL: `https://your-app.netlify.app`

### 3. Update Backend with Frontend URL

1. Go to Render dashboard
2. Update `FRONTEND_URL` with your Netlify URL
3. Redeploy backend (automatic or manual)

### 4. Update Frontend with Backend URL (if needed)

1. Go to Netlify dashboard
2. Verify `VITE_API_URL` is set correctly
3. Trigger new deployment if needed

## Key Points

- ✅ **CORS**: Backend automatically allows your Netlify URL via `FRONTEND_URL`
- ✅ **Cookies**: Configured for cross-origin (sameSite: 'none')
- ✅ **Socket.IO**: Automatically configured to match CORS
- ✅ **Environment Variables**: Flexible - works with or without separate hosting

## Testing Checklist

After deployment, test:
- [ ] User can log in
- [ ] Messages send/receive
- [ ] Real-time typing indicators work
- [ ] Online status updates
- [ ] File uploads work (if applicable)
- [ ] WebRTC calls work (if applicable)

## Need Help?

See `DEPLOYMENT_GUIDE.md` for detailed step-by-step instructions.
