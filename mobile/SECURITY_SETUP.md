# Security Setup Guide

## ⚠️ IMPORTANT: API Keys and Secrets

This app requires API keys and secrets that should **NEVER** be committed to git.

## Required Secrets

### 1. Google Maps API Key
- **Location:** `mobile/app.json`
- **Fields:**
  - `ios.config.googleMapsApiKey`
  - `plugins[react-native-maps].googleMapsApiKey`
- **How to get:** [Google Cloud Console](https://console.cloud.google.com/)

### 2. Backend Environment Variables
- **Location:** `backend/.env`
- **Required variables:**
  - `JWT_SECRET` - Secret for JWT token signing
  - `MONGO_URI` - MongoDB connection string
  - `CLOUDINARY_CLOUD_NAME` - Cloudinary cloud name
  - `CLOUDINARY_API_KEY` - Cloudinary API key
  - `CLOUDINARY_API_SECRET` - Cloudinary API secret

### 3. Frontend Environment Variables
- **Location:** `frontend/.env`
- **Required variables:**
  - `VITE_API_URL` - Backend API URL (optional, defaults to `/api`)

## Setup Instructions

### Step 1: Remove app.json from Git (if already tracked)

```bash
# Remove from git tracking (keeps local file)
git rm --cached mobile/app.json

# Commit the removal
git commit -m "Remove app.json with API key from git"
```

### Step 2: Create Local app.json

```bash
# Copy the example template
cp mobile/app.json.example mobile/app.json

# Edit mobile/app.json and replace YOUR_GOOGLE_MAPS_API_KEY_HERE with your actual key
# Use your preferred editor (nano, vim, VS Code, etc.)
```

### Step 3: Create .env Files

```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env and add your secrets

# Frontend (if needed)
cp frontend/.env.example frontend/.env
# Edit frontend/.env and add your API URL if needed
```

### Step 4: Verify .gitignore

Make sure these are in `.gitignore`:
- `.env`
- `.env.local`
- `.env.*`
- `mobile/app.json`
- `*.apk`
- `*.aab`
- `*.ipa`

## ⚠️ If You've Already Pushed Secrets

If you've already pushed `app.json` or `.env` files with secrets:

1. **Regenerate the exposed keys:**
   - Google Maps API Key: Regenerate in Google Cloud Console
   - Cloudinary: Regenerate API keys in Cloudinary dashboard
   - JWT_SECRET: Generate a new secret

2. **Remove from git history (advanced):**
   ```bash
   # Use git filter-branch or BFG Repo-Cleaner
   # This rewrites git history - be careful!
   ```

3. **Or start fresh:**
   - Create a new repository
   - Don't copy the old history
   - Add all files except secrets

## Best Practices

1. ✅ Always use `.env.example` files as templates
2. ✅ Never commit `.env` files
3. ✅ Never commit API keys in code
4. ✅ Use environment variables for all secrets
5. ✅ Rotate keys if exposed
6. ✅ Use different keys for dev/staging/production

## Verification

Check that secrets are not tracked:

```bash
# Check for API keys in tracked files
git ls-files | xargs grep -l "AIzaSy\|CLOUDINARY\|JWT_SECRET" || echo "✅ No secrets found"

# Check that .env files are ignored
git status --ignored | grep .env
```

