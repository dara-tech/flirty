# Fix API Key on Emulator - Step by Step

## Problem
API key is in AndroidManifest.xml but not working on emulator. This means the app was built before the API key was added.

## Solution: Clean Rebuild

### Step 1: Remove Android Folder
```bash
cd mobile
rm -rf android
```

### Step 2: Regenerate Android Project with API Key
```bash
npx expo prebuild --clean
```

This will:
- Regenerate the `android/` folder
- Process the `react-native-maps` plugin
- Embed the API key from `app.json` into AndroidManifest.xml

### Step 3: Verify API Key is Embedded
```bash
cat android/app/src/main/AndroidManifest.xml | grep -A 1 "API_KEY"
```

You should see:
```xml
<meta-data android:name="com.google.android.geo.API_KEY" android:value="AIzaSyDE9soRb5x5YPWrQqD8nm2K_VNXJVvTvx0"/>
```

### Step 4: Clean Build
```bash
cd android
./gradlew clean
cd ..
```

### Step 5: Run on Emulator
```bash
npx expo run:android
```

Or if you prefer:
```bash
cd android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Quick All-in-One Command

```bash
cd mobile
rm -rf android
npx expo prebuild --clean
cd android && ./gradlew clean && cd ..
npx expo run:android
```

## Why This Works

1. **Removing `android/` folder** - Gets rid of old build without API key
2. **`npx expo prebuild --clean`** - Regenerates everything fresh with plugins
3. **`./gradlew clean`** - Cleans any cached build files
4. **`npx expo run:android`** - Builds and runs fresh app with API key

## After Rebuilding

1. ✅ API key will be in the built app
2. ✅ Maps should work on emulator
3. ✅ No more "API key not found" error

## If Still Not Working

1. **Check Google Cloud Console:**
   - Maps SDK for Android is enabled
   - API key restrictions allow your package: `com.anonymous.mobile`

2. **Check logcat:**
   ```bash
   adb logcat | grep -i "maps\|api\|key"
   ```

3. **Verify in built APK:**
   ```bash
   # Check if API key is in the actual built APK
   aapt dump xmltree app/build/outputs/apk/debug/app-debug.apk AndroidManifest.xml | grep API_KEY
   ```




