# Native Apple Maps - Build Instructions

The Xcode workspace is now open. Follow these steps to build with native Apple Maps:

## Build Steps in Xcode:

1. **Select a Simulator:**
   - At the top of Xcode, click the device selector (next to "mobile")
   - Choose "iPhone 15 Pro" or any iOS simulator

2. **Build the Project:**
   - Press **⌘+B** (Cmd+B) to build
   - This will trigger codegen and compile everything
   - Wait for "Build Succeeded" message

3. **Run the App:**
   - Press **⌘+R** (Cmd+R) to run
   - Or click the Play button in the toolbar

## What to Expect:

✅ **After successful build:**
- Native **Apple Maps** will appear (not WebView)
- Better performance and native iOS features
- Same functionality as the WebView version

## If Build Fails in Xcode:

1. **Clean Build Folder:** Product → Clean Build Folder (⇧⌘K)
2. **Close Xcode completely**
3. **Re-run pod install:**
   ```bash
   cd ios
   pod install
   ```
4. **Re-open Xcode and try again**

## Troubleshooting:

If you see codegen errors:
- Xcode usually handles codegen better than CLI
- Make sure ReactCodegen target builds successfully first
- Check that all pod dependencies are installed

## After First Successful Build:

- The app will be installed on the simulator
- Future builds will be faster
- Use `npx expo start --dev-client` to run Metro bundler

---

**Current Status:** 
- ✅ Native maps code is enabled
- ✅ Xcode workspace is ready
- ⏳ Building in Xcode will complete setup

