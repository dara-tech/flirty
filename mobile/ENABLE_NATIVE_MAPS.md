# Enable Native Apple Maps / Google Maps

Currently, the app uses **WebView-based maps (OpenStreetMap)** because it's running in **Expo Go**, which doesn't support native modules.

To use **native Apple Maps on iOS** or **Google Maps on Android**, you need to create a **development build**.

## Quick Setup (3 Steps)

### Step 1: Create Native Project Files
```bash
cd mobile
npx expo prebuild
```

This creates the iOS and Android native folders.

### Step 2: Update MapScreen.js

Open `mobile/src/screens/MapScreen.js` and:

1. **Uncomment the import** (around line 19):
   ```javascript
   import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
   ```

2. **Change `useNativeMaps` to `true`** (around line 25):
   ```javascript
   const useNativeMaps = true; // Enable native maps
   ```

### Step 3: Build and Run

**For iOS (requires Mac):**
```bash
npx expo run:ios
```

**For Android:**
```bash
npx expo run:android
```

This will:
- Build a development version of the app
- Install it on your simulator/device
- Use **native Apple Maps on iOS** and **Google Maps on Android**

## Result

✅ **iOS**: Beautiful native **Apple Maps**  
✅ **Android**: Native **Google Maps**  
✅ Better performance than WebView  
✅ Native map features (3D, flyover on iOS, etc.)

---

**Note**: After creating the development build, you'll need to use `npx expo start --dev-client` instead of regular Expo Go.

