# Debugging the Loading Issue

Complete guide for debugging the conversation loading problem in both debug and production builds.

---

## Quick Debug Methods

### Method 1: React Native Debugger (Best for Debug Mode)

1. **Install React Native Debugger:**
   ```bash
   # macOS
   brew install --cask react-native-debugger
   
   # Or download from: https://github.com/jhen0409/react-native-debugger/releases
   ```

2. **Start Debug Mode:**
   ```bash
   cd mobile
   npx expo start --dev-client
   ```

3. **Open Debugger:**
   - Shake device or press `Cmd+D` (iOS) / `Cmd+M` (Android)
   - Select "Debug" or "Open Debugger"
   - React Native Debugger will open automatically

4. **View Console Logs:**
   - All `console.log`, `console.error`, `console.warn` will appear
   - Filter by "Loading" or "getMessages" to find relevant logs

---

### Method 2: ADB Logcat (For Production APK)

**View logs from production APK on Android:**

```bash
# Connect device via USB
adb devices

# View all logs
adb logcat

# Filter for React Native logs only
adb logcat | grep -i "ReactNativeJS"

# Filter for specific tags
adb logcat | grep -E "(getMessages|Loading|ConversationScreen|useChatStore)"

# Save logs to file
adb logcat > debug_logs.txt
```

**Key things to look for:**
- `⚠️ Loading timeout` - Safety timeout triggered
- `Error loading messages:` - Network/API errors
- `⚠️ Network timeout or connection issue` - Network problems
- `✅ Loaded X messages` - Success messages

---

### Method 3: Metro Bundler Console (Debug Mode)

When running `npx expo start --dev-client`, logs appear in terminal:

```bash
cd mobile
npx expo start --dev-client
```

**Watch for:**
- Network request logs
- Error messages
- Loading state changes

---

### Method 4: Add Debug Logging (Temporary)

Add temporary debug logs to track the issue:

**In `mobile/src/store/useChatStore.js`:**

```javascript
getMessages: async (userId) => {
  console.log('🔵 [DEBUG] getMessages called with userId:', userId);
  console.log('🔵 [DEBUG] Current loading state:', get().isMessagesLoading);
  
  // ... existing code ...
  
  set({ isMessagesLoading: true, messages: [] });
  console.log('🔵 [DEBUG] Set loading to true');
  
  const safetyTimeout = setTimeout(() => {
    console.log('🔵 [DEBUG] Safety timeout triggered');
    // ... rest of code
  }, 12000);
  
  try {
    console.log('🔵 [DEBUG] Making API request to /messages/' + userId);
    const res = await axiosInstance.get(`/messages/${userId}`);
    console.log('🔵 [DEBUG] API response received:', res.status);
    // ... rest of code
  } catch (error) {
    console.log('🔵 [DEBUG] API error caught:', error.message, error.code);
    // ... rest of code
  }
}
```

**In `mobile/src/screens/ConversationScreen.js`:**

```javascript
useEffect(() => {
  console.log('🟢 [DEBUG] ConversationScreen useEffect triggered');
  console.log('🟢 [DEBUG] userId:', userId, 'groupId:', groupId);
  console.log('🟢 [DEBUG] isMessagesLoading:', isMessagesLoading);
  
  // ... existing code ...
}, [userId, groupId, isGroup]);
```

---

## Debugging Production APK

### Step 1: Enable Remote Debugging

1. **Connect device via USB**
2. **Enable USB Debugging** on device
3. **Run:**
   ```bash
   adb devices
   ```
   Should show your device

### Step 2: View Logs in Real-Time

```bash
# Filter for React Native logs
adb logcat | grep -i "ReactNativeJS"

# Or view all logs and search manually
adb logcat > logs.txt
# Then search for: getMessages, Loading, ConversationScreen
```

### Step 3: Check Network Requests

**Option A: Use Flipper (Recommended)**

1. **Install Flipper:**
   ```bash
   brew install --cask flipper
   ```

2. **Enable Network Plugin in Flipper**

3. **View all network requests** from the app

**Option B: Use Charles Proxy or Proxyman**

- Intercept network traffic
- See actual API requests/responses
- Check if requests are being made

---

## Common Debug Scenarios

### Scenario 1: Loading Stuck Forever

**Check:**
1. Are safety timeouts being triggered?
   - Look for: `⚠️ getMessages safety timeout`
   - Look for: `⚠️ Loading timeout - clearing loading state`

2. Is the API request being made?
   - Check network logs
   - Check if axios timeout is working

3. Is error being caught?
   - Look for: `Error loading messages:`
   - Check error type (timeout, network, etc.)

