import { create } from "zustand";
import { useAuthStore } from "./useAuthStore";
import { useChatStore } from "./useChatStore";
import toast from "react-hot-toast";
import { createOffer, createAnswer, setRemoteDescription } from "../lib/webrtc";

export const useCallStore = create((set, get) => ({
  // Call state
  callState: 'idle', // 'idle' | 'calling' | 'ringing' | 'in-call' | 'ended'
  callType: null, // 'voice' | 'video' | null
  callId: null,
  isGroupCall: false, // true for group calls, false for 1-on-1
  roomId: null, // Group call room ID
  groupId: null, // Group ID for group calls
  groupName: null, // Group name for group calls
  
  // Call participants
  caller: null, // { userId, fullname, profilePic }
  receiver: null, // { userId, fullname, profilePic }
  
  // Group call participants
  // { [userId]: { userId, userInfo: { fullname, profilePic }, tracks: { audio, video }, stream, screenShareStream, peerConnection, isLocal } }
  participants: new Map(),
  
  // WebRTC streams
  localStream: null,
  remoteStream: null, // For 1-on-1 calls
  peerConnection: null, // For 1-on-1 calls
  
  // Call controls
  isMuted: false,
  isVideoEnabled: true,
  isSpeakerEnabled: false,
  isScreenSharing: false,
  screenShareStream: null,
  
  // Call metadata
  callDuration: 0,
  callStartTime: null,
  durationInterval: null,
  
  // Reset call state
  resetCallState: () => {
    const { durationInterval, localStream, peerConnection } = get();
    
    // Clear interval
    if (durationInterval) {
      clearInterval(durationInterval);
    }
    
    // Stop local stream
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    
    // Stop screen share stream
    const { screenShareStream } = get();
    if (screenShareStream) {
      screenShareStream.getTracks().forEach(track => track.stop());
    }
    
    // Close peer connection
    if (peerConnection) {
      peerConnection.close();
    }
    
    // Cleanup group call participants
    const { participants } = get();
    participants.forEach(participant => {
      if (participant.stream) {
        participant.stream.getTracks().forEach(track => track.stop());
      }
      if (participant.peerConnection) {
        participant.peerConnection.close();
      }
    });
    
    set({
      callState: 'idle',
      callType: null,
      callId: null,
      isGroupCall: false,
      roomId: null,
      groupId: null,
      groupName: null,
      caller: null,
      receiver: null,
      participants: new Map(),
      localStream: null,
      remoteStream: null,
      peerConnection: null,
      isMuted: false,
      isVideoEnabled: true,
      isSpeakerEnabled: false,
      isScreenSharing: false,
      screenShareStream: null,
      callDuration: 0,
      callStartTime: null,
      durationInterval: null,
    });
  },
  
  // Set peer connection
  setPeerConnection: (pc) => set({ peerConnection: pc }),
  
  // Set local stream
  setLocalStream: (stream) => set({ localStream: stream }),
  
  // Set remote stream
  setRemoteStream: (stream) => set({ remoteStream: stream }),
  
  // Set call state
  setCallState: (state) => set({ callState: state }),
  
  // Set call type
  setCallType: (type) => set({ callType: type }),
  
  // Set call ID
  setCallId: (id) => set({ callId: id }),
  
  // Set caller info
  setCaller: (caller) => set({ caller }),
  
  // Set receiver info
  setReceiver: (receiver) => set({ receiver }),
  
  // Toggle mute
  // Step 1: Update WebRTC track.enabled (actual media control)
  // Step 2: Send WebSocket signal for UI synchronization (signaling only, no media)
  toggleMute: () => {
    const { localStream, isMuted, isGroupCall, roomId } = get();
    const { socket } = useAuthStore.getState();
    
    // Step 1: Update WebRTC track state (actual media control)
    if (localStream) {
      const newMuteState = !isMuted;
      localStream.getAudioTracks().forEach(track => {
        track.enabled = newMuteState; // WebRTC: actual track control
      });
      
      // Step 2: Send WebSocket signal for UI synchronization (signaling only)
      if (isGroupCall && socket && roomId) {
        socket.emit('groupcall:update-tracks', {
          roomId,
          tracks: { audio: newMuteState }, // WebSocket: UI state sync
        });
      }
    }
    
    set({ isMuted: !isMuted });
  },
  
  // Toggle video - enable/disable camera with comprehensive validation
  toggleVideo: async () => {
    const state = get();
    const { 
      localStream, 
      isVideoEnabled, 
      peerConnection, 
      callType, 
      callId, 
      caller, 
      receiver, 
      isScreenSharing,
      callState,
      isGroupCall,
      roomId,
    } = state;
    const { authUser, socket } = useAuthStore.getState();
    
    // Validation: Only allow video toggle for video calls
    if (callType !== 'video') {
      toast.error("Video controls are only available for video calls");
      return;
    }
    
    // Validation: Must be in an active call
    if (callState !== 'in-call') {
      toast.error("No active call to toggle video");
      return;
    }
    
    // Validation: Peer connection must exist (only for 1-on-1 calls)
    if (!isGroupCall && !peerConnection) {
      toast.error("Call connection not established. Please wait...");
      return;
    }
    
    // Validation: Socket must exist
    if (!socket) {
      toast.error("Connection lost. Please reconnect.");
      return;
    }
    
    // Socket.IO connection check - be lenient to allow reconnection attempts
    // socket.connected is a boolean, but we'll also check if socket exists and has methods
    // The actual emit will fail gracefully if not connected
    const isSocketConnected = socket.connected === true || (socket.id && typeof socket.emit === 'function');
    if (!isSocketConnected) {
      console.warn('Socket connection check:', { 
        connected: socket.connected, 
        disconnected: socket.disconnected,
        id: socket.id,
        hasEmit: typeof socket.emit === 'function'
      });
      // Don't block - let the emit try anyway, it will handle errors gracefully
      // toast.error("Connection lost. Please reconnect.");
      // return;
    }
    
    // DISABLE VIDEO - Best Practice: Use track.enabled = false (no renegotiation needed)
    if (isVideoEnabled) {
      try {
        // Don't disable video if screen sharing is active (screen share is video)
        if (isScreenSharing) {
          toast.info("Please stop screen sharing first to disable camera");
          return;
        }
        
        // Best Practice: Just disable the track, don't remove it
        // This avoids renegotiation and stream recreation, preventing glitches
        if (localStream) {
          const videoTracks = localStream.getVideoTracks();
          let disabledCount = 0;
          
          videoTracks.forEach(track => {
            if (track.readyState === 'live') {
              track.enabled = false;
              disabledCount++;
              console.log('✅ Video track disabled:', track.label);
            }
          });
          
          if (disabledCount === 0) {
            console.warn('⚠️ No live video tracks found to disable');
          }
        }
        
        // Also disable in peer connection sender (if track exists) - for 1-on-1 calls
        if (!isGroupCall && peerConnection) {
          const senders = peerConnection.getSenders();
          const videoSender = senders.find(sender => sender.track?.kind === 'video');
          if (videoSender && videoSender.track && videoSender.track.readyState === 'live') {
            videoSender.track.enabled = false;
            console.log('✅ Video track disabled in peer connection sender');
          }
        }
        
        // For group calls, disable in all participant peer connections
        if (isGroupCall) {
          participants.forEach((participant, userId) => {
            if (participant.peerConnection) {
              const senders = participant.peerConnection.getSenders();
              const videoSender = senders.find(sender => sender.track?.kind === 'video');
              if (videoSender && videoSender.track && videoSender.track.readyState === 'live') {
                videoSender.track.enabled = false;
              }
            }
          });
        }
        
        // Update state
        set({ isVideoEnabled: false });
        console.log('✅ Video disabled (track.enabled = false) - no renegotiation needed');
        
        // Update group call tracks if in group call
        if (isGroupCall && socket && roomId) {
          socket.emit('groupcall:update-tracks', {
            roomId,
            tracks: { video: false },
          });
        }
        
        toast.success("Camera turned off");
        
      } catch (error) {
        console.error('Error disabling video:', error);
        // Still disable locally even if there's an error
        if (localStream) {
          const videoTracks = localStream.getVideoTracks();
          videoTracks.forEach(track => {
            if (track.readyState === 'live') {
              track.enabled = false;
            }
          });
        }
        set({ isVideoEnabled: false });
        toast.error("Failed to disable video: " + (error.message || 'Unknown error'));
      }
      return;
    }
    
    // ENABLE VIDEO - Best Practice: Use track.enabled = true (no renegotiation needed)
    if (!isVideoEnabled) {
      try {
        // If screen sharing is active, user needs to stop it first via the screen share button
        // The CallControls component handles this automatically
        if (isScreenSharing) {
          toast.info("Please stop screen sharing first to enable camera");
          return;
        }
        
        // Best Practice: Just enable the track, don't recreate it
        // This avoids renegotiation and stream recreation, preventing glitches
        
        // Check if video tracks exist in local stream
        const existingVideoTracks = localStream?.getVideoTracks() || [];
        
        if (existingVideoTracks.length > 0) {
          // Tracks exist - check if any are live
          const liveTrack = existingVideoTracks.find(track => track.readyState === 'live');
          
          if (liveTrack) {
            // Track is live - just enable it (Best Practice)
            liveTrack.enabled = true;
            console.log('✅ Video track enabled:', liveTrack.label);
            
            // Also enable in peer connection sender if it exists - for 1-on-1 calls
            if (!isGroupCall && peerConnection) {
              const senders = peerConnection.getSenders();
              const videoSender = senders.find(sender => sender.track?.kind === 'video');
              if (videoSender && videoSender.track && videoSender.track.readyState === 'live') {
                videoSender.track.enabled = true;
                console.log('✅ Video track enabled in peer connection sender');
              }
            }
            
            // For group calls, enable in all participant peer connections
            if (isGroupCall) {
              participants.forEach((participant, userId) => {
                if (participant.peerConnection) {
                  const senders = participant.peerConnection.getSenders();
                  const videoSender = senders.find(sender => sender.track?.kind === 'video');
                  if (videoSender && videoSender.track && videoSender.track.readyState === 'live') {
                    videoSender.track.enabled = true;
                  }
                }
              });
            }
            
            // Update state
        set({ isVideoEnabled: true });
        console.log('✅ Video enabled (track.enabled = true) - no renegotiation needed');
        
        // Update group call tracks if in group call
        if (isGroupCall && socket && roomId) {
          socket.emit('groupcall:update-tracks', {
            roomId,
            tracks: { video: true },
          });
        }
        
        toast.success("Camera turned on");
        return;
          } else {
            // Tracks exist but all ended - need to get new stream
            console.log('⚠️ Video tracks exist but all ended - need to get new stream');
            // Fall through to get new stream
          }
        }
        
        // No live tracks exist - need to get camera stream (only when tracks are truly missing)
        const { getLocalStream, replaceVideoTrack } = await import('../lib/webrtc');
        
        // Get camera stream
        const videoStream = await getLocalStream('video');
        const videoTrack = videoStream.getVideoTracks()[0];
        
        // Validation: Video track must be obtained
        if (!videoTrack) {
          throw new Error('Failed to get camera stream');
        }
        
        // Validation: Video track must be live
        if (videoTrack.readyState !== 'live') {
          throw new Error('Camera stream is not active');
        }
        
        // Get senders
        const senders = peerConnection.getSenders();
        const videoSender = senders.find(sender => sender.track?.kind === 'video');
        
        // Add or replace video track in peer connection (only when track doesn't exist)
        if (videoSender) {
          // Replace existing sender track
          await videoSender.replaceTrack(videoTrack);
        } else {
          // Add new track to peer connection
          if (localStream) {
            peerConnection.addTrack(videoTrack, localStream);
          } else {
            peerConnection.addTrack(videoTrack, videoStream);
          }
        }
        
        // Update local stream
        if (localStream) {
          // Remove old video tracks if any
          localStream.getVideoTracks().forEach(track => {
            if (track.id !== videoTrack.id && track.readyState === 'live') {
              track.stop();
              localStream.removeTrack(track);
            }
          });
          // Add new video track if not already present
          if (!localStream.getVideoTracks().some(t => t.id === videoTrack.id)) {
            localStream.addTrack(videoTrack);
          }
        } else {
          set({ localStream: videoStream });
        }
        
        // Note: When adding a new track (not just enabling), renegotiation IS needed
        // But this should only happen when tracks are truly missing (ended), not when just disabled
        if (socket && peerConnection.signalingState !== 'closed') {
          await new Promise(resolve => setTimeout(resolve, 200));
          
          const authUserId = typeof authUser._id === 'object' ? authUser._id._id || authUser._id : authUser._id;
          const callerId = typeof caller?.userId === 'object' ? caller.userId._id || caller.userId : caller?.userId;
          const receiverId = typeof receiver?.userId === 'object' ? receiver.userId._id || receiver.userId : receiver?.userId;
          
          if (callerId && receiverId) {
            const isCaller = String(authUserId) === String(callerId);
            const otherUserId = isCaller ? receiverId : callerId;
            
            try {
              const { createOffer } = await import('../lib/webrtc');
              const offer = await createOffer(peerConnection);
              if (offer) {
                socket.emit('webrtc:offer', { callId, offer, receiverId: otherUserId });
                console.log('📤 Renegotiation offer sent for new video track');
              }
            } catch (offerError) {
              console.error('Error creating offer for new video track:', offerError);
            }
          }
        }
        
        set({ isVideoEnabled: true });
        console.log('✅ Video enabled (new track added)');
        
        // Update group call tracks if in group call
        if (isGroupCall && socket && roomId) {
          socket.emit('groupcall:update-tracks', {
            roomId,
            tracks: { video: true },
          });
        }
        
        toast.success("Camera turned on");
        
      } catch (error) {
        console.error('Error enabling video:', error);
        
        // Provide specific error messages
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          toast.error("Camera permission denied. Please allow camera access.");
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          toast.error("No camera found. Please connect a camera.");
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
          toast.error("Camera is being used by another application.");
        } else {
          toast.error(error.message || "Failed to enable camera");
        }
      }
    }
  },
  
  // Toggle speaker
  toggleSpeaker: () => {
    set({ isSpeakerEnabled: !get().isSpeakerEnabled });
  },

  // Set screen sharing state
  setScreenSharing: (isSharing, stream = null) => {
    set({ isScreenSharing: isSharing, screenShareStream: stream });
  },
  
  // Start call duration timer
  startCallTimer: () => {
    const startTime = Date.now();
    set({ callStartTime: new Date(startTime) });
    
    const interval = setInterval(() => {
      const duration = Math.floor((Date.now() - startTime) / 1000);
      set({ callDuration: duration });
    }, 1000);
    
    set({ durationInterval: interval });
  },
  
  // Stop call duration timer
  stopCallTimer: () => {
    const { durationInterval } = get();
    if (durationInterval) {
      clearInterval(durationInterval);
      set({ durationInterval: null });
    }
  },
  
  // Initiate call
  initiateCall: async (receiverId, callType) => {
    const { socket } = useAuthStore.getState();
    const { authUser } = useAuthStore.getState();
    const { users } = useChatStore.getState();
    
    if (!socket || !authUser) {
      toast.error("Not connected. Please check your connection.");
      return;
    }
    
    // Prevent users from calling themselves
    const authUserId = typeof authUser._id === 'object' ? authUser._id._id || authUser._id : authUser._id;
    const receiverIdStr = typeof receiverId === 'object' ? receiverId._id || receiverId : receiverId;
    
    if (String(authUserId) === String(receiverIdStr)) {
      toast.error("You cannot call yourself");
      return;
    }
    
    // Find receiver info
    const receiver = users.find(u => {
      const uId = typeof u._id === 'object' ? u._id._id || u._id : u._id;
      return String(uId) === String(receiverIdStr);
    });
    if (!receiver) {
      toast.error("User not found");
      return;
    }
    
    // Check if user is online
    const { onlineUsers } = useAuthStore.getState();
    if (!onlineUsers.includes(receiverIdStr)) {
      toast.error("User is offline");
      return;
    }
    
    // Generate unique call ID
    const callId = `${authUser._id}_${receiverId}_${Date.now()}`;
    
    // Set call info - for voice calls, video should be disabled initially
    set({
      callId,
      callType,
      callState: 'calling',
      isVideoEnabled: callType === 'video', // Only enable video for video calls
      caller: {
        userId: authUser._id,
        fullname: authUser.fullname,
        profilePic: authUser.profilePic,
      },
      receiver: {
        userId: receiver._id,
        fullname: receiver.fullname,
        profilePic: receiver.profilePic,
      },
    });
    
    // Emit call initiation
    socket.emit('call:initiate', {
      callId,
      receiverId,
      callType,
      callerInfo: {
        userId: authUser._id,
        fullname: authUser.fullname,
        profilePic: authUser.profilePic,
      },
    });
    
    // Set timeout for no answer
    setTimeout(() => {
      const { callState, callId: currentCallId } = get();
      if ((callState === 'calling' || callState === 'ringing') && currentCallId === callId) {
        get().endCall('no-answer');
        toast.error("No answer. Call cancelled.");
      }
    }, 60000); // 60 seconds timeout
  },
  
  // Send call status message to chat
  sendCallStatusMessage: async (callType, status, duration = null) => {
    try {
      const { receiver, caller } = get();
      const { authUser } = useAuthStore.getState();
      const { selectedUser, sendMessage } = useChatStore.getState();
      
      // Determine the other user in the call
      const otherUser = receiver?.userId === authUser._id ? caller : receiver;
      if (!otherUser) return;
      
      // Only send if we're in a chat with the call participant
      const otherUserId = typeof otherUser.userId === 'object' ? otherUser.userId._id || otherUser.userId : otherUser.userId;
      const selectedUserId = selectedUser?._id ? (typeof selectedUser._id === 'object' ? selectedUser._id._id || selectedUser._id : selectedUser._id) : null;
      
      if (otherUserId && selectedUserId && String(otherUserId) === String(selectedUserId)) {
        const callTypeText = callType === 'video' ? 'Video' : 'Voice';
        let statusText = '';
        
        if (status === 'started') {
          statusText = `${callTypeText} call started`;
        } else if (status === 'ended') {
          if (duration) {
            const minutes = Math.floor(duration / 60);
            const seconds = duration % 60;
            const durationText = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
            statusText = `${callTypeText} call ended (${durationText})`;
          } else {
            statusText = `${callTypeText} call ended`;
          }
        } else if (status === 'missed') {
          statusText = `Missed ${callTypeText.toLowerCase()} call`;
        }
        
        if (statusText) {
          await sendMessage({
            text: `📞 ${statusText}`,
          });
        }
      }
    } catch (error) {
      console.error('Error sending call status message:', error);
      // Don't show error toast - call status messages are optional
    }
  },

  // Answer call
  answerCall: async () => {
    const { socket } = useAuthStore.getState();
    const { callId, callType, caller, receiver } = get();
    const { authUser } = useAuthStore.getState();
    
    if (!socket) {
      toast.error("Not connected. Please check your connection.");
      return;
    }
    
    if (!callId) {
      toast.error("Call information missing");
      return;
    }
    
    // Verify that the current user is the receiver (can only answer incoming calls)
    const authUserId = typeof authUser._id === 'object' ? authUser._id._id || authUser._id : authUser._id;
    const callerId = caller ? (typeof caller.userId === 'object' ? caller.userId._id || caller.userId : caller.userId) : null;
    const receiverId = receiver ? (typeof receiver.userId === 'object' ? receiver.userId._id || receiver.userId : receiver.userId) : null;
    
    // Only receiver can answer
    if (String(authUserId) !== String(receiverId)) {
      toast.error("Only the receiver can answer the call");
      return;
    }
    
    // Prevent answering your own call
    if (String(authUserId) === String(callerId)) {
      toast.error("You cannot answer your own call");
      return;
    }
    
    socket.emit('call:answer', { callId });
    set({ callState: 'in-call' });
    get().startCallTimer();
    
    // Send call started message
    get().sendCallStatusMessage(callType, 'started');
  },
  
  // Reject call
  rejectCall: () => {
    const { socket, isGroupCall } = get();
    const { callId } = get();
    
    // For 1-on-1 calls, emit reject event
    if (!isGroupCall && socket && callId) {
      socket.emit('call:reject', { callId, reason: 'rejected' });
    }
    // For group calls, just reset state (no reject event needed)
    
    get().resetCallState();
    toast("Call rejected", { icon: 'ℹ️' });
  },
  
  // Group Call Functions
  setRoomId: (roomId) => set({ roomId }),
  setIsGroupCall: (isGroupCall) => set({ isGroupCall }),
  
  // Add participant to group call
  addParticipant: (userId, participantData) => {
    const { participants } = get();
    const newParticipants = new Map(participants);
    newParticipants.set(userId, {
      userId,
      ...participantData,
    });
    set({ participants: newParticipants });
  },
  
  // Remove participant from group call
  removeParticipant: (userId) => {
    const { participants } = get();
    const participant = participants.get(userId);
    if (participant) {
      if (participant.stream) {
        participant.stream.getTracks().forEach(track => track.stop());
      }
      if (participant.peerConnection) {
        participant.peerConnection.close();
      }
    }
    const newParticipants = new Map(participants);
    newParticipants.delete(userId);
    set({ participants: newParticipants });
  },
  
  // Update participant tracks
  updateParticipantTracks: (userId, tracks) => {
    const { participants } = get();
    const participant = participants.get(userId);
    if (participant) {
      const newParticipants = new Map(participants);
      newParticipants.set(userId, {
        ...participant,
        tracks: { ...participant.tracks, ...tracks },
      });
      set({ participants: newParticipants });
    }
  },
  
  // Update participant stream
  updateParticipantStream: (userId, stream) => {
    const { participants } = get();
    const participant = participants.get(userId);
    if (participant) {
      const newParticipants = new Map(participants);
      newParticipants.set(userId, {
        ...participant,
        stream,
      });
      set({ participants: newParticipants });
    }
  },
  
  // Update participant screen share stream
  updateParticipantScreenShare: (userId, screenShareStream) => {
    const { participants } = get();
    const participant = participants.get(userId);
    if (participant) {
      const newParticipants = new Map(participants);
      newParticipants.set(userId, {
        ...participant,
        screenShareStream,
      });
      set({ participants: newParticipants });
    }
  },
  
  // Update participant peer connection
  updateParticipantPeerConnection: (userId, peerConnection) => {
    const { participants } = get();
    const participant = participants.get(userId);
    if (participant) {
      const newParticipants = new Map(participants);
      newParticipants.set(userId, {
        ...participant,
        peerConnection,
      });
      set({ participants: newParticipants });
    }
  },
  
  // Initiate group call
  initiateGroupCall: async (groupId, callType) => {
    const { socket } = useAuthStore.getState();
    const { authUser } = useAuthStore.getState();
    const { groups } = useChatStore.getState();
    
    if (!socket || !authUser) {
      toast.error("Not connected. Please check your connection.");
      return;
    }
    
    // Find group info
    const group = groups.find(g => {
      const gId = typeof g._id === 'object' ? g._id._id || g._id : g._id;
      return String(gId) === String(groupId);
    });
    
    if (!group) {
      toast.error("Group not found");
      return;
    }
    
    // Generate unique room ID
    const roomId = `group_${groupId}_${Date.now()}`;
    
    // Step A: Add local participant immediately (don't wait for remote participants)
    const authUserId = typeof authUser._id === 'object' ? authUser._id._id || authUser._id : authUser._id;
    const authUserIdStr = String(authUserId);
    
    const localParticipant = {
      userId: authUserIdStr,
      userInfo: {
        userId: authUser._id,
        fullname: authUser.fullname,
        profilePic: authUser.profilePic,
      },
      tracks: { audio: true, video: callType === 'video' },
      stream: null,
      peerConnection: null,
      isLocal: true, // Mark as local participant
    };
    
    const initialParticipants = new Map();
    initialParticipants.set(authUserIdStr, localParticipant);
    
    // Set group call info with local participant
    // Step A: Set call UI visible immediately (callState: 'in-call')
    set({
      callId: roomId,
      roomId,
      callType,
      callState: 'in-call', // Show call UI immediately, don't wait for remote participants
      isGroupCall: true,
      isVideoEnabled: callType === 'video',
      caller: {
        userId: authUser._id,
        fullname: authUser.fullname,
        profilePic: authUser.profilePic,
      },
      participants: initialParticipants, // Local participant added immediately
    });
    
    // Start call timer immediately
    get().startCallTimer();
    
    // Emit group call initiation
    socket.emit('groupcall:join', {
      roomId,
      groupId,
      callType,
      userInfo: {
        userId: authUser._id,
        fullname: authUser.fullname,
        profilePic: authUser.profilePic,
      },
    });
    
    console.log(`✅ Group call ${roomId} initiated - Local participant added immediately`);
  },
  
  // Join group call
  joinGroupCall: async (roomId, groupId, callType) => {
    const { socket } = useAuthStore.getState();
    const { authUser } = useAuthStore.getState();
    
    if (!socket || !authUser) {
      toast.error("Not connected. Please check your connection.");
      return;
    }
    
    const authUserId = typeof authUser._id === 'object' ? authUser._id._id || authUser._id : authUser._id;
    const authUserIdStr = String(authUserId);
    
    // Step A: Add local participant immediately (don't wait for remote participants)
    const localParticipant = {
      userId: authUserIdStr,
      userInfo: {
        userId: authUser._id,
        fullname: authUser.fullname,
        profilePic: authUser.profilePic,
      },
      tracks: { audio: true, video: callType === 'video' },
      stream: null,
      peerConnection: null,
      isLocal: true, // Mark as local participant
    };
    
    const initialParticipants = new Map();
    initialParticipants.set(authUserIdStr, localParticipant);
    
    // Set group call info and add local participant immediately
    set({
      callId: roomId,
      roomId,
      callType,
      callState: 'in-call',
      isGroupCall: true,
      isVideoEnabled: callType === 'video',
      participants: initialParticipants, // Local participant added immediately
    });
    
    // Emit join group call
    socket.emit('groupcall:join', {
      roomId,
      groupId,
      callType,
      userInfo: {
        userId: authUser._id,
        fullname: authUser.fullname,
        profilePic: authUser.profilePic,
      },
    });
    
    get().startCallTimer();
    console.log(`✅ Joined group call ${roomId} - Local participant added immediately`);
  },
  
  // Leave group call
  leaveGroupCall: () => {
    const { socket } = useAuthStore.getState();
    const { roomId } = get();
    
    if (socket && roomId) {
      socket.emit('groupcall:leave', { roomId });
    }
    
    get().endCall('left');
  },
  
  // End call
  endCall: (reason = 'ended') => {
    try {
      console.log('📞 Ending call...', reason);
      
      const { socket } = useAuthStore.getState();
      const { callId, callType, callDuration } = get();
      
      // Stop timer first
      get().stopCallTimer();
      
      // Send call ended message before resetting state
      if (callType && reason === 'ended') {
        get().sendCallStatusMessage(callType, 'ended', callDuration);
      } else if (reason === 'no-answer' || reason === 'rejected') {
        get().sendCallStatusMessage(callType, 'missed');
      }
      
      const { isGroupCall, roomId } = get();
      
      // Emit end event if socket and callId exist
      if (socket && callId) {
        if (isGroupCall && roomId) {
          // Group call - emit leave event
          console.log('📤 Leaving group call:', roomId);
          socket.emit('groupcall:leave', { roomId });
        } else {
          // 1-on-1 call - emit end event
          console.log('📤 Emitting call:end event:', callId);
          socket.emit('call:end', { callId, reason });
        }
      } else {
        console.warn('⚠️ Cannot emit call:end - missing socket or callId', { socket: !!socket, callId });
      }
      
      // Always reset state, even if socket/callId is missing
      get().resetCallState();
      
      console.log('✅ Call ended successfully');
      
      // Show toast notification
      toast("Call ended");
    } catch (error) {
      console.error('❌ Error ending call:', error);
      
      // Force reset state even on error
      try {
        get().stopCallTimer();
        get().resetCallState();
        toast.error("Error ending call, but call was terminated");
      } catch (resetError) {
        console.error('❌ Critical: Failed to reset call state:', resetError);
      }
    }
  },
}));
