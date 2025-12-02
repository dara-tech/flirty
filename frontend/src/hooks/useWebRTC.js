import { useEffect, useRef } from "react";
import { useCallStore } from "../store/useCallStore";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import {
  createPeerConnection,
  getLocalStream,
  getDisplayMedia,
  addLocalStreamTracks,
  replaceVideoTrack,
  createOffer,
  createAnswer,
  setRemoteDescription,
  addIceCandidate,
  setupIceCandidateHandler,
  setupRemoteStreamHandler,
  cleanupStream,
  cleanupPeerConnection,
  isWebRTCSupported,
} from "../lib/webrtc";
import toast from "react-hot-toast";

const useWebRTC = () => {
  const {
    callState,
    callType,
    callId,
    caller,
    receiver,
    localStream,
    remoteStream,
    peerConnection,
    setPeerConnection,
    setLocalStream,
    setRemoteStream,
    setCallState,
    endCall,
    isScreenSharing,
    screenShareStream,
    setScreenSharing,
  } = useCallStore();
  
  const { socket } = useAuthStore();
  const isCallerRef = useRef(false);
  const offerCreatedRef = useRef(false);
  const pendingAnswerRef = useRef(null); // Buffer answer if received before offer is set
  const answerCreatedRef = useRef(false); // Track if answer has been created
  const processingOfferRef = useRef(false); // Prevent duplicate offer processing
  
  // Check WebRTC support
  useEffect(() => {
    if (!isWebRTCSupported()) {
      toast.error("WebRTC is not supported in this browser");
    }
  }, []);
  
  // Handle incoming call signaling events
  useEffect(() => {
    if (!socket) return;
    
    // Incoming call
    const handleIncomingCall = ({ callId, callerId, callerInfo, callType }) => {
      const currentState = useCallStore.getState();
      
      // Prevent duplicate incoming call processing
      // If we already have an incoming call with the same callId, ignore it
      if (currentState.callState === 'ringing' && currentState.callId === callId) {
        console.log('⚠️ Duplicate incoming call event ignored:', callId);
        return;
      }
      
      // If there's already an active call, ignore new incoming calls
      if (currentState.callState !== 'idle' && currentState.callState !== 'ringing') {
        console.log('⚠️ Ignoring incoming call - another call is active');
        return;
      }
      
      const { authUser } = useAuthStore.getState();
      
      useCallStore.setState({
        callId,
        callType,
        callState: 'ringing',
        caller: callerInfo,
        receiver: {
          userId: authUser._id,
          fullname: authUser.fullname,
          profilePic: authUser.profilePic,
        },
      });
      
      console.log('📞 Incoming call received:', callId, callerInfo.fullname);
    };
    
    // Call ringing (for caller)
    const handleCallRinging = () => {
      if (callState === 'calling') {
        setCallState('ringing');
      }
    };
    
    // Call answered
    const handleCallAnswered = async ({ callId: answeredCallId }) => {
      if (answeredCallId !== callId) return;
      
      setCallState('in-call');
      useCallStore.getState().startCallTimer();
      
      // Start WebRTC connection as caller - create and send offer
      if (isCallerRef.current) {
        // Use a flag to prevent duplicate processing
        if (offerCreatedRef.current) {
          console.log('Offer already created, skipping duplicate call:answered event');
          return;
        }
        
        try {
          const currentState = useCallStore.getState();
          
          // Clean up any existing peer connection
          if (currentState.peerConnection) {
            try {
              currentState.peerConnection.close();
            } catch (e) {
              // Ignore cleanup errors
            }
            useCallStore.getState().setPeerConnection(null);
          }
          
          // Ensure we have media stream
          let stream = currentState.localStream;
          if (!stream) {
            stream = await getLocalStream(currentState.callType);
            useCallStore.getState().setLocalStream(stream);
          }
          
          // Create new peer connection
          const pc = createPeerConnection();
          
          // Add tracks and setup handlers
          addLocalStreamTracks(pc, stream);
          setupRemoteStreamHandler(pc, (remoteStream) => {
            useCallStore.getState().setRemoteStream(remoteStream);
          });
          
          // Store peer connection
          useCallStore.getState().setPeerConnection(pc);
          
          const receiverId = currentState.receiver?.userId;
          
          if (pc && socket && receiverId && stream) {
            // Setup ICE candidate handler
            setupIceCandidateHandler(pc, socket, callId, receiverId);
            
            // Set flag to prevent duplicate offers
            offerCreatedRef.current = true;
            
            // Create and send offer (createOffer handles all validation)
            const offer = await createOffer(pc);
            
            if (!offer) {
              throw new Error('Failed to create call offer');
            }
            
            socket.emit('webrtc:offer', {
              callId,
              offer,
              receiverId: receiverId,
            });
          } else {
            toast.error("Failed to initialize call");
          }
        } catch (error) {
          offerCreatedRef.current = false;
          console.error('Error creating offer:', error);
          toast.error(error.message || "Failed to establish connection");
          endCall();
        }
      }
    };
    
    // Call rejected
    const handleCallRejected = ({ callId: rejectedCallId, reason }) => {
      if (rejectedCallId !== callId) return;
      
      toast.error(reason || "Call rejected");
      endCall();
    };
    
    // Call ended
    const handleCallEnded = ({ callId: endedCallId }) => {
      if (endedCallId !== callId) return;
      
      endCall();
    };
    
    // Call failed
    const handleCallFailed = ({ callId: failedCallId, reason }) => {
      if (failedCallId !== callId) return;
      
      toast.error(reason || "Call failed");
      endCall();
    };
    
    // WebRTC Offer received
    const handleWebRTCOffer = async ({ callId: offerCallId, offer, callerId: offerCallerId }) => {
      if (offerCallId !== callId) return;
      
      // Prevent duplicate processing
      if (processingOfferRef.current) {
        console.log('Already processing offer, ignoring duplicate');
        return;
      }
      
      // If answer already created, ignore
      if (answerCreatedRef.current) {
        console.log('Answer already created, ignoring duplicate offer');
        return;
      }
      
      processingOfferRef.current = true;
      
      try {
        // Get or create peer connection
        let pc = peerConnection || useCallStore.getState().peerConnection;
        
        // If peer connection doesn't exist yet, create it (fallback)
        if (!pc) {
          try {
            const currentState = useCallStore.getState();
            let stream = currentState.localStream;
            
            if (!stream) {
              stream = await getLocalStream(currentState.callType);
              useCallStore.getState().setLocalStream(stream);
            }
            
            pc = createPeerConnection();
            useCallStore.getState().setPeerConnection(pc);
            
            addLocalStreamTracks(pc, stream);
            
            // Setup handlers
            setupRemoteStreamHandler(pc, (remoteStream) => {
              useCallStore.getState().setRemoteStream(remoteStream);
            });
          } catch (error) {
            console.error('Error initializing call on offer receive:', error);
            
            // If it's a configuration error, try with minimal config
            if (error.message?.includes('Configuration') || error.message?.includes('Bad Configuration')) {
              try {
                const currentState = useCallStore.getState();
                const fallbackConfig = {
                  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
                };
                pc = new RTCPeerConnection(fallbackConfig);
                useCallStore.getState().setPeerConnection(pc);
                
                const stream = currentState.localStream || await getLocalStream(currentState.callType);
                if (stream) {
                  addLocalStreamTracks(pc, stream);
                  setupRemoteStreamHandler(pc, (remoteStream) => {
                    useCallStore.getState().setRemoteStream(remoteStream);
                  });
                }
              } catch (fallbackError) {
                toast.error("Failed to establish connection");
                processingOfferRef.current = false;
                endCall();
                return;
              }
            } else {
              toast.error(error.message || "Failed to initialize call");
              processingOfferRef.current = false;
              endCall();
              return;
            }
          }
        }
        
        // Setup ICE candidate handler if not already set up (with callerId)
        if (socket && offerCallerId) {
          // Check if handler is already set up by checking if onicecandidate exists
          if (!pc.onicecandidate) {
            setupIceCandidateHandler(pc, socket, callId, offerCallerId);
          }
        }
        
        // Check if answer already created for this peer connection
        if (pc.localDescription && pc.localDescription.type === 'answer') {
          console.log('Answer already exists, skipping');
          answerCreatedRef.current = true;
          processingOfferRef.current = false;
          return;
        }
        
        // Answer the call
        const answer = await createAnswer(pc, offer);
        answerCreatedRef.current = true;
        
        if (socket && answer) {
          socket.emit('webrtc:answer', {
            callId,
            answer,
            callerId: offerCallerId,
          });
        }
      } catch (error) {
        console.error('Error handling offer:', error);
        
        // Check if connection is already established (stable state)
        if (pc.signalingState === 'stable') {
          // Connection is stable, answer might already exist
          if (pc.localDescription?.type === 'answer') {
            // Answer already exists, connection is working
            answerCreatedRef.current = true;
            processingOfferRef.current = false;
            return;
          }
        }
        
        // Handle specific error types
        if (error.message?.includes('already established') || 
            error.message?.includes('stable') ||
            error.message?.includes('Invalid connection state')) {
          // Connection state issue - might be a race condition
          // Check if connection is actually working
          if (pc.signalingState === 'stable' || pc.connectionState === 'connected' || pc.connectionState === 'connecting') {
            // Connection seems to be working, don't end call
            console.warn('Connection state warning, but connection appears to be working');
            answerCreatedRef.current = true;
            processingOfferRef.current = false;
            return;
          }
        }
        
        // Only end call if it's a critical error
        if (error.message?.includes('Configuration') || error.message?.includes('Bad Configuration')) {
          // Configuration error - try to continue, connection might still work
          toast.error("Connection issue. Attempting to continue...");
        } else if (error.message?.includes('Call connection error')) {
          // Connection error - might be recoverable
          console.warn('Call connection error, but continuing...');
          // Don't end call immediately, let it try to recover
        } else {
          // Critical error - end call
          toast.error(error.message || "Failed to answer call");
          endCall();
        }
      } finally {
        processingOfferRef.current = false;
      }
    };
    
    // WebRTC Answer received
    const handleWebRTCAnswer = async ({ callId: answerCallId, answer }) => {
      if (answerCallId !== callId) return;
      
      // Check if we're the caller (should have local description set)
      if (!isCallerRef.current) {
        // We're the receiver, shouldn't receive an answer
        console.warn('Received answer but we are not the caller');
        return;
      }
      
      const pc = peerConnection || useCallStore.getState().peerConnection;
      if (!pc) {
        // Buffer the answer until peer connection is ready
        pendingAnswerRef.current = answer;
        return;
      }
      
      // Check if local description is set (should be if we're the caller)
      if (!pc.localDescription) {
        // Buffer the answer until local description is set
        pendingAnswerRef.current = answer;
        return;
      }
      
      // Check connection state - should be "have-local-offer" to set remote answer
      // If already stable, connection is established
      if (pc.signalingState === 'stable') {
        console.log('Connection already stable, answer already processed');
        pendingAnswerRef.current = null;
        return;
      }
      
      // Should be in "have-local-offer" state when setting remote answer
      if (pc.signalingState !== 'have-local-offer') {
        console.warn(`Unexpected signaling state: ${pc.signalingState}, expected have-local-offer`);
        // Buffer and retry later
        pendingAnswerRef.current = answer;
        return;
      }
      
      try {
        await setRemoteDescription(pc, answer);
        pendingAnswerRef.current = null; // Clear buffered answer
      } catch (error) {
        console.error('Error handling answer:', error);
        
        // If connection is already stable, ignore
        if (error.message?.includes('stable') || error.message?.includes('wrong state')) {
          pendingAnswerRef.current = null;
          return;
        }
        
        // Retry after a short delay
        setTimeout(async () => {
          const currentPc = useCallStore.getState().peerConnection;
          if (currentPc && currentPc.signalingState === 'have-local-offer') {
            try {
              await setRemoteDescription(currentPc, answer);
              pendingAnswerRef.current = null;
            } catch (retryError) {
              if (!retryError.message?.includes('stable')) {
                toast.error("Failed to establish connection");
                endCall();
              }
            }
          }
        }, 500);
      }
    };
    
    // ICE Candidate received
    const handleICECandidate = async ({ callId: candidateCallId, candidate, senderId }) => {
      if (candidateCallId !== callId) return;
      
      const pc = peerConnection || useCallStore.getState().peerConnection;
      if (!pc) {
        console.warn('ICE candidate received but no peer connection');
        return;
      }
      
      try {
        // Can add candidates even before remote description is set (they'll be queued)
        await addIceCandidate(pc, candidate);
      } catch (error) {
        // ICE candidate errors are non-fatal - connection can still work
        // Only log unexpected errors
        if (!error.message?.includes('not found') && 
            !error.message?.includes('already added')) {
          console.warn('ICE candidate error (non-fatal):', error.message);
        }
      }
    };
    
    // Register event listeners
    socket.on('call:incoming', handleIncomingCall);
    socket.on('call:ringing', handleCallRinging);
    socket.on('call:answered', handleCallAnswered);
    socket.on('call:rejected', handleCallRejected);
    socket.on('call:ended', handleCallEnded);
    socket.on('call:failed', handleCallFailed);
    socket.on('webrtc:offer', handleWebRTCOffer);
    socket.on('webrtc:answer', handleWebRTCAnswer);
    socket.on('webrtc:ice-candidate', handleICECandidate);
    
    return () => {
      socket.off('call:incoming', handleIncomingCall);
      socket.off('call:ringing', handleCallRinging);
      socket.off('call:answered', handleCallAnswered);
      socket.off('call:rejected', handleCallRejected);
      socket.off('call:ended', handleCallEnded);
      socket.off('call:failed', handleCallFailed);
      socket.off('webrtc:offer', handleWebRTCOffer);
      socket.off('webrtc:answer', handleWebRTCAnswer);
      socket.off('webrtc:ice-candidate', handleICECandidate);
    };
  }, [socket, callId, callState, peerConnection, localStream, receiver, endCall, setCallState]);
  
  // Initialize call (get media stream only - peer connection created later)
  const initializeCall = async (isCaller = false) => {
    try {
      isCallerRef.current = isCaller;
      offerCreatedRef.current = false;
      answerCreatedRef.current = false;
      processingOfferRef.current = false;
      pendingAnswerRef.current = null;
      
      // IMPORTANT: Only get media stream, DO NOT create peer connection here
      // Peer connection will be created when:
      // - Caller: When receiver answers (in handleCallAnswered)
      // - Receiver: When they click answer (in answerCallWithMedia)
      // This ensures completely fresh peer connections with no leftover state
      
      // Clean up any existing peer connection first
      const currentState = useCallStore.getState();
      if (currentState.peerConnection) {
        try {
          currentState.peerConnection.close();
        } catch (e) {
          // Ignore cleanup errors
        }
        useCallStore.getState().setPeerConnection(null);
      }
      
      // Get media stream
      const stream = await getLocalStream(callType);
      setLocalStream(stream);
    } catch (error) {
      console.error('Error initializing call:', error);
      toast.error(error.message || "Failed to start call");
      endCall();
    }
  };
  
  // Initialize call when state changes to 'calling' (only get media, no peer connection yet)
  useEffect(() => {
    if (callState === 'calling' && callType && !localStream) {
      initializeCall(true);
    }
  }, [callState, callType, localStream]);
  
  // Initialize call when answering
  useEffect(() => {
    if (callState === 'ringing' && callType && !localStream && !peerConnection) {
      // Wait for user to answer - initialize when they answer
    }
  }, [callState]);
  
  // Answer call with media
  const answerCallWithMedia = async () => {
    try {
      // First initialize media stream
      await initializeCall(false);
      
      // Create peer connection immediately when answering (not waiting for offer)
      const currentState = useCallStore.getState();
      let stream = currentState.localStream;
      
      if (!stream) {
        stream = await getLocalStream(currentState.callType);
        useCallStore.getState().setLocalStream(stream);
      }
      
      // Create peer connection now so it's ready when offer arrives
      let pc = currentState.peerConnection;
      if (!pc) {
        try {
          pc = createPeerConnection();
        } catch (pcError) {
          console.error('Failed to create peer connection:', pcError);
          // Don't reject call immediately - try to continue without peer connection
          // The offer handler will retry creating the peer connection
          toast.error("Connection error. Please try again.");
          // Still send answer signal - connection might work
        }
        
        if (pc) {
          useCallStore.getState().setPeerConnection(pc);
          
          // Add local stream tracks
          addLocalStreamTracks(pc, stream);
          
          // Setup handlers
          setupRemoteStreamHandler(pc, (remoteStream) => {
            useCallStore.getState().setRemoteStream(remoteStream);
          });
        }
      }
      
      // Send the answer signal to notify caller we've answered
      // This should happen even if peer connection creation failed
      const { answerCall } = useCallStore.getState();
      await answerCall();
    } catch (error) {
      console.error('Error answering call:', error);
      
      // Only reject if it's a critical error (not peer connection config)
      if (error.message?.includes('Configuration') || error.message?.includes('Bad Configuration')) {
        // Try to continue - peer connection will be created when offer arrives
        toast.error("Connection setup issue. Attempting to continue...");
        const { answerCall } = useCallStore.getState();
        try {
          await answerCall();
        } catch (answerError) {
          toast.error("Failed to answer call");
          useCallStore.getState().rejectCall();
        }
      } else {
        toast.error(error.message || "Failed to answer call");
        useCallStore.getState().rejectCall();
      }
    }
  };
  
  // Cleanup on unmount or call end
  useEffect(() => {
    return () => {
      if (callState === 'idle') {
        cleanupStream(localStream);
        cleanupPeerConnection(peerConnection);
      }
    };
  }, [callState]);
  
  // Stop screen sharing and switch back to camera
  const stopScreenShare = async () => {
    try {
      const currentState = useCallStore.getState();
      const pc = currentState.peerConnection;
      const screenShareStream = currentState.screenShareStream;
      
      if (!pc) return;
      
      // Stop screen share tracks
      screenShareStream?.getTracks().forEach(track => track.stop());
      
      // Get camera stream and replace video track
      const cameraStream = await getLocalStream(currentState.callType);
      const videoTrack = cameraStream.getVideoTracks()[0];
      
      if (videoTrack) {
        await replaceVideoTrack(pc, videoTrack, cameraStream);
        setLocalStream(cameraStream);
      }
      
      setScreenSharing(false, null);
      toast.success("Screen sharing stopped");
    } catch (error) {
      console.error('Error stopping screen share:', error);
      toast.error(error.message || "Failed to stop screen sharing");
    }
  };
  
  // Toggle screen sharing
  const toggleScreenShare = async () => {
    try {
      const currentState = useCallStore.getState();
      const pc = currentState.peerConnection;
      
      if (!pc) {
        toast.error("No active call connection");
        return;
      }
      
      if (currentState.isScreenSharing) {
        await stopScreenShare();
        return;
      }
      
      // Start screen sharing
      const displayStream = await getDisplayMedia();
      const videoTrack = displayStream.getVideoTracks()[0];
      
      if (!videoTrack) {
        toast.error("Failed to get screen share video track");
        return;
      }
      
      // Handle browser UI stop event
      videoTrack.onended = stopScreenShare;
      
      // Replace video track with screen share
      await replaceVideoTrack(pc, videoTrack, displayStream);
      setScreenSharing(true, displayStream);
      toast.success("Screen sharing started");
    } catch (error) {
      console.error('Error toggling screen share:', error);
      // Don't show error if user cancelled
      if (!error.message?.includes('cancelled')) {
        toast.error(error.message || "Failed to toggle screen sharing");
      }
    }
  };
  
  return {
    initializeCall,
    answerCallWithMedia,
    toggleScreenShare,
    isWebRTCSupported: isWebRTCSupported(),
  };
};

export default useWebRTC;
