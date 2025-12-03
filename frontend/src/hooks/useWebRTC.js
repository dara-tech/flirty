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
        isVideoEnabled: callType === 'video', // Only enable video for video calls
        caller: callerInfo,
        receiver: {
          userId: authUser._id,
          fullname: authUser.fullname,
          profilePic: authUser.profilePic,
        },
      });
      
      console.log('📞 Incoming call received:', callId, callerInfo.fullname);
    };
    
    // Call ringing (for caller) - don't change state, caller should stay in 'calling' state
    // This event is just a confirmation that the receiver's phone is ringing
    const handleCallRinging = () => {
      // Don't change caller's state - they should stay in 'calling' state
      // Only receiver should be in 'ringing' state
      console.log('📞 Call is ringing on receiver side');
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
      
      // Get peer connection to check if this is a renegotiation
      const pc = peerConnection || useCallStore.getState().peerConnection;
      const isRenegotiation = pc && pc.signalingState === 'stable' && pc.localDescription;
      
      // If answer already created and this is NOT a renegotiation, ignore
      if (answerCreatedRef.current && !isRenegotiation) {
        console.log('Answer already created, ignoring duplicate offer');
        return;
      }
      
      // If this is a renegotiation, allow it
      if (isRenegotiation) {
        console.log('🔄 Processing renegotiation offer (camera/screen share enabled)');
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
        
        // Check if this is a renegotiation (connection already established)
        const isRenegotiation = pc.signalingState === 'stable' && pc.localDescription;
        
        if (isRenegotiation) {
          // This is a renegotiation - set remote description first, then create answer
          console.log('🔄 Handling renegotiation offer (camera/screen share)');
          try {
            // Ensure remote stream handler is set up to detect new tracks
            if (!pc.ontrack) {
              setupRemoteStreamHandler(pc, (remoteStream) => {
                console.log('📹 Remote stream updated with new video track');
                useCallStore.getState().setRemoteStream(remoteStream);
              });
            }
            
            await setRemoteDescription(pc, offer);
            const answer = await createAnswer(pc, offer);
            if (socket && answer) {
              socket.emit('webrtc:answer', {
                callId,
                answer,
                callerId: offerCallerId,
              });
              console.log('✅ Renegotiation answer sent');
            }
            
            // Force check for new tracks after a short delay
            setTimeout(() => {
              const receivers = pc.getReceivers();
              const videoReceiver = receivers.find(r => r.track?.kind === 'video');
              if (videoReceiver && videoReceiver.track) {
                console.log('📹 Video track detected in receiver:', videoReceiver.track.label);
                const currentRemoteStream = useCallStore.getState().remoteStream;
                if (currentRemoteStream) {
                  const hasVideoTrack = currentRemoteStream.getVideoTracks().some(t => t.id === videoReceiver.track.id);
                  if (!hasVideoTrack) {
                    // Add new video track to remote stream
                    const updatedStream = new MediaStream([
                      ...currentRemoteStream.getAudioTracks(),
                      videoReceiver.track,
                    ]);
                    useCallStore.getState().setRemoteStream(updatedStream);
                    console.log('✅ Remote stream updated with new video track');
                  }
                }
              }
            }, 500);
          } catch (renegError) {
            console.error('Error during renegotiation:', renegError);
            // Don't end call on renegotiation error, just log it
          }
          processingOfferRef.current = false;
          return;
        }
        
        // Initial offer - check if answer already exists
        if (pc.localDescription && pc.localDescription.type === 'answer') {
          console.log('Answer already exists, skipping');
          answerCreatedRef.current = true;
          processingOfferRef.current = false;
          return;
        }
        
        // Answer the initial call
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
      
      const pc = peerConnection || useCallStore.getState().peerConnection;
      if (!pc) {
        // Buffer the answer until peer connection is ready
        pendingAnswerRef.current = answer;
        return;
      }
      
      // Check if this is a renegotiation (connection already stable)
      const isRenegotiation = pc.signalingState === 'stable' && pc.localDescription?.type === 'offer';
      
      // Check if we're the caller (should have local description set)
      if (!isCallerRef.current && !isRenegotiation) {
        // We're the receiver, shouldn't receive an answer (unless renegotiation)
        console.warn('Received answer but we are not the caller');
        return;
      }
      
      // Check if local description is set (should be if we're the caller or renegotiating)
      if (!pc.localDescription && !isRenegotiation) {
        // Buffer the answer until local description is set
        pendingAnswerRef.current = answer;
        return;
      }
      
      // Check connection state - should be "have-local-offer" to set remote answer
      // If already stable, might be renegotiation
      if (pc.signalingState === 'stable' && !isRenegotiation) {
        console.log('Connection already stable, answer already processed');
        pendingAnswerRef.current = null;
        return;
      }
      
      // For renegotiation, allow setting answer even if state is stable
      if (!isRenegotiation && pc.signalingState !== 'have-local-offer') {
        console.warn(`Unexpected signaling state: ${pc.signalingState}, expected have-local-offer`);
        // Buffer and retry later
        pendingAnswerRef.current = answer;
        return;
      }
      
      try {
        await setRemoteDescription(pc, answer);
        pendingAnswerRef.current = null; // Clear buffered answer
        
        // If this is a renegotiation, check for new video tracks
        if (isRenegotiation) {
          console.log('🔄 Processing renegotiation answer - checking for new video tracks');
          
          // Ensure remote stream handler is set up
          if (!pc.ontrack) {
            setupRemoteStreamHandler(pc, (remoteStream) => {
              console.log('📹 Remote stream updated with new video track');
              useCallStore.getState().setRemoteStream(remoteStream);
            });
          }
          
          // Check for new video tracks after a delay
          setTimeout(() => {
            const receivers = pc.getReceivers();
            const videoReceiver = receivers.find(r => r.track?.kind === 'video');
            if (videoReceiver && videoReceiver.track) {
              console.log('📹 Video track detected in receiver after renegotiation:', videoReceiver.track.label);
              const currentRemoteStream = useCallStore.getState().remoteStream;
              if (currentRemoteStream) {
                const hasVideoTrack = currentRemoteStream.getVideoTracks().some(t => t.id === videoReceiver.track.id);
                if (!hasVideoTrack) {
                  // Add new video track to remote stream
                  const updatedStream = new MediaStream([
                    ...currentRemoteStream.getAudioTracks(),
                    videoReceiver.track,
                  ]);
                  useCallStore.getState().setRemoteStream(updatedStream);
                  console.log('✅ Remote stream updated with new video track after renegotiation');
                }
              } else {
                // Create new stream with video track
                const newStream = new MediaStream([videoReceiver.track]);
                useCallStore.getState().setRemoteStream(newStream);
                console.log('✅ New remote stream created with video track');
              }
            } else {
              console.log('⚠️ No video track found in receivers after renegotiation');
            }
          }, 500);
        }
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
          if (currentPc && (currentPc.signalingState === 'have-local-offer' || isRenegotiation)) {
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
      
      // For video calls, ensure video tracks are enabled
      if (callType === 'video') {
        const videoTracks = stream.getVideoTracks();
        videoTracks.forEach(track => {
          if (track.readyState === 'live' && !track.enabled) {
            track.enabled = true;
            console.log('✅ Enabled video track during call initialization:', track.label);
          }
        });
        
        // Validation: Ensure at least one video track is active
        const activeVideoTracks = videoTracks.filter(track => 
          track.enabled && track.readyState === 'live'
        );
        
        if (activeVideoTracks.length === 0 && videoTracks.length > 0) {
          console.warn('⚠️ Video tracks exist but none are active - enabling all tracks');
          // Try to enable all tracks
          videoTracks.forEach(track => {
            if (track.readyState === 'live') {
              track.enabled = true;
            }
          });
        }
        
        console.log('📹 Video call initialized:', {
          totalTracks: videoTracks.length,
          activeTracks: activeVideoTracks.length,
          trackDetails: videoTracks.map(t => ({
            id: t.id,
            label: t.label,
            enabled: t.enabled,
            readyState: t.readyState,
          })),
        });
      }
      
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
      const { answerCall, callType } = useCallStore.getState();
      await answerCall();
      
      // Send call started message (answerCall already sends it, but ensure it's sent)
      // The answerCall function in useCallStore will handle sending the status message
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
  
  // Stop screen sharing and switch back to camera (with validation)
  const stopScreenShare = async () => {
    try {
      const currentState = useCallStore.getState();
      const { peerConnection, screenShareStream, callType, callState, isVideoEnabled, localStream } = currentState;
      
      // Validation: Must be in active call
      if (callState !== 'in-call') {
        toast.error("No active call");
        return;
      }
      
      // Validation: Peer connection must exist
      if (!peerConnection) {
        toast.error("Call connection not established");
        return;
      }
      
      // Validation: Must be screen sharing
      if (!currentState.isScreenSharing || !screenShareStream) {
        console.warn('Not currently screen sharing');
        setScreenSharing(false, null);
        return;
      }
      
      // Validation: Peer connection must be in valid state
      const validStates = ['stable', 'have-local-offer', 'have-remote-offer', 'have-local-pranswer', 'have-remote-pranswer'];
      if (!validStates.includes(peerConnection.signalingState)) {
        toast.error("Call connection is not ready");
        return;
      }
      
      // Stop screen share tracks
      const screenShareTracks = screenShareStream.getTracks();
      screenShareTracks.forEach(track => {
        if (track.readyState === 'live') {
          track.stop();
        }
      });
      
      // For video calls, switch back to camera if video was enabled before screen share
      if (callType === 'video' && isVideoEnabled && localStream) {
        const cameraVideoTracks = localStream.getVideoTracks();
        
        // Find camera track (not screen share track)
        const cameraVideoTrack = cameraVideoTracks.find(track => 
          track.readyState === 'live' && 
          !track.label.toLowerCase().includes('screen') &&
          track.label.toLowerCase().includes('camera')
        ) || cameraVideoTracks.find(track => 
          track.readyState === 'live' && 
          !track.label.toLowerCase().includes('screen')
        );
        
        if (cameraVideoTrack) {
          // Camera track exists - replace screen share with camera
          try {
            await replaceVideoTrack(peerConnection, cameraVideoTrack, localStream);
            console.log('✅ Switched back to camera from screen share');
          } catch (error) {
            console.error('Error switching to camera:', error);
            toast.error("Stopped screen sharing but failed to switch to camera");
          }
        } else {
          // No camera tracks - need to get camera stream
          try {
            const cameraStream = await getLocalStream('video');
            const cameraVideoTrack = cameraStream.getVideoTracks()[0];
            
            if (cameraVideoTrack) {
              await replaceVideoTrack(peerConnection, cameraVideoTrack, cameraStream);
              
              // Update local stream
              if (localStream) {
                // Remove old video tracks
                localStream.getVideoTracks().forEach(track => {
                  if (track.id !== cameraVideoTrack.id) {
                    track.stop();
                    localStream.removeTrack(track);
                  }
                });
                // Add camera track
                if (!localStream.getVideoTracks().some(t => t.id === cameraVideoTrack.id)) {
                  localStream.addTrack(cameraVideoTrack);
                }
              } else {
                setLocalStream(cameraStream);
              }
              
              console.log('✅ Switched back to camera from screen share');
            }
          } catch (error) {
            console.error('Error getting camera stream:', error);
            // Remove video track from peer connection
            const senders = peerConnection.getSenders();
            const videoSender = senders.find(sender => sender.track?.kind === 'video');
            if (videoSender) {
              try {
                await videoSender.replaceTrack(null);
                // Disable video since camera is not available
                useCallStore.setState({ isVideoEnabled: false });
              } catch (e) {
                console.error('Error removing video track:', e);
              }
            }
            toast.error("Stopped screen sharing. Camera not available.");
          }
        }
      } else {
        // For voice calls or if video is disabled, just remove video track
        const senders = peerConnection.getSenders();
        const videoSender = senders.find(sender => sender.track?.kind === 'video');
        if (videoSender) {
          try {
            await videoSender.replaceTrack(null);
          } catch (error) {
            console.error('Error removing video track:', error);
          }
        }
      }
      
      setScreenSharing(false, null);
      toast.success("Screen sharing stopped");
      
    } catch (error) {
      console.error('Error stopping screen share:', error);
      toast.error(error.message || "Failed to stop screen sharing");
      // Still update state to prevent UI inconsistency
      setScreenSharing(false, null);
    }
  };
  
  // Toggle screen sharing with comprehensive validation
  const toggleScreenShare = async () => {
    try {
      const currentState = useCallStore.getState();
      const { 
        peerConnection, 
        socket, 
        callId, 
        caller, 
        receiver, 
        callType,
        callState,
        isScreenSharing,
        screenShareStream
      } = currentState;
      const { authUser } = useAuthStore.getState();
      
      // Validation: Only allow screen share for video calls
      if (callType !== 'video') {
        toast.error("Screen sharing is only available for video calls");
        return;
      }
      
      // Validation: Must be in active call
      if (callState !== 'in-call') {
        toast.error("No active call");
        return;
      }
      
      // Validation: Peer connection must exist
      if (!peerConnection) {
        toast.error("Call connection not established. Please wait...");
        return;
      }
      
      // Validation: Socket must be connected
      if (!socket || !socket.connected) {
        toast.error("Connection lost. Please reconnect.");
        return;
      }
      
      // Validation: Peer connection must be in valid state
      const validStates = ['stable', 'have-local-offer', 'have-remote-offer', 'have-local-pranswer', 'have-remote-pranswer'];
      if (!validStates.includes(peerConnection.signalingState)) {
        toast.error("Call connection is not ready. Please wait...");
        return;
      }
      
      // STOP SCREEN SHARING
      if (isScreenSharing) {
        await stopScreenShare();
        return;
      }
      
      // START SCREEN SHARING
      let displayStream = null;
      try {
        // Validation: Check if screen sharing is supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
          toast.error("Screen sharing is not supported in your browser");
          return;
        }
        
        // Get screen share stream
        displayStream = await getDisplayMedia();
        
        // Validation: Display stream must be obtained
        if (!displayStream) {
          throw new Error('Failed to get screen share stream');
        }
        
        const videoTrack = displayStream.getVideoTracks()[0];
        
        // Validation: Video track must exist
        if (!videoTrack) {
          displayStream.getTracks().forEach(track => track.stop());
          throw new Error('Failed to get screen share video track');
        }
        
        // Validation: Video track must be live
        if (videoTrack.readyState !== 'live') {
          displayStream.getTracks().forEach(track => track.stop());
          throw new Error('Screen share stream is not active');
        }
        
        // Handle browser UI stop event (user clicks stop in browser UI)
        videoTrack.onended = () => {
          console.log('📹 Screen share ended by user (browser UI)');
          stopScreenShare();
        };
        
        // Check if video sender exists before adding
        const senders = peerConnection.getSenders();
        const videoSender = senders.find(sender => sender.track?.kind === 'video');
        const hadVideoBefore = !!videoSender;
        
        // Replace or add video track with screen share
        await replaceVideoTrack(peerConnection, videoTrack, displayStream);
        
        // Update state: screen sharing replaces video, so mark video as "replaced" but keep isVideoEnabled true
        // This allows UI to show that video is active (screen share is video)
        setScreenSharing(true, displayStream);
        
        // Note: We keep isVideoEnabled true because screen share is a form of video
        // The UI will show screen share instead of camera when isScreenSharing is true
        
        // If this is a new video track, renegotiate
        if (!hadVideoBefore) {
          // Wait for negotiationneeded event
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // Validation: Check peer connection state before renegotiation
          if (peerConnection.signalingState === 'closed') {
            throw new Error('Peer connection is closed');
          }
          
          // Get user IDs for signaling
          const authUserId = typeof authUser._id === 'object' ? authUser._id._id || authUser._id : authUser._id;
          const callerId = typeof caller?.userId === 'object' ? caller.userId._id || caller.userId : caller?.userId;
          const receiverId = typeof receiver?.userId === 'object' ? receiver.userId._id || receiver.userId : receiver?.userId;
          
          // Validation: User IDs must exist
          if (!authUserId || !callerId || !receiverId) {
            throw new Error('Call participant information missing');
          }
          
          const otherUserId = String(authUserId) === String(callerId) ? receiverId : callerId;
          
          // Create and send renegotiation offer
          const offer = await createOffer(peerConnection);
          if (!offer) {
            throw new Error('Failed to create renegotiation offer');
          }
          
          socket.emit('webrtc:offer', { callId, offer, receiverId: otherUserId });
          console.log('📤 Renegotiation offer sent for screen share');
        }
        
        toast.success("Screen sharing started");
        
      } catch (error) {
        console.error('Error starting screen share:', error);
        
        // Clean up on error
        if (displayStream) {
          displayStream.getTracks().forEach(track => track.stop());
        }
        setScreenSharing(false, null);
        
        // Provide specific error messages
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          toast.error("Screen sharing permission denied. Please allow access.");
        } else if (error.name === 'NotFoundError' || error.name === 'AbortError') {
          // User cancelled - don't show error
          return;
        } else if (error.message?.includes('cancelled')) {
          // User cancelled - don't show error
          return;
        } else {
          toast.error(error.message || "Failed to start screen sharing");
        }
      }
    } catch (error) {
      console.error('Error toggling screen share:', error);
      toast.error(error.message || "Failed to toggle screen sharing");
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
