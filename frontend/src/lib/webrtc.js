// WebRTC Configuration
export const RTC_CONFIGURATION = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // For production, add TURN servers here:
    // {
    //   urls: 'turn:your-turn-server.com:3478',
    //   username: 'your-username',
    //   credential: 'your-credential'
    // }
  ],
  iceCandidatePoolSize: 10,
};

/**
 * Create a new RTCPeerConnection with configuration
 */
export const createPeerConnection = () => {
  try {
    const pc = new RTCPeerConnection(RTC_CONFIGURATION);
    return pc;
  } catch (error) {
    console.error('Error creating peer connection:', error);
    throw error;
  }
};

/**
 * Get user media stream (audio/video)
 * @param {string} callType - 'voice' or 'video'
 * @returns {Promise<MediaStream>}
 */
export const getLocalStream = async (callType) => {
  try {
    const constraints = {
      audio: true,
      video: callType === 'video' ? {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user',
      } : false,
    };
    
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return stream;
  } catch (error) {
    console.error('Error getting user media:', error);
    
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      throw new Error('Camera/microphone permission denied. Please allow access and try again.');
    } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      throw new Error('No camera/microphone found. Please connect a device and try again.');
    } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      throw new Error('Camera/microphone is being used by another application.');
    } else {
      throw new Error('Failed to access camera/microphone. Please check your device settings.');
    }
  }
};

/**
 * Get display media stream (screen sharing)
 * @returns {Promise<MediaStream>}
 */
export const getDisplayMedia = async () => {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'always',
        displaySurface: 'monitor',
      },
      audio: true, // Try to capture system audio if available
    });
    return stream;
  } catch (error) {
    console.error('Error getting display media:', error);
    
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      throw new Error('Screen sharing permission denied. Please allow access and try again.');
    } else if (error.name === 'NotFoundError' || error.name === 'AbortError') {
      throw new Error('Screen sharing cancelled or not available.');
    } else {
      throw new Error('Failed to start screen sharing. Please check your browser settings.');
    }
  }
};

/**
 * Replace video track in peer connection
 * @param {RTCPeerConnection} peerConnection
 * @param {MediaStreamTrack} newTrack
 * @param {MediaStream} stream
 * @returns {Promise<void>}
 */
export const replaceVideoTrack = async (peerConnection, newTrack, stream) => {
  if (!peerConnection || !newTrack) {
    throw new Error('Missing peerConnection or newTrack');
  }
  
  const senders = peerConnection.getSenders();
  const videoSender = senders.find(sender => sender.track?.kind === 'video');
  
  if (videoSender) {
    const oldTrack = videoSender.track;
    console.log('🔄 Replacing video track:', {
      old: oldTrack?.label,
      new: newTrack.label,
    });
    
    await videoSender.replaceTrack(newTrack);
    newTrack.enabled = true;
    console.log('✅ Video track replaced');
  } else if (stream) {
    console.log('➕ Adding new video track');
    peerConnection.addTrack(newTrack, stream);
  } else {
    throw new Error('Cannot add track: stream is missing');
  }
};

/**
 * Add local stream tracks to peer connection
 */
export const addLocalStreamTracks = (peerConnection, stream) => {
  if (!stream || !peerConnection) return;
  
  stream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, stream);
  });
};

/**
 * Create WebRTC offer
 * @param {RTCPeerConnection} peerConnection
 * @returns {Promise<RTCSessionDescriptionInit>}
 */