**Debug Steps:**
```bash
# Add this to getMessages function
console.log('🔴 [DEBUG] Safety timeout set for 12 seconds');
console.log('🔴 [DEBUG] Making request at:', new Date().toISOString());

# In catch block
console.log('🔴 [DEBUG] Error caught at:', new Date().toISOString());
console.log('🔴 [DEBUG] Error details:', JSON.stringify(error, null, 2));
```

### Scenario 2: Loading Clears Too Fast

**Check:**
1. Is API request succeeding?
   - Look for: `✅ Loaded X messages`
   - Check response data

2. Is loading state being set correctly?
   - Check: `isMessagesLoading` state changes

**Debug Steps:**
```javascript
// Add to getMessages success
console.log('🟢 [DEBUG] Messages loaded:', messagesData.length);
console.log('🟢 [DEBUG] Setting loading to false');
```

### Scenario 3: Network Errors Not Caught

**Check:**
1. Is error object structure correct?
   - Log full error object
   - Check error.code, error.message

2. Are error detection conditions working?
   - Test with airplane mode
   - Test with backend offline

**Debug Steps:**
```javascript
// Add comprehensive error logging
catch (error) {
  console.log('🔴 [DEBUG] Full error object:', {
    code: error.code,
    message: error.message,
    name: error.name,
    response: error.response?.status,
    request: !!error.request,
    stack: error.stack
  });
  
  console.log('🔴 [DEBUG] isTimeout:', isTimeout);
  console.log('🔴 [DEBUG] isNetworkError:', isNetworkError);
  console.log('🔴 [DEBUG] isConnectionError:', isConnectionError);
}
```

---

## Debugging Tools

### 1. React Native Debugger
- **Best for:** Debug mode development
- **Features:** Console, Network, Redux DevTools
- **Install:** `brew install --cask react-native-debugger`

### 2. Flipper
- **Best for:** Production debugging
- **Features:** Network, Logs, Layout Inspector
- **Install:** `brew install --cask flipper`

### 3. ADB Logcat
- **Best for:** Android production APK
- **Features:** System logs, React Native logs
- **Usage:** `adb logcat | grep ReactNativeJS`

### 4. Chrome DevTools
- **Best for:** JavaScript debugging
- **Features:** Breakpoints, Console, Network
- **Access:** Shake device → "Debug" → Opens Chrome

---

## Quick Debug Checklist

When debugging the loading issue:

- [ ] Check if `getMessages` is being called
- [ ] Check if `isMessagesLoading` is set to `true`
- [ ] Check if API request is made (network logs)
- [ ] Check if API request succeeds or fails
- [ ] Check if error is caught in catch block
- [ ] Check if safety timeout is triggered
- [ ] Check if loading state is cleared
- [ ] Check network connectivity
- [ ] Check backend URL is correct
- [ ] Check axios timeout configuration

---

## Testing Different Scenarios

### Test 1: Normal Network
```bash
# Should load messages normally
# Check logs for: ✅ Loaded X messages
```

### Test 2: Slow Network
```bash
# Enable network throttling in dev tools
# Should trigger timeout after 10-12 seconds
# Check logs for: ⚠️ Network timeout
```

### Test 3: No Network
```bash
# Enable airplane mode
# Should clear loading within 8-12 seconds
# Check logs for: ⚠️ Network timeout or connection issue
```

### Test 4: Backend Offline
```bash
# Stop backend server
# Should clear loading and show error
# Check logs for: Error loading messages: ECONNREFUSED
```

---

## Production APK Debugging Tips

1. **Add persistent logging:**
   - Logs to file on device
   - Retrieve with `adb pull`

2. **Use remote logging service:**
   - Sentry, LogRocket, etc.
   - See logs from production users

3. **Add debug menu:**
   - Shake device → Show debug info
   - Display current state, network status

4. **Test with different network conditions:**
   - WiFi, 4G, 5G
   - Slow/fast connections
   - Intermittent connectivity

---

## Quick Commands Reference

```bash
# View React Native logs
adb logcat | grep ReactNativeJS

# View all logs and save
adb logcat > debug_logs.txt

# Clear logcat buffer
adb logcat -c

# View specific app logs
adb logcat | grep "com.yourapp"

# Start debug mode
cd mobile && npx expo start --dev-client

# Build production APK with debug symbols
cd mobile && npx expo run:android --variant release
```

---

## Next Steps

1. **Add debug logging** to track the issue
2. **Test in different scenarios** (normal, slow, no network)
3. **Check logs** for error patterns
4. **Verify fix** is working in production APK
5. **Remove debug logs** once issue is resolved

