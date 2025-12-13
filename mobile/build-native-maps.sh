#!/bin/bash

# Script to build native maps for iOS and Android
# This enables native Apple Maps (iOS) and Google Maps (Android)

echo "🗺️  Building Native Maps..."
echo ""

# Check if we're in the mobile directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the mobile directory"
    exit 1
fi

# Detect platform
if [[ "$OSTYPE" == "darwin"* ]]; then
    PLATFORM="both"
    echo "✅ Detected macOS - can build for both iOS and Android"
else
    PLATFORM="android"
    echo "✅ Detected Linux/Windows - can build for Android only"
fi

echo ""
echo "Choose platform to build:"
echo "1) Android"
if [[ "$PLATFORM" == "both" ]]; then
    echo "2) iOS"
    echo "3) Both"
fi
read -p "Enter choice [1]: " choice
choice=${choice:-1}

case $choice in
    1)
        BUILD_PLATFORM="android"
        ;;
    2)
        if [[ "$PLATFORM" == "both" ]]; then
            BUILD_PLATFORM="ios"
        else
            echo "❌ iOS builds require macOS"
            exit 1
        fi
        ;;
    3)
        if [[ "$PLATFORM" == "both" ]]; then
            BUILD_PLATFORM="both"
        else
            echo "❌ iOS builds require macOS"
            exit 1
        fi
        ;;
    *)
        BUILD_PLATFORM="android"
        ;;
esac

echo ""
echo "📦 Step 1: Prebuilding native project files..."
npx expo prebuild --clean

if [ $? -ne 0 ]; then
    echo "❌ Prebuild failed"
    exit 1
fi

echo ""
echo "🔨 Step 2: Building native app..."

if [ "$BUILD_PLATFORM" == "android" ] || [ "$BUILD_PLATFORM" == "both" ]; then
    echo "Building Android..."
    npx expo run:android
    if [ $? -ne 0 ]; then
        echo "❌ Android build failed"
        exit 1
    fi
fi

if [ "$BUILD_PLATFORM" == "ios" ] || [ "$BUILD_PLATFORM" == "both" ]; then
    echo "Building iOS..."
    npx expo run:ios
    if [ $? -ne 0 ]; then
        echo "❌ iOS build failed"
        exit 1
    fi
fi

echo ""
echo "✅ Build complete!"
echo ""
echo "📱 Next steps:"
echo "1. Start the dev server: npx expo start --dev-client"
echo "2. Open your development build app (NOT Expo Go)"
echo "3. You'll now have native maps! 🗺️"
echo ""
echo "Note: Don't use Expo Go anymore - use your development build app instead."
