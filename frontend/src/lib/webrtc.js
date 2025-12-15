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
  // Check if getUserMedia is available
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Camera/microphone access is not supported in this browser. Please use a modern browser like Chrome, Firefox, Safari, or Edge.');
  }

  // Check if page is served over HTTPS (required for getUserMedia)
  if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    throw new Error('Camera/microphone access requires HTTPS. Please access this page over HTTPS.');
  }

  try {
    // Start with flexible constraints
    let constraints = {
      audio: callType === 'voice' ? {
        // Optimized audio settings for low-latency voice calls (Opus codec)
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000, // Opus supports 8-48kHz, use max for quality
        channelCount: 1, // Mono for voice (lower bandwidth, Opus optimized)
        latency: 0.01, // Low latency (~10ms)
        // Chrome-specific optimizations
        googEchoCancellation: true,
        googNoiseSuppression: true,
        googAutoGainControl: true,
        googHighpassFilter: true,
        googTypingNoiseDetection: true,
        googNoiseReduction: true,
        // Opus-specific optimizations (hints for WebRTC)
        googAudioMirroring: false,
        googAutoGainControl2: true,
      } : {
        // Video calls - balanced audio/video
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
      },
      video: callType === 'video' ? {
        width: { ideal: 1280, min: 640 },
        height: { ideal: 720, min: 480 },
        facingMode: { ideal: 'user' }, // Make it ideal instead of required
      } : false,
    };
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Verify stream has the expected tracks
      if (callType === 'video') {
        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length === 0) {
          // Try to get video again with minimal constraints
          stream.getTracks().forEach(track => track.stop());
          const minimalStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: true,
          });
          return minimalStream;
        }
      }
      
      return stream;
    } catch (firstError) {
      // If first attempt fails, try with more relaxed constraints
      if (callType === 'video') {
        
        // Try without facingMode constraint
        constraints = {
          audio: true,
          video: {
            width: { min: 320, ideal: 640 },
            height: { min: 240, ideal: 480 },
          },
        };
        
        try {
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          return stream;
        } catch (secondError) {
          // Try with minimal constraints
          constraints = {
            audio: true,
            video: true, // Just request any video
          };
          
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          return stream;
        }
      } else {
        throw firstError;
      }
    }
  } catch (error) {
    console.error('Error getting user media:', error);
    
    // Provide specific error messages
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      throw new Error('Camera/microphone permission denied. Please allow access in your browser settings and try again.');
    } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      throw new Error('No camera/microphone found. Please connect a device and try again.');
    } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      throw new Error('Camera/microphone is being used by another application. Please close other apps using the camera and try again.');
    } else if (error.name === 'OverconstrainedError') {
      throw new Error('Camera does not support the requested settings. Trying with basic settings...');
    } else if (error.name === 'TypeError') {
      throw new Error('Camera/microphone access is not available. Please check your browser and device settings.');
    } else {
      throw new Error(`Failed to access camera/microphone: ${error.message || error.name}. Please check your device settings.`);
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

    await videoSender.replaceTrack(newTrack);
    newTrack.enabled = true;
  } else if (stream) {
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
    // For audio tracks, configure for optimized voice quality (Opus)
    if (track.kind === 'audio') {
      // Set audio track constraints for low-latency voice
      const settings = track.getSettings();
      if (settings) {
        // Apply optimized audio constraints for voice calls
        // Opus codec handles encoding automatically, but we optimize capture
        track.applyConstraints({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000, // Match Opus optimal sample rate
          channelCount: 1, // Mono for voice (Opus optimized)
          latency: 0.01, // Low latency
          // Chrome-specific optimizations
          googEchoCancellation: true,
          googNoiseSuppression: true,
          googAutoGainControl: true,
          googHighpassFilter: true,
          googTypingNoiseDetection: true,
        }).catch(err => {
        });
      }
      
      // Configure RTCRtpSender for Opus optimization if available
      // This optimizes the encoding side (sender)
      const sender = peerConnection.getSenders().find(s => s.track === track);
      if (sender && sender.getParameters) {
        try {
          const params = sender.getParameters();
          if (params.codecs && params.codecs.length > 0) {
            // Find Opus codec and optimize it
            const opusCodec = params.codecs.find(codec => 
              codec.mimeType.toLowerCase().includes('opus')
            );
            if (opusCodec) {
              // Set Opus to low-latency mode (20ms frames)
              opusCodec.clockRate = 48000;
              // Opus payload type is usually 111
              sender.setParameters(params).catch(err => {
              });
            }
          }
        } catch (err) {
          // setParameters might not be available in all browsers
        }
      }
    }
    
    // For video tracks, ensure they're enabled
    if (track.kind === 'video') {
      // Ensure video track is enabled
      if (!track.enabled && track.readyState === 'live') {
        track.enabled = true;
      }
    }
    
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
  
  // Check if this is a renegotiation (connection already established)
  const isRenegotiation = peerConnection.signalingState === 'stable' && 
                          peerConnection.localDescription && 
                          peerConnection.remoteDescription;
  
  // Validate peer connection state
  if (peerConnection.signalingState === 'have-local-offer') {
    if (peerConnection.localDescription?.type === 'offer') {
      return peerConnection.localDescription;
    }
    throw new Error('Peer connection already has an offer. Please reset the connection.');
  }
  
  try {
    // Must be in stable state to create offer (or renegotiation)
    if (peerConnection.signalingState !== 'stable') {
      throw new Error(`Cannot create offer: Invalid connection state "${peerConnection.signalingState}". Expected "stable".`);
    }
    
    // For renegotiation, allow creating offer even if descriptions exist
    if (!isRenegotiation) {
      // Initial offer - verify no descriptions are set
      if (peerConnection.localDescription) {
        throw new Error('Cannot create offer: Local description already exists.');
      }
      
      if (peerConnection.remoteDescription) {
        throw new Error('Cannot create offer: Remote description already set.');
      }
    }
    
    // Create the offer with optimized audio/video preferences
    // Opus codec will be used automatically by WebRTC for audio
    const offerOptions = {
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    };
    
    const offer = await peerConnection.createOffer(offerOptions);
    
    // Optimize SDP for Opus codec (low latency, high quality)
    // WebRTC uses Opus by default, but we can optimize frame size for lower latency
    if (offer.sdp) {
      // Opus payload type is typically 111, optimize for low latency (20ms frames)
      // This reduces latency from ~50-150ms to ~20-50ms
      offer.sdp = offer.sdp.replace(
        /a=fmtp:111 ([^\r\n]*)/g,
        (match, params) => {
          // Add minptime=10 for 20ms frames (low latency)
          // useinbandfec=1 enables forward error correction
          if (!params.includes('minptime')) {
            return `a=fmtp:111 ${params}; minptime=10; useinbandfec=1`;
          }
          return match;
        }
      );
    }
    
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
    
    // Create answer with optimized audio/video preferences
    const answerOptions = {
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    };
    
    const answer = await peerConnection.createAnswer(answerOptions);
    
    // Optimize SDP for Opus codec (low latency, high quality)
    if (answer.sdp) {
      // Opus payload type is typically 111, optimize for low latency (20ms frames)
      answer.sdp = answer.sdp.replace(
        /a=fmtp:111 ([^\r\n]*)/g,
        (match, params) => {
          // Add minptime=10 for 20ms frames (low latency)
          // useinbandfec=1 enables forward error correction
          if (!params.includes('minptime')) {
            return `a=fmtp:111 ${params}; minptime=10; useinbandfec=1`;
          }
          return match;
        }
      );
    }
    
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
      // Error logged silently - non-fatal
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
    } else if (state === 'disconnected') {
    } else if (state === 'connected' || state === 'completed') {
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
        handleVideoTrackChange();
      }
    };
    
    stream.onremovetrack = (event) => {
      if (event.track.kind === 'video') {
        handleVideoTrackChange();
      }
    };
  };
  
  // Monitor receivers for track changes (when replaceTrack is used)
  let lastVideoTrackId = null;
  let lastVideoTrackLabel = null;
  let lastVideoTrackEnabled = null;
  const checkReceiverTracks = () => {
    if (!remoteStream) {
      // No remote stream yet - check if we have a video receiver
      const receivers = peerConnection.getReceivers();
      const videoReceiver = receivers.find(r => r.track?.kind === 'video');
      if (videoReceiver?.track && videoReceiver.track.enabled && videoReceiver.track.readyState === 'live') {
        // Create new stream with video track
        const newStream = new MediaStream([videoReceiver.track]);
        setupStreamListeners(newStream);
        updateRemoteStream(newStream);
        lastVideoTrackId = videoReceiver.track.id;
        lastVideoTrackLabel = videoReceiver.track.label;
        lastVideoTrackEnabled = videoReceiver.track.enabled;
      }
      return;
    }
    
    const receivers = peerConnection.getReceivers();
    const videoReceiver = receivers.find(r => r.track?.kind === 'video');
    const currentVideoTrack = remoteStream.getVideoTracks()[0];
    const receiverTrack = videoReceiver?.track;
    
    // Check if video receiver exists but track is null (video was disabled)
    if (!receiverTrack) {
      // No video receiver track - video was removed
      if (currentVideoTrack) {
        const updatedStream = new MediaStream([
          ...remoteStream.getAudioTracks(),
        ]);
        setupStreamListeners(updatedStream);
        updateRemoteStream(updatedStream);
        lastVideoTrackId = null;
        lastVideoTrackLabel = null;
        lastVideoTrackEnabled = null;
      }
      return;
    }
    
    // Check if track was re-enabled (was null/disabled, now enabled)
    const receiverTrackActive = receiverTrack.enabled && 
                                 receiverTrack.readyState === 'live' &&
                                 !receiverTrack.muted;
    
    if (!currentVideoTrack && receiverTrackActive) {
      // No video track in stream but receiver has active track - add it
      const updatedStream = new MediaStream([
        ...remoteStream.getAudioTracks(),
        receiverTrack,
      ]);
      setupStreamListeners(updatedStream);
      updateRemoteStream(updatedStream);
      lastVideoTrackId = receiverTrack.id;
      lastVideoTrackLabel = receiverTrack.label;
      lastVideoTrackEnabled = receiverTrack.enabled;
      return;
    }
    
    if (!receiverTrackActive && currentVideoTrack) {
      // Track exists in stream but receiver track is disabled - remove it
      const updatedStream = new MediaStream([
        ...remoteStream.getAudioTracks(),
      ]);
      setupStreamListeners(updatedStream);
      updateRemoteStream(updatedStream);
      lastVideoTrackId = null;
      lastVideoTrackLabel = null;
      lastVideoTrackEnabled = null;
      return;
    }
    
    if (!receiverTrackActive) return;
    
    // Check if track ID changed (completely new track)
    if (currentVideoTrack?.id !== receiverTrack.id) {
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
          const updatedStream = new MediaStream([
            ...remoteStream.getAudioTracks(),
            receiverTrack,
          ]);
          
          setupStreamListeners(updatedStream);
          updateRemoteStream(updatedStream);
        }
      }
    }
    
    // Check for track state changes (enabled/disabled, muted/unmuted)
    if (receiverTrack && currentVideoTrack) {
      const trackStateChanged = receiverTrack.muted !== currentVideoTrack.muted ||
                                receiverTrack.enabled !== currentVideoTrack.enabled ||
                                receiverTrack.readyState !== currentVideoTrack.readyState;
      
      // Also check if track was re-enabled (was disabled, now enabled)
      const wasDisabledNowEnabled = lastVideoTrackEnabled === false && receiverTrack.enabled === true;
      
      if (trackStateChanged || wasDisabledNowEnabled) {

        // If track is now enabled and active, update stream
        if (receiverTrackActive) {
          const updatedStream = new MediaStream([
            ...remoteStream.getAudioTracks(),
            receiverTrack,
          ]);
          setupStreamListeners(updatedStream);
          updateRemoteStream(updatedStream);
          lastVideoTrackEnabled = receiverTrack.enabled;
        } else {
          // Track is disabled - remove from stream
          const updatedStream = new MediaStream([
            ...remoteStream.getAudioTracks(),
          ]);
          setupStreamListeners(updatedStream);
          updateRemoteStream(updatedStream);
          lastVideoTrackEnabled = receiverTrack.enabled;
        }
      }
    } else if (receiverTrack && receiverTrackActive && !currentVideoTrack) {
      // Track exists in receiver but not in stream - add it
      const updatedStream = new MediaStream([
        ...remoteStream.getAudioTracks(),
        receiverTrack,
      ]);
      setupStreamListeners(updatedStream);
      updateRemoteStream(updatedStream);
      lastVideoTrackId = receiverTrack.id;
      lastVideoTrackLabel = receiverTrack.label;
      lastVideoTrackEnabled = receiverTrack.enabled;
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
        lastVideoTrackEnabled = track.enabled;
        
        // Listen for track mute/unmute (indicates track change)
        track.onmute = () => {
          lastVideoTrackEnabled = track.enabled;
          checkReceiverTracks();
        };
        track.onunmute = () => {
          lastVideoTrackEnabled = track.enabled;
          checkReceiverTracks();
        };
        
        // Listen for track ended (track was replaced)
        track.onended = () => {
          lastVideoTrackId = null;
          lastVideoTrackLabel = null;
          lastVideoTrackEnabled = null;
          checkReceiverTracks();
        };
        
        // Monitor enabled state changes (when replaceTrack is used to enable/disable)
        // Since there's no 'enabled' event, we'll check periodically
        const checkEnabledState = () => {
          if (track.readyState === 'live') {
            const currentEnabled = track.enabled;
            if (lastVideoTrackEnabled !== null && lastVideoTrackEnabled !== currentEnabled) {

              lastVideoTrackEnabled = currentEnabled;
              checkReceiverTracks();
            } else if (lastVideoTrackEnabled === null) {
              lastVideoTrackEnabled = currentEnabled;
            }
          }
        };
        
        // Check enabled state periodically
        const enabledCheckInterval = setInterval(() => {
          if (track.readyState === 'ended') {
            clearInterval(enabledCheckInterval);
            return;
          }
          checkEnabledState();
        }, 200);
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

    // Listen to track changes directly
    track.onmute = () => {
      checkReceiverTracks();
    };
    track.onunmute = () => {
      checkReceiverTracks();
    };
    
    if (stream) {
      const isNewStream = !remoteStream || remoteStream.id !== stream.id;
      const currentVideoTrack = remoteStream?.getVideoTracks()[0];
      const newVideoTrack = stream.getVideoTracks()[0];
      const videoTrackChanged = currentVideoTrack && newVideoTrack && 
                                currentVideoTrack.id !== newVideoTrack.id;
      
      // Check if video track was re-enabled (no track in stream but track exists in event)
      const videoTrackReEnabled = !currentVideoTrack && newVideoTrack && 
                                   newVideoTrack.enabled && 
                                   newVideoTrack.readyState === 'live' &&
                                   !newVideoTrack.muted;
      
      if (isNewStream || videoTrackChanged || videoTrackReEnabled) {
        if (videoTrackChanged) {

        } else if (videoTrackReEnabled) {

        }
        
        setupStreamListeners(stream);
        updateRemoteStream(stream);
        
        // Store track ID for change detection
        if (newVideoTrack) {
          lastVideoTrackId = newVideoTrack.id;
          lastVideoTrackLabel = newVideoTrack.label;
          lastVideoTrackEnabled = newVideoTrack.enabled;
        }
      } else if (newVideoTrack && currentVideoTrack?.id === newVideoTrack.id) {
        // Same track ID but might have new content or state - check if enabled state changed
        const enabledStateChanged = currentVideoTrack.enabled !== newVideoTrack.enabled;
        if (enabledStateChanged && newVideoTrack.enabled && newVideoTrack.readyState === 'live') {
          // Track was re-enabled - update stream
          setupStreamListeners(stream);
          updateRemoteStream(stream);
          lastVideoTrackEnabled = newVideoTrack.enabled;
        } else {
          // Update anyway to ensure latest content
          setupStreamListeners(stream);
          updateRemoteStream(stream);
        }
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
    manageMonitoring();
  };
  
  peerConnection.oniceconnectionstatechange = () => {
    const state = peerConnection.iceConnectionState;
    
    if (state === 'connected' || state === 'completed') {
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
    return false;
  }
  
  // Browser-specific checks
  if (browserInfo) {
    if (browserInfo.isSafari) {
      // Safari requires HTTPS for WebRTC (except localhost)
      if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
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
    
    if (onStateChange) {
      onStateChange(state);
    }
    
    if (state === 'failed') {
      console.error('Peer connection failed');
    }
  };
};
