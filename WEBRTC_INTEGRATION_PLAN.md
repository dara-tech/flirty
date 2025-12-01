# WebRTC Integration Plan - Voice & Video Calling

## Overview
This document outlines a comprehensive plan to integrate WebRTC for voice and video calling functionality into the existing chat application.

## Architecture Overview

### Current Stack
- **Frontend**: React, Zustand, Socket.IO Client, TailwindCSS/DaisyUI
- **Backend**: Express.js, Socket.IO, MongoDB, Mongoose
- **Real-time**: Socket.IO for messaging, typing indicators, online status

### WebRTC Integration Stack
- **Signaling**: Socket.IO (existing)
- **WebRTC API**: Native browser APIs (RTCPeerConnection, getUserMedia)
- **Media Handling**: MediaStream API
- **STUN/TURN**: Free STUN servers (public), TURN server (optional for production)

---

## Phase 1: Foundation Setup

### 1.1 Dependencies Installation

**Frontend (`frontend/package.json`):**
- ✅ No additional packages needed (using native WebRTC APIs)
- Optional: `simple-peer` (simplified WebRTC wrapper) - NOT needed, using native APIs

**Backend (`backend/package.json`):**
- ✅ Socket.IO already installed
- No additional packages needed

### 1.2 Project Structure

```
frontend/src/
├── store/
│   ├── useAuthStore.js (existing)
│   ├── useChatStore.js (existing)
│   └── useCallStore.js (NEW) - Call state management
├── component/
│   ├── CallModal.jsx (NEW) - Incoming call UI
│   ├── CallControls.jsx (NEW) - Call button controls
│   ├── VideoCallWindow.jsx (NEW) - Video call UI
│   ├── VoiceCallWindow.jsx (NEW) - Voice call UI
│   └── CallButton.jsx (NEW) - Call trigger buttons
├── lib/
│   └── webrtc.js (NEW) - WebRTC utilities and connection management
└── hooks/
    └── useWebRTC.js (NEW) - WebRTC hook for components

backend/src/
├── lib/
│   ├── socket.js (MODIFY) - Add call signaling events
│   └── webrtc.js (NEW) - Backend WebRTC utilities (optional)
├── controllers/
│   └── call.controller.js (NEW) - Call history/logging
└── model/
    └── call.model.js (NEW) - Call history model
```

---

## Phase 2: WebRTC Core Implementation

### 2.1 WebRTC Store (Zustand) - `frontend/src/store/useCallStore.js`

**State Management:**
```javascript
- callState: 'idle' | 'calling' | 'ringing' | 'in-call' | 'ended'
- callType: 'voice' | 'video' | null
- caller: { userId, fullname, profilePic } | null
- receiver: { userId, fullname, profilePic } | null
- localStream: MediaStream | null
- remoteStream: MediaStream | null
- peerConnection: RTCPeerConnection | null
- isMuted: boolean
- isVideoEnabled: boolean
- callDuration: number
- callStartTime: Date | null
```

**Actions:**
- `initiateCall(userId, callType)`
- `answerCall(callId)`
- `rejectCall(callId)`
- `endCall()`
- `toggleMute()`
- `toggleVideo()`
- `switchCamera()`
- `resetCallState()`

### 2.2 WebRTC Utilities - `frontend/src/lib/webrtc.js`

**Functions:**
```javascript
- createPeerConnection() - Create RTCPeerConnection with STUN/TURN config
- getLocalStream(callType) - Get user media (audio/video)
- createOffer(peerConnection) - Create WebRTC offer
- createAnswer(peerConnection, offer) - Create WebRTC answer
- handleICE(peerConnection, socket) - Handle ICE candidates
- addRemoteStream(peerConnection, callback) - Handle remote stream
- cleanupStream(stream) - Stop tracks and cleanup
- cleanupPeerConnection(pc) - Close connection and cleanup
```

**STUN/TURN Configuration:**
```javascript
const rtcConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // For production, add TURN servers:
    // {
    //   urls: 'turn:your-turn-server.com:3478',
    //   username: 'your-username',
    //   credential: 'your-credential'
    // }
  ],
  iceCandidatePoolSize: 10
};
```

