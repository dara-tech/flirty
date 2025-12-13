# Enable Native Maps - Quick Guide

## Problem
- **iOS**: Using WebView (browser) instead of native Apple Maps
- **Android**: Map not smooth, using WebView instead of native Google Maps

## Why?
**Expo Go doesn't support native modules** like `react-native-maps`. You need a **development build**.

## Solution: Create Development Build

### Option 1: Local Build (Fastest - Recommended)

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

### Option 2: EAS Build (Cloud Build)

```bash
cd mobile
npm install -g eas-cli
eas login
eas build:configure
eas build --profile development --platform android  # or ios
```

After build completes, install the APK/IPA and run:
```bash
npx expo start --dev-client
```

## What You'll Get

✅ **iOS**: Native **Apple Maps** (smooth, fast, native features)  
✅ **Android**: Native **Google Maps** (smooth, fast, better performance)  
✅ **No WebView**: Direct native map rendering  
✅ **Better Performance**: 60fps smooth scrolling  
✅ **Native Features**: 3D maps, gestures, etc.

## Current Status

- ❌ **Expo Go**: Uses WebView (slow, browser-based)
- ✅ **Development Build**: Uses native maps (fast, smooth)

## After Building

1. **Don't use Expo Go** - Use your development build app instead
2. **Start with**: `npx expo start --dev-client`
3. **Open**: Your development build app (not Expo Go)

---

**Note**: The Google Maps API key is already configured in `app.json`. It will be automatically embedded during the build process.