export const createOffer = async (peerConnection) => {
  // ABSOLUTE FIRST CHECK: If we already have a local description (offer), RETURN IT IMMEDIATELY
  // This check happens BEFORE anything else - even before the try block
  if (peerConnection.localDescription?.type === 'offer') {
    console.log('✅ Offer already exists, returning existing offer (preventing duplicate)');
    return peerConnection.localDescription;
  }
  
  // ABSOLUTE SECOND CHECK: If state is 'have-local-offer', we already have an offer
  // Throw error immediately - do NOT try to create a new one
  if (peerConnection.signalingState === 'have-local-offer') {
    console.error('❌ FATAL ERROR: Cannot create offer - peer connection is in "have-local-offer" state!');
    console.error('This means an offer already exists. This should have been caught earlier.');
    
    if (peerConnection.localDescription?.type === 'offer') {
      console.log('Returning existing offer as fallback');
      return peerConnection.localDescription;
    }
    
    throw new Error('FATAL: Peer connection is in "have-local-offer" state. Cannot create new offer. Reset peer connection required.');
  }
  
  try {
    const currentState = peerConnection.signalingState;
    
    // Additional check inside try block
    if (peerConnection.localDescription) {
      if (peerConnection.localDescription.type === 'offer') {
        console.log('✅ Offer already exists, returning existing offer (preventing duplicate)');
        return peerConnection.localDescription;
      } else {
        throw new Error(`Cannot create offer when local description is: ${peerConnection.localDescription.type}. State: ${currentState}`);
      }
    }
    
    if (currentState === 'have-local-offer') {
      throw new Error('FATAL: Peer connection is in "have-local-offer" state. Cannot create new offer.');
    }
    
    // Can ONLY create offer in 'stable' state
    if (currentState !== 'stable') {
      throw new Error(`Cannot create offer in state: ${currentState}. Peer connection must be in 'stable' state. Current state indicates an offer may already exist.`);
    }
    
    // Verify peer connection doesn't have remote description
    if (peerConnection.remoteDescription) {
      throw new Error(`Cannot create offer when remote description already set: ${peerConnection.remoteDescription.type}`);
    }
    
    // TRIPLE-CHECK: Make absolutely sure local description doesn't exist
    if (peerConnection.localDescription) {
      console.error('❌ CRITICAL: localDescription appeared between checks - this should not happen');
      return peerConnection.localDescription;
    }
    
    // Create the offer (SDP object, not yet set)
    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    
    // QUADRUPLE-CHECK: Before setting, verify state is still stable and no local description exists
    if (peerConnection.signalingState !== 'stable' || peerConnection.localDescription) {
      console.error('❌ CRITICAL: State changed during offer creation');
      if (peerConnection.localDescription) {
        console.log('Using existing local description instead');
        return peerConnection.localDescription;
      }
      throw new Error(`Cannot set offer: State changed to ${peerConnection.signalingState} during creation`);
    }
    
    // FINAL SAFETY CHECK: Verify we're still in stable state before setting
    if (peerConnection.signalingState !== 'stable') {
      throw new Error(`Cannot set offer: Peer connection state is ${peerConnection.signalingState}, expected 'stable'`);
    }
    
    // FINAL CHECK BEFORE SETTING: Verify peer connection doesn't already have a local description
    // The error "order of m-lines" happens when we try to set an offer when one already exists
    if (peerConnection.localDescription) {
      console.error('❌ FATAL: Attempted to set local description but one already exists!');
      console.error('Existing local description:', {
        type: peerConnection.localDescription.type,
        sdpLength: peerConnection.localDescription.sdp?.length || 0,
      });
      console.error('New offer SDP length:', offer.sdp?.length || 0);
      
      // If it's the same offer, just return it
      if (peerConnection.localDescription.type === 'offer' && 
          peerConnection.localDescription.sdp === offer.sdp) {
        console.log('Same offer, returning existing');
        return peerConnection.localDescription;
      }
      
      // Otherwise, we can't set a new offer
      throw new Error('Cannot set local description: An offer already exists on this peer connection. Reset peer connection required.');
    }
    
    // Verify state is still stable before setting
    if (peerConnection.signalingState !== 'stable') {
      throw new Error(`Cannot set local description: Peer connection state is ${peerConnection.signalingState}, expected 'stable'`);
    }
    
    // Set local description - this is where the error was happening
    // The error "order of m-lines" means we're trying to set an offer when one already exists
    try {
      await peerConnection.setLocalDescription(offer);
      console.log('✅ Offer created successfully, local description set');
      return offer;
    } catch (setError) {
      // If error is about m-lines or existing offer, check if one already exists
      if (setError.message && (setError.message.includes('m-lines') || setError.message.includes('order'))) {
        console.error('❌ Error setting local description - offer may already exist');
        
        // Check if peer connection already has an offer
        if (peerConnection.localDescription?.type === 'offer') {
          console.log('✅ Peer connection already has offer - returning existing one');
          return peerConnection.localDescription;
        }
        
        // If state is have-local-offer, something went wrong
        if (peerConnection.signalingState === 'have-local-offer') {
          console.error('❌ Peer connection in have-local-offer state - cannot set new offer');
          throw new Error('Cannot set offer: Peer connection already has an offer. Use existing offer or reset peer connection.');
        }
      }
      
      // Re-throw other errors
      throw setError;
    }
  } catch (error) {
    console.error('❌ Error creating offer:', error);
    console.error('Peer connection state:', {
      signalingState: peerConnection.signalingState,
      localDescription: peerConnection.localDescription?.type || 'none',
      remoteDescription: peerConnection.remoteDescription?.type || 'none',
      connectionState: peerConnection.connectionState,
      iceConnectionState: peerConnection.iceConnectionState,
    });
    
    // If the error is about m-lines, it means an offer already exists
    if (error.message && error.message.includes('m-lines')) {
      console.error('❌ FATAL: m-lines error indicates an offer already exists on this peer connection');
      console.error('This peer connection cannot be used. It must be reset and recreated.');
    }
    
    throw error;
  }
};

