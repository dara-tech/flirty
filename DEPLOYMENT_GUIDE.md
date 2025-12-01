# Deployment Guide: Backend on Render + Frontend on Netlify

This guide will help you deploy your chat application with the backend hosted on Render and the frontend hosted on Netlify.

## Table of Contents

1. [Backend Deployment (Render)](#backend-deployment-render)
2. [Frontend Deployment (Netlify)](#frontend-deployment-netlify)
3. [Environment Variables Setup](#environment-variables-setup)
4. [CORS Configuration](#cors-configuration)
5. [Troubleshooting](#troubleshooting)

---

## Backend Deployment (Render)

### Step 1: Prepare Backend Repository

1. Make sure your backend code is in a Git repository (GitHub, GitLab, or Bitbucket)
2. Ensure `package.json` has a start script:
   ```json
   {
     "scripts": {
       "start": "node src/index.js"
     }
   }
   ```

### Step 2: Create Render Service

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New +"** → **"Web Service"**
3. Connect your repository
4. Configure the service:
   - **Name**: `chat-app-backend` (or your preferred name)
   - **Root Directory**: `backend` (if backend is in a subdirectory)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Choose a plan (Free tier available)

### Step 3: Set Environment Variables on Render

Go to your service → **Environment** tab and add:

```env
PORT=5002
NODE_ENV=production
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_here
FRONTEND_URL=https://your-app-name.netlify.app
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
GOOGLE_CLIENT_ID=your_google_client_id_here
```

**Important**: Replace `FRONTEND_URL` with your actual Netlify URL (you'll get this after deploying frontend).

### Step 4: Deploy

1. Click **"Create Web Service"**
2. Render will automatically deploy your backend
3. Wait for deployment to complete
4. Note your backend URL: `https://your-backend-name.onrender.com`

---

## Frontend Deployment (Netlify)

### Step 1: Build Frontend Locally (Optional - for testing)

```bash
cd frontend
npm install
npm run build
```

The `dist` folder will contain your built files.

### Step 2: Create Netlify Site

1. Go to [Netlify Dashboard](https://app.netlify.com/)
2. Click **"Add new site"** → **"Import an existing project"**
3. Connect your Git repository
4. **IMPORTANT**: The repository includes a `netlify.toml` file that automatically configures build settings. You can skip manual configuration, or verify:
   - **Base directory**: `frontend` (must be exactly "frontend", not "cd frontend")
   - **Build command**: `npm run build` (runs automatically inside base directory)
   - **Publish directory**: `dist` (relative to base directory, so it resolves to `frontend/dist`)
   - **Node version**: `20` (or your preferred version)

### Step 3: Set Environment Variables on Netlify

Go to your site → **Site settings** → **Environment variables** and add:

```env
VITE_API_URL=https://your-backend-name.onrender.com
```

**Important**: 
- Replace with your actual Render backend URL
- Variable name must start with `VITE_` for Vite to expose it
- After adding, trigger a new deployment to apply changes

### Step 4: Deploy

1. Click **"Deploy site"**
2. Netlify will automatically build and deploy your frontend
3. Wait for deployment to complete
4. Note your frontend URL: `https://your-app-name.netlify.app`

---

## Environment Variables Setup

### Backend (Render)

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `5002` |
| `NODE_ENV` | Environment | `production` |
| `MONGODB_URI` | MongoDB connection string | `mongodb+srv://...` |
| `JWT_SECRET` | Secret for JWT tokens | `your-secret-key` |
| `FRONTEND_URL` | Netlify frontend URL | `https://your-app.netlify.app` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | `your-cloud-name` |
| `CLOUDINARY_API_KEY` | Cloudinary API key | `your-api-key` |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | `your-api-secret` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | `your-google-client-id` |

### Frontend (Netlify)

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `https://your-backend.onrender.com` |

**Note**: After deploying backend, update `FRONTEND_URL` in Render, then redeploy frontend with the backend URL.

---

## CORS Configuration

### Backend CORS

The backend is configured to allow:
- All localhost origins (for development)
- Your Netlify frontend URL (from `FRONTEND_URL` env var)
- Development mode allows all origins

### Socket.IO CORS

Socket.IO CORS matches the backend Express CORS configuration automatically.

---

## Important Configuration Notes

### 1. Cookie Settings (Cross-Origin)

For separate hosting (frontend on Netlify, backend on Render), cookies are configured with:
- `sameSite: 'none'` (required for cross-origin)
- `secure: true` (required when sameSite is 'none')

This is automatically handled in `backend/src/lib/until.js`.

### 2. Environment Variable Updates

If you need to update environment variables:

**Backend (Render)**:
1. Go to service → Environment
2. Add/update variables
3. Click "Save Changes"
4. Service will automatically redeploy

**Frontend (Netlify)**:
1. Go to site → Site settings → Environment variables
2. Add/update variables
3. Go to Deploys → Trigger deploy → Deploy site

### 3. After Initial Deployment

1. **Deploy backend first** → Get backend URL
2. **Update `FRONTEND_URL` in Render** with your Netlify URL (you'll get this next)
3. **Deploy frontend** → Get frontend URL
4. **Update `FRONTEND_URL` in Render** with actual Netlify URL
5. **Redeploy backend** to apply CORS changes
6. **Update `VITE_API_URL` in Netlify** with backend URL
7. **Redeploy frontend** to connect to backend

---

## Troubleshooting

### Issue: CORS Errors

**Symptoms**: Browser console shows CORS errors when making API requests

**Solutions**:
1. Check that `FRONTEND_URL` in Render matches your exact Netlify URL (including `https://`)
2. Check that both URLs match exactly (no trailing slashes)
3. Redeploy backend after updating `FRONTEND_URL`
4. Check browser console for exact CORS error message

### Issue: Socket.IO Connection Fails

**Symptoms**: Real-time features (messages, typing indicators) don't work

**Solutions**:
1. Check that `VITE_API_URL` in Netlify includes the full backend URL
2. Verify Socket.IO CORS is configured (should match Express CORS)
3. Check browser console for Socket.IO connection errors
4. Ensure backend URL doesn't have `/api` suffix for Socket.IO

### Issue: Authentication Not Working

**Symptoms**: Users can't log in or get logged out

**Solutions**:
1. Check cookie settings (should be `sameSite: 'none'` for cross-origin)
2. Verify `secure: true` is set in production
3. Check that both frontend and backend use HTTPS
4. Check browser console for cookie-related errors

### Issue: Environment Variables Not Working

**Symptoms**: App uses wrong URLs or can't connect

**Solutions**:
1. **Frontend**: Variables must start with `VITE_` prefix
2. **Backend**: Check that variables are set in Render dashboard
3. Redeploy after adding/updating environment variables
4. Check build logs to see if variables are being read

### Issue: Build Fails

**Solutions**:
1. Check build logs in Netlify/Render dashboard
2. Ensure all dependencies are in `package.json`
3. Check Node version compatibility
4. Verify build commands are correct

---

## Step-by-Step Deployment Checklist

### Backend (Render)

- [ ] Repository is connected to Render
- [ ] Build command: `npm install`
- [ ] Start command: `npm start`
- [ ] Environment variables set:
  - [ ] `PORT=5002`
  - [ ] `NODE_ENV=production`
  - [ ] `MONGODB_URI` (set)
  - [ ] `JWT_SECRET` (set)
  - [ ] `FRONTEND_URL` (will update after frontend deploy)
  - [ ] `CLOUDINARY_*` variables (if using)
  - [ ] `GOOGLE_CLIENT_ID` (if using)
- [ ] Deployment successful
- [ ] Backend URL noted: `https://your-backend.onrender.com`

### Frontend (Netlify)

- [ ] Repository is connected to Netlify
- [ ] Base directory: `frontend`
- [ ] Build command: `npm run build`
- [ ] Publish directory: `frontend/dist`
- [ ] Environment variables set:
  - [ ] `VITE_API_URL=https://your-backend.onrender.com`
- [ ] Deployment successful
- [ ] Frontend URL noted: `https://your-app.netlify.app`

### Post-Deployment

- [ ] Update `FRONTEND_URL` in Render with Netlify URL
- [ ] Redeploy backend (if needed)
- [ ] Update `VITE_API_URL` in Netlify with Render backend URL
- [ ] Redeploy frontend
- [ ] Test authentication
- [ ] Test real-time features (messages, typing)
- [ ] Test file uploads (if applicable)

---

## Support

If you encounter issues:

1. Check build logs in Render/Netlify dashboard
2. Check browser console for errors
3. Verify all environment variables are set correctly
4. Ensure URLs match exactly (no trailing slashes)
5. Check that both services are using HTTPS

---

**Last Updated**: 2024
**Status**: Ready for deployment
