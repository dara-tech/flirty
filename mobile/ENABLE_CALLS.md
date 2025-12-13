# Enable Voice & Video Calls

## Current Status

❌ **Calls DON'T work in Expo Go**  
✅ **Calls WILL work in Development Build**

## Why?

**WebRTC** (required for calls) is a **native module** that doesn't work in Expo Go. You need a **development build**.

## Quick Fix: Create Development Build

### Option 1: Local Build (Fastest)

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

### Option 2: Use Build Script

```bash
cd mobile
./build-native-maps.sh
```

This builds native maps AND enables WebRTC for calls.

## After Building

1. **Don't use Expo Go** - Use your development build app
2. **Start with**: `npx expo start --dev-client`
3. **Open**: Your development build app (not Expo Go)

## What You'll Get

✅ **Voice Calls**: Full audio calling  
✅ **Video Calls**: Video + audio calling  
✅ **Native Performance**: Smooth, low latency  
✅ **WebRTC**: Direct peer-to-peer connection

## Current Behavior in Expo Go

When you try to make a call, you'll see:
- Alert: "WebRTC Not Available"
- Message: "Voice and video calls require a development build"
- Calls are disabled

## Test After Building

1. Open a conversation
2. Tap the phone icon (voice call) or video icon (video call)
3. Calls should work! 🎉

---

**Note**: The same development build that enables native maps also enables WebRTC calls. Build once, get both features!