/**
 * Create WebRTC answer
 * @param {RTCPeerConnection} peerConnection
 * @param {RTCSessionDescriptionInit} offer
 * @returns {Promise<RTCSessionDescriptionInit>}
 */
export const createAnswer = async (peerConnection, offer) => {
  try {
    const currentState = peerConnection.signalingState;
    
    // If connection is already stable with both descriptions, answer already created
    if (currentState === 'stable' && peerConnection.remoteDescription && peerConnection.localDescription) {
      if (peerConnection.localDescription.type === 'answer') {
        console.log('Answer already created and connection established');
        return peerConnection.localDescription;
      }
    }
    
    // Check if we already have a remote description set
    const hasRemoteOffer = peerConnection.remoteDescription && 
                          peerConnection.remoteDescription.type === 'offer';
    
    // Set remote description (the offer) if not already set
    if (!hasRemoteOffer) {
      // Set remote description (the offer) - this must succeed before creating answer
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    } else {
      // Verify it's the same offer
      if (peerConnection.remoteDescription.sdp !== offer.sdp) {
        throw new Error('Remote description already set with different offer');
      }
      // If same offer but state is stable and we have local answer, return it
      if (currentState === 'stable' && peerConnection.localDescription) {
        return peerConnection.localDescription;
      }
    }
    
    // Verify we're in the correct state to create an answer
    // Must be "have-remote-offer" to create answer
    const stateAfterSet = peerConnection.signalingState;
    if (stateAfterSet !== 'have-remote-offer') {
      throw new Error(`Cannot create answer in state: ${stateAfterSet}, expected have-remote-offer`);
    }
    
    // Verify remote description is actually set
    if (!peerConnection.remoteDescription || peerConnection.remoteDescription.type !== 'offer') {
      throw new Error('Remote description (offer) not properly set');
    }
    
    // If we already have a local answer, we shouldn't be here, but return it anyway
    if (peerConnection.localDescription && peerConnection.localDescription.type === 'answer') {
      console.log('Local answer already exists, returning it');
      return peerConnection.localDescription;
    }
    
    // Create answer - this requires remote description to be set
    const answer = await peerConnection.createAnswer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    
    // Set local description (the answer) - this should work now that remote is set
    await peerConnection.setLocalDescription(answer);
    
    return answer;
  } catch (error) {
    console.error('Error creating answer:', error);
    throw error;
  }
};

