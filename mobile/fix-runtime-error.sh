#!/bin/bash

echo "🔧 Fixing 'Runtime Not Ready' Error..."
echo ""

# Stop any running Metro bundlers
echo "1. Stopping Metro bundler..."
pkill -f "expo start" || true
pkill -f "metro" || true
sleep 2

# Clear Metro bundler cache
echo "2. Clearing Metro bundler cache..."
rm -rf $TMPDIR/metro-* 2>/dev/null || true
rm -rf $TMPDIR/haste-* 2>/dev/null || true
rm -rf node_modules/.cache 2>/dev/null || true

# Clear watchman cache (if installed)
if command -v watchman &> /dev/null; then
    echo "3. Clearing Watchman cache..."
    watchman watch-del-all 2>/dev/null || true
fi

# Clear Expo cache
echo "4. Clearing Expo cache..."
rm -rf .expo 2>/dev/null || true

# Clear React Native cache
echo "5. Clearing React Native cache..."
rm -rf /tmp/metro-* 2>/dev/null || true
rm -rf /tmp/haste-* 2>/dev/null || true

# Clear Android build cache (if exists)
if [ -d "android" ]; then
    echo "6. Clearing Android build cache..."
    cd android
    ./gradlew clean 2>/dev/null || true
    cd ..
fi

echo ""
echo "✅ Cache cleared! Now restart the app with:"
echo "   npx expo start --clear"
echo ""
echo "Or for your tablet:"
echo "   npx expo start --clear --device"
