# Build Fix for Paths with Spaces

## Problem
Your project path contains spaces (`Project 2024`), which causes iOS build scripts to fail because paths aren't properly quoted.

## Solution
A fix script has been created that automatically patches the generated build scripts before each build.

## How to Build

### Option 1: Use npm script (Recommended)
```bash
cd mobile
npm run ios
```

This automatically runs the fix script before building.

### Option 2: Manual fix before build
```bash
cd mobile
bash ios/scripts/fix-exconstants-script.sh
npx expo run:ios
```

### Option 3: Build in Xcode
1. Open `ios/mobile.xcworkspace` in Xcode
2. Before building, run in terminal:
   ```bash
   cd mobile
   bash ios/scripts/fix-exconstants-script.sh
   ```
3. Build in Xcode (⌘+B)

## What the Fix Does

The fix script patches generated build scripts to properly quote paths with spaces:
- Fixes EXConstants script path
- Fixes PROJECT_ROOT variable assignment
- Fixes backtick command execution

## Files Created

- `ios/.xcode.env` - Node.js path configuration
- `ios/scripts/fix-exconstants-script.sh` - Script patcher
- `ios/scripts/pre-build-fix.sh` - Pre-build wrapper

## Note

The scripts are regenerated during each build, so the fix needs to run before building. The `npm run ios` command has been updated to do this automatically.