/**
 * Set remote description (for offer or answer)
 */
export const setRemoteDescription = async (peerConnection, description) => {
  try {
    const currentState = peerConnection.signalingState;
    
    // If connection is already stable, don't try to set remote description
    if (currentState === 'stable') {
      // Check if remote description is already set with the same content
      if (peerConnection.remoteDescription) {
        if (peerConnection.remoteDescription.type === description.type) {
          console.log('Connection already established, remote description already set');
          return; // Connection is already working
        }
      }
      // If stable but different description type, might be renegotiation
      // For now, just log and return
      console.log('Connection stable, skipping remote description set');
      return;
    }
    
    // Check if remote description is already set
    if (peerConnection.remoteDescription) {
      // If it's the same description, ignore
      if (peerConnection.remoteDescription.sdp === description.sdp &&
          peerConnection.remoteDescription.type === description.type) {
        console.log('Remote description already set with same content');
        return;
      }
    }
    
    await peerConnection.setRemoteDescription(new RTCSessionDescription(description));
  } catch (error) {
    // If error is about wrong state, check if connection is already working
    if (error.message && error.message.includes('stable')) {
      if (peerConnection.signalingState === 'stable') {
        console.log('Connection already stable, ignoring setRemoteDescription error');
        return; // Connection is working, ignore the error
      }
    }
    console.error('Error setting remote description:', error);
    throw error;
  }
};

/**
 * Add ICE candidate to peer connection
 */
export const addIceCandidate = async (peerConnection, candidate) => {
  try {
    if (candidate) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  } catch (error) {
    console.error('Error adding ICE candidate:', error);
    // Don't throw - ICE candidates can fail without breaking the connection
  }
};

/**
 * Setup ICE candidate handling
 */
export const setupIceCandidateHandler = (peerConnection, socket, callId, receiverId) => {
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('webrtc:ice-candidate', {
        callId,
        candidate: event.candidate,
        receiverId,
      });
    }
  };
  
  // Log ICE connection state changes
  peerConnection.oniceconnectionstatechange = () => {
    const state = peerConnection.iceConnectionState;
    console.log('ICE connection state:', state);
    
    if (state === 'failed' || state === 'disconnected') {
      console.warn('ICE connection failed or disconnected');
    }
  };
};

/**
 * Setup remote stream handling with track change detection
 */
