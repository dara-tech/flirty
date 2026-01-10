# Testing Push Notifications on Mac

## Why notifications might not appear

Push notifications are **designed to work when the app is closed or in the background**. If your browser tab is open and active, notifications are usually suppressed.

## How to test properly

### Method 1: Close the app completely
1. **Close the browser tab completely** (not just minimize)
2. **Or close the entire browser window**
3. Have another user send you a message
4. You should see a notification popup

### Method 2: Minimize the browser
1. **Minimize the browser window** (Cmd+M)
2. **Or switch to another app** (Cmd+Tab)
3. Have another user send you a message
4. You should see a notification popup

### Method 3: Check Mac notification settings
1. Open **System Settings** (or System Preferences)
2. Go to **Notifications**
3. Find your browser (Chrome, Safari, Edge, etc.)
4. Make sure:
   - ✅ Notifications are **enabled**
   - ✅ **Allow Notifications** is checked
   - ✅ **Banner** or **Alert** style is selected (not None)

### Method 4: Check browser notification settings
1. Open your browser
2. Click the **lock/info icon** (🔒 or ℹ️) in the address bar
3. Find **Notifications**
4. Make sure it's set to **Allow**

## Debugging steps

### 1. Check service worker is registered
- Open DevTools (F12 or Cmd+Option+I)
- Go to **Application** tab → **Service Workers**
- Verify `/sw.js` is registered and **activated**
- Status should be "activated and is running"

### 2. Check console logs
- Open DevTools → **Console** tab
- Look for logs starting with:
  - `🔔 Push event received!`
  - `📦 Parsed notification payload:`
  - `✅ Notification displayed successfully!`

### 3. Test with browser console
Open browser console and run:
```javascript
// Check if service worker is registered
navigator.serviceWorker.getRegistration('/').then(reg => {
  console.log('Service Worker:', reg);
  if (reg) {
    reg.pushManager.getSubscription().then(sub => {
      console.log('Push Subscription:', sub);
    });
  }
});

// Check notification permission
console.log('Notification permission:', Notification.permission);
```

### 4. Check backend logs
Look for these logs in your backend terminal:
```
info: Sending push notification to user ...
info: Push notification sent to user ... on device ...
info: Push notification sent
```

## Common issues

### Issue 1: Notifications blocked
**Solution:** Enable notifications in browser and Mac settings (see above)

### Issue 2: App is still open
**Solution:** Close the browser tab/window completely, or minimize it

### Issue 3: Service worker not registered
**Solution:** 
- Hard refresh (Cmd+Shift+R)
- Unregister service worker in DevTools → Application → Service Workers
- Refresh page to re-register

### Issue 4: No subscription
**Solution:**
- Log out and log back in
- Check browser console for subscription errors
- Verify VAPID keys are in backend `.env`

### Issue 5: Mac Do Not Disturb
**Solution:**
- Check if Mac's **Do Not Disturb** is enabled
- Disable it in System Settings → Focus

## Expected behavior

✅ **When app is CLOSED:**
- Push notification appears
- Shows sender name, message, profile picture
- Has Reply and Mark as read buttons

❌ **When app is OPEN and ACTIVE:**
- Push notification is suppressed (by design)
- Message appears in chat instead

✅ **When app is OPEN but MINIMIZED:**
- Push notification appears
- Shows in notification center

## Test it now

1. **Close this browser tab completely**
2. Have another user send you a message
3. You should see a notification popup on your Mac!

If you still don't see notifications after closing the app, check:
- Mac notification settings
- Browser notification permissions
- Service worker console logs
- Backend logs for errors
