/**
 * WebRTC Configuration - Multiple STUN servers for cross-browser compatibility
 * 
 * This configuration includes STUN servers from multiple providers to ensure
 * maximum browser compatibility:
 * - Google STUN servers: Work in Chrome, Firefox, Safari, Edge
 * - Mozilla STUN server: Backup for Firefox
 * - Twilio STUN server: Cross-browser compatible
 * - Open Relay Project: Open-source alternative
 * 
 * Supported Browsers:
 * - Chrome/Chromium (all versions with WebRTC support)
 * - Firefox (all versions with WebRTC support)
 * - Safari (11+ with WebRTC support, requires HTTPS)
 * - Microsoft Edge (all versions with WebRTC support)
 * - Opera (all versions with WebRTC support)
 * 
 * Note: For production, you should add TURN servers to handle NAT traversal
 * when STUN servers alone cannot establish a connection.
 */
// Create a clean, validated RTC configuration
// Using minimal, well-tested STUN servers to avoid configuration errors
const getRTCConfiguration = () => {
  // Use only the most reliable STUN servers in a simple format
  const iceServers = [
    // Primary Google STUN server (most reliable)
    { urls: 'stun:stun.l.google.com:19302' },
    // Backup Google STUN servers
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];

  return {
    iceServers: iceServers,
    iceCandidatePoolSize: 10,
  };
};

export const RTC_CONFIGURATION = getRTCConfiguration();

/**
 * Create a new RTCPeerConnection with configuration
 * @returns {RTCPeerConnection}
 * @throws {Error} If WebRTC is not supported or configuration is invalid
 */