export const setupRemoteStreamHandler = (peerConnection, onRemoteStream) => {
  let remoteStream = null;
  let trackCheckInterval = null;
  
  // Update stream and notify callback
  const updateRemoteStream = (stream) => {
    remoteStream = stream;
    onRemoteStream(stream);
  };
  
  // Set up stream event listeners for track changes
  const setupStreamListeners = (stream) => {
    const handleVideoTrackChange = () => {
      const updatedStream = new MediaStream(stream.getTracks());
      updateRemoteStream(updatedStream);
    };
    
    // Listen for track additions/removals (screen share replacing camera)
    stream.onaddtrack = (event) => {
      if (event.track.kind === 'video') {
        console.log('🔄 Video track added to remote stream');
        handleVideoTrackChange();
      }
    };
    
    stream.onremovetrack = (event) => {
      if (event.track.kind === 'video') {
        console.log('🔄 Video track removed from remote stream');
        handleVideoTrackChange();
      }
    };
  };
  
  // Monitor receivers for track changes (when replaceTrack is used)
  const checkReceiverTracks = () => {
    if (!remoteStream) return;
    
    const receivers = peerConnection.getReceivers();
    const videoReceiver = receivers.find(r => r.track?.kind === 'video');
    const currentVideoTrack = remoteStream.getVideoTracks()[0];
    
    if (videoReceiver?.track && currentVideoTrack?.id !== videoReceiver.track.id) {
      console.log('🔄 Video track changed via receiver:', {
        old: currentVideoTrack?.label,
        new: videoReceiver.track.label,
      });
      
      // Create updated stream with new video track
      const updatedStream = new MediaStream([
        ...remoteStream.getAudioTracks(),
        videoReceiver.track,
      ]);
      
      setupStreamListeners(updatedStream);
      updateRemoteStream(updatedStream);
    }
  };
  
  // Start/stop monitoring based on connection state
  const manageMonitoring = () => {
    const isActive = peerConnection.connectionState === 'connected' || 
                     peerConnection.connectionState === 'connecting';
    
    if (isActive && !trackCheckInterval) {
      trackCheckInterval = setInterval(checkReceiverTracks, 500);
    } else if (!isActive && trackCheckInterval) {
      clearInterval(trackCheckInterval);
      trackCheckInterval = null;
    }
  };
  
  // Handle incoming tracks
  peerConnection.ontrack = (event) => {
    const track = event.track;
    const stream = event.streams?.[0];
    
    console.log('🎵 Received remote track:', track.kind, {
      id: track.id,
      label: track.label,
    });
    
    if (stream) {
      const isNewStream = !remoteStream || remoteStream.id !== stream.id;
      const currentVideoTrack = remoteStream?.getVideoTracks()[0];
      const newVideoTrack = stream.getVideoTracks()[0];
      const videoTrackChanged = currentVideoTrack && newVideoTrack && 
                                currentVideoTrack.id !== newVideoTrack.id;
      
      if (isNewStream || videoTrackChanged) {
        if (videoTrackChanged) {
          console.log('🔄 Video track replaced:', {
            old: currentVideoTrack.label,
            new: newVideoTrack.label,
          });
        }
        
        setupStreamListeners(stream);
        updateRemoteStream(stream);
      }
    } else if (track) {
      // Track without stream - create new stream
      const newStream = new MediaStream([track]);
      setupStreamListeners(newStream);
      updateRemoteStream(newStream);
    }
  };
  
  // Connection state management
  peerConnection.onconnectionstatechange = () => {
    console.log('🌐 Connection state:', peerConnection.connectionState);
    manageMonitoring();
  };
  
  peerConnection.oniceconnectionstatechange = () => {
    const state = peerConnection.iceConnectionState;
    console.log('🔌 ICE connection state:', state);
    
    if (state === 'connected' || state === 'completed') {
      console.log('✅ WebRTC connection established!');
      manageMonitoring();
    } else if (state === 'failed' || state === 'disconnected') {
      console.error('❌ WebRTC connection failed');
    }
  };
  
  // Initialize monitoring if already connected
  manageMonitoring();
};

/**
 * Cleanup media stream
 */
export const cleanupStream = (stream) => {
  if (stream) {
    stream.getTracks().forEach((track) => {
      track.stop();
    });
  }
};

/**
 * Cleanup peer connection
 */
export const cleanupPeerConnection = (peerConnection) => {
  if (peerConnection) {
    peerConnection.onicecandidate = null;
    peerConnection.ontrack = null;
    peerConnection.oniceconnectionstatechange = null;
    peerConnection.close();
  }
};

/**
 * Check if WebRTC is supported
 */
export const isWebRTCSupported = () => {
  return !!(
    typeof RTCPeerConnection !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia
  );
};

/**
 * Check if video is supported
 */
export const isVideoSupported = () => {
  return isWebRTCSupported() && 
         navigator.mediaDevices.getSupportedConstraints().video;
};

/**
 * Format call duration (seconds to MM:SS)
 */
export const formatCallDuration = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Setup connection state monitoring
 */
export const setupConnectionStateHandler = (peerConnection, onStateChange) => {
  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    console.log('Connection state:', state);
    
    if (onStateChange) {
      onStateChange(state);
    }
    
    if (state === 'failed') {
      console.error('Peer connection failed');
    }
  };
};
