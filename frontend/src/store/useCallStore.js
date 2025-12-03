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
  
  // Call participants
  caller: null, // { userId, fullname, profilePic }
  receiver: null, // { userId, fullname, profilePic }
  
  // WebRTC streams
  localStream: null,
  remoteStream: null,
  peerConnection: null,
  
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
    
    set({
      callState: 'idle',
      callType: null,
      callId: null,
      caller: null,
      receiver: null,
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
  toggleMute: () => {
    const { localStream, isMuted } = get();
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = isMuted;
      });
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
      socket,
      isScreenSharing,
      callState 
    } = state;
    const { authUser } = useAuthStore.getState();
    
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
    
    // DISABLE VIDEO
    if (isVideoEnabled) {
      try {
        // Note: Screen sharing can continue even if video is disabled
        // Screen share replaces video track, so disabling video during screen share is OK
        
        // Validation: Local stream must exist
        if (!localStream) {
          console.warn('No local stream to disable video');
          set({ isVideoEnabled: false });
          return;
        }
        
        const videoTracks = localStream.getVideoTracks();
        
        // Validation: Video tracks must exist
        if (videoTracks.length === 0) {
          console.warn('No video tracks found in local stream');
          set({ isVideoEnabled: false });
          return;
        }
        
        // Disable all video tracks
        videoTracks.forEach(track => {
          if (track.readyState === 'live') {
            track.enabled = false;
          }
        });
        
        // Update state
        set({ isVideoEnabled: false });
        console.log('✅ Video disabled');
        
      } catch (error) {
        console.error('Error disabling video:', error);
        toast.error("Failed to disable video");
        // Still update state to prevent UI inconsistency
        set({ isVideoEnabled: false });
      }
      return;
    }
    
    // ENABLE VIDEO
    if (!isVideoEnabled) {
      try {
        // Validation: Check if screen sharing is active
        // Screen sharing replaces video, so we need to stop it first
        if (isScreenSharing) {
          toast.error("Please stop screen sharing before enabling camera");
          return;
        }
        
        // Validation: Peer connection state must be valid
        const validStates = ['stable', 'have-local-offer', 'have-remote-offer', 'have-local-pranswer', 'have-remote-pranswer'];
        if (!validStates.includes(peerConnection.signalingState)) {
          toast.error("Call connection is not ready. Please wait...");
          return;
        }
        
        // Check if video tracks already exist in local stream
        const existingVideoTracks = localStream?.getVideoTracks() || [];
        
        if (existingVideoTracks.length > 0) {
          // Video tracks exist - just enable them
          const allEnabled = existingVideoTracks.every(track => track.enabled && track.readyState === 'live');
          
          if (allEnabled) {
            // Already enabled
            set({ isVideoEnabled: true });
            return;
          }
          
          // Enable existing tracks
          existingVideoTracks.forEach(track => {
            if (track.readyState === 'live') {
              track.enabled = true;
            }
          });
          
          set({ isVideoEnabled: true });
          console.log('✅ Video enabled (existing tracks)');
          return;
        }
        
        // No video tracks exist - need to get camera stream
        const { getLocalStream, replaceVideoTrack, createOffer } = await import('../lib/webrtc');
        
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
        
        // Check if video sender exists in peer connection
        const senders = peerConnection.getSenders();
        const videoSender = senders.find(sender => sender.track?.kind === 'video');
        const hadVideoBefore = !!videoSender;
        
        // Add or replace video track
        await replaceVideoTrack(peerConnection, videoTrack, videoStream);
        
        // Update local stream
        if (localStream) {
          // Remove old video tracks if any
          localStream.getVideoTracks().forEach(track => {
            if (track.id !== videoTrack.id) {
              track.stop();
              localStream.removeTrack(track);
            }
          });
          // Add new video track
          if (!localStream.getVideoTracks().some(t => t.id === videoTrack.id)) {
            localStream.addTrack(videoTrack);
          }
        } else {
          set({ localStream: videoStream });
        }
        
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
          
          if (!callerId || !receiverId) {
            throw new Error('Call participant information missing');
          }
          
          const isCaller = String(authUserId) === String(callerId);
          const otherUserId = isCaller ? receiverId : callerId;
          
          // Create and send renegotiation offer
          const offer = await createOffer(peerConnection);
          if (!offer) {
            throw new Error('Failed to create renegotiation offer');
          }
          
          socket.emit('webrtc:offer', { callId, offer, receiverId: otherUserId });
          console.log('📤 Renegotiation offer sent for video track');
        }
        
        set({ isVideoEnabled: true });
        toast.success("Camera enabled");
        
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
    const { socket } = useAuthStore.getState();
    const { callId } = get();
    
    if (socket && callId) {
      socket.emit('call:reject', { callId, reason: 'rejected' });
    }
    
    get().resetCallState();
    toast("Call rejected", { icon: 'ℹ️' });
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
      
      // Emit end event if socket and callId exist
      if (socket && callId) {
        console.log('📤 Emitting call:end event:', callId);
        socket.emit('call:end', { callId, reason });
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
