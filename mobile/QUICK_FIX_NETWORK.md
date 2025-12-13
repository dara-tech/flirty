# Quick Fix: Network Connection Issue

## Current Status
- ✅ Backend is running on port 5002
- ✅ Backend is listening on all interfaces
- ✅ Firewall is disabled
- ✅ Ping works from device to computer
- ❌ HTTP requests failing with "Host unreachable"

## Quick Fix Steps

### Step 1: Verify IP Address
```bash
# Check your current IP
ipconfig getifaddr en0

# Should match what's in mobile/.env
cat mobile/.env | grep EXPO_PUBLIC_LOCAL_IP
```

### Step 2: Restart Everything
```bash
# 1. Stop dev server (Ctrl+C in terminal)

# 2. Clear Metro cache
cd mobile
rm -rf node_modules/.cache
rm -rf .expo

# 3. Restart dev server
npx expo start --dev-client --clear

# 4. Reload app on device
# Shake device → "Reload" or press 'r' in terminal
```

### Step 3: If Still Not Working - Use Production Backend

Temporarily use production backend to test:

1. Edit `mobile/.env`:
   ```
   EXPO_PUBLIC_API_URL=https://flirty-aspk.onrender.com
   ```

2. Restart dev server:
   ```bash
   npx expo start --dev-client --clear
   ```

3. Reload app

**Note:** This uses production backend, so you'll see production data.

### Step 4: Check Device Network

On your Android device:
1. Settings → WiFi
2. Make sure you're connected to the **same WiFi** as your computer
3. Check WiFi network name matches

### Step 5: Verify Backend is Reachable

Test from your computer:
```bash
curl http://192.168.0.107:5002/api/auth/me
```

Should get a response (even if 401 Unauthorized).

## Most Likely Issue

The app might be using **cached environment variables**. 

**Solution:** 
1. Stop dev server
2. Clear cache: `rm -rf node_modules/.cache .expo`
3. Restart: `npx expo start --dev-client --clear`
4. Reload app on device

## Alternative: Use Production Backend

If local connection keeps failing, use production:

```bash
# In mobile/.env
EXPO_PUBLIC_API_URL=https://flirty-aspk.onrender.com
```

Then restart dev server. This will work immediately but uses production data.