export const createPeerConnection = () => {
  // Validate WebRTC support
  if (typeof RTCPeerConnection === 'undefined') {
    throw new Error('WebRTC is not supported in this browser. Please use a modern browser like Chrome, Firefox, Safari, or Edge.');
  }

  // Try multiple configuration strategies
  const configs = [
    // Strategy 1: Full configuration
    getRTCConfiguration(),
    // Strategy 2: Single reliable STUN server
    {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      iceCandidatePoolSize: 10,
    },
    // Strategy 3: Minimal configuration
    {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    },
    // Strategy 4: Empty configuration (browser will use defaults)
    {
      iceServers: [],
    },
  ];

  // Try each configuration until one works
  for (let i = 0; i < configs.length; i++) {
    try {
      const pc = new RTCPeerConnection(configs[i]);
      
      // Set up error handlers
      pc.onerror = (error) => {
        console.error('RTCPeerConnection error:', error);
      };

      return pc;
    } catch (error) {
      // If this is the last config, throw the error
      if (i === configs.length - 1) {
        console.error('All RTCPeerConnection configurations failed:', error);
        throw new Error('Failed to initialize video call. Please refresh the page and try again.');
      }
      // Otherwise, try next configuration
      continue;
    }
  }

  // Should never reach here, but just in case
  throw new Error('Failed to create peer connection');
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
  // Check if offer already exists
  if (peerConnection.localDescription?.type === 'offer') {
    return peerConnection.localDescription;
  }
  
  // Validate peer connection state
  if (peerConnection.signalingState === 'have-local-offer') {
    if (peerConnection.localDescription?.type === 'offer') {
      return peerConnection.localDescription;
    }
    throw new Error('Peer connection already has an offer. Please reset the connection.');
  }
  
  try {
    // Must be in stable state to create offer
    if (peerConnection.signalingState !== 'stable') {
      throw new Error(`Cannot create offer: Invalid connection state "${peerConnection.signalingState}". Expected "stable".`);
    }
    
    // Verify no descriptions are set
    if (peerConnection.localDescription) {
      throw new Error('Cannot create offer: Local description already exists.');
    }
    
    if (peerConnection.remoteDescription) {
      throw new Error('Cannot create offer: Remote description already set.');
    }
    
    // Create the offer
    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    
    // Verify state is still stable before setting
    if (peerConnection.signalingState !== 'stable' || peerConnection.localDescription) {
      if (peerConnection.localDescription?.type === 'offer') {
        return peerConnection.localDescription;
      }
      throw new Error('Connection state changed during offer creation.');
    }
    
    // Set local description
    try {
      await peerConnection.setLocalDescription(offer);
      return offer;
    } catch (setError) {
      // Handle case where offer was set concurrently
      if (peerConnection.localDescription?.type === 'offer') {
        return peerConnection.localDescription;
      }
      
      // Handle m-lines error (indicates offer already exists)
      if (setError.message?.includes('m-lines') || setError.message?.includes('order')) {
        if (peerConnection.localDescription?.type === 'offer') {
          return peerConnection.localDescription;
        }
        throw new Error('Failed to create offer: Connection may already be established.');
      }
      
      throw setError;
    }
  } catch (error) {
    // Provide user-friendly error message
    const errorMessage = error.message || 'Failed to create call offer';
    
    if (errorMessage.includes('state') || errorMessage.includes('description')) {
      throw new Error('Call connection error. Please try again.');
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
    // Check if answer already exists
    if (peerConnection.localDescription?.type === 'answer' && 
        peerConnection.signalingState === 'stable') {
      return peerConnection.localDescription;
    }
    
    // Check if remote offer is already set
    const hasRemoteOffer = peerConnection.remoteDescription?.type === 'offer';
    
    // Set remote description (the offer) if not already set
    if (!hasRemoteOffer) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    } else {
      // Verify it's the same offer
      if (peerConnection.remoteDescription.sdp !== offer.sdp) {
        throw new Error('Remote description already set with different offer');
      }
      // If same offer and connection is stable, return existing answer
      if (peerConnection.signalingState === 'stable' && peerConnection.localDescription?.type === 'answer') {
        return peerConnection.localDescription;
      }
    }
    
    // Check if answer already exists
    if (peerConnection.localDescription?.type === 'answer') {
      return peerConnection.localDescription;
    }
    
    // Verify remote description is properly set
    if (!peerConnection.remoteDescription || peerConnection.remoteDescription.type !== 'offer') {
      throw new Error('Remote description (offer) not properly set');
    }
    
    // Verify we're in the correct state to create an answer
    // Allow 'have-remote-offer' or 'stable' (if connection already established)
    const validStates = ['have-remote-offer', 'stable'];
    if (!validStates.includes(peerConnection.signalingState)) {
      // If connection is stable and we have an answer, return it
      if (peerConnection.signalingState === 'stable' && peerConnection.localDescription?.type === 'answer') {
        return peerConnection.localDescription;
      }
      // If we're in 'have-local-offer', we might be processing duplicate offers
      if (peerConnection.signalingState === 'have-local-offer') {
        // Wait a bit and check again (race condition handling)
        await new Promise(resolve => setTimeout(resolve, 100));
        if (peerConnection.signalingState === 'have-remote-offer' || peerConnection.signalingState === 'stable') {
          // State changed, continue
        } else {
          throw new Error(`Cannot create answer: Invalid connection state "${peerConnection.signalingState}". Expected "have-remote-offer".`);
        }
      } else {
        throw new Error(`Cannot create answer: Invalid connection state "${peerConnection.signalingState}". Expected "have-remote-offer".`);
      }
    }
    
    // Create answer
    const answer = await peerConnection.createAnswer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    
    // Set local description (the answer)
    await peerConnection.setLocalDescription(answer);
    
    return answer;
  } catch (error) {
    // Provide user-friendly error message
    const errorMessage = error.message || 'Failed to create call answer';
    
    // If connection is already stable, don't throw error
    if (peerConnection.signalingState === 'stable') {
      if (peerConnection.localDescription?.type === 'answer') {
        return peerConnection.localDescription;
      }
    }
    
    // Check for specific error types
    if (errorMessage.includes('state') || errorMessage.includes('description')) {
      // If it's a state error but connection might still work, log warning instead
      if (peerConnection.signalingState === 'stable') {
        console.warn('Connection state warning:', errorMessage);
        return peerConnection.localDescription || null;
      }
      throw new Error('Call connection error. Please try again.');
    }
    
    throw error;
  }
};

/**
 * Set remote description (for offer or answer)
 */
export const setRemoteDescription = async (peerConnection, description) => {
  try {
    // If connection is already stable, check if description is already set
    if (peerConnection.signalingState === 'stable') {
      if (peerConnection.remoteDescription?.type === description.type) {
        return; // Already set correctly
      }
      return; // Connection established, skip
    }
    
    // Check if same description is already set
    if (peerConnection.remoteDescription) {
      if (peerConnection.remoteDescription.sdp === description.sdp &&
          peerConnection.remoteDescription.type === description.type) {
        return; // Already set
      }
    }
    
    await peerConnection.setRemoteDescription(new RTCSessionDescription(description));
  } catch (error) {
    // If connection is already stable, ignore the error
    if (peerConnection.signalingState === 'stable') {
      return;
    }
    
    // Provide user-friendly error
    if (error.message?.includes('state') || error.message?.includes('stable')) {
      throw new Error('Call connection error. Please try again.');
    }
    
    throw error;
  }
};

/**
 * Add ICE candidate to peer connection
 * @param {RTCPeerConnection} peerConnection
 * @param {RTCIceCandidateInit} candidate
 */
