// Safely import WebRTC - handle case when native module is not available (e.g., Expo Go)
let RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, mediaDevices, MediaStream;
let isWebRTCAvailable = false;

try {
  const webrtc = require('react-native-webrtc');
  RTCPeerConnection = webrtc.RTCPeerConnection;
  RTCSessionDescription = webrtc.RTCSessionDescription;
  RTCIceCandidate = webrtc.RTCIceCandidate;
  mediaDevices = webrtc.mediaDevices;
  MediaStream = webrtc.MediaStream;
  isWebRTCAvailable = true;
  console.log('✅ WebRTC native module loaded successfully');
} catch (error) {
  console.warn('⚠️ WebRTC native module not available:', error.message);
  console.warn('⚠️ Voice/Video calls will not work. Use a development build (not Expo Go) to enable WebRTC.');
  isWebRTCAvailable = false;
}

export const isWebRTCSupported = () => isWebRTCAvailable;

// Export MediaStream if available, otherwise create a placeholder
export { MediaStream };

/**
 * WebRTC Configuration for React Native
 */
const getRTCConfiguration = () => {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
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
 * Create a new RTCPeerConnection
 */
export const createPeerConnection = () => {
  if (!isWebRTCAvailable) {
    throw new Error('WebRTC is not available. Please use a development build (not Expo Go) to enable voice/video calls.');
  }
  try {
    const pc = new RTCPeerConnection(RTC_CONFIGURATION);
    return pc;
  } catch (error) {
    console.error('Failed to create peer connection:', error);
    throw new Error('Failed to initialize call. Please try again.');
  }
};

/**
 * Get user media stream (audio/video) for React Native
 */
export const getLocalStream = async (callType) => {
  if (!isWebRTCAvailable) {
    throw new Error('WebRTC is not available. Please use a development build (not Expo Go) to enable voice/video calls.');
  }
  try {
    console.log('🎤 Requesting media stream for call type:', callType);
    
    const constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: callType === 'video' ? {
        width: { ideal: 1280, min: 640 },
        height: { ideal: 720, min: 480 },
        facingMode: 'user',
      } : false,
    };

    console.log('🎤 Media constraints:', JSON.stringify(constraints, null, 2));
    const stream = await mediaDevices.getUserMedia(constraints);
    console.log('✅ Media stream obtained:', {
      audioTracks: stream.getAudioTracks().length,
      videoTracks: stream.getVideoTracks().length,
    });
    return stream;
  } catch (error) {
    console.error('❌ Error getting user media:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
    });
    
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      throw new Error('Camera/microphone permission denied. Please allow access in your device settings.');
    } else if (error.name === 'NotFoundError') {
      throw new Error('No camera/microphone found. Please connect a device and try again.');
    } else if (error.name === 'NotReadableError') {
      throw new Error('Camera/microphone is being used by another application.');
    } else {
      throw new Error(`Failed to access camera/microphone: ${error.message || error.name}`);
    }
  }
};

/**
 * Create WebRTC offer
 */
export const createOffer = async (peerConnection, localStream) => {
  if (!isWebRTCAvailable) {
    throw new Error('WebRTC is not available. Please use a development build (not Expo Go) to enable voice/video calls.');
  }
  try {
    // Add local stream tracks to peer connection
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });

    await peerConnection.setLocalDescription(offer);
    return offer;
  } catch (error) {
    console.error('Error creating offer:', error);
    throw new Error('Failed to create call offer. Please try again.');
  }
};

/**
 * Create WebRTC answer
 */
export const createAnswer = async (peerConnection, localStream, offer) => {
  if (!isWebRTCAvailable) {
    throw new Error('WebRTC is not available. Please use a development build (not Expo Go) to enable voice/video calls.');
  }
  try {
    // Add local stream tracks to peer connection
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    return answer;
  } catch (error) {
    console.error('Error creating answer:', error);
    throw new Error('Failed to answer call. Please try again.');
  }
};

/**
 * Set remote description
 */
export const setRemoteDescription = async (peerConnection, description) => {
  if (!isWebRTCAvailable) {
    throw new Error('WebRTC is not available. Please use a development build (not Expo Go) to enable voice/video calls.');
  }
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(description));
  } catch (error) {
    console.error('Error setting remote description:', error);
    throw new Error('Failed to set remote description.');
  }
};

/**
 * Add ICE candidate
 */
export const addIceCandidate = async (peerConnection, candidate) => {
  if (!isWebRTCAvailable) {
    return; // Silently fail for ICE candidates if WebRTC not available
  }
  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (error) {
    console.error('Error adding ICE candidate:', error);
    // Don't throw - ICE candidate errors are often non-fatal
  }
};
