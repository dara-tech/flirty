# Testing Guide - Verify Everything Works

## 🔒 Security Testing (First Priority)

### 1. Verify Secrets Are Not Tracked

```bash
# Check that app.json is not tracked
git ls-files | grep app.json
# Should show nothing (or only app.json.example)

# Check that .env files are not tracked
git ls-files | grep "\.env$"
# Should only show .env.example files, not actual .env files

# Verify no API keys in tracked files
git ls-files | xargs grep -l "AIzaSy" 2>/dev/null
# Should show nothing (or only documentation with placeholders)
```

### 2. Verify .gitignore Works

```bash
# Check git status - app.json and .env should not appear
git status

# Check ignored files
git status --ignored | grep -E "\.env|app\.json"
# Should show .env and app.json as ignored
```

### 3. Verify Local Setup

```bash
# Check that app.json exists locally with your API key
cat mobile/app.json | grep "googleMapsApiKey"
# Should show YOUR actual API key (not placeholder)

# Check that .env files exist locally
ls backend/.env frontend/.env 2>/dev/null
# Should exist (but not tracked in git)
```

---

## 📱 Mobile App Testing

### 1. Build and Install

```bash
cd mobile

# Clean previous build
rm -rf android ios

# Regenerate native projects
npx expo prebuild --clean

# Build APK
cd android
./gradlew clean assembleDebug
cd ..

# Install on device
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### 2. Test Authentication

1. **Open the app**
2. **Login/Signup**
   - ✅ Should login successfully
   - ✅ Should show user profile
   - ✅ Check logs for: `✅ Socket connected successfully`

### 3. Test Real-Time Features

#### A. Online Status
1. **Open web app in browser** (different device/user)
2. **Login to web app**
3. **Check mobile app ChatScreen**
   - ✅ Should see green indicator on web user's avatar
   - ✅ Check mobile logs: `👥 Online users updated: X users`
   - ✅ Check backend logs: `📢 Broadcasting online users to all clients`

#### B. Real-Time Messages
1. **Open conversation on mobile**
2. **Send message from web**
   - ✅ Mobile should receive message in real-time
   - ✅ Check mobile logs: `📨 New message received (global)`
   - ✅ Message should appear in conversation view
   - ✅ Chat list should update with last message

3. **Send message from mobile**
   - ✅ Web should receive message in real-time
   - ✅ Message should appear in web chat

4. **Mobile to Mobile**
   - ✅ Open conversation on two mobile devices
   - ✅ Send message from device 1
   - ✅ Device 2 should receive in real-time

#### C. Map Functionality
1. **Open Map tab on mobile**
   - ✅ Should load without crashing
   - ✅ Should show your location
   - ✅ Should show other users' locations (if sharing)

2. **Share location from web**
   - ✅ Mobile map should show web user's location
   - ✅ Should show user's profile picture

3. **Share location from mobile**
   - ✅ Web map should show mobile user's location

---

## 🌐 Web App Testing

### 1. Start Development Servers

```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev

# Terminal 3: Mobile (if testing)
cd mobile
npx expo start --dev-client
```

### 2. Test Authentication

1. **Open browser** to frontend URL (usually http://localhost:5173)
2. **Login/Signup**
   - ✅ Should login successfully
   - ✅ Should redirect to chat page
   - ✅ Check browser console: `Socket connected: {socket-id}`

### 3. Test Real-Time Features

#### A. Online Status
1. **Open mobile app** (different device/user)
2. **Login to mobile**
3. **Check web chat list**
   - ✅ Should see green indicator on mobile user's avatar
   - ✅ Check browser console for online users updates

#### B. Real-Time Messages
1. **Open conversation on web**
2. **Send message from mobile**
   - ✅ Web should receive message in real-time
   - ✅ Message should appear in conversation view
   - ✅ Chat list should update

3. **Send message from web**
   - ✅ Mobile should receive message in real-time
   - ✅ Message should appear in mobile conversation

#### C. Map Functionality
1. **Open Map page on web**
   - ✅ Should load map
   - ✅ Should show your location
   - ✅ Should show other users' locations

2. **Share location from mobile**
   - ✅ Web map should show mobile user's location
   - ✅ Should show user's profile picture

---

## 🔍 Debugging Commands

### Mobile Logs

```bash
# Watch all logs
adb logcat

