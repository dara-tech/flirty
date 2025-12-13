#!/bin/bash
# Debug Logout Script

DEVICE="HVA5K72A"

echo "=== Debugging Logout ==="
echo ""
echo "1. Clearing logs..."
adb -s $DEVICE logcat -c

echo "2. Starting log monitoring..."
echo "   Now try logging out in your app!"
echo "   Press Ctrl+C to stop"
echo ""

# Watch for React Native logs, console logs, and our debug messages
adb -s $DEVICE logcat | grep -E "(ReactNativeJS|console|logout|Logout|Navigation|Navigating|Auth|Login|🔄|✅|❌|⚠️)" --color=always