### 2.3 WebRTC Hook - `frontend/src/hooks/useWebRTC.js`

**Custom hook for WebRTC management:**
- Handles peer connection lifecycle
- Manages media streams
- Handles signaling events
- Returns call controls and state

---

## Phase 3: Signaling Implementation

### 3.1 Backend Signaling Events - `backend/src/lib/socket.js`

**New Socket Events:**

**Call Initiation:**
```javascript
socket.on('call:initiate', async ({ receiverId, callType, callerInfo }) => {
  // Validate users exist and are online
  // Store call info temporarily
  // Forward call to receiver
  io.to(receiverSocketId).emit('call:incoming', {
    callId,
    callerId,
    callerInfo,
    callType
  });
  // Notify caller of call status
  io.to(callerSocketId).emit('call:ringing', { callId, receiverId });
});
```

**Call Answer:**
```javascript
socket.on('call:answer', ({ callId, answer }) => {
  // Forward answer to caller
  // Update call state
});
```

**Call Reject:**
```javascript
socket.on('call:reject', ({ callId, reason }) => {
  // Notify caller
  // Cleanup call state
});
```

**Call End:**
```javascript
socket.on('call:end', ({ callId, reason }) => {
  // Notify both parties
  // Log call (optional)
  // Cleanup
});
```

**WebRTC Signaling:**
```javascript
// Offer/Answer exchange
socket.on('webrtc:offer', ({ callId, offer, receiverId }) => {
  io.to(receiverSocketId).emit('webrtc:offer', { callId, offer });
});

socket.on('webrtc:answer', ({ callId, answer, callerId }) => {
  io.to(callerSocketId).emit('webrtc:answer', { callId, answer });
});

// ICE Candidates
socket.on('webrtc:ice-candidate', ({ callId, candidate, receiverId }) => {
  io.to(receiverSocketId).emit('webrtc:ice-candidate', { callId, candidate });
});
```

### 3.2 Frontend Signaling - Socket.IO Events

**Event Handlers in useCallStore:**
- Listen for `call:incoming`
- Listen for `call:ringing`
- Listen for `call:answered`
- Listen for `call:rejected`
- Listen for `call:ended`
- Listen for `webrtc:offer`
- Listen for `webrtc:answer`
- Listen for `webrtc:ice-candidate`

---

## Phase 4: UI Components

### 4.1 Call Button Component - `frontend/src/component/CallButton.jsx`

**Features:**
- Voice call button (phone icon)
- Video call button (video camera icon)
- Display in ChatHeader or as floating action
- Disabled state when user is offline

**Location:** ChatHeader, Contact list items

### 4.2 Incoming Call Modal - `frontend/src/component/CallModal.jsx`

**Features:**
- Full-screen or modal overlay
- Caller profile picture and name
- Call type indicator (voice/video)
- Answer button (green)
- Reject button (red)
- Auto-dismiss after timeout
- Plays ringtone (optional)

### 4.3 Video Call Window - `frontend/src/component/VideoCallWindow.jsx`

**Features:**
- Local video preview (small, draggable)
- Remote video (full screen)
- Call controls overlay (bottom)
- Call info (duration, caller name)
- Responsive design (mobile/desktop)
- Picture-in-picture support

**Layout:**
```
┌─────────────────────────────┐
│  Remote Video (Full Screen) │
│                             │
│  ┌─────────┐               │
│  │ Local   │               │
│  │ Video   │               │
│  └─────────┘               │
│                             │
│  [Controls Bar - Bottom]    │
└─────────────────────────────┘
```

### 4.4 Voice Call Window - `frontend/src/component/VoiceCallWindow.jsx`

**Features:**
- Large profile picture
- Caller/receiver name
- Call duration timer
- Call controls (mute, speaker, end)
- Minimal, centered design

### 4.5 Call Controls Component - `frontend/src/component/CallControls.jsx`

**Features:**
- Mute/Unmute button
- Video on/off toggle
- Speaker/Toggle audio output
- Switch camera (video calls)
- End call button
- Call duration display

**Icons:**
- Mic on/off
- Video on/off
- Speaker on/off
- Switch camera
- End call (red)

---

## Phase 5: Call Flow Implementation

