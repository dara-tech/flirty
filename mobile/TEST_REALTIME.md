# Real-Time Functionality Testing Guide

## Quick Test Commands

### Monitor logs in real-time:
```bash
adb logcat | grep -E "ReactNativeJS|Socket|message|reaction|typing"
```

### Filter for real-time events only:
```bash
adb logcat | grep -E "📨|📝|🗑️|👁️|👍|👎|✅.*socket|✅.*Global message"
```

## Test Scenarios

### 1. Real-Time Messages ✅
**Test:** Send a message from web/another device
**Expected:** Message appears instantly in mobile app
**Log:** `📨 New message received: {...}`

### 2. Message Edits ✅
**Test:** Edit a message from web/another device
**Expected:** Message text updates instantly
**Log:** `📝 Message edited: {...}`

### 3. Message Deletions ✅
**Test:** Delete a message from web/another device
**Expected:** Message disappears instantly
**Log:** `🗑️ Message deleted: {messageId}`

### 4. Read Receipts ✅
**Test:** View a message from web/another device
**Expected:** "Seen" status appears instantly
**Log:** `👁️ Message seen update: {messageId, seenAt}`

### 5. Reactions ✅
**Test:** Add/remove reaction from web/another device
**Expected:** Reaction appears/disappears instantly
**Log:** `👍 Reaction added` or `👎 Reaction removed`

### 6. Typing Indicators ✅
**Test:** Type in conversation from web/another device
**Expected:** "User is typing..." appears

### 7. Online Status ✅
**Test:** User goes online/offline
**Expected:** Status updates in real-time

## Verification Checklist

- [ ] Socket connects: `✅ Socket connected successfully`
- [ ] Global subscription enabled: `✅ Global message subscription enabled`
- [ ] Socket listeners set up: `✅ Setting up socket listeners for real-time messages`
- [ ] New messages appear instantly
- [ ] Edits update instantly
- [ ] Deletions remove instantly
- [ ] Read receipts work
- [ ] Reactions work
- [ ] Typing indicators work

## Troubleshooting

**If real-time not working:**
1. Check socket connection logs
2. Verify backend is running
3. Check network connectivity
4. Ensure both devices are on same network (or using production URL)
5. Check for socket connection errors in logs
