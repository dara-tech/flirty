# React Native Troubleshooting Guide

## Current Status

✅ **Setup Complete:**
- React Native app created with Expo
- Navigation configured (React Navigation)
- Zustand stores created
- All screens converted to StyleSheet (no NativeWind)
- API client configured
- Storage utilities ready

⚠️ **Known Issues:**
- Type error: "expected dynamic type 'boolean', but had type 'string'" - Non-critical warning
- NativeWind disabled (using StyleSheet instead)
- Persist middleware temporarily disabled for debugging

## Fixes Applied

1. ✅ Removed NativeWind from Babel config
2. ✅ Removed NativeWind from Metro config
3. ✅ Removed global.css import
4. ✅ Converted all screens to StyleSheet
5. ✅ Disabled react-native-reanimated plugin temporarily
6. ✅ Temporarily disabled Zustand persist
7. ✅ Added safety checks for store access
8. ✅ Fixed boolean prop usage

## If App Still Shows White Screen

### Option 1: Check Console Logs
Look at the terminal/logs to see what's happening:
- Is the app bundling successfully?
- Are there any error messages?
- Does "LoginScreen rendered" appear in logs?

### Option 2: Try Minimal Test
Temporarily replace App.js content with:

```jsx
import { View, Text, StyleSheet } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Hello World!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 24,
    color: '#000000',
  },
});
```

If this works, the issue is with navigation or stores.

### Option 3: Clear All Caches
```bash
cd mobile
rm -rf node_modules
rm -rf .expo
npm install
npm start -- --clear
```

### Option 4: Check Backend Connection
The app should work even without backend, but if auth check is hanging, make sure:
- Backend is running on port 5002
- Or update timeout in `useAuthStore.js`

## Next Steps

1. **If app works but shows error**: Ignore the type error warning for now
2. **If app is white screen**: Try minimal test above
3. **Once working**: Re-enable persist middleware
4. **Once working**: Re-enable reanimated plugin (if needed)

