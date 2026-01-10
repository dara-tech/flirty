# Push Notification Debugging Guide

## Issue: No notifications when app is closed

### Changes Made

1. **Backend now sends push notifications even when user is online**
   - Previously, push notifications were only sent when the user was offline (no socket connection)
   - Now, push notifications are sent regardless of online status
   - The frontend will suppress duplicate notifications if the user is viewing the chat

2. **Better logging added**
   - More detailed logs in `pushNotification.service.js`
   - Logs show subscription count, success/failure, and whether user is online

### Testing Steps

1. **Verify subscription exists:**
   ```bash
   # Check backend logs when you log in - should see:
   # "Created push subscription for user ..."
   ```

2. **Check your subscriptions:**
   - Open browser DevTools → Application → Service Workers
   - Verify service worker is registered and active
   - Check: `navigator.serviceWorker.ready` in console

3. **Test push notification manually:**
   - After logging in, open browser console
   - Run: `fetch('/api/push/test', { method: 'POST', headers: { 'Authorization': 'Bearer YOUR_TOKEN' } })`
   - Or use the API endpoint: `POST /api/push/test`

4. **Test with app closed:**
   - Close the browser tab completely (not just minimize)
   - Have another user send you a message
   - You should receive a push notification

5. **Check service worker:**
   - Open DevTools → Application → Service Workers
   - Click "Unregister" then refresh page to re-register
   - Check console for service worker registration logs

### Common Issues

1. **No subscription in database:**
   - Check backend logs for subscription creation
   - Verify VAPID keys are in `.env` file
   - Check browser console for subscription errors

2. **Service worker not registered:**
   - Verify `/sw.js` exists in `frontend/public/`
   - Check browser console for service worker errors
   - Try unregistering and re-registering the service worker

3. **Notifications blocked:**
   - Check browser notification permissions
   - Enable notifications in browser settings (see NOTIFICATION_PERMISSION_GUIDE.md)
   - Some browsers block notifications in private/incognito mode

4. **VAPID keys not configured:**
   - Check `backend/.env` has:
     - `VAPID_PUBLIC_KEY=...`
     - `VAPID_PRIVATE_KEY=...`
     - `VAPID_SUBJECT=mailto:your-email@example.com`

### Debug Commands

**Check if subscription exists:**
```javascript
// In browser console:
navigator.serviceWorker.ready.then(reg => {
  reg.pushManager.getSubscription().then(sub => {
    console.log('Subscription:', sub);
  });
});
```

**Manually trigger test notification:**
```bash
# Using curl (replace YOUR_TOKEN with actual token):
curl -X POST http://localhost:5000/api/push/test \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Check backend logs:**
- Look for: "Sending push notification to user..."
- Look for: "Push notification sent" or "No active push subscriptions found"

### Expected Behavior

1. **When app is open and viewing chat:**
   - Message appears in chat (no notification needed)

2. **When app is open but NOT viewing the specific chat:**
   - Browser notification appears (handled by frontend)
   - Push notification also sent (but frontend suppresses duplicate)

3. **When app is closed:**
   - Push notification sent to service worker
   - Service worker displays notification
   - Clicking notification opens the app

### Next Steps

If notifications still don't work:

1. Check backend logs for errors
2. Verify subscription is in database
3. Test with manual push notification endpoint
4. Check service worker is receiving push events
5. Verify browser notification permissions


