# WebRTC Call Debugging Guide

## The Error You're Seeing
```
InvalidAccessError: Failed to set local offer sdp: The order of m-lines in subsequent offer doesn't match order from previous offer/answer.
Peer connection state: {signalingState: "have-local-offer", localDescription: "offer", ...}
```

## What This Means
The peer connection **already has an offer** when we try to create/set a new one. This should be caught by our checks, but it's not.

## Debugging Steps

### 1. Check Console Logs
Look for these messages to see what's happening:
- `🔄 Creating fresh peer connection...` - Should appear when call is answered
- `✨ Creating new peer connection...` - Fresh peer connection created
- `📞 All checks passed - creating new offer...` - This means checks passed
- `❌❌❌ CRITICAL BLOCK` - Offer detected, should block creation
- `✅ Offer already exists` - Should return existing offer

### 2. Check the Flow
The error happens "when receiver answers". The flow should be:
1. Receiver clicks Answer
2. `handleCallAnswered` runs on caller
3. Fresh peer connection is created
4. Offer should be created (or existing one reused)

### 3. What to Look For
- Does the log show "Creating fresh peer connection"?
- Does it show "All checks passed"?
- Does it show any "❌❌❌ CRITICAL BLOCK" messages?
- What is the peer connection state right before `createOffer()` is called?

## Possible Causes

1. **Peer connection from previous call not cleaned up**
   - Solution: Always reset when starting new call

2. **Offer created during initialization**
   - Solution: Don't create offer until call is answered

3. **Race condition**
   - Solution: Multiple checks and flags

4. **Peer connection shared between calls**
   - Solution: Create fresh peer connection each time

## Current Fixes Applied

✅ Multiple checkpoints before creating offer
✅ Fresh peer connection created when call answered
✅ Checks at every step
✅ Detailed logging

If error still occurs, check the console logs to see which checkpoint is being bypassed.
