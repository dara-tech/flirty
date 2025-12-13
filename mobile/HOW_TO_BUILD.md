# How to Build the App

Complete guide for building iOS and Android apps.

## Prerequisites

### For iOS (macOS only):
- ✅ Xcode (latest version from App Store)
- ✅ Xcode Command Line Tools: `xcode-select --install`
- ✅ CocoaPods: `sudo gem install cocoapods`
- ✅ Node.js and npm

### For Android:
- ✅ Android Studio
- ✅ Android SDK (via Android Studio)
- ✅ Java Development Kit (JDK)
- ✅ Set `ANDROID_HOME` environment variable

---

## Step 1: Install Dependencies

```bash
cd "/Users/cheolsovandara/Documents/D/Developments/Project 2024/chat_app/mobile"
npm install
```

---

## Step 2: Generate Native Projects

This creates the `ios/` and `android/` folders with native code:

```bash
npx expo prebuild
```

**Note:** If you get errors about directories not being empty, clean first:
```bash
rm -rf ios android
npx expo prebuild
```

---

## Step 3: Build for iOS

### Option A: Build and Run (Recommended)
```bash
npx expo run:ios
```

This will:
- Install CocoaPods dependencies
- Build the app
- Launch iOS Simulator
- Install and run the app

### Option B: Build Only
```bash
cd ios
pod install
cd ..
npx expo run:ios --no-install
```

### If Podfile.lock is Out of Sync:
```bash
cd ios
pod install
cd ..
npx expo run:ios
```

### If You Get Permission Errors:
```bash
cd ios
chmod +x Pods/**/*.sh 2>/dev/null || true
pod install
cd ..
npx expo run:ios
```

### If You Get Codegen Errors:
```bash
# Clean Xcode build cache
rm -rf ~/Library/Developer/Xcode/DerivedData
cd ios
pod install
cd ..
npx expo run:ios --no-build-cache
```

---

## Step 4: Build for Android

### Option A: Build and Run (Recommended)
```bash
npx expo run:android
```

This will:
- Build the app
- Launch Android Emulator (if available)
- Install and run the app

### Option B: Build APK Only
```bash
cd android
./gradlew assembleDebug
cd ..
```

The APK will be at: `android/app/build/outputs/apk/debug/app-debug.apk`

### If Android SDK Not Found:
```bash
# Set ANDROID_HOME (add to ~/.zshrc or ~/.bash_profile)
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/tools
export PATH=$PATH:$ANDROID_HOME/tools/bin

# Then reload shell
source ~/.zshrc  # or source ~/.bash_profile
```

---

## Step 5: Run Development Server

After building, start the Metro bundler:

```bash
npx expo start --dev-client
```

**Important:** Use `--dev-client` flag (not regular Expo Go) because this app uses native modules like `react-native-maps`.

---

## Quick Build Commands

### iOS:
```bash
cd "/Users/cheolsovandara/Documents/D/Developments/Project 2024/chat_app/mobile"
npm install
npx expo prebuild
cd ios && pod install && cd ..
npx expo run:ios
```

### Android:
```bash
cd "/Users/cheolsovandara/Documents/D/Developments/Project 2024/chat_app/mobile"
npm install
npx expo prebuild
npx expo run:android
```

---

## Troubleshooting

### iOS Build Fails with "Permission denied"
```bash
cd ios
find . -name "*.sh" -exec chmod +x {} \;
pod install
cd ..
npx expo run:ios
```

### iOS Build Fails with "Podfile.lock out of sync"
```bash
cd ios
rm Podfile.lock
pod install
cd ..
npx expo run:ios
```

### iOS Build Fails with "Codegen file not found"
```bash
# Clean everything
rm -rf ~/Library/Developer/Xcode/DerivedData
cd ios
rm -rf build Pods Podfile.lock
pod install
cd ..
npx expo run:ios --no-build-cache
```

### Android Build Fails with "adb not found"
```bash
# Install Android SDK Platform Tools
# Via Android Studio: Tools > SDK Manager > SDK Tools > Android SDK Platform-Tools

# Or via command line:
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

### Build Database Locked (iOS)
```bash
# Kill all Xcode processes
killall Xcode xcodebuild
# Remove lock files
rm -rf ~/Library/Developer/Xcode/DerivedData/*/Build/Intermediates.noindex/*.xcbuild
```

---

## What Happens After Build?

✅ **Native maps will work** - `react-native-maps` will use Apple Maps (iOS) or Google Maps (Android)  
✅ **Better performance** - Native code runs faster than WebView  
✅ **Full native features** - Access to all device capabilities  

---

## Next Steps

1. **Test the app** - Make sure login, chat, and maps work
2. **Configure Google Maps API Key** (for Android) - Update `app.json` with your API key
3. **Build for production** - Use EAS Build or build locally for release

---

## Need Help?

Check the console logs for specific error messages. Common issues:
- Missing dependencies → Run `npm install` and `pod install`
- Path issues → Make sure you're in the `mobile/` directory
- Xcode version → Update to latest Xcode
- Node version → Use Node.js 18+ (check with `node --version`)
