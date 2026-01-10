# Call Reliability Improvement Guide

## 💰 Cost Summary

**100% FREE Options:**
- ✅ STUN servers (Google's) - completely free
- ✅ Free TURN servers (openrelay.metered.ca) - free but with usage limits
- ✅ All code improvements (monitoring, reconnection, error handling, etc.) - just code changes
- ✅ Self-hosted TURN server (coturn) - free if you host it on your own server

**PAID Options:**
- 💰 Twilio TURN service - ~$0.40 per GB (recommended for production)
- 💰 Other commercial TURN services (Vonage, etc.)

**Recommendation:** Start with the free options (Option 1) for development/testing. For production, consider self-hosting or a paid service for better reliability and no usage limits.

## Current Issues & Solutions

### 1. Add TURN Servers (Critical for NAT Traversal)

**Problem:** Currently only using STUN servers, which fail behind strict NATs/firewalls.

**Solution:** Add TURN servers to handle relay connections.

**Update `frontend/src/lib/webrtc.js`:**

```javascript
const getRTCConfiguration = () => {
  const iceServers = [
    // STUN servers (for discovery)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    
    // TURN servers (for relay - REQUIRED for reliability)
    // Option 1: FREE TURN servers (limited bandwidth, for testing/development)
    // ⚠️ Note: These are free but have usage limits. Not recommended for production.
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    
    // Option 2: PAID TURN service (Twilio - recommended for production)
    // 💰 Cost: ~$0.40 per GB of data relayed
    // {
    //   urls: 'turn:global.turn.twilio.com:3478?transport=udp',
    //   username: 'YOUR_TWILIO_USERNAME',
    //   credential: 'YOUR_TWILIO_CREDENTIAL'
    // },
    
    // Option 3: Self-hosted TURN server (coturn) - FREE if you host it yourself
    // 💰 Cost: Free (but requires your own server/VPS)
    // {
    //   urls: 'turn:your-turn-server.com:3478',
    //   username: 'username',
    //   credential: 'password'
    // }
  ];

  return {
    iceServers: iceServers,
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all', // Try both UDP and TCP
  };
};
```

### 2. Enhanced Connection State Monitoring

**Add to `frontend/src/lib/webrtc.js`:**

```javascript
export const setupConnectionMonitoring = (peerConnection, onStateChange) => {
  const handleConnectionStateChange = () => {
    const state = peerConnection.connectionState;
    const iceState = peerConnection.iceConnectionState;
    
    console.log('Connection state:', state, 'ICE state:', iceState);
    
    if (onStateChange) {
      onStateChange({ connectionState: state, iceState });
    }
    
    // Handle connection failures
    if (state === 'failed' || iceState === 'failed') {
      console.error('Connection failed, attempting recovery...');
      
      // Try to restart ICE
      if (peerConnection.restartIce) {
        peerConnection.restartIce();
      }
      
      // Notify user
      if (onStateChange) {
        onStateChange({ 
          connectionState: state, 
          iceState,
          error: 'Connection failed. Attempting to reconnect...'
        });
      }
    }
    
    // Handle disconnection
    if (state === 'disconnected' || iceState === 'disconnected') {
      console.warn('Connection disconnected, monitoring for recovery...');
      
      // Wait a bit before considering it failed
      setTimeout(() => {
        if (peerConnection.iceConnectionState === 'disconnected' || 
            peerConnection.connectionState === 'disconnected') {
          // Still disconnected, try recovery
          if (peerConnection.restartIce) {
            peerConnection.restartIce();
          }
        }
      }, 3000);
    }
  };
  
  peerConnection.onconnectionstatechange = handleConnectionStateChange;
  peerConnection.oniceconnectionstatechange = handleConnectionStateChange;
  
  // Also monitor ICE gathering state
  peerConnection.onicegatheringstatechange = () => {
    console.log('ICE gathering state:', peerConnection.iceGatheringState);
  };
};
```

### 3. Automatic Reconnection on Failure

**Add to `frontend/src/hooks/useWebRTC.jsx`:**

```javascript
// Add reconnection logic
const handleConnectionFailure = async () => {
  const { callId, callType, caller, receiver } = useCallStore.getState();
  const { socket } = useAuthStore.getState();
  
  if (!callId || !socket) return;
  
  console.log('Attempting to reconnect call...');
  
  try {
    // Create new peer connection
    const newPc = createPeerConnection();
    useCallStore.getState().setPeerConnection(newPc);
    
    // Get local stream
    const stream = await getLocalStream(callType);
    if (stream) {
      addLocalStreamTracks(newPc, stream);
      setupRemoteStreamHandler(newPc, (remoteStream) => {
        useCallStore.getState().setRemoteStream(remoteStream);
      });
    }
    
    // Create new offer
    const offer = await createOffer(newPc);
    if (offer && socket) {
      const authUserId = useAuthStore.getState().authUser._id;
      const isCaller = String(authUserId) === String(caller?.userId);
      const otherUserId = isCaller ? receiver?.userId : caller?.userId;
      
      socket.emit('webrtc:offer', {
        callId,
        offer,
        receiverId: otherUserId,
        isReconnection: true
      });
    }
  } catch (error) {
    console.error('Reconnection failed:', error);
    toast.error('Failed to reconnect. Call ended.');
    useCallStore.getState().endCall('connection-failed');
  }
};
```

### 4. Network Quality Detection

**Add network quality monitoring:**

```javascript
export const monitorNetworkQuality = (peerConnection, onQualityChange) => {
  if (!peerConnection.getStats) return;
  
  const checkQuality = async () => {
    try {
      const stats = await peerConnection.getStats();
      let audioQuality = 'unknown';
      let videoQuality = 'unknown';
      
      stats.forEach((report) => {
        if (report.type === 'inbound-rtp' && report.mediaType === 'audio') {
          const packetsLost = report.packetsLost || 0;
          const packetsReceived = report.packetsReceived || 1;
          const lossRate = packetsLost / packetsReceived;
          
          if (lossRate < 0.01) audioQuality = 'excellent';
          else if (lossRate < 0.03) audioQuality = 'good';
          else if (lossRate < 0.05) audioQuality = 'fair';
          else audioQuality = 'poor';
        }
        
        if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
          const packetsLost = report.packetsLost || 0;
          const packetsReceived = report.packetsReceived || 1;
          const lossRate = packetsLost / packetsReceived;
          
          if (lossRate < 0.01) videoQuality = 'excellent';
          else if (lossRate < 0.03) videoQuality = 'good';
          else if (lossRate < 0.05) videoQuality = 'fair';
          else videoQuality = 'poor';
        }
      });
      
      if (onQualityChange) {
        onQualityChange({ audio: audioQuality, video: videoQuality });
      }
    } catch (error) {
      console.error('Error checking network quality:', error);
    }
  };
  
  // Check quality every 5 seconds
  const interval = setInterval(checkQuality, 5000);
  
  return () => clearInterval(interval);
};
```

### 5. Better Error Handling & Retry Logic

**Update `frontend/src/store/useCallStore.js` - initiateCall:**

```javascript
initiateCall: async (receiverId, callType, retryCount = 0) => {
  const MAX_RETRIES = 3;
  
  try {
    // ... existing code ...
    
    // Set timeout with retry logic
    const timeoutId = setTimeout(async () => {
      const { callState, callId: currentCallId } = get();
      if ((callState === 'calling' || callState === 'ringing') && currentCallId === callId) {
        if (retryCount < MAX_RETRIES) {
          // Retry the call
          console.log(`Call timeout, retrying (${retryCount + 1}/${MAX_RETRIES})...`);
          get().initiateCall(receiverId, callType, retryCount + 1);
        } else {
          // Max retries reached
          get().endCall('no-answer');
          toast.error("No answer. Call cancelled after multiple attempts.");
        }
      }
    }, 60000);
    
    set({ callTimeoutId: timeoutId });
  } catch (error) {
    if (retryCount < MAX_RETRIES && error.message?.includes('connection')) {
      // Retry on connection errors
      setTimeout(() => {
        get().initiateCall(receiverId, callType, retryCount + 1);
      }, 2000);
    } else {
      toast.error(error.message || "Failed to start call");
    }
  }
}
```

### 6. ICE Candidate Handling Improvements

**Update ICE candidate handling:**

```javascript
export const setupIceCandidateHandler = (peerConnection, socket, callId, receiverId) => {
  let candidateQueue = [];
  let isRemoteDescriptionSet = false;
  
  // Queue candidates until remote description is set
  const queueCandidate = (candidate) => {
    if (!isRemoteDescriptionSet) {
      candidateQueue.push(candidate);
      return;
    }
    
    // Send immediately if description is set
    if (candidate && socket) {
      socket.emit('webrtc:ice-candidate', {
        callId,
        candidate,
        receiverId
      });
    }
  };
  
  // Process queued candidates
  const processQueue = () => {
    isRemoteDescriptionSet = true;
    candidateQueue.forEach(candidate => {
      if (candidate && socket) {
        socket.emit('webrtc:ice-candidate', {
          callId,
          candidate,
          receiverId
        });
      }
    });
    candidateQueue = [];
  };
  
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      queueCandidate(event.candidate);
    }
  };
  
  // Monitor when remote description is set
  const originalSetRemoteDescription = peerConnection.setRemoteDescription.bind(peerConnection);
  peerConnection.setRemoteDescription = async (description) => {
    await originalSetRemoteDescription(description);
    processQueue();
  };
};
```

### 7. Pre-call Connection Test

**Add connection test before initiating call:**

```javascript
export const testConnection = async () => {
  return new Promise((resolve) => {
    const testPc = new RTCPeerConnection(getRTCConfiguration());
    let testResolved = false;
    
    const timeout = setTimeout(() => {
      if (!testResolved) {
        testResolved = true;
        testPc.close();
        resolve({ success: false, error: 'Connection test timeout' });
      }
    }, 5000);
    
    testPc.oniceconnectionstatechange = () => {
      if (testPc.iceConnectionState === 'connected' || 
          testPc.iceConnectionState === 'completed') {
        if (!testResolved) {
          testResolved = true;
          clearTimeout(timeout);
          testPc.close();
          resolve({ success: true });
        }
      } else if (testPc.iceConnectionState === 'failed') {
        if (!testResolved) {
          testResolved = true;
          clearTimeout(timeout);
          testPc.close();
          resolve({ success: false, error: 'Connection test failed' });
        }
      }
    };
    
    // Create data channel to trigger ICE gathering
    testPc.createDataChannel('test');
    testPc.createOffer().then(offer => {
      testPc.setLocalDescription(offer);
    });
  });
};
```

### 8. Backend Improvements

**Add to `backend/src/lib/socket.js` - call:initiate:**

```javascript
socket.on("call:initiate", async ({ callId, receiverId, callType, callerInfo, isReconnection }) => {
  try {
    // ... existing code ...
    
    // For reconnections, extend timeout
    const timeout = isReconnection ? 120000 : 60000; // 2 minutes for reconnection
    
    // Store call with reconnection flag
    activeCalls.set(callId, {
      callerId: userId,
      receiverId: receiverId,
      callType,
      status: "ringing",
      createdAt: new Date(),
      startedAt: new Date(),
      answeredAt: null,
      isReconnection: isReconnection || false,
      reconnectAttempts: isReconnection ? 1 : 0
    });
    
    // ... rest of code ...
  } catch (error) {
    // ... error handling ...
  }
});
```

## Quick Implementation Priority

1. **High Priority:**
   - Add TURN servers (most critical)
   - Enhanced connection state monitoring
   - Better error messages

2. **Medium Priority:**
   - Automatic reconnection
   - Network quality detection
   - Retry logic

3. **Low Priority:**
   - Pre-call connection test
   - Advanced ICE handling

## Testing Checklist

- [ ] Test behind strict NAT
- [ ] Test with poor network (throttle connection)
- [ ] Test reconnection after network interruption
- [ ] Test with different browsers
- [ ] Test with mobile networks
- [ ] Test call quality with various bandwidths

## Production Recommendations

1. **Use paid TURN service** (Twilio, Vonage, etc.) for reliability
2. **Monitor call quality** and log connection issues
3. **Implement analytics** to track call success rates
4. **Add user feedback** for call quality issues
5. **Consider using SFU** (Selective Forwarding Unit) for group calls