### 5.1 Call Initiation Flow

```
1. User clicks Call/Video button
   ↓
2. useCallStore.initiateCall(userId, callType)
   ↓
3. Request media permissions (getUserMedia)
   ↓
4. Create peer connection
   ↓
5. Get local stream (audio/video)
   ↓
6. Add local stream tracks to peer connection
   ↓
7. Create offer
   ↓
8. Set local description
   ↓
9. Send offer via Socket.IO ('webrtc:offer')
   ↓
10. Emit 'call:initiate' via Socket.IO
    ↓
11. Show "Calling..." UI
    ↓
12. Wait for answer or timeout
```

### 5.2 Call Receiving Flow

```
1. Receive 'call:incoming' event
   ↓
2. Show incoming call modal
   ↓
3. Play ringtone (optional)
   ↓
4. User answers:
   a. Request media permissions
   b. Create peer connection
   c. Get local stream
   d. Add local stream tracks
   e. Receive offer
   f. Set remote description
   g. Create answer
   h. Set local description
   i. Send answer via Socket.IO
   j. Show call window
   
OR User rejects:
   a. Emit 'call:reject'
   b. Close modal
   c. Cleanup
```

### 5.3 ICE Candidate Exchange

```
1. When ICE candidate generated:
   ↓
2. Send via Socket.IO ('webrtc:ice-candidate')
   ↓
3. Receiver receives candidate
   ↓
4. Add candidate to peer connection
   ↓
5. Repeat until connection established
```

### 5.4 Call End Flow

```
1. User clicks End Call
   ↓
2. Stop all media tracks
   ↓
3. Close peer connection
   ↓
4. Emit 'call:end' via Socket.IO
   ↓
5. Cleanup local/remote streams
   ↓
6. Reset call state
   ↓
7. Return to chat view
```

---

## Phase 6: Error Handling & Edge Cases

### 6.1 Error Scenarios

**Media Permission Denied:**
- Show permission request modal
- Guide user to browser settings
- Disable call buttons if denied

**User Offline:**
- Check online status before calling
- Show "User is offline" message
- Disable call buttons

**Network Issues:**
- Detect connection loss
- Attempt reconnection
- Show "Reconnecting..." status
- Auto-end call after timeout

**No Answer:**
- Timeout after 30-60 seconds
- Show "No answer" message
- Cleanup resources

**Call Busy:**
- Detect if user is already in call
- Show "User is busy" message
- Prevent multiple simultaneous calls

### 6.2 Connection Quality

**ICE Connection State Monitoring:**
- 'new' → 'checking' → 'connected' → 'completed'
- Handle 'failed', 'disconnected' states
- Show connection status indicator

**Quality Indicators:**
- Connection strength indicator
- Packet loss detection
- Latency monitoring
- Show warnings if poor quality

---

## Phase 7: Call History & Logging

### 7.1 Call Model - `backend/src/model/call.model.js`

```javascript
{
  callId: String (unique),
  callerId: ObjectId (ref: User),
  receiverId: ObjectId (ref: User),
  callType: String ('voice' | 'video'),
  status: String ('answered' | 'rejected' | 'missed' | 'cancelled'),
  duration: Number (seconds),
  startTime: Date,
  endTime: Date,
  createdAt: Date
}
```

### 7.2 Call Controller - `backend/src/controllers/call.controller.js`

**Endpoints:**
- `GET /api/calls` - Get call history
- `GET /api/calls/:callId` - Get specific call
- `POST /api/calls/log` - Log call (called after call ends)

### 7.3 Call History UI (Optional)

- Display in user profile/settings
- Show call logs with duration, type, date
- Filter by voice/video
- Search functionality

---

## Phase 8: Mobile Optimization

### 8.1 Responsive Design

- Full-screen call UI on mobile
- Touch-optimized controls
- Larger button sizes
- Swipe gestures (optional)

### 8.2 Mobile-Specific Features

- Background call handling (optional)
- Lock screen controls (optional)
- Bluetooth audio routing
- Screen orientation handling

---

## Phase 9: Advanced Features (Optional)

### 9.1 Group Calls
- Multi-peer connections
- Video grid layout
- Speaker view
- Screen sharing

