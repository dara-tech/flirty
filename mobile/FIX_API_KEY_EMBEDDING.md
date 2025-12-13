# Fix: API Key Not Embedded in AndroidManifest.xml

## Problem Found
Your API key is in `app.json` but it's **NOT in the AndroidManifest.xml**. This is why the map crashes!

## Solution: Rebuild with Plugin

The `react-native-maps` plugin should automatically add the API key during `prebuild`, but it didn't. Let's fix it:

### Step 1: Clean and Rebuild

```bash
cd mobile

# Remove old Android build
rm -rf android

# Regenerate with plugins (this should embed the API key)
npx expo prebuild --clean
```

### Step 2: Verify API Key is Now Embedded

```bash
cat android/app/src/main/AndroidManifest.xml | grep -A 2 "API_KEY"
```

You should now see:
```xml
<meta-data
    android:name="com.google.android.geo.API_KEY"
    android:value="YOUR_GOOGLE_MAPS_API_KEY_HERE"/>
```

### Step 3: If Still Not There, Manually Add It

If the plugin still doesn't add it, manually edit:

**File:** `android/app/src/main/AndroidManifest.xml`

**Add this inside the `<application>` tag:**
```xml
<application ...>
    <!-- Add this line -->
    <meta-data
        android:name="com.google.android.geo.API_KEY"
        android:value="YOUR_GOOGLE_MAPS_API_KEY_HERE"/>
    
    <!-- Rest of your application config -->
</application>
```

### Step 4: Rebuild APK

```bash
cd android
./gradlew clean
./gradlew assembleDebug
cd ..
```

The new APK will be at: `android/app/build/outputs/apk/debug/app-debug.apk`

## Why This Happened

The `react-native-maps` Expo plugin should automatically add the API key from `app.json` to AndroidManifest.xml during `prebuild`, but sometimes it doesn't work if:
- The plugin wasn't properly configured
- The prebuild was run before the plugin was added
- There was an error during plugin execution

## After Fixing

1. ✅ API key will be in AndroidManifest.xml
2. ✅ Native maps should work (if API key is valid in Google Cloud)
3. ✅ App won't crash when opening map
4. ✅ If native maps fail, will fallback to WebView (from latest code fixes)

## Test

1. Install the new APK
2. Open the app
3. Click on Map tab
4. Should work now! 🎉




