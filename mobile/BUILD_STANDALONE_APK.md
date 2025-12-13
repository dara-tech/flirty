# Build Standalone APK (No Dev Server Needed)

## Current Situation

**Development APK** (what you have now):
- ✅ Already built and installed
- ❌ **Requires dev server running** (`npx expo start --dev-client`)
- ✅ Can update code without rebuilding
- ❌ Won't work if dev server stops

**Production APK** (standalone):
- ✅ **Works without dev server**
- ✅ All code bundled inside APK
- ✅ Can install and run anywhere
- ❌ Need to rebuild to update code

## Option 1: Build Standalone Production APK

### Step 1: Configure Backend URL

The production APK will use the backend URL from environment variables.

**Option A: Use Production Backend (Recommended)**
```bash
# In mobile/.env
EXPO_PUBLIC_API_URL=https://flirty-aspk.onrender.com
```

**Option B: Use Local Backend (Your Computer's IP)**
```bash
# In mobile/.env
EXPO_PUBLIC_LOCAL_IP=192.168.0.107
# Make sure backend is running and accessible
```

### Step 2: Build Production APK

```bash
cd mobile

# Build standalone production APK
npx expo run:android --variant release

# Or using EAS (if configured)
eas build --platform android --profile production
```

### Step 3: Install APK

The APK will be at:
```
android/app/build/outputs/apk/release/app-release.apk
```

Install it:
```bash
adb install android/app/build/outputs/apk/release/app-release.apk
```

### Step 4: Run Without Dev Server

Once installed, the APK works **standalone** - no dev server needed!

## Option 2: Keep Using Development APK

If you want to keep using the current APK with dev server:

1. **Keep dev server running:**
   ```bash
   npx expo start --dev-client
   ```

2. **App connects automatically** when you open it

3. **Update code** - just reload app (shake → Reload)

## Which Should You Use?

### Use Production APK If:
- ✅ You want to test without dev server
- ✅ You want to share APK with others
- ✅ You want to test on different devices
- ✅ You're ready for production testing

### Use Development APK If:
- ✅ You're actively developing
- ✅ You want hot reload
- ✅ You want to update code quickly
- ✅ Dev server is running

## Quick Build Command

**For standalone production APK:**
```bash
cd mobile
npx expo run:android --variant release
```

**For development APK (current):**
```bash
cd mobile
npx expo run:android
# Then start dev server:
npx expo start --dev-client
```

## Important Notes

1. **Backend URL**: Production APK uses the URL from `.env` file
2. **No Hot Reload**: Production APK doesn't support hot reload
3. **Rebuild Required**: To update code, rebuild the APK
4. **Backend Must Be Running**: APK still needs backend server (local or production)

## Current Recommendation

Since you're having network connection issues, I recommend:

1. **Use Production Backend** in `.env`:
   ```
   EXPO_PUBLIC_API_URL=https://flirty-aspk.onrender.com
   ```

2. **Build Production APK**:
   ```bash
   npx expo run:android --variant release
   ```

3. **Install and test** - works without dev server!

This way, the APK will work anywhere as long as there's internet connection.