# Filter for specific events
adb logcat | grep -E "Socket|Online|Message|Map"

# Watch for errors
adb logcat | grep -E "Error|Exception|Fatal"
```

### Backend Logs

```bash
# Watch backend logs
cd backend
npm run dev

# Look for:
# - "Socket {id} mapped to user {userId}"
# - "📢 Broadcasting online users to all clients"
# - "📤 Emitting newMessage to receiver socket"
```

### Web Browser Console

Open browser DevTools (F12) and check:
- Console tab for socket events
- Network tab for API calls
- No 401/403 errors (except expected auth errors)

---

## ✅ Test Checklist

### Security
- [ ] `app.json` is not tracked in git
- [ ] `.env` files are not tracked in git
- [ ] No API keys in tracked files
- [ ] `.gitignore` properly excludes secrets

### Mobile App
- [ ] App builds successfully
- [ ] App installs and runs
- [ ] Login/Signup works
- [ ] Socket connects (check logs)
- [ ] Online status shows correctly
- [ ] Messages send and receive in real-time
- [ ] Map loads without crashing
- [ ] Location sharing works

### Web App
- [ ] App loads in browser
- [ ] Login/Signup works
- [ ] Socket connects (check console)
- [ ] Online status shows correctly
- [ ] Messages send and receive in real-time
- [ ] Map loads and shows locations

### Real-Time Features
- [ ] Web → Mobile: Messages received in real-time
- [ ] Mobile → Web: Messages received in real-time
- [ ] Mobile → Mobile: Messages received in real-time
- [ ] Online status updates in real-time
- [ ] Location updates in real-time

---

## 🐛 Common Issues & Fixes

### Issue: "API key not found" on mobile map
**Fix:** 
- Verify `mobile/app.json` has your actual API key (not placeholder)
- Rebuild APK: `cd mobile/android && ./gradlew clean assembleDebug`

### Issue: Socket not connecting
**Fix:**
- Check backend is running
- Check backend URL in mobile `src/lib/api.js`
- Check network connection
- Check logs for connection errors

### Issue: Messages not received in real-time
**Fix:**
- Check socket is connected (logs should show "Socket connected")
- Check backend logs for message emission
- Check mobile logs for message reception
- Verify `selectedUser` is set in ConversationScreen

### Issue: Online status not showing
**Fix:**
- Check backend logs: `📢 Broadcasting online users`
- Check mobile logs: `👥 Online users updated`
- Verify user IDs match (both as strings)
- Check socket connection status

---

## 📊 Performance Testing

### Load Test
1. **Open multiple conversations**
2. **Send multiple messages quickly**
3. **Verify all messages are received**
4. **Check for memory leaks (watch device memory)**

### Network Test
1. **Test on slow network** (throttle in DevTools)
2. **Test offline/online transitions**
3. **Verify reconnection works**

---

## 🎯 Quick Test Script

```bash
#!/bin/bash
# Quick test script

echo "🔒 Security Check..."
git ls-files | grep -E "app\.json|\.env$" | grep -v example && echo "❌ Secrets found in git!" || echo "✅ No secrets in git"

echo ""
echo "📱 Mobile Build Test..."
cd mobile
npx expo prebuild --clean > /dev/null 2>&1
cd android && ./gradlew assembleDebug > /dev/null 2>&1 && echo "✅ Build successful" || echo "❌ Build failed"
cd ../..

echo ""
echo "🌐 Backend Test..."
cd backend
npm run dev > /dev/null 2>&1 &
BACKEND_PID=$!
sleep 3
curl -s http://localhost:5002/api/health > /dev/null && echo "✅ Backend running" || echo "❌ Backend not responding"
kill $BACKEND_PID 2>/dev/null
cd ..

echo ""
echo "✅ Basic tests complete!"
```

Save as `test.sh`, make executable: `chmod +x test.sh`, run: `./test.sh`

