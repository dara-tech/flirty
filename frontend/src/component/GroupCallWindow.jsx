import { useEffect, useRef, useState } from "react";
import { useCallStore } from "../store/useCallStore";
import CallControls from "./CallControls";
import ProfileImage from "./ProfileImage";
import { formatCallDuration, getLocalStream } from "../lib/webrtc";
import { useAuthStore } from "../store/useAuthStore";
import {
  createPeerConnection,
  addLocalStreamTracks,
  setupIceCandidateHandler,
  setupRemoteStreamHandler,
  createOffer,
  createAnswer,
  setRemoteDescription,
  addIceCandidate,
} from "../lib/webrtc";
import toast from "react-hot-toast";

const GroupCallWindow = () => {
  const {
    callState,
    roomId,
    callType,
    localStream,
    participants,
    isVideoEnabled,
    isMuted,
    isScreenSharing,
    screenShareStream,
    callDuration,
    addParticipant,
    removeParticipant,
    updateParticipantStream,
    updateParticipantScreenShare,
    updateParticipantTracks,
    updateParticipantPeerConnection,
    leaveGroupCall,
  } = useCallStore();
  
  const { socket, authUser } = useAuthStore();
  const localVideoRef = useRef(null);
  const localScreenShareRef = useRef(null); // Separate ref for local screen share
  const participantVideoRefs = useRef(new Map()); // { userId: videoRef }
  const participantScreenShareRefs = useRef(new Map()); // { userId: screenShareRef }
  const [gridColumns, setGridColumns] = useState(2);
  
  // Calculate grid layout based on participant count (including local)
  useEffect(() => {
    // Count remote participants only (local is shown separately)
    const remoteParticipantCount = Array.from(participants.values()).filter(p => !p.isLocal).length;
    const totalCount = remoteParticipantCount + 1; // +1 for local video
    
    if (totalCount === 1) {
      setGridColumns(1); // Just local participant
    } else if (totalCount <= 2) {
      setGridColumns(2);
    } else if (totalCount <= 4) {
      setGridColumns(2);
    } else if (totalCount <= 6) {
      setGridColumns(3);
    } else {
      setGridColumns(Math.ceil(Math.sqrt(totalCount)));
    }
  }, [participants]);
  
  // Step B: Attach local track to local preview immediately
  // This guarantees first caller sees themselves, independent of remote participants
  useEffect(() => {
    const videoElement = localVideoRef.current;
    if (!videoElement) return;
    
    // Always attach local stream if available (for preview)
    // Don't show camera if screen sharing (screen share is shown separately)
    if (localStream && !isScreenSharing) {
      const videoTracks = localStream.getVideoTracks();
      const hasActiveTracks = videoTracks.some(track => 
        track.enabled && track.readyState === 'live' && !track.muted
      );
      
      if (hasActiveTracks && isVideoEnabled) {
        // Step B: Attach local stream to preview
        videoElement.srcObject = localStream;
        videoElement.muted = true; // Avoid echo
        videoElement.autoplay = true;
        videoElement.play().catch(err => {
          if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
          }
        });
      } else {
        videoElement.srcObject = null;
      }
    } else {
      videoElement.srcObject = null;
    }
  }, [localStream, isVideoEnabled, isScreenSharing]);
  
  // Handle local screen share preview
  useEffect(() => {
    const screenShareElement = localScreenShareRef.current;
    if (!screenShareElement) return;
    
    if (isScreenSharing && screenShareStream) {
      const videoTracks = screenShareStream.getVideoTracks();
      const hasActiveTracks = videoTracks.some(track => 
        track.enabled && track.readyState === 'live' && !track.muted
      );
      
      if (hasActiveTracks) {
        screenShareElement.srcObject = screenShareStream;
        screenShareElement.muted = true; // Avoid echo
        screenShareElement.autoplay = true;
        screenShareElement.play().catch(err => {
          if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
          }
        });
      } else {
        screenShareElement.srcObject = null;
      }
    } else {
      screenShareElement.srcObject = null;
    }
  }, [isScreenSharing, screenShareStream]);
  
  // Initialize local stream when joining group call
  // Step B: Get local media immediately on join
  useEffect(() => {
    if (!localStream && callState === 'in-call' && roomId) {
      const initializeLocalStream = async () => {
        try {
          const stream = await getLocalStream(callType);
          const store = useCallStore.getState();
          store.setLocalStream(stream);
          
          // Step B: Update local participant's stream reference
          const authUserId = typeof authUser._id === 'object' ? authUser._id._id || authUser._id : authUser._id;
          const authUserIdStr = String(authUserId);
          const currentParticipants = store.participants;
          const localParticipant = currentParticipants.get(authUserIdStr);
          if (localParticipant) {
            // Update local participant with stream
            store.updateParticipantStream(authUserIdStr, stream);
          }
        } catch (error) {
          console.error('Error initializing local stream:', error);
          toast.error("Failed to access camera/microphone");
        }
      };
      
      initializeLocalStream();
    }
  }, [callState, roomId, localStream, callType, authUser]);
  
  // Handle group call signaling events
  useEffect(() => {
    if (!socket || !roomId) return;
    
    // Setup peer connection for a participant (helper function)
    const setupPeerConnectionForParticipant = async (targetUserId, streamToUse = null) => {
      const stream = streamToUse || localStream;
      if (!stream) {
        return;
      }
      
      // Check if peer connection already exists
      const currentParticipants = useCallStore.getState().participants;
      const participant = currentParticipants.get(targetUserId);
      if (participant?.peerConnection) {
        return;
      }
      
      try {
        const pc = createPeerConnection();
        updateParticipantPeerConnection(targetUserId, pc);
        
        // Add local tracks
        addLocalStreamTracks(pc, stream);
        
        // Setup remote stream handler with track detection
        // Handle both camera and screen share tracks separately
        pc.ontrack = (event) => {
          const track = event.track;
          const stream = event.streams?.[0];
          
          if (!track || !stream) return;

          // Detect screen share tracks by label
          const isScreenShareTrack = track.kind === 'video' && (
            track.label.toLowerCase().includes('screen') ||
            track.label.toLowerCase().includes('display') ||
            track.label.toLowerCase().includes('window') ||
            track.label.toLowerCase().includes('monitor')
          );
          
          if (isScreenShareTrack) {
            // This is a screen share track - create separate stream
            const screenShareStream = new MediaStream([track]);
            updateParticipantScreenShare(targetUserId, screenShareStream);
            
            // Handle track ended
            track.onended = () => {
              updateParticipantScreenShare(targetUserId, null);
              updateParticipantTracks(targetUserId, { screenSharing: false });
            };
          } else if (track.kind === 'video') {
            // This is a camera track
            // Check if we already have a stream for this participant
            const participant = useCallStore.getState().participants.get(targetUserId);
            if (participant?.stream) {
              // Add track to existing stream if not already present
              const existingTracks = participant.stream.getTracks();
              if (!existingTracks.some(t => t.id === track.id)) {
                participant.stream.addTrack(track);
                updateParticipantStream(targetUserId, participant.stream);
              }
            } else {
              // Create new stream with camera track
              const cameraStream = new MediaStream([track]);
              updateParticipantStream(targetUserId, cameraStream);
            }
          } else if (track.kind === 'audio') {
            // Audio track - add to existing stream or create new
            const participant = useCallStore.getState().participants.get(targetUserId);
            if (participant?.stream) {
              const existingTracks = participant.stream.getTracks();
              if (!existingTracks.some(t => t.id === track.id)) {
                participant.stream.addTrack(track);
                updateParticipantStream(targetUserId, participant.stream);
              }
            } else {
              const audioStream = new MediaStream([track]);
              updateParticipantStream(targetUserId, audioStream);
            }
          }
        };
        
        // Setup ICE candidate handler - send to target user
        const authUserId = typeof authUser._id === 'object' ? authUser._id._id || authUser._id : authUser._id;
        pc.onicecandidate = (event) => {
          if (event.candidate && socket) {
            socket.emit('groupcall:webrtc-ice-candidate', {
              roomId,
              candidate: event.candidate,
              targetUserId,
            });
          }
        };
        
        // Create and send offer
        const offer = await createOffer(pc);
        if (socket && offer) {
          socket.emit('groupcall:webrtc-offer', {
            roomId,
            offer,
            targetUserId,
          });
        }
      } catch (error) {
        console.error('Error creating peer connection for participant:', error);
      }
    };
    
    // Participant joined (remote participant)
    const handleParticipantJoined = ({ participant }) => {
      const authUserId = typeof authUser._id === 'object' ? authUser._id._id || authUser._id : authUser._id;
      const authUserIdStr = String(authUserId);
      const participantIdStr = String(participant.userId);
      
      // Don't add local participant (already added)
      if (participantIdStr === authUserIdStr) {
        return;
      }
      
      addParticipant(participantIdStr, {
        userInfo: participant.userInfo,
        tracks: participant.tracks,
        stream: null,
        peerConnection: null,
        isLocal: false,
      });
      
      // Create peer connection for new remote participant (wait for local stream)
      if (localStream) {
        setupPeerConnectionForParticipant(participantIdStr, localStream);
      } else {
        // Wait for local stream
        const checkStream = setInterval(() => {
          const currentStream = useCallStore.getState().localStream;
          if (currentStream) {
            clearInterval(checkStream);
            setupPeerConnectionForParticipant(participantIdStr, currentStream);
          }
        }, 200);
        
        // Cleanup after 10 seconds
        setTimeout(() => clearInterval(checkStream), 10000);
      }
    };
    
    // Participant left
    const handleParticipantLeft = ({ userId }) => {
      removeParticipant(userId);
      
      // Clean up video refs
      const videoRef = participantVideoRefs.current.get(userId);
      if (videoRef?.current) {
        videoRef.current.srcObject = null;
      }
      participantVideoRefs.current.delete(userId);
      
      // Clean up screen share refs
      const screenShareRef = participantScreenShareRefs.current.get(userId);
      if (screenShareRef?.current) {
        screenShareRef.current.srcObject = null;
      }
      participantScreenShareRefs.current.delete(userId);
    };
    
    // Tracks updated (WebSocket signaling event - UI state update only)
    // WebRTC tracks are updated via track.enabled, this is just for UI synchronization
    const handleTracksUpdated = ({ userId, tracks }) => {
      // Update participant track state in store (for UI rendering)
      updateParticipantTracks(userId, tracks);
      
      const participant = participants.get(userId);
      if (participant) {
        // Update UI based on track state (best practice: always render based on track state)
        const videoRef = participantVideoRefs.current.get(userId);
        if (videoRef?.current && participant.stream) {
          const videoTracks = participant.stream.getVideoTracks();
          const hasActiveVideo = videoTracks.some(track => 
            track.enabled && track.readyState === 'live' && !track.muted
          );
          
          // If WebSocket says video is off OR track is not active, hide video element
          if (!hasActiveVideo || tracks.video === false) {
            videoRef.current.srcObject = null;
          } else if (hasActiveVideo && tracks.video !== false) {
            // Ensure video is attached if track is active
            if (videoRef.current.srcObject !== participant.stream) {
              videoRef.current.srcObject = participant.stream;
              videoRef.current.play().catch(err => {
                if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
                }
              });
            }
          }
        }
      }
    };
    
    // WebRTC Offer received
    const handleWebRTCOffer = async ({ roomId: offerRoomId, offer, senderId }) => {
      if (offerRoomId !== roomId) return;
      
      let participant = participants.get(senderId);
      if (!participant) {
        // Participant not in our list yet, add them
        addParticipant(senderId, {
          userInfo: {},
          tracks: { audio: true, video: callType === 'video' },
          stream: null,
          peerConnection: null,
        });
        participant = participants.get(senderId);
      }
      
      let pc = participant.peerConnection;
      if (!pc) {
        pc = createPeerConnection();
        updateParticipantPeerConnection(senderId, pc);
        
        // Add local tracks if we have them
        if (localStream) {
          addLocalStreamTracks(pc, localStream);
        }
        
        // Setup remote stream handler
        setupRemoteStreamHandler(pc, (remoteStream) => {
          updateParticipantStream(senderId, remoteStream);
        });
        
        // Setup ICE candidate handler
        const authUserId = typeof authUser._id === 'object' ? authUser._id._id || authUser._id : authUser._id;
        pc.onicecandidate = (event) => {
          if (event.candidate && socket) {
            socket.emit('groupcall:webrtc-ice-candidate', {
              roomId,
              candidate: event.candidate,
              targetUserId: senderId,
            });
          }
        };
      }
      
      try {
        await setRemoteDescription(pc, offer);
        const answer = await createAnswer(pc, offer);
        
        if (socket && answer) {
          socket.emit('groupcall:webrtc-answer', {
            roomId,
            answer,
            targetUserId: senderId,
          });
        }
      } catch (error) {
        console.error('Error handling group call offer:', error);
      }
    };
    
    // WebRTC Answer received
    const handleWebRTCAnswer = async ({ roomId: answerRoomId, answer, senderId }) => {
      if (answerRoomId !== roomId) return;
      
      const participant = participants.get(senderId);
      if (!participant || !participant.peerConnection) return;
      
      try {
        await setRemoteDescription(participant.peerConnection, answer);
      } catch (error) {
        console.error('Error handling group call answer:', error);
      }
    };
    
    // ICE Candidate received
    const handleICECandidate = async ({ roomId: candidateRoomId, candidate, senderId }) => {
      if (candidateRoomId !== roomId) return;
      
      const participant = participants.get(senderId);
      if (!participant || !participant.peerConnection) return;
      
      try {
        await addIceCandidate(participant.peerConnection, candidate);
      } catch (error) {
      }
    };
    
    // Joined event - received list of existing participants (Step C: room state)
    const handleJoined = ({ participants: existingParticipants, roomState }) => {
      
      const authUserId = typeof authUser._id === 'object' ? authUser._id._id || authUser._id : authUser._id;
      const authUserIdStr = String(authUserId);
      
      // Wait for local stream to be ready before creating peer connections
      const setupConnections = () => {
        const currentStream = useCallStore.getState().localStream;
        if (!currentStream) {
          // Wait a bit and retry
          setTimeout(setupConnections, 500);
          return;
        }
        
        // Add remote participants only (local participant already added in joinGroupCall)
        existingParticipants.forEach(participant => {
          const participantIdStr = String(participant.userId);
          // Don't add local participant again
          if (participantIdStr !== authUserIdStr) {
            addParticipant(participantIdStr, {
              userInfo: participant.userInfo,
              tracks: participant.tracks,
              stream: null,
              peerConnection: null,
              isLocal: false,
            });
            
            // Create peer connection for each existing remote participant
            setupPeerConnectionForParticipant(participantIdStr, currentStream);
          }
        });
      };
      
      setupConnections();
    };
    
    // Screen share started (remote participant)
    const handleScreenShareStarted = ({ userId, trackId }) => {
      const participant = participants.get(userId);
      if (participant) {
        // Mark participant as screen sharing
        updateParticipantTracks(userId, { screenSharing: true });
      }
    };
    
    // Screen share stopped (remote participant)
    const handleScreenShareStopped = ({ userId }) => {
      const participant = participants.get(userId);
      if (participant) {
        // Mark participant as not screen sharing
        updateParticipantTracks(userId, { screenSharing: false });
        // Clear screen share stream
        updateParticipantScreenShare(userId, null);
        
        // Clear screen share video element
        const screenShareRef = participantScreenShareRefs.current.get(userId);
        if (screenShareRef?.current) {
          screenShareRef.current.srcObject = null;
        }
      }
    };
    
    // Register event listeners
    socket.on('groupcall:joined', handleJoined);
    socket.on('groupcall:participant-joined', handleParticipantJoined);
    socket.on('groupcall:participant-left', handleParticipantLeft);
    socket.on('groupcall:tracks-updated', handleTracksUpdated);
    socket.on('groupcall:screen-share-started', handleScreenShareStarted);
    socket.on('groupcall:screen-share-stopped', handleScreenShareStopped);
    socket.on('groupcall:webrtc-offer', handleWebRTCOffer);
    socket.on('groupcall:webrtc-answer', handleWebRTCAnswer);
    socket.on('groupcall:webrtc-ice-candidate', handleICECandidate);
    
      return () => {
      socket.off('groupcall:joined', handleJoined);
      socket.off('groupcall:participant-joined', handleParticipantJoined);
      socket.off('groupcall:participant-left', handleParticipantLeft);
      socket.off('groupcall:tracks-updated', handleTracksUpdated);
      socket.off('groupcall:screen-share-started', handleScreenShareStarted);
      socket.off('groupcall:screen-share-stopped', handleScreenShareStopped);
      socket.off('groupcall:webrtc-offer', handleWebRTCOffer);
      socket.off('groupcall:webrtc-answer', handleWebRTCAnswer);
      socket.off('groupcall:webrtc-ice-candidate', handleICECandidate);
    };
  }, [socket, roomId, participants, localStream, callType, authUser, addParticipant, removeParticipant, updateParticipantStream, updateParticipantScreenShare, updateParticipantPeerConnection, updateParticipantTracks]);
  
  // Handle participant video elements and screen shares
  useEffect(() => {
    participants.forEach((participant, userId) => {
      // Skip local participant (handled separately)
      if (participant.isLocal) return;
      
      // Handle camera video
      let videoRef = participantVideoRefs.current.get(userId);
      if (!videoRef) {
        videoRef = { current: null };
        participantVideoRefs.current.set(userId, videoRef);
      }
      
      const videoElement = videoRef.current;
      if (videoElement) {
        // Only show camera if not screen sharing
        if (participant.stream && !participant.tracks?.screenSharing) {
          const videoTracks = participant.stream.getVideoTracks();
          const hasActiveVideo = videoTracks.some(track => 
            track.enabled && track.readyState === 'live' && !track.muted &&
            !track.label.toLowerCase().includes('screen') // Exclude screen share tracks
          );
          
          if (hasActiveVideo && participant.tracks?.video) {
            videoElement.srcObject = participant.stream;
            videoElement.play().catch(err => {
              if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
              }
            });
          } else {
            videoElement.srcObject = null;
          }
        } else {
          videoElement.srcObject = null;
        }
      }
      
      // Handle screen share (separate video element)
      let screenShareRef = participantScreenShareRefs.current.get(userId);
      if (!screenShareRef) {
        screenShareRef = { current: null };
        participantScreenShareRefs.current.set(userId, screenShareRef);
      }
      
      const screenShareElement = screenShareRef.current;
      if (screenShareElement && participant.screenShareStream) {
        const screenShareTracks = participant.screenShareStream.getVideoTracks();
        const hasActiveScreenShare = screenShareTracks.some(track => 
          track.enabled && track.readyState === 'live' && !track.muted
        );
        
        if (hasActiveScreenShare) {
          screenShareElement.srcObject = participant.screenShareStream;
          screenShareElement.play().catch(err => {
            if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
            }
          });
        } else {
          screenShareElement.srcObject = null;
        }
      } else if (screenShareElement && !participant.screenShareStream) {
        screenShareElement.srcObject = null;
      }
    });
  }, [participants]);
  
  if (callState !== 'in-call') return null;
  
  // Filter out local participant from remote participants array
  const authUserId = typeof authUser._id === 'object' ? authUser._id._id || authUser._id : authUser._id;
  const authUserIdStr = String(authUserId);
  const remoteParticipants = Array.from(participants.values()).filter(p => 
    !p.isLocal && String(p.userId) !== authUserIdStr
  );
  const totalParticipants = remoteParticipants.length + 1; // +1 for local video
  
  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col overflow-hidden">
      {/* Participants Grid */}
      <div className="flex-1 p-4">
        <div
          className="h-full grid gap-4"
          style={{
            gridTemplateColumns: `repeat(${gridColumns}, 1fr)`,
          }}
        >
          {/* Local Video / Screen Share */}
          <div className="relative bg-base-200 rounded-lg overflow-hidden border-2 border-primary">
            {/* Local Screen Share (shown prominently if active) */}
            {isScreenSharing && screenShareStream ? (
              <>
                <video
                  ref={localScreenShareRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-contain"
                />
                {/* Small camera preview overlay */}
                {isVideoEnabled && localStream && (
                  <div className="absolute top-2 right-2 w-32 h-24 bg-black rounded-lg overflow-hidden border-2 border-primary">
                    <video
                      ref={localVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="absolute top-2 left-2 bg-red-500 text-white text-xs px-2 py-1 rounded">
                  Sharing Screen
                </div>
              </>
            ) : isVideoEnabled && localStream ? (
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="w-24 h-24 rounded-full overflow-hidden mb-2">
                  <ProfileImage
                    src={authUser?.profilePic}
                    alt="You"
                    className="w-full h-full object-cover"
                  />
                </div>
                <p className="text-sm text-base-content/60">You</p>
                {!isVideoEnabled && (
                  <p className="text-xs text-base-content/40">Camera off</p>
                )}
              </div>
            )}
            <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
              You {isMuted && '🔇'}
            </div>
          </div>
          
          {/* Remote Participants */}
          {remoteParticipants.length === 0 && (
            <div className="col-span-full flex items-center justify-center">
              <div className="text-center text-base-content/60">
                <p className="text-lg mb-2">Waiting for participants...</p>
                <p className="text-sm">Share the call link or wait for others to join</p>
              </div>
            </div>
          )}
          {remoteParticipants.map((participant) => {
            const videoRef = participantVideoRefs.current.get(participant.userId);
            const screenShareRef = participantScreenShareRefs.current.get(participant.userId);
            if (!videoRef) {
              participantVideoRefs.current.set(participant.userId, { current: null });
            }
            if (!screenShareRef) {
              participantScreenShareRefs.current.set(participant.userId, { current: null });
            }
            
            const isScreenSharing = participant.tracks?.screenSharing || participant.screenShareStream;
            
            return (
              <div
                key={participant.userId}
                className="relative bg-base-200 rounded-lg overflow-hidden border-2 border-base-300"
              >
                {/* Screen Share (shown prominently if active) */}
                {isScreenSharing && participant.screenShareStream ? (
                  <>
                    <video
                      ref={(el) => {
                        const ref = participantScreenShareRefs.current.get(participant.userId);
                        if (ref) ref.current = el;
                      }}
                      autoPlay
                      playsInline
                      className="w-full h-full object-contain"
                    />
                    {/* Small camera preview overlay */}
                    {participant.tracks?.video && participant.stream && (
                      <div className="absolute top-2 right-2 w-32 h-24 bg-black rounded-lg overflow-hidden border-2 border-base-300">
                        <video
                          ref={(el) => {
                            const ref = participantVideoRefs.current.get(participant.userId);
                            if (ref) ref.current = el;
                          }}
                          autoPlay
                          playsInline
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="absolute top-2 left-2 bg-red-500 text-white text-xs px-2 py-1 rounded">
                      {participant.userInfo?.fullname || 'Participant'} is sharing
                    </div>
                  </>
                ) : participant.tracks?.video && participant.stream ? (
                  <video
                    ref={(el) => {
                      const ref = participantVideoRefs.current.get(participant.userId);
                      if (ref) ref.current = el;
                    }}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="w-24 h-24 rounded-full overflow-hidden mb-2">
                      <ProfileImage
                        src={participant.userInfo?.profilePic}
                        alt={participant.userInfo?.fullname}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <p className="text-sm text-base-content/60">
                      {participant.userInfo?.fullname || 'Participant'}
                    </p>
                    {!participant.tracks?.video && (
                      <p className="text-xs text-base-content/40">Camera off</p>
                    )}
                  </div>
                )}
                <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                  {participant.userInfo?.fullname || 'Participant'}
                  {!participant.tracks?.audio && ' 🔇'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Call Info Bar */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black/50 text-white px-4 py-2 rounded-lg">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">
            {formatCallDuration(callDuration)}
          </span>
          <span className="text-xs text-white/70">
            {totalParticipants} participant{totalParticipants !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
      
      {/* Call Controls */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent pb-8 pt-16 pointer-events-none">
        <div className="pointer-events-auto">
          <CallControls />
        </div>
      </div>
    </div>
  );
};

export default GroupCallWindow;

