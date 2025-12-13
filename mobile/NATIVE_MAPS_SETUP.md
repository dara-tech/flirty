# Native Maps Setup Guide

To use **Apple Maps on iOS** and **Google Maps on Android** (instead of WebView), you need to create a **development build**.

## Why?

- **Expo Go** doesn't support custom native modules like `react-native-maps`
- **Development builds** include your custom native code

## Step 1: Install EAS CLI (if not already installed)

```bash
npm install -g eas-cli
```

## Step 2: Login to Expo

```bash
eas login
```

## Step 3: Configure EAS Build

```bash
cd mobile
eas build:configure
```

This creates an `eas.json` file.

## Step 4: Get Google Maps API Key (for Android)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable "Maps SDK for Android" and "Maps SDK for iOS"
4. Create credentials → API Key
5. Copy the API key

## Step 5: Update app.json

Replace `YOUR_GOOGLE_MAPS_API_KEY_HERE` in `app.json` with your actual API key:

```json
{
  "expo": {
    "plugins": [
      [
        "react-native-maps",
        {
          "googleMapsApiKey": "YOUR_ACTUAL_API_KEY"
        }
      ]
    ]
  }
}
```

## Step 6: Create Development Build

### For iOS (requires Mac):
```bash
eas build --profile development --platform ios
```

### For Android:
```bash
eas build --profile development --platform android
```

Or build locally:
```bash
npx expo prebuild
npx expo run:ios
# or
npx expo run:android
```

## Step 7: Install the Development Build

- **iOS**: Download from the build URL and install via TestFlight or directly
- **Android**: Download the APK and install

## Step 8: Run with Development Build

Instead of `npm run ios` with Expo Go, use:
```bash
npx expo start --dev-client
```

Then open the app using your development build (not Expo Go).

## Result

✅ **iOS**: Will use **Apple Maps** (native)  
✅ **Android**: Will use **Google Maps** (native)  
✅ Better performance and native features

---

**Note**: For now, the app will use WebView-based maps in Expo Go, which still works but is less performant than native maps.

