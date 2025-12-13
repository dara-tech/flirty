# Fix "Map API Key Not Found" Error

## Problem
The error "Map API key not found" occurs because:
1. **Expo Go doesn't support native modules** - The API key configuration in `app.json` only applies to native builds
2. **Native build required** - Google Maps API key must be embedded in the native Android/iOS code

## Solution: Create a Development Build

Your API key is already configured in `app.json`:
- ✅ iOS: `ios.config.googleMapsApiKey`
- ✅ Android: `android.config.googleMaps.apiKey`
- ✅ Plugin: `plugins[react-native-maps].googleMapsApiKey`

The key will be applied when you create a native build.

## Quick Fix Steps

### Option 1: Local Development Build (Fastest)

**For Android:**
```bash
cd mobile
npx expo prebuild --clean
npx expo run:android
```

**For iOS (requires Mac):**
```bash
cd mobile
npx expo prebuild --clean
npx expo run:ios
```

**Then start dev server:**
```bash
npx expo start --dev-client
```

### Option 2: EAS Build (For Distribution)

1. **Install EAS CLI:**
   ```bash
   npm install -g eas-cli
   ```

2. **Login:**
   ```bash
   eas login
   ```

3. **Configure:**
   ```bash
   cd mobile
   eas build:configure
   ```

4. **Build:**
   ```bash
   # Android
   eas build --profile development --platform android
   
   # iOS
   eas build --profile development --platform ios
   ```

5. **Install the build and run:**
   ```bash
   npx expo start --dev-client
   ```

## Verify API Key Configuration

After building, verify the API key is embedded:

**Android:** Check `android/app/src/main/AndroidManifest.xml`:
```xml
<meta-data
    android:name="com.google.android.geo.API_KEY"
    android:value="YOUR_API_KEY_HERE"/>
```

**iOS:** Check `ios/mobile/Info.plist`:
```xml
<key>GMSApiKey</key>
<string>YOUR_API_KEY_HERE</string>
```

## Important Notes

1. **Don't use Expo Go** - It won't work with native maps
2. **API key is already set** - No need to change `app.json`
3. **Rebuild after changes** - If you update the API key, rebuild the app
4. **Google Cloud Console** - Make sure your API key has:
   - Maps SDK for Android enabled (for Android)
   - Maps SDK for iOS enabled (for iOS)
   - Proper restrictions set (optional but recommended)

## Troubleshooting

### If error persists after building:

1. **Verify API key is valid:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Check API key restrictions
   - Ensure Maps SDK is enabled

2. **Clean and rebuild:**
   ```bash
   cd mobile
   rm -rf android ios
   npx expo prebuild --clean
   npx expo run:android  # or run:ios
   ```

3. **Check console logs:**
   - Look for specific error messages
   - Verify API key is being read from native code

## Current Configuration

Your `app.json` already has:
```json
{
  "ios": {
    "config": {
      "googleMapsApiKey": "YOUR_GOOGLE_MAPS_API_KEY_HERE"
    }
  },
  "android": {
    "config": {
      "googleMaps": {
        "apiKey": "YOUR_GOOGLE_MAPS_API_KEY_HERE"
      }
    }
  },
  "plugins": [
    [
      "react-native-maps",
      {
        "googleMapsApiKey": "YOUR_GOOGLE_MAPS_API_KEY_HERE"
      }
    ]
  ]
}
```

✅ **Configuration is correct** - Just need to build!