export const addIceCandidate = async (peerConnection, candidate) => {
  try {
    if (!candidate) return;
    
    // Skip if connection is closed or failed
    if (peerConnection.connectionState === 'closed' || 
        peerConnection.iceConnectionState === 'failed') {
      return;
    }
    
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (error) {
    // ICE candidate errors are non-fatal - connection can still work
    // Only log if it's not a common expected error
    if (!error.message?.includes('not found') && 
        !error.message?.includes('already added') &&
        peerConnection.connectionState !== 'closed') {
      console.warn('ICE candidate error (non-fatal):', error.message);
    }
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
  
  // Handle ICE connection state changes
  peerConnection.oniceconnectionstatechange = () => {
    const state = peerConnection.iceConnectionState;
    
    if (state === 'failed') {
      console.warn('ICE connection failed - connection may not work');
    } else if (state === 'disconnected') {
      console.warn('ICE connection disconnected');
    } else if (state === 'connected' || state === 'completed') {
      console.log('ICE connection established');
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
  let lastVideoTrackId = null;
  let lastVideoTrackLabel = null;
  const checkReceiverTracks = () => {
    if (!remoteStream) return;
    
    const receivers = peerConnection.getReceivers();
    const videoReceiver = receivers.find(r => r.track?.kind === 'video');
    const currentVideoTrack = remoteStream.getVideoTracks()[0];
    const receiverTrack = videoReceiver?.track;
    
    if (!receiverTrack) return;
    
    // Check if track ID changed (completely new track)
    if (currentVideoTrack?.id !== receiverTrack.id) {
      console.log('🔄 Video track changed via receiver (ID changed):', {
        old: currentVideoTrack?.label || 'none',
        new: receiverTrack.label,
      });
      
      // Create updated stream with new video track
      const updatedStream = new MediaStream([
        ...remoteStream.getAudioTracks(),
        receiverTrack,
      ]);
      
      setupStreamListeners(updatedStream);
      updateRemoteStream(updatedStream);
      lastVideoTrackId = receiverTrack.id;
      lastVideoTrackLabel = receiverTrack.label;
      return;
    } 
    
    // Check if track label changed (indicates screen share switch)
    // Screen share tracks typically have different labels like "screen" or contain "screen"
    if (currentVideoTrack && receiverTrack.label !== currentVideoTrack.label) {
      console.log('🔄 Video track label changed (screen share?):', {
        old: currentVideoTrack.label,
        new: receiverTrack.label,
      });
      
      const updatedStream = new MediaStream([
        ...remoteStream.getAudioTracks(),
        receiverTrack,
      ]);
      
      setupStreamListeners(updatedStream);
      updateRemoteStream(updatedStream);
      lastVideoTrackLabel = receiverTrack.label;
      return;
    }
    
    // Check if track was replaced (same ID but different content)
    // This happens when replaceTrack() is called - track ID might stay same
    if (receiverTrack.id === currentVideoTrack?.id) {
      // Always update to ensure latest track content is used
      // This handles cases where replaceTrack() doesn't change the track ID
      if (lastVideoTrackLabel !== receiverTrack.label) {
        console.log('🔄 Video track updated (label changed):', {
          old: lastVideoTrackLabel,
          new: receiverTrack.label,
        });
        
        const updatedStream = new MediaStream([
          ...remoteStream.getAudioTracks(),
          receiverTrack,
        ]);
        
        setupStreamListeners(updatedStream);
        updateRemoteStream(updatedStream);
        lastVideoTrackLabel = receiverTrack.label;
      }
      
      // Also check if track settings changed (dimensions, frame rate, etc.)
      // Screen shares often have different settings
      const currentSettings = currentVideoTrack.getSettings?.();
      const receiverSettings = receiverTrack.getSettings?.();
      
      if (currentSettings && receiverSettings) {
        const settingsChanged = 
          currentSettings.width !== receiverSettings.width ||
          currentSettings.height !== receiverSettings.height ||
          currentSettings.frameRate !== receiverSettings.frameRate;
        
        if (settingsChanged) {
          console.log('🔄 Video track settings changed (possible screen share):', {
            old: { width: currentSettings.width, height: currentSettings.height },
            new: { width: receiverSettings.width, height: receiverSettings.height },
          });
          
          const updatedStream = new MediaStream([
            ...remoteStream.getAudioTracks(),
            receiverTrack,
          ]);
          
          setupStreamListeners(updatedStream);
          updateRemoteStream(updatedStream);
        }
      }
    }
    
    // Check for track state changes
    if (receiverTrack && currentVideoTrack) {
      const trackStateChanged = receiverTrack.muted !== currentVideoTrack.muted ||
                                receiverTrack.enabled !== currentVideoTrack.enabled ||
                                receiverTrack.readyState !== currentVideoTrack.readyState;
      
      if (trackStateChanged) {
        console.log('🔄 Video track state changed:', {
          muted: receiverTrack.muted,
          enabled: receiverTrack.enabled,
          readyState: receiverTrack.readyState,
        });
        
        // Update stream to reflect changes
        const updatedStream = new MediaStream([
          ...remoteStream.getAudioTracks(),
          receiverTrack,
        ]);
        setupStreamListeners(updatedStream);
        updateRemoteStream(updatedStream);
      }
    }
  };
  
  // Setup receiver track change listeners
  const setupReceiverTrackListeners = () => {
    const receivers = peerConnection.getReceivers();
    receivers.forEach(receiver => {
      if (receiver.track?.kind === 'video') {
        const track = receiver.track;
        
        // Store initial track info
        if (track.id) {
          lastVideoTrackId = track.id;
        }
        if (track.label) {
          lastVideoTrackLabel = track.label;
        }
        
        // Listen for track mute/unmute (indicates track change)
        track.onmute = () => {
          console.log('🔄 Remote video track muted');
          checkReceiverTracks();
        };
        track.onunmute = () => {
          console.log('🔄 Remote video track unmuted');
          checkReceiverTracks();
        };
        
        // Listen for track ended (track was replaced)
        track.onended = () => {
          console.log('🔄 Remote video track ended');
          checkReceiverTracks();
        };
      }
    });
  };
  
  // Start/stop monitoring based on connection state
  const manageMonitoring = () => {
    const isActive = peerConnection.connectionState === 'connected' || 
                     peerConnection.connectionState === 'connecting';
    
    if (isActive) {
      if (!trackCheckInterval) {
        // Faster polling for screen share detection
        trackCheckInterval = setInterval(checkReceiverTracks, 250);
      }
      // Setup receiver listeners
      setupReceiverTrackListeners();
    } else if (trackCheckInterval) {
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
      enabled: track.enabled,
      muted: track.muted,
    });
    
    // Listen to track changes directly
    track.onmute = () => {
      console.log('🔄 Remote track muted:', track.kind, track.label);
      checkReceiverTracks();
    };
    track.onunmute = () => {
      console.log('🔄 Remote track unmuted:', track.kind, track.label);
      checkReceiverTracks();
    };
    
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
        
        // Store track ID for change detection
        if (newVideoTrack) {
          lastVideoTrackId = newVideoTrack.id;
        }
      } else if (newVideoTrack && currentVideoTrack?.id === newVideoTrack.id) {
        // Same track ID but might have new content - update anyway
        console.log('🔄 Same track ID, but updating stream to ensure latest content');
        setupStreamListeners(stream);
        updateRemoteStream(stream);
      }
    } else if (track) {
      // Track without stream - create new stream
      const newStream = new MediaStream([track]);
      setupStreamListeners(newStream);
      updateRemoteStream(newStream);
      
      if (track.kind === 'video') {
        lastVideoTrackId = track.id;
      }
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
      // Force immediate track check
      setTimeout(() => {
        checkReceiverTracks();
        setupReceiverTrackListeners();
      }, 100);
    } else if (state === 'failed' || state === 'disconnected') {
      console.error('❌ WebRTC connection failed');
    }
  };
  
  // Initialize monitoring if already connected
  manageMonitoring();
  
  // Also check immediately if connection is already established
  if (peerConnection.connectionState === 'connected' || 
      peerConnection.iceConnectionState === 'connected' ||
      peerConnection.iceConnectionState === 'completed') {
    setTimeout(() => {
      checkReceiverTracks();
      setupReceiverTrackListeners();
    }, 100);
  }
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
 * Detect browser type for compatibility
 */
export const getBrowserInfo = () => {
  if (typeof navigator === 'undefined') return null;
  
  const ua = navigator.userAgent.toLowerCase();
  const isChrome = ua.includes('chrome') && !ua.includes('edg');
  const isFirefox = ua.includes('firefox');
  const isSafari = ua.includes('safari') && !ua.includes('chrome');
  const isEdge = ua.includes('edg');
  const isOpera = ua.includes('opera') || ua.includes('opr');
  
  return {
    isChrome,
    isFirefox,
    isSafari,
    isEdge,
    isOpera,
    userAgent: ua,
  };
};

/**
 * Check if WebRTC is supported
 */
export const isWebRTCSupported = () => {
  const browserInfo = getBrowserInfo();
  
  // Check basic WebRTC support
  const hasRTCPeerConnection = typeof RTCPeerConnection !== 'undefined';
  const hasMediaDevices = typeof navigator !== 'undefined' &&
                          navigator.mediaDevices &&
                          navigator.mediaDevices.getUserMedia;
  
  if (!hasRTCPeerConnection || !hasMediaDevices) {
    console.warn('WebRTC not fully supported in this browser');
    return false;
  }
  
  // Browser-specific checks
  if (browserInfo) {
    if (browserInfo.isSafari) {
      // Safari requires HTTPS for WebRTC (except localhost)
      if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        console.warn('Safari requires HTTPS for WebRTC');
        return false;
      }
    }
  }
  
  return true;
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
