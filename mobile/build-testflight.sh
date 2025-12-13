#!/bin/bash

# TestFlight Build Script for Chatu iOS App
# This script builds an archive ready for TestFlight upload

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$SCRIPT_DIR/ios"
WORKSPACE="$IOS_DIR/Chatu.xcworkspace"
SCHEME="Chatu"
ARCHIVE_PATH="$IOS_DIR/build/Chatu.xcarchive"

echo "🚀 Starting TestFlight Build Process..."
echo "📁 Project: $SCRIPT_DIR"
echo ""

# Check if Xcode is installed
if ! command -v xcodebuild &> /dev/null; then
    echo "❌ Error: Xcode is not installed or xcodebuild is not in PATH"
    echo "   Please install Xcode from the Mac App Store"
    exit 1
fi

# Check if workspace exists
if [ ! -d "$WORKSPACE" ]; then
    echo "❌ Error: Xcode workspace not found at $WORKSPACE"
    echo "   Run 'npx expo prebuild' first to generate iOS project"
    exit 1
fi

# Navigate to iOS directory
cd "$IOS_DIR"

echo "🧹 Step 1: Cleaning previous builds..."
xcodebuild clean \
    -workspace "$WORKSPACE" \
    -scheme "$SCHEME" \
    -configuration Release \
    > /dev/null 2>&1 || true

echo "📦 Step 2: Installing CocoaPods dependencies..."
if [ -f "Podfile" ]; then
    pod install --repo-update
else
    echo "⚠️  Warning: Podfile not found, skipping pod install"
fi

echo "🔨 Step 3: Building archive (this may take 5-10 minutes)..."
echo "   Note: Make sure you've configured signing in Xcode first!"
xcodebuild archive \
    -workspace "$WORKSPACE" \
    -scheme "$SCHEME" \
    -configuration Release \
    -archivePath "$ARCHIVE_PATH" \
    -allowProvisioningUpdates

# Check if archive was created
if [ -d "$ARCHIVE_PATH" ]; then
    echo ""
    echo "✅ Archive created successfully!"
    echo "📍 Location: $ARCHIVE_PATH"
    echo ""
    echo "📤 Next Steps:"
    echo "   1. Open Xcode"
    echo "   2. Go to Window → Organizer (or press Cmd+Shift+9)"
    echo "   3. Select your archive"
    echo "   4. Click 'Distribute App'"
    echo "   5. Choose 'App Store Connect' → 'Upload'"
    echo ""
    echo "   Or open Xcode Organizer directly:"
    echo "   open -a Xcode $ARCHIVE_PATH"
    echo ""
    
    # Optionally open Organizer
    read -p "Open Xcode Organizer now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        open -a Xcode "$ARCHIVE_PATH"
    fi
else
    echo "❌ Error: Archive was not created"
    echo "   Check the build output above for errors"
    exit 1
fi

