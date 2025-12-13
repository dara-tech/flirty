# Debugging Guide for Mobile App

## Quick Debug Methods

### 1. View Device Logs (Real-time)

**See all console.log output from your app:**

```bash
# View logs from your tablet
adb -s HVA5K72A logcat | grep -E "(ReactNativeJS|console|ERROR|WARN)"

# Or view all logs
adb -s HVA5K72A logcat

# Filter by your app package
adb -s HVA5K72A logcat | grep "com.anonymous.mobile"

# Clear logs and start fresh
adb -s HVA5K72A logcat -c && adb -s HVA5K72A logcat
```

### 2. View Specific Logs

**Check logout logs:**
```bash
adb -s HVA5K72A logcat | grep -E "(logout|Logout|Navigation|Auth state)"
```

**Check loading logs:**
```bash
adb -s HVA5K72A logcat | grep -E "(Loading|isMessagesLoading|isUsersLoading|getUsers|getMessages)"
```

**Check navigation logs:**
```bash
adb -s HVA5K72A logcat | grep -E "(Navigating|Navigation|Login|Main)"
```

### 3. React Native Debugger (Chrome DevTools)

**Enable remote debugging:**

1. Shake your device or run:
   ```bash
   adb -s HVA5K72A shell input keyevent 82
   ```

2. Select "Debug" or "Open Developer Menu"

3. Select "Debug with Chrome"

4. Open Chrome and go to: `chrome://inspect`

5. Click "inspect" under your device

**Or use React Native Debugger app:**
- Download: https://github.com/jhen0409/react-native-debugger
- Connect to: `localhost:8081`

### 4. Network Debugging

**Check API requests:**
```bash
# View network traffic
adb -s HVA5K72A logcat | grep -E "(axios|fetch|Network|API)"
```

**Or use a proxy:**
- Install Charles Proxy or Proxyman
- Configure device to use proxy
- View all HTTP/HTTPS requests

### 5. Check App State

**Force stop and restart app:**
```bash
# Force stop
adb -s HVA5K72A shell am force-stop com.anonymous.mobile

# Start app
adb -s HVA5K72A shell am start -n com.anonymous.mobile/.MainActivity

# Clear app data (WARNING: This will delete all app data)
adb -s HVA5K72A shell pm clear com.anonymous.mobile
```

### 6. View App Info

**Check if app is running:**
```bash
adb -s HVA5K72A shell ps | grep mobile
```

**Check app version:**
```bash
adb -s HVA5K72A shell dumpsys package com.anonymous.mobile | grep version
```

**Check app permissions:**
```bash
adb -s HVA5K72A shell dumpsys package com.anonymous.mobile | grep permission
```

### 7. Debug Specific Issues

#### Debug Logout Issue:
```bash
# Watch logout flow
adb -s HVA5K72A logcat -c
adb -s HVA5K72A logcat | grep -E "(logout|Logout|Auth|Navigation|Login screen)"
# Then try logging out in the app
```

#### Debug Loading Loop:
```bash
# Watch loading state
adb -s HVA5K72A logcat | grep -E "(Loading|isMessagesLoading|getUsers|getMessages|timeout)"
```

#### Debug Tab Switching:
```bash
# Watch tab changes
adb -s HVA5K72A logcat | grep -E "(Switching|activeTab|person|group)"
```

### 8. Add Debug Logs to Code

**In your code, add console.log:**

```javascript
// Example: In logout function
logout: async () => {
  console.log('🔄 [DEBUG] Logout called');
  console.log('🔄 [DEBUG] Current authUser:', get().authUser);
  // ... rest of code
  console.log('✅ [DEBUG] Logout completed');
}
```

**Then view logs:**
```bash
adb -s HVA5K72A logcat | grep "DEBUG"
```

### 9. Check Zustand Store State

**Add temporary debug button in Settings:**

```javascript
// In SettingsScreen.js, add a debug button
<TouchableOpacity onPress={() => {
  const authState = useAuthStore.getState();
  const chatState = useChatStore.getState();
  console.log('🔍 [DEBUG] Auth State:', {
    hasAuthUser: !!authState.authUser,
    authUser: authState.authUser,
    isCheckingAuth: authState.isCheckingAuth
  });
  console.log('🔍 [DEBUG] Chat State:', {
    users: chatState.users?.length || 0,
    isUsersLoading: chatState.isUsersLoading,
    messages: chatState.messages?.length || 0,
    isMessagesLoading: chatState.isMessagesLoading
  });
  Alert.alert('Debug Info', `Auth: ${!!authState.authUser}, Users: ${chatState.users?.length || 0}`);
}}>
  <Text>Debug State</Text>
</TouchableOpacity>
```

### 10. Monitor Navigation

**Add navigation listener in App.js:**

```javascript
useEffect(() => {
  const unsubscribe = navigationRef.current?.addListener('state', (e) => {
    console.log('🔄 [DEBUG] Navigation state:', e.data.state);
  });
  return unsubscribe;
}, []);
```

## Quick Debug Commands

**All-in-one debug script:**
```bash
#!/bin/bash
# Save as debug.sh

echo "=== Clearing logs ==="
adb -s HVA5K72A logcat -c

echo "=== Starting log monitoring ==="
echo "Watching for: logout, loading, navigation"
echo "Press Ctrl+C to stop"
echo ""

adb -s HVA5K72A logcat | grep -E "(logout|Logout|Loading|isMessagesLoading|Navigation|Navigating|Login|Auth state|ERROR|WARN)" --color=always
```

**Run it:**
```bash
chmod +x debug.sh
./debug.sh
```

## Common Issues & Debug Steps

### Issue: Logout not working
1. Check if logout function is called:
   ```bash
   adb -s HVA5K72A logcat | grep "logout"
   ```
2. Check if authUser is cleared:
   ```bash
   adb -s HVA5K72A logcat | grep "Auth state cleared"
   ```
3. Check if navigation is triggered:
   ```bash
   adb -s HVA5K72A logcat | grep "Navigating to Login"
   ```

### Issue: Loading loop
1. Check if API calls are completing:
   ```bash
   adb -s HVA5K72A logcat | grep "getUsers\|getMessages"
   ```
2. Check timeout triggers:
   ```bash
   adb -s HVA5K72A logcat | grep "timeout"
   ```
3. Check loading state changes:
   ```bash
   adb -s HVA5K72A logcat | grep "isMessagesLoading\|isUsersLoading"
   ```

### Issue: Tabs not switching
1. Check tab press events:
   ```bash
   adb -s HVA5K72A logcat | grep "Switching"
   ```
2. Check activeTab state:
   ```bash
   adb -s HVA5K72A logcat | grep "activeTab"
   ```

## Tips

1. **Always clear logs first:** `adb logcat -c`
2. **Use grep to filter:** Focus on what you need
3. **Add timestamps:** `adb logcat -v time`
4. **Save logs to file:** `adb logcat > debug.log`
5. **Use colors:** `adb logcat | grep --color=always "ERROR"`

## Next Steps

1. Run the debug command for your specific issue
2. Try the action (logout, switch tab, etc.)
3. Watch the logs to see what's happening
4. Share the relevant log output if you need help
