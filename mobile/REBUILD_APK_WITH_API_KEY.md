# Rebuild APK with API Key - Step by Step

## ✅ API Key is Already in AndroidManifest.xml

The API key is correctly added to `android/app/src/main/AndroidManifest.xml`:
```xml
<meta-data android:name="com.google.android.geo.API_KEY" android:value="YOUR_GOOGLE_MAPS_API_KEY_HERE"/>
```

## ⚠️ Problem: Your Current APK Doesn't Have It

The APK you're running was built **before** the API key was added. You need to rebuild it.

## 🔧 Solution: Rebuild the APK

### Step 1: Clean Previous Build
```bash
cd mobile/android
./gradlew clean
```

### Step 2: Build New APK
```bash
./gradlew assembleDebug
```

### Step 3: Find the New APK
The new APK will be at:
```
mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

### Step 4: Uninstall Old APK and Install New One
```bash
# Uninstall old version
adb uninstall com.anonymous.mobile

# Install new APK
adb install mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

Or manually:
1. Uninstall the old app from your device
2. Transfer the new APK to your device
3. Install it

## 🎯 Quick Rebuild Command (All in One)

```bash
cd /Users/cheolsovandara/Documents/D/Developments/Project_2024/chat_app/mobile/android
./gradlew clean assembleDebug
```

Then install:
```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## ✅ After Rebuilding

1. **Uninstall the old app** from your device
2. **Install the new APK**
3. **Open the app** and go to Map tab
4. **The error should be gone!** 🎉

## 🔍 Verify API Key is in APK

After building, you can verify the API key is in the APK:

```bash
# Extract and check AndroidManifest from APK
aapt dump badging app/build/outputs/apk/debug/app-debug.apk | grep API_KEY
```

Or use Android Studio's APK Analyzer to check the manifest.

## ⚠️ Important Notes

1. **You MUST rebuild** - Just having it in the source code isn't enough
2. **You MUST uninstall old app** - Otherwise Android might use cached version
3. **The API key is correct** - It's in the manifest, just needs to be in the APK

## 🐛 If Still Not Working After Rebuild

1. Check Google Cloud Console:
   - Maps SDK for Android is enabled
   - API key restrictions allow your package: `com.anonymous.mobile`

2. Check the built APK:
   ```bash
   # Use aapt to check manifest in APK
   aapt dump xmltree app/build/outputs/apk/debug/app-debug.apk AndroidManifest.xml | grep API_KEY
   ```

3. Check logcat for other errors:
   ```bash
   adb logcat | grep -i "maps\|api\|key"
   ```




