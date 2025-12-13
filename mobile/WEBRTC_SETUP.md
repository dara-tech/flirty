# WebRTC Setup Guide

## Problem
The error "WebRTC native module not found" occurs because `react-native-webrtc` requires native modules that are not available in Expo Go.

## Solution: Create a Development Build

You need to create a **development build** (not use Expo Go) to use WebRTC features.

## Option 1: Local Development Build (Recommended for Testing)

### For Android:
```bash
cd mobile
npx expo prebuild
npx expo run:android
```

### For iOS (requires Mac):
```bash
cd mobile
npx expo prebuild
npx expo run:ios
```

### Then start the dev server:
```bash
npx expo start --dev-client
```

## Option 2: EAS Build (For Distribution)

### 1. Install EAS CLI:
```bash
npm install -g eas-cli
```

### 2. Login to Expo:
```bash
eas login
```

### 3. Configure EAS Build:
```bash
cd mobile
eas build:configure
```

### 4. Create Development Build:

**For Android:**
```bash
eas build --profile development --platform android
```

**For iOS:**
```bash
eas build --profile development --platform ios
```

### 5. Install the build and run:
```bash
npx expo start --dev-client
```

## Important Notes

- ✅ **Backend URL is already configured**: `https://flirty-aspk.onrender.com`
- ❌ **Expo Go won't work** - You must use a development build
- ✅ After building, use `npx expo start --dev-client` (not regular `expo start`)
- ✅ The development build includes all native modules including WebRTC

## Troubleshooting

If you still see the error after building:

1. **Clean and rebuild:**
   ```bash
   cd mobile
   rm -rf node_modules
   npm install
   npx expo prebuild --clean
   npx expo run:android  # or run:ios
   ```

2. **Check that react-native-webrtc is installed:**
   ```bash
   npm list react-native-webrtc
   ```

3. **Verify you're using the development build:**
   - Don't open the app in Expo Go
   - Open the app you built with `expo run:android` or `expo run:ios`
   - Start Metro with `npx expo start --dev-client`

