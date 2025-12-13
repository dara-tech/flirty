# Build Troubleshooting Guide

## If you see "Build service could not create build operation" error:

### Quick Fix:
1. **Close Xcode completely** (⌘+Q)
2. **Wait 10 seconds**
3. **Reopen Xcode** and try building again

### If that doesn't work:

1. **Clean DerivedData:**
   ```bash
   rm -rf ~/Library/Developer/Xcode/DerivedData/mobile-*
   ```

2. **Kill all Xcode processes:**
   ```bash
   killall Xcode
   killall xcodebuild
   ```

3. **Clean build folders:**
   ```bash
   cd ios
   rm -rf build
   rm -rf Pods/build
   ```

4. **Reinstall pods:**
   ```bash
   cd ios
   pod install
   ```

5. **Reopen Xcode:**
   ```bash
   open ios/mobile.xcworkspace
   ```

6. **In Xcode:**
   - Product → Clean Build Folder (⇧⌘K)
   - Product → Build (⌘+B)

## Common Build Issues Fixed:

✅ **PhaseScriptExecution errors** - Fixed by updating Podfile to handle paths with spaces
✅ **Node.js not found** - Fixed by creating `.xcode.env` file
✅ **Script path issues** - Fixed by correctly locating scripts in `node_modules`

## After Successful Build:

Once the build succeeds, you'll have:
- ✅ Native Apple Maps on iOS
- ✅ Native Google Maps on Android  
- ✅ Full native map features (not WebView)

## Next Steps:

After the build completes, run:
```bash
npx expo start --dev-client
```

Then the app will connect to Metro bundler and you can use native maps!

