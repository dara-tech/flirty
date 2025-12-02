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
          // Get current state
          const currentState = useCallStore.getState();
          
          // CRITICAL: Create completely fresh peer connection when call is answered
          console.log('🔄 Call answered - setting up WebRTC connection...');
          
          // Step 1: Clean up any existing peer connection
          if (currentState.peerConnection) {
            console.log('🗑️ Closing any existing peer connection...');
            try {
              currentState.peerConnection.close();
            } catch (e) {
              console.warn('Error closing existing peer connection:', e);
            }
            useCallStore.getState().setPeerConnection(null);
          }
          
          // Step 2: Ensure we have media stream
          let stream = currentState.localStream;
          if (!stream) {
            console.log('🎤 Getting media stream...');
            stream = await getLocalStream(currentState.callType);
            useCallStore.getState().setLocalStream(stream);
          }
          
          // Step 3: Create BRAND NEW peer connection (never used before)
          console.log('✨ Creating brand new peer connection...');
          const pc = createPeerConnection();
          
          // Step 4: Verify it's completely clean before doing anything
          if (pc.signalingState !== 'stable') {
            console.error('❌ New peer connection not in stable state!', pc.signalingState);
            throw new Error(`New peer connection invalid state: ${pc.signalingState}`);
          }
          if (pc.localDescription) {
            console.error('❌ New peer connection has local description!');
            throw new Error('New peer connection already has local description!');
          }
          if (pc.remoteDescription) {
            console.error('❌ New peer connection has remote description!');
            throw new Error('New peer connection already has remote description!');
          }
          
          console.log('✅ Peer connection is clean, proceeding...');
          
          // Step 5: Add tracks
          console.log('📡 Adding local stream tracks...');
          addLocalStreamTracks(pc, stream);
          
          // Step 6: Setup handlers
          setupRemoteStreamHandler(pc, (remoteStream) => {
            useCallStore.getState().setRemoteStream(remoteStream);
            console.log('✅ Remote stream received and set');
          });
          
          // Step 7: Store peer connection
          useCallStore.getState().setPeerConnection(pc);
          
          // Step 8: Verify still clean after adding tracks
          if (pc.signalingState !== 'stable') {
            console.warn('⚠️ Warning: State changed after adding tracks:', pc.signalingState);
          }
          if (pc.localDescription) {
            console.error('❌ ERROR: Local description appeared after adding tracks!');
            throw new Error('Local description was set unexpectedly after adding tracks');
          }
          
          // Get receiver ID
          const receiverId = currentState.receiver?.userId;
          
          if (pc && socket && receiverId && stream) {
            // Setup ICE candidate handler
            setupIceCandidateHandler(pc, socket, callId, receiverId);
            
            // Check peer connection state BEFORE attempting to create offer
            const signalingState = pc.signalingState;
            const connectionState = pc.connectionState;
            
            // Final safety check - ensure peer connection is in valid state
            if (connectionState === 'closed') {
              throw new Error('Peer connection is closed');
            }
            
            // ABSOLUTE FINAL CHECK: Never create offer if one already exists
            // This is the last chance to prevent the error
            if (pc.localDescription || signalingState === 'have-local-offer' || pc.signalingState === 'have-local-offer') {
              console.error('❌ BLOCKED: Attempted to create offer when one already exists!');
              console.error('Current state:', {
                signalingState: pc.signalingState,
                localDescription: pc.localDescription?.type || 'none',
                offerCreatedFlag: offerCreatedRef.current,
              });
              
              // If we have a valid offer, resend it
              if (pc.localDescription?.type === 'offer') {
                console.log('✅ Reusing existing offer - resending to receiver');
                socket.emit('webrtc:offer', {
                  callId,
                  offer: pc.localDescription,
                  receiverId: receiverId,
                });
                offerCreatedRef.current = true;
                return; // CRITICAL: EXIT immediately - DO NOT create new offer
              } else {
                // Something is wrong - reset everything
                console.error('❌ Invalid state detected, resetting peer connection');
                pc.close();
                useCallStore.getState().setPeerConnection(null);
                throw new Error(`Cannot create offer: Peer connection is in invalid state "${signalingState}" with localDescription "${pc.localDescription?.type || 'none'}". Reset required.`);
              }
            }
            
            // MUST be in 'stable' state to create an offer
            if (signalingState !== 'stable' || pc.signalingState !== 'stable') {
              console.error(`❌ Cannot create offer: state is ${signalingState} or ${pc.signalingState}, must be 'stable'`);
              throw new Error(`Cannot create offer when peer connection is in state: ${signalingState || pc.signalingState}. Must be 'stable'.`);
            }
            
            // Triple-check that we don't have a local description
            if (pc.localDescription) {
              console.error('❌ CRITICAL: localDescription exists at final check - this should not happen!');
              socket.emit('webrtc:offer', {
                callId,
                offer: pc.localDescription,
                receiverId: receiverId,
              });
              offerCreatedRef.current = true;
              return; // Exit immediately
            }
            
            // Set flag BEFORE creating offer to prevent duplicates
            offerCreatedRef.current = true;
            
            // FINAL ABSOLUTE CHECK: Verify peer connection is clean before calling createOffer
            // This is the last line of defense - if this fails, we throw an error
            const finalState = pc.signalingState;
            const finalLocalDesc = pc.localDescription;
            
            // If peer connection has ANY existing offer, DO NOT call createOffer
            if (finalState === 'have-local-offer' || finalLocalDesc?.type === 'offer') {
              console.error('❌❌❌ CRITICAL BLOCK: Peer connection has existing offer - CANNOT create new one!');
              console.error('Blocking createOffer() call. State:', {
                signalingState: finalState,
                localDescription: finalLocalDesc?.type || 'none',
                connectionState: pc.connectionState,
              });
              
              // If we have a valid offer, resend it
              if (finalLocalDesc?.type === 'offer') {
                console.log('✅ Reusing existing offer instead of creating new one');
                socket.emit('webrtc:offer', {
                  callId,
                  offer: finalLocalDesc,
                  receiverId: receiverId,
                });
                offerCreatedRef.current = true;
                return; // EXIT - DO NOT call createOffer
              } else {
                // State says we have an offer but no local description - corrupted state
                console.error('❌ FATAL: Peer connection in corrupted state - resetting');
                pc.close();
                useCallStore.getState().setPeerConnection(null);
                throw new Error(`Peer connection in corrupted state: ${finalState} without valid localDescription. Reset required.`);
              }
            }
            
            // MUST be in 'stable' state
            if (finalState !== 'stable') {
              throw new Error(`Cannot create offer: Peer connection state is ${finalState}, must be 'stable'`);
            }
            
            // Verify no local description exists
            if (finalLocalDesc) {
              throw new Error(`Cannot create offer: Local description already exists (${finalLocalDesc.type})`);
            }
            
            // LAST-MILLISECOND CHECK: Verify state one more time RIGHT before calling createOffer
            // Read fresh state values directly from peer connection (no caching)
            const immediateState = pc.signalingState;
            const immediateLocalDesc = pc.localDescription;
            
            if (immediateState === 'have-local-offer' || immediateLocalDesc?.type === 'offer') {
              console.error('❌❌❌ LAST-MILLISECOND BLOCK: Offer detected right before createOffer call!');
              console.error('State at last moment:', {
                signalingState: immediateState,
                localDescription: immediateLocalDesc?.type || 'none',
              });
              
              if (immediateLocalDesc?.type === 'offer') {
                socket.emit('webrtc:offer', {
                  callId,
                  offer: immediateLocalDesc,
                  receiverId: receiverId,
                });
                offerCreatedRef.current = true;
                return; // Exit - do NOT call createOffer
              } else {
                throw new Error(`FATAL: State is ${immediateState} but no valid offer found. Peer connection corrupted.`);
              }
            }
            
            // Now it's safe to create the offer (createOffer will do its own checks too)
            console.log('📞 All checks passed - attempting to create offer...');
            console.log('Peer connection state before createOffer:', {
              signalingState: pc.signalingState,
              localDescription: pc.localDescription?.type || 'none',
              connectionState: pc.connectionState,
            });
            
            // Try to create offer - it will return existing one if it already exists
            const offer = await createOffer(pc);
            
            // After createOffer returns, verify we got a valid offer
            if (!offer) {
              throw new Error('createOffer returned null - this should not happen');
            }
            
            console.log('✅ Offer obtained (either created or existing):', offer.type);
            
            socket.emit('webrtc:offer', {
              callId,
              offer,
              receiverId: receiverId,
            });
            console.log('✅ Call answered, offer created and sent to receiver');
          } else {
            console.error('Missing required components:', { pc: !!pc, socket: !!socket, receiverId: !!receiverId, stream: !!stream });
            toast.error("Failed to initialize call");
          }
        } catch (error) {
          offerCreatedRef.current = false; // Reset flag on error
          console.error('Error creating offer after call answered:', error);
          toast.error("Failed to establish connection");
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
        // If peer connection doesn't exist yet, initialize it first
        let pc = peerConnection || useCallStore.getState().peerConnection;
        if (!pc) {
          try {
            const currentState = useCallStore.getState();
            const stream = await getLocalStream(currentState.callType);
            useCallStore.getState().setLocalStream(stream);
            
            pc = createPeerConnection();
            useCallStore.getState().setPeerConnection(pc);
            
            addLocalStreamTracks(pc, stream);
            
            // Setup handlers
            setupRemoteStreamHandler(pc, (remoteStream) => {
              useCallStore.getState().setRemoteStream(remoteStream);
            });
            
            // Setup ICE candidate handler
            if (socket && offerCallerId) {
              setupIceCandidateHandler(pc, socket, callId, offerCallerId);
            }
          } catch (error) {
            console.error('Error initializing call on offer receive:', error);
            toast.error(error.message || "Failed to initialize call");
            processingOfferRef.current = false;
            endCall();
            return;
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
        
        if (socket) {
          socket.emit('webrtc:answer', {
            callId,
            answer,
            callerId: offerCallerId,
          });
        }
      } catch (error) {
        console.error('Error handling offer:', error);
        if (error.message && error.message.includes('already established')) {
          console.log('Connection already established, ignoring error');
        } else {
          toast.error("Failed to answer call");
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
        // If connection is already stable, it's fine - connection is established
        if (error.message && (error.message.includes('stable') || error.message.includes('wrong state'))) {
          console.log('Connection already established, ignoring duplicate answer');
          pendingAnswerRef.current = null;
        } else {
          // Retry after a short delay
          setTimeout(async () => {
            const currentPc = useCallStore.getState().peerConnection;
            if (currentPc && currentPc.signalingState === 'have-local-offer') {
              try {
                await setRemoteDescription(currentPc, answer);
                pendingAnswerRef.current = null;
              } catch (retryError) {
                console.error('Error retrying answer:', retryError);
                if (!retryError.message.includes('stable')) {
                  toast.error("Failed to establish connection");
                  endCall();
                }
              }
            }
          }, 500);
        }
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
        console.error('Error adding ICE candidate:', error);
        // Don't fail the call, just log the error
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
        console.log('🧹 Cleaning up existing peer connection during initialization...');
        try {
          currentState.peerConnection.close();
        } catch (e) {
          console.warn('Error closing peer connection:', e);
        }
        useCallStore.getState().setPeerConnection(null);
      }
      
      // Get media stream
      const stream = await getLocalStream(callType);
      setLocalStream(stream);
      
      console.log('✅ Media stream obtained. Peer connection will be created when call is answered.');
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
      // First initialize media and peer connection
      await initializeCall(false);
      
      // Set that we're ready to receive the offer
      // The answer will be created automatically when offer is received via handleWebRTCOffer
      
      // Send the answer signal to notify caller we've answered
      const { answerCall } = useCallStore.getState();
      await answerCall();
      
      console.log('Call answered, waiting for offer from caller');
    } catch (error) {
      console.error('Error answering call:', error);
      toast.error(error.message || "Failed to answer call");
      useCallStore.getState().rejectCall();
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
