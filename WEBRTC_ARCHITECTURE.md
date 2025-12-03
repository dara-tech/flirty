# WebSocket + WebRTC Architecture for Group Calls

## Overview

This document describes the architecture and implementation patterns used in the group call system, following production-grade best practices.

## Key Principles

1. **WebSocket (Socket.IO)** → Signaling only (negotiating connections, sending metadata, events)
2. **WebRTC (RTCPeerConnection)** → Actual media streams (audio/video) peer-to-peer or via SFU
3. **Separation of Concerns**: WebSocket never carries media. WebRTC handles real-time audio/video.

## Architecture Flow

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Client A  │◄──WS───►│  Signaling   │◄──WS───►│   Client B  │
│             │         │   Server     │         │             │
│  WebRTC PC  │         │  (Socket.IO) │         │  WebRTC PC  │
│             │         │              │         │             │
└──────┬──────┘         └──────────────┘         └──────┬──────┘
       │                                                 │
       └──────────────────WebRTC─────────────────────────┘
                    (Media Streams)
```

## Implementation Steps

### Step A: WebSocket Signaling Setup

**Backend (`socket.js`)**:
- Handles room management (`groupcall:join`, `groupcall:leave`)
- Forwards WebRTC signaling (`groupcall:webrtc-offer`, `groupcall:webrtc-answer`, `groupcall:webrtc-ice-candidate`)
- Broadcasts UI state updates (`groupcall:update-tracks`, `groupcall:participant-joined`)

**Frontend (`useWebRTC.js`, `GroupCallWindow.jsx`)**:
- Listens for signaling events
- Sends WebRTC offers/answers via WebSocket
- Updates UI based on signaling events

### Step B: Getting Local Media

```javascript
const localStream = await navigator.mediaDevices.getUserMedia({
  video: true,
  audio: true
});
localVideoEl.srcObject = localStream;
```

### Step C: Creating PeerConnection

```javascript
const pc = new RTCPeerConnection({ 
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }] 
});

// Send local tracks
localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

// Receive remote tracks
pc.ontrack = (event) => {
  const [stream] = event.streams;
  attachVideoToElement(stream, remoteVideoEl);
};

// Handle ICE candidates
pc.onicecandidate = (event) => {
  if (event.candidate) {
    socket.emit('groupcall:webrtc-ice-candidate', {
      roomId,
      candidate: event.candidate,
      targetUserId
    });
  }
};
```

### Step D: Offer/Answer Exchange via WebSocket

**Client sends offer**:
```javascript
const offer = await pc.createOffer();
await pc.setLocalDescription(offer);
socket.emit('groupcall:webrtc-offer', {
  roomId,
  offer,
  targetUserId
});
```

**Client receives answer**:
```javascript
socket.on('groupcall:webrtc-answer', async ({ answer, senderId }) => {
  await pc.setRemoteDescription(answer);
});
```

### Step E: ICE Candidate Exchange

```javascript
socket.on('groupcall:webrtc-ice-candidate', async ({ candidate, senderId }) => {
  await pc.addIceCandidate(candidate);
});
```

### Step F: Mute / Camera Toggle (Real-Time UI Update)

**Mute local mic**:
```javascript
// Step 1: Update WebRTC track (actual media control)
localStream.getAudioTracks()[0].enabled = false;

// Step 2: Send WebSocket signal (UI synchronization)
socket.emit('groupcall:update-tracks', {
  roomId,
  tracks: { audio: false }
});
```

**Toggle camera**:
```javascript
// Step 1: Update WebRTC track (actual media control)
const videoTrack = localStream.getVideoTracks()[0];
videoTrack.enabled = !videoTrack.enabled;

