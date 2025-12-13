# Fix "Host Unreachable" Network Error

## Problem
Mobile app can't connect to backend at `http://192.168.0.107:5002` - getting "Host unreachable" error.

## Common Causes

1. **Device and Computer on Different Networks**
   - Device must be on the **same WiFi network** as your computer
   - Check WiFi network name on both devices

2. **Firewall Blocking Connection**
   - macOS firewall might be blocking port 5002
   - Need to allow incoming connections

3. **Backend Not Listening on Network Interface**
   - Backend might only be listening on localhost
   - Need to bind to all interfaces (0.0.0.0)

4. **IP Address Changed**
   - Router assigned a new IP to your computer
   - Update `.env` file with new IP

## Solutions

### Solution 1: Check Same Network

**On your device:**
1. Go to Settings → WiFi
2. Note the WiFi network name

**On your computer:**
1. Check WiFi network name
2. Make sure it matches the device

**If different:** Connect both to the same WiFi network.

### Solution 2: Check Firewall (macOS)

1. Open **System Settings** → **Network** → **Firewall**
2. Click **Options** or **Firewall Options**
3. Make sure firewall is either:
   - **Off** (for development), OR
   - **On** with port 5002 allowed

**To allow port 5002:**
```bash
# Temporarily allow all connections (for development)
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate off

# Or add specific rule (requires admin)
# Go to System Settings → Network → Firewall → Options → Add Application
# Add Node.js or your terminal
```

### Solution 3: Verify Backend is Listening

Check if backend is listening on all interfaces:
```bash
lsof -i :5002
```

Should show:
```
node  ... TCP *:rfe (LISTEN)
```

The `*` means it's listening on all interfaces (good).

If it shows `127.0.0.1` or `localhost`, it's only listening locally (bad).

### Solution 4: Test Connection from Device

**From your Android device terminal (via ADB):**
```bash
adb shell "curl http://192.168.0.107:5002/api/auth/me"
```

**Or test ping:**
```bash
adb shell "ping -c 2 192.168.0.107"
```

If ping fails, device can't reach your computer (network issue).

### Solution 5: Use Production Backend (Temporary)

If local connection doesn't work, you can use production backend:

1. Update `mobile/.env`:
   ```
   EXPO_PUBLIC_API_URL=https://flirty-aspk.onrender.com
   ```

2. Restart dev server:
   ```bash
   npx expo start --dev-client --clear
   ```

**Note:** This uses production backend, so all users will see your test data.

### Solution 6: Check Router Settings

Some routers block device-to-device communication:

1. Check router settings for "AP Isolation" or "Client Isolation"
2. Disable it if enabled
3. This allows devices on same WiFi to communicate

## Quick Diagnostic Steps

1. **Check IP addresses:**
   ```bash
   # Computer IP
   ipconfig getifaddr en0
   
   # Device IP (from device settings)
   ```

2. **Test from computer:**
   ```bash
   curl http://192.168.0.107:5002/api/auth/me
   ```
   Should get a response (even if 401).

3. **Test from device (via ADB):**
   ```bash
   adb shell "curl http://192.168.0.107:5002/api/auth/me"
   ```
   If this fails, it's a network/firewall issue.

4. **Check same network:**
   - Device WiFi name = Computer WiFi name?

5. **Check firewall:**
   - macOS Firewall allowing connections?

## Most Common Fix

**90% of the time, it's one of these:**

1. ✅ **Same WiFi network** - Make sure device and computer are on same WiFi
2. ✅ **Firewall** - Turn off macOS firewall temporarily for testing
3. ✅ **IP changed** - Update `.env` with current IP: `ipconfig getifaddr en0`

## Still Not Working?

Try using production backend temporarily:
```bash
# In mobile/.env
EXPO_PUBLIC_API_URL=https://flirty-aspk.onrender.com
```

Then restart dev server. This will work but uses production data.
