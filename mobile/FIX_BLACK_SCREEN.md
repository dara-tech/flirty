# Fix Black Screen Issue

## Problem
The app shows a black screen because it can't connect to Metro bundler.

## Root Cause
From logs: `failed to connect to /10.0.2.2 (port 8081)`

The emulator is trying to connect to Metro bundler but can't reach it.

## Solution

### Step 1: Start Metro Bundler
```bash
cd mobile
npx expo start --dev-client --clear
```

### Step 2: Wait for Metro to Start
You should see:
- Metro bundler starting
- "Metro waiting on exp://..."
- QR code and options

### Step 3: Reload the App
Once Metro is running:
1. **Shake your device/emulator** (or press `Ctrl+M` on emulator)
2. Select **"Reload"** from the dev menu
3. Or press `r` in the Metro terminal

### Step 4: If Still Black Screen

**Option A: Restart App**
```bash
# Kill the app
adb shell am force-stop com.anonymous.mobile

# Restart Metro
npx expo start --dev-client --clear

# Reinstall and run
npx expo run:android
```

**Option B: Check Metro is Accessible**
```bash
# Check if Metro is running
curl http://localhost:8081/status

# Should return: {"status":"running"}
```

**Option C: Use Tunnel Mode**
```bash
npx expo start --dev-client --tunnel
```

## Common Issues

### Issue 1: Metro Not Running
**Fix:** Make sure Metro bundler is running before opening the app

### Issue 2: Port 8081 Blocked
**Fix:** 
```bash
# Kill any process on port 8081
lsof -ti:8081 | xargs kill -9

# Restart Metro
npx expo start --dev-client
```

### Issue 3: Network Issue
**Fix:** Use tunnel mode or check firewall settings

### Issue 4: Cache Issue
**Fix:**
```bash
# Clear Metro cache
npx expo start --dev-client --clear

# Clear app cache
adb shell pm clear com.anonymous.mobile
```

## Quick Fix Command

```bash
cd mobile
# Kill old Metro
lsof -ti:8081 | xargs kill -9 2>/dev/null

# Start fresh Metro
npx expo start --dev-client --clear
```

Then reload the app (shake device → Reload).


