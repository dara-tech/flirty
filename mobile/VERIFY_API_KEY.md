# Verify API Key in Built APK

Since you've already provided the API key in `app.json`, let's verify it was properly embedded in your APK build.

## Step 1: Check if API Key is in AndroidManifest.xml

After running `npx expo prebuild`, check the generated AndroidManifest.xml:

```bash
cd mobile
cat android/app/src/main/AndroidManifest.xml | grep -A 2 "API_KEY"
```

You should see:
```xml
<meta-data
    android:name="com.google.android.geo.API_KEY"
    android:value="AIzaSyDE9soRb5x5YPWrQqD8nm2K_VNXJVvTvx0"/>
```

## Step 2: Verify Google Cloud Console Settings

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Go to **APIs & Services** > **Enabled APIs**
4. Make sure these are **ENABLED**:
   - ✅ **Maps SDK for Android**
   - ✅ **Maps SDK for iOS** (if building for iOS)

5. Go to **APIs & Services** > **Credentials**
6. Click on your API key
7. Check **API restrictions**:
   - Should allow "Maps SDK for Android" (or no restrictions)
8. Check **Application restrictions**:
   - If set, make sure your app's package name is allowed: `com.anonymous.mobile`

## Step 3: Rebuild with Latest Fixes

The crash fixes I just made need to be in your APK. Rebuild:

```bash
cd mobile

# Clean previous build
rm -rf android ios

# Regenerate native projects (this embeds the API key)
npx expo prebuild --clean

# Build APK
cd android
./gradlew assembleDebug
cd ..
```

The APK will be at: `android/app/build/outputs/apk/debug/app-debug.apk`

## Step 4: Check Logcat for Actual Error

When the app crashes, check the actual error:

```bash
# Connect your device
adb devices

# Clear logcat and watch for errors
adb logcat -c
adb logcat | grep -i "map\|crash\|fatal\|exception"
```

Then click on the Map tab and see what error appears.

## Common Issues

### Issue 1: API Key Not Embedded
**Symptom:** "API key not found" error
**Fix:** Make sure you ran `npx expo prebuild` before building

### Issue 2: Maps SDK Not Enabled
**Symptom:** "This API project is not authorized to use this API"
**Fix:** Enable Maps SDK for Android in Google Cloud Console

### Issue 3: Package Name Mismatch
**Symptom:** API key works in some builds but not others
**Fix:** Check package name in `app.json` matches Google Cloud restrictions

### Issue 4: Native Module Crash
**Symptom:** App closes immediately when opening map
**Fix:** The latest code changes should handle this with WebView fallback

## Quick Test

1. **Rebuild with latest fixes:**
   ```bash
   cd mobile
   rm -rf android
   npx expo prebuild --clean
   cd android && ./gradlew assembleDebug && cd ..
   ```

2. **Install new APK:**
   ```bash
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```

3. **Test map screen** - Should now:
   - Try native maps first
   - Fallback to WebView if native maps fail
   - Show error screen with option to use WebView
   - **NOT crash** the app

## If Still Crashing

Run this to get the full crash log:
```bash
adb logcat -d > crash_log.txt
```

Then check `crash_log.txt` for the exact error message and share it.




