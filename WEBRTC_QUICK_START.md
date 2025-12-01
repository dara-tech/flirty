# WebRTC Integration - Quick Start Guide

## 🚀 Getting Started

This is a quick reference guide to start implementing WebRTC calls. For detailed information, see `WEBRTC_INTEGRATION_PLAN.md`.

## 📋 Prerequisites Checklist

- [ ] Review the full plan (`WEBRTC_INTEGRATION_PLAN.md`)
- [ ] Understand WebRTC basics (RTCPeerConnection, getUserMedia)
- [ ] Test Socket.IO connection is working
- [ ] Ensure user authentication is functioning
- [ ] Verify online user tracking works

## 🏗️ Implementation Order

### Step 1: Create Store (30 min)
Create `frontend/src/store/useCallStore.js` with basic call state management.

### Step 2: WebRTC Utilities (1 hour)
Create `frontend/src/lib/webrtc.js` with peer connection and media handling functions.

### Step 3: Backend Signaling (1 hour)
Add call signaling events to `backend/src/lib/socket.js`.

### Step 4: Basic UI Components (2 hours)
- Call button component
- Incoming call modal
- Basic call window

### Step 5: Integration (2 hours)
- Wire up call flow
- Connect signaling
- Test basic call functionality

### Step 6: Polish (2 hours)
- Error handling
- UI improvements
- Testing

## 📦 Required Files

### Frontend Files to Create:
```
frontend/src/
├── store/useCallStore.js          [NEW]
├── lib/webrtc.js                   [NEW]
├── hooks/useWebRTC.js              [NEW - Optional]
├── component/
│   ├── CallButton.jsx              [NEW]
│   ├── CallModal.jsx               [NEW]
│   ├── VideoCallWindow.jsx         [NEW]
│   ├── VoiceCallWindow.jsx         [NEW]
│   └── CallControls.jsx            [NEW]
```

### Backend Files to Modify:
```
backend/src/
├── lib/socket.js                   [MODIFY - Add call events]
```

### Backend Files to Create (Optional):
```
backend/src/
├── model/call.model.js             [NEW - For call history]
├── controllers/call.controller.js  [NEW - For call logging]
└── routes/call.route.js            [NEW - For call history API]
```

## 🎯 Key Implementation Points

### 1. Call State Management
Use Zustand store to manage:
- Call status (idle, calling, ringing, in-call)
- Media streams
- Peer connection
- Call controls state

### 2. Signaling Flow
Use Socket.IO for:
- Call initiation/rejection
- WebRTC offer/answer exchange
- ICE candidate exchange
- Call state updates

### 3. Media Handling
- Request permissions before call
- Get local stream (audio/video)
- Add tracks to peer connection
- Handle remote stream

### 4. UI Considerations
- Non-intrusive call buttons
- Clear call status indicators
- Easy-to-use controls
- Mobile-responsive design

## ⚙️ Configuration

### STUN Server (Free, for development)
```javascript
iceServers: [
  { urls: 'stun:stun.l.google.com:19302' }
]
```

### TURN Server (Required for production)
You'll need a TURN server for users behind NAT/firewalls.
- Option 1: Use a service (Twilio, Vonage)
- Option 2: Self-host (coturn)

## 🧪 Testing Checklist

- [ ] Voice call between two users
- [ ] Video call between two users
- [ ] Call rejection works
- [ ] Call timeout handling
- [ ] Network disconnection handling
- [ ] Permission denial handling
- [ ] Mobile device testing
- [ ] Different browsers testing

## 🐛 Common Issues & Solutions

### Issue: No audio/video
**Solution:** Check browser permissions, ensure getUserMedia is called

### Issue: Connection fails
**Solution:** Check STUN/TURN servers, verify signaling is working

### Issue: Poor quality
**Solution:** Adjust bitrate, check network connection, consider TURN server

### Issue: Mobile issues
**Solution:** Test permissions, handle orientation changes, optimize for battery

## 📚 Essential Code Snippets

### Get User Media
```javascript
const stream = await navigator.mediaDevices.getUserMedia({
  audio: true,
  video: callType === 'video'
});
```

### Create Peer Connection
```javascript
const pc = new RTCPeerConnection({
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
});
```

### Create Offer
```javascript
const offer = await pc.createOffer();
await pc.setLocalDescription(offer);
// Send offer via Socket.IO
```

### Handle Answer
```javascript
await pc.setRemoteDescription(answer);
const answerResponse = await pc.createAnswer();
await pc.setLocalDescription(answerResponse);
```

## 🎨 UI Design Principles

1. **Clear Call Status** - Always show what's happening
2. **Easy Controls** - Large, accessible buttons
3. **Non-Blocking** - Don't freeze the UI during calls
4. **Error Feedback** - Clear error messages
5. **Consistent Design** - Match existing chat app style

## 🔄 Next Steps After Basic Implementation

1. Add call history logging
2. Implement group calls (advanced)
3. Add screen sharing (advanced)
4. Optimize for production (TURN server)
5. Add analytics and monitoring

## 💡 Tips

- Start simple: Voice calls first, then video
- Test on real devices, not just browser
- Handle all error cases gracefully
- Consider user privacy and permissions
- Optimize for battery life on mobile
- Test on poor network conditions

## 📞 Support

For detailed implementation, refer to:
- `WEBRTC_INTEGRATION_PLAN.md` - Complete technical plan
- WebRTC MDN Documentation
- Socket.IO documentation for signaling

---

**Ready to start?** Begin with Step 1: Create the call store!