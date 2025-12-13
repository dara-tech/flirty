# Web to Mobile Connection Guide

## Current Configuration

### Web App (Frontend)
- **Development**: `http://localhost:5002` (socket.io)
- **HTTP API**: `/api` (proxied to `localhost:5002/api`)

### Mobile App
- **Development**: `http://192.168.0.116:5002` (physical device) or `http://10.0.2.2:5002` (emulator)
- **Production**: `https://flirty-aspk.onrender.com`

## Connection Issues

### 1. Backend URL Mismatch
Both apps need to connect to the **same backend** for real-time communication to work.

### 2. WebRTC Limitations
- **Mobile (Expo Go)**: WebRTC **doesn't work** - requires development build
- **Mobile (Development Build)**: WebRTC works ✅
- **Web**: WebRTC works ✅

## Solutions

### Option 1: Both Use Local Backend (Development)

**For Web App:**
1. Ensure backend is running on `localhost:5002`
2. Web app connects via `http://localhost:5002` ✅

**For Mobile App:**
1. Ensure backend is running on `localhost:5002`
2. Mobile connects via `http://192.168.0.116:5002` (your computer's IP)
3. Make sure your computer's firewall allows connections on port 5002

**Check your local IP:**
```bash
# macOS/Linux
ifconfig | grep "inet " | grep -v 127.0.0.1

# Windows
ipconfig
```

Update `mobile/.env`:
```
EXPO_PUBLIC_LOCAL_IP=YOUR_LOCAL_IP  # e.g., 192.168.0.116
EXPO_PUBLIC_DEVICE_TYPE=device
```

### Option 2: Both Use Production Backend

**For Web App:**
Set `VITE_API_URL=https://flirty-aspk.onrender.com/api` in `frontend/.env`

**For Mobile App:**
Set `EXPO_PUBLIC_API_URL=https://flirty-aspk.onrender.com` in `mobile/.env`

### Option 3: Use Production Backend for Both (Recommended for Testing)

This ensures both apps connect to the same backend regardless of network:

**Frontend `.env`:**
```env
VITE_API_URL=https://flirty-aspk.onrender.com/api
```

**Mobile `.env`:**
```env
EXPO_PUBLIC_API_URL=https://flirty-aspk.onrender.com
EXPO_PUBLIC_DEVICE_TYPE=device
```

## Testing Connection

### 1. Check Backend is Running
```bash
# Check if backend is running
curl http://localhost:5002/api/health
# or
curl http://192.168.0.116:5002/api/health
```

### 2. Check Socket.IO Connection
- **Web**: Open browser console, look for "Socket connected"
- **Mobile**: Check logs for "Socket connected successfully"

### 3. Test Real-time Features
- Send a message from web → should appear on mobile
- Send a message from mobile → should appear on web
- Typing indicators should work both ways

## WebRTC (Voice/Video Calls)

### Current Status
- ✅ **Web**: WebRTC works
- ❌ **Mobile (Expo Go)**: WebRTC **doesn't work** - shows warning
- ✅ **Mobile (Development Build)**: WebRTC works

### To Enable WebRTC on Mobile

**Option A: Create Development Build**
```bash
cd mobile
npx expo prebuild
npx expo run:android  # or run:ios
npx expo start --dev-client
```

**Option B: Use EAS Build**
```bash
cd mobile
eas build --profile development --platform android
```

### WebRTC Connection Flow
1. **Call Initiation**: Socket.io event `call:initiate`
2. **WebRTC Signaling**: Socket.io events `webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate`
3. **Direct P2P**: After signaling, WebRTC connects peer-to-peer

## Troubleshooting

### Issue: Web can't see mobile messages
**Solution**: Ensure both connect to same backend URL

### Issue: Socket not connecting
**Check**:
1. Backend is running
2. Correct port (5002)
3. Firewall allows connections
4. CORS is configured in backend

### Issue: WebRTC not working on mobile
**Solution**: Create development build (Expo Go doesn't support WebRTC)

### Issue: Mobile can't reach backend
**Check**:
1. Computer and mobile are on same WiFi network
2. Local IP is correct (`192.168.x.x`)
3. Backend is listening on `0.0.0.0` not just `localhost`

## Backend Configuration Check

Ensure backend `socket.js` allows connections from:
- `http://localhost:5002` (web)
- `http://192.168.0.116:5002` (mobile - your IP)
- `https://flirty-aspk.onrender.com` (production)

Check CORS configuration in backend.