### 9.2 Call Recording (Legal compliance required)
- Record audio/video
- Storage management
- User consent

### 9.3 Screen Sharing
- Screen capture API
- Share entire screen or window
- Toggle between camera and screen

### 9.4 Call Waiting
- Handle incoming call during active call
- Call hold functionality
- Call switching

---

## Phase 10: Testing & Optimization

### 10.1 Testing Checklist

**Unit Tests:**
- WebRTC utility functions
- Call state management
- Signal handling

**Integration Tests:**
- End-to-end call flow
- Multiple concurrent calls
- Error scenarios

**Browser Compatibility:**
- Chrome/Edge
- Firefox
- Safari (iOS/macOS)
- Mobile browsers

### 10.2 Performance Optimization

- Lazy load call components
- Optimize video bitrate
- Adaptive bitrate streaming
- Reduce memory usage
- Battery optimization

---

## Implementation Timeline

### Week 1: Foundation
- ✅ Project structure setup
- ✅ Store creation (useCallStore)
- ✅ WebRTC utilities (lib/webrtc.js)
- ✅ Basic signaling setup

### Week 2: Core Functionality
- ✅ Peer connection management
- ✅ Media stream handling
- ✅ Offer/Answer exchange
- ✅ ICE candidate handling

### Week 3: UI Components
- ✅ Call buttons
- ✅ Incoming call modal
- ✅ Video call window
- ✅ Voice call window
- ✅ Call controls

### Week 4: Integration & Testing
- ✅ Integrate with existing chat
- ✅ Error handling
- ✅ Edge cases
- ✅ Browser testing
- ✅ Mobile testing

### Week 5: Polish & Optimization
- ✅ UI/UX improvements
- ✅ Performance optimization
- ✅ Call history (optional)
- ✅ Documentation

---

## Security Considerations

### 1. Authentication
- Verify user identity before allowing calls
- Validate call permissions
- Check contact relationships

### 2. Media Privacy
- No recording without consent
- Secure media transmission
- End-to-end encryption (advanced)

### 3. Rate Limiting
- Limit call frequency per user
- Prevent spam calls
- Abuse detection

---

## Deployment Considerations

### 1. STUN/TURN Servers

**Development:**
- Use free public STUN servers (Google)
- No TURN server needed for local network

**Production:**
- Set up dedicated STUN server
- **Required**: TURN server for NAT traversal
- Options:
  - Self-hosted (coturn)
  - Cloud service (Twilio, Vonage)
  - Managed service

### 2. Environment Variables

```env
# STUN/TURN Configuration
STUN_SERVER_URL=stun:stun.l.google.com:19302
TURN_SERVER_URL=turn:your-server.com:3478
TURN_USERNAME=your-username
TURN_PASSWORD=your-password

# Call Settings
MAX_CALL_DURATION=3600 # seconds
CALL_TIMEOUT=60 # seconds
```

### 3. Monitoring

- Call success rate
- Connection quality metrics
- Error rates
- User feedback

---

## Resources & Documentation

### WebRTC APIs
- [MDN WebRTC Documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [WebRTC Samples](https://webrtc.github.io/samples/)
- [WebRTC Best Practices](https://webrtc.org/getting-started/peer-connections-checklist)

### STUN/TURN Servers
- [List of Public STUN Servers](https://gist.github.com/mondain/b0ec1cf5f60ae726202e)
- [coturn - TURN Server](https://github.com/coturn/coturn)

### Socket.IO Signaling
- [Socket.IO Documentation](https://socket.io/docs/v4/)

---

## Next Steps

1. **Review this plan** - Confirm approach and timeline
2. **Set up project structure** - Create files and folders
3. **Implement Phase 1** - Foundation setup
4. **Implement Phase 2** - Core WebRTC functionality
5. **Test incrementally** - Test each phase before moving to next

---

## Notes

- Start with voice calls, then add video
- Test thoroughly on different networks (WiFi, 4G, 5G)
- Consider user privacy and permissions
- Provide clear error messages
- Make UI intuitive and accessible
- Consider battery drain on mobile devices

---

**Document Version:** 1.0  
**Last Updated:** 2024  
**Status:** Ready for Implementation