// Step 2: Send WebSocket signal (UI synchronization)
socket.emit('groupcall:update-tracks', {
  roomId,
  tracks: { video: videoTrack.enabled }
});
```

**Peers receive and update UI**:
```javascript
socket.on('groupcall:tracks-updated', ({ userId, tracks }) => {
  // Update UI based on track state
  updateParticipantTracks(userId, tracks);
  // Render based on track.enabled and track.readyState
});
```

### Step G: Leaving the Room

```javascript
// Step 1: Stop WebRTC tracks
localStream.getTracks().forEach(track => track.stop());
pc.close();

// Step 2: Send WebSocket signal
socket.emit('groupcall:leave', { roomId });
```

## WebSocket Events (Signaling Only)

### Room Management
- `groupcall:join` - Join a group call room
- `groupcall:leave` - Leave a group call room
- `groupcall:invitation` - Invitation to join a group call
- `groupcall:participant-joined` - Participant joined notification
- `groupcall:participant-left` - Participant left notification

### WebRTC Signaling
- `groupcall:webrtc-offer` - SDP offer
- `groupcall:webrtc-answer` - SDP answer
- `groupcall:webrtc-ice-candidate` - ICE candidate

### UI State Synchronization
- `groupcall:update-tracks` - Track state update (mute/unmute, camera on/off)
- `groupcall:tracks-updated` - Broadcast track state to all participants

## WebRTC Events (Media Only)

- `pc.ontrack` - Remote track received
- `pc.onicecandidate` - ICE candidate generated
- `track.onended` - Track ended
- `track.onmute` / `track.onunmute` - Track mute state changed

## UI Rendering Best Practices

### Always Render Based on Track State

```javascript
// ✅ Good: Check track state
const hasActiveVideo = videoTracks.some(track => 
  track.enabled && track.readyState === 'live' && !track.muted
);

if (hasActiveVideo) {
  videoElement.srcObject = stream;
} else {
  videoElement.srcObject = null;
  showAvatar();
}

// ❌ Bad: Check button state only
if (isVideoEnabled) {
  videoElement.srcObject = stream; // May show frozen frame
}
```

### Camera State Machine

States: `loading` | `on` | `off` | `error` | `replacing` | `ended`

```javascript
const determineCameraState = (stream) => {
  if (!stream) return 'loading';
  
  const videoTracks = stream.getVideoTracks();
  if (videoTracks.length === 0) return 'error';
  
  const activeTracks = videoTracks.filter(track =>
    track.enabled && track.readyState === 'live' && !track.muted
  );
  
  if (activeTracks.length > 0) return 'on';
  
  const allEnded = videoTracks.every(track => track.readyState === 'ended');
  if (allEnded) return 'ended';
  
  return 'off';
};
```

## Current Implementation: Mesh vs SFU

**Current**: Mesh topology (each participant connects to each other)
- Each client has N-1 peer connections (where N = number of participants)
- Works well for small groups (< 5 participants)
- Bandwidth: O(N²) - each participant uploads once, downloads N-1 times

**Future**: SFU (Selective Forwarding Unit)
- Each client has 1 peer connection to SFU
- SFU forwards tracks to all participants
- Bandwidth: O(N) - each participant uploads once, downloads N times
- Better for large groups (> 5 participants)

## Key Files

- **Backend Signaling**: `backend/src/lib/socket.js`
- **Frontend WebRTC Hook**: `frontend/src/hooks/useWebRTC.js`
- **Group Call Component**: `frontend/src/component/GroupCallWindow.jsx`
- **Call Store**: `frontend/src/store/useCallStore.js`

## Summary

✅ **WebSocket** handles:
- Room management
- WebRTC signaling (offers, answers, ICE candidates)
- UI state synchronization (mute/unmute, camera on/off)

✅ **WebRTC** handles:
- Actual media streams (audio/video)
- Peer-to-peer connections
- Track control (`track.enabled`, `track.stop()`)

✅ **UI** renders based on:
- Track state (`track.enabled`, `track.readyState`, `track.muted`)
- WebSocket state updates (for immediate UI feedback)

This architecture ensures low latency, proper separation of concerns, and scalable group calling.

