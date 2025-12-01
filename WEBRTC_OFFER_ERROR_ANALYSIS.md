# WebRTC Offer Creation Error Analysis

## Error Message
```
InvalidAccessError: Failed to set local offer sdp: The order of m-lines in subsequent offer doesn't match order from previous offer/answer.
```

## Root Cause
The error occurs when:
1. A peer connection already has a local description (offer) set
2. Tracks have been added to the peer connection in a specific order
3. We try to create and set a NEW offer on the same peer connection
4. The new offer has tracks in a different order than the existing one
5. WebRTC rejects it because it violates the SDP negotiation rules

## Why It Happens
- Peer connection is reused from a previous call attempt
- Peer connection state is "have-local-offer" when we try to create a new offer
- Tracks are added multiple times or in different order
- Event handler fires multiple times, creating duplicate offers

## The Fix
1. **Always check signaling state before creating offer**
   - Must be in "stable" state
   - Cannot be in "have-local-offer" or "have-remote-offer"

2. **Reset peer connection if it has ANY description**
   - If `localDescription` exists → Reset
   - If `signalingState !== 'stable'` → Reset
   - Cannot reuse a peer connection with existing state

3. **Complete cleanup before creating new offer**
   - Close existing peer connection
   - Stop all media tracks
   - Create fresh peer connection
   - Add tracks in consistent order

4. **Multiple safety checks**
   - Check before attempting to create
   - Check again right before calling createOffer()
   - Double-check after creating (before setting)

## Solution Implementation
- Detect if peer connection has local description
- If yes → Reset completely (close, cleanup, recreate)
- If no → Ensure it's in "stable" state before creating offer
- Add multiple validation checkpoints
- Handle race conditions with flags

## Key Lesson
**NEVER try to create a new offer on a peer connection that already has one. Always reset or reuse the existing one.**
