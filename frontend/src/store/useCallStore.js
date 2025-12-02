import { create } from "zustand";
import { useAuthStore } from "./useAuthStore";
import { useChatStore } from "./useChatStore";
import toast from "react-hot-toast";

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
  
  // Toggle video
  toggleVideo: () => {
    const { localStream, isVideoEnabled } = get();
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !isVideoEnabled;
      });
    }
    set({ isVideoEnabled: !isVideoEnabled });
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
    
    // Find receiver info
    const receiver = users.find(u => u._id === receiverId);
    if (!receiver) {
      toast.error("User not found");
      return;
    }
    
    // Check if user is online
    const { onlineUsers } = useAuthStore.getState();
    if (!onlineUsers.includes(receiverId)) {
      toast.error("User is offline");
      return;
    }
    
    // Generate unique call ID
    const callId = `${authUser._id}_${receiverId}_${Date.now()}`;
    
    // Set call info
    set({
      callId,
      callType,
      callState: 'calling',
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
  
  // Answer call
  answerCall: async () => {
    const { socket } = useAuthStore.getState();
    const { callId } = get();
    
    if (!socket) {
      toast.error("Not connected. Please check your connection.");
      return;
    }
    
    if (!callId) {
      toast.error("Call information missing");
      return;
    }
    
    socket.emit('call:answer', { callId });
    set({ callState: 'in-call' });
    get().startCallTimer();
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
      const { callId } = get();
      
      // Stop timer first
      get().stopCallTimer();
      
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
