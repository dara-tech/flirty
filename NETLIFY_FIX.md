# Fix Netlify Build Error

## Error Message
```
Base directory does not exist: /opt/build/repo/cd frontend
```

## Problem
Netlify is trying to use "cd frontend" as a base directory path. This happens when "cd frontend" is entered in the Netlify dashboard instead of just "frontend".

## Solution

### Option 1: Use netlify.toml (Recommended) ✅

I've created a `netlify.toml` file in your repository root that automatically configures Netlify. 

**Steps:**
1. Commit and push the `netlify.toml` file to your repository
2. In Netlify dashboard, go to your site → **Site settings** → **Build & deploy**
3. Under **Build settings**, clear/remove any manual settings:
   - Clear **Base directory** field (leave empty - netlify.toml will handle it)
   - Clear **Build command** field
   - Clear **Publish directory** field
4. Save changes
5. Trigger a new deployment

### Option 2: Fix in Netlify Dashboard

If you want to manually configure:

1. Go to your Netlify site dashboard
2. Navigate to **Site settings** → **Build & deploy**
3. Under **Build settings**, click **Edit settings**
4. Fix the **Base directory** field:
   - **WRONG**: `cd frontend` ❌
   - **CORRECT**: `frontend` ✅
5. Set **Build command**: `npm run build`
6. Set **Publish directory**: `dist` (NOT `frontend/dist` - it's relative to base directory)
7. Save changes
8. Trigger a new deployment

## Correct Settings

| Field | Value | Notes |
|-------|-------|-------|
| **Base directory** | `frontend` | Just the folder name, no "cd" |
| **Build command** | `npm run build` | Runs inside base directory |
| **Publish directory** | `dist` | Relative to base directory |

## Verification

After fixing, the build should:
- ✅ Find the base directory: `/opt/build/repo/frontend`
- ✅ Run `npm install` and `npm run build` inside that directory
- ✅ Publish from `/opt/build/repo/frontend/dist`

## If Problem Persists

1. Check the `netlify.toml` file is in the repository root
2. Verify the file is committed and pushed to your Git repository
3. Clear Netlify build cache:
   - Site settings → Build & deploy → Clear build cache
   - Trigger new deployment
