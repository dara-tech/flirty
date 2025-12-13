import { create } from 'zustand';
import { useAuthStore } from './useAuthStore';
import { useChatStore } from './useChatStore';
import { Alert } from 'react-native';
import * as webrtcLib from '../lib/webrtc';

// Store functions at module level to ensure they're available in Zustand store
const {
  createPeerConnection,
  getLocalStream,
  createOffer,
  createAnswer,
  setRemoteDescription,
  addIceCandidate,
  isWebRTCSupported,
  MediaStream,
} = webrtcLib;

// Check if WebRTC is available
const webRTCAvailable = isWebRTCSupported();

if (!webRTCAvailable) {
  console.warn('⚠️ WebRTC is not available. Voice/Video calls will be disabled.');
  console.warn('⚠️ To enable calls, create a development build: npx expo run:android');
}

export const useCallStore = create((set, get) => ({
  // Call state
  callState: 'idle', // 'idle' | 'calling' | 'ringing' | 'in-call' | 'ended'
  callType: null, // 'voice' | 'video' | null
  callId: null,
  isGroupCall: false,
  roomId: null,
  groupId: null,
  groupName: null,
  
  // Call participants
  caller: null,
  receiver: null,
  
  // WebRTC streams
  localStream: null,
  remoteStream: null,
  peerConnection: null,
  
  // Call controls
  isMuted: false,
  isVideoEnabled: true,
  isSpeakerEnabled: false,
  
  // Call metadata
  callDuration: 0,
  callStartTime: null,
  durationInterval: null,
  
  // Reset call state
  resetCallState: () => {
    const { durationInterval, localStream, peerConnection } = get();
    
    if (durationInterval) {
      clearInterval(durationInterval);
    }
    
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    
    if (peerConnection) {
      peerConnection.close();
    }
    
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
      localStream: null,
      remoteStream: null,
      peerConnection: null,
      isMuted: false,
      isVideoEnabled: true,
      isSpeakerEnabled: false,
      callDuration: 0,
      callStartTime: null,
      durationInterval: null,
    });
  },
  
  // Start call timer
  startCallTimer: () => {
    const startTime = Date.now();
    set({ callStartTime: startTime });
    
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      set({ callDuration: elapsed });
    }, 1000);
    
    set({ durationInterval: interval });
  },
  
  // Initiate call
  initiateCall: async (receiverId, callType) => {
    console.log('📞 initiateCall called:', { receiverId, callType });
    
    // Check if WebRTC is available
    if (!webRTCAvailable) {
      Alert.alert(
        '📞 Calls Not Available',
        'Voice and video calls require a development build (not Expo Go).\n\n' +
        'To enable calls:\n' +
        '1. Run: npx expo prebuild --clean\n' +
        '2. Run: npx expo run:android (or run:ios)\n' +
        '3. Start: npx expo start --dev-client\n\n' +
        'See ENABLE_CALLS.md for details.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    const { socket } = useAuthStore.getState();
    const { authUser } = useAuthStore.getState();
    const { users } = useChatStore.getState();
    
    if (!socket) {
      console.error('❌ Socket not available');
      Alert.alert('Error', 'Not connected. Please check your connection.');
      return;
    }
    
    if (!authUser) {
      console.error('❌ Auth user not available');
      Alert.alert('Error', 'User not authenticated.');
      return;
    }
    
    const authUserId = typeof authUser._id === 'object' ? authUser._id._id || authUser._id : authUser._id;
    const receiverIdStr = typeof receiverId === 'object' ? receiverId._id || receiverId : receiverId;
    
    console.log('📞 Caller ID:', authUserId, 'Receiver ID:', receiverIdStr);
    
    if (String(authUserId) === String(receiverIdStr)) {
      Alert.alert('Error', 'You cannot call yourself');
      return;
    }
    
    const receiver = users.find(u => {
      const uId = typeof u._id === 'object' ? u._id._id || u._id : u._id;
      return String(uId) === String(receiverIdStr);
    });
    
    if (!receiver) {
      console.error('❌ Receiver not found in users list');
      Alert.alert('Error', 'User not found');
      return;
    }
    
    const { onlineUsers } = useAuthStore.getState();
    console.log('📞 Online users:', onlineUsers);
    console.log('📞 Checking if receiver is online:', receiverIdStr, 'in', onlineUsers);
    
    if (!onlineUsers.includes(receiverIdStr)) {
      console.warn('⚠️ Receiver is offline');
      Alert.alert('User Offline', 'This user is currently offline.');
      return;
    }
    
    const callId = `${authUser._id}_${receiverId}_${Date.now()}`;
    console.log('📞 Generated callId:', callId);
    
    const callerInfo = {
      userId: authUser._id,
      fullname: authUser.fullname || 'Unknown',
      profilePic: authUser.profilePic,
    };
    
    set({
      callId,
      callType,
      callState: 'calling',
      isVideoEnabled: callType === 'video',
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
    
    console.log('📤 Emitting call:initiate:', {
      callId,
      receiverId: receiverIdStr,
      callType,
      callerInfo,
    });
    
    try {
      socket.emit('call:initiate', {
        callId,
        receiverId: receiverIdStr,
        callType,
        callerInfo,
      });
      console.log('✅ call:initiate event emitted successfully');
    } catch (error) {
      console.error('❌ Error emitting call:initiate:', error);
      Alert.alert('Error', 'Failed to initiate call. Please try again.');
      get().resetCallState();
      return;
    }
    
    // Timeout after 60 seconds
    setTimeout(() => {
      const { callState, callId: currentCallId } = get();
      if ((callState === 'calling' || callState === 'ringing') && currentCallId === callId) {
        console.log('⏰ Call timeout - no answer');
        get().endCall('no-answer');
        Alert.alert('Call Ended', 'No answer. Call cancelled.');
      }
    }, 60000);
  },
  
  // Answer call
  answerCall: async () => {
    const { socket } = useAuthStore.getState();
    const { callId, callType, caller } = get();
    
    // Check if WebRTC is available
    if (!webRTCAvailable) {
      Alert.alert(
        '📞 Calls Not Available',
        'Voice and video calls require a development build (not Expo Go).\n\n' +
        'To enable calls:\n' +
        '1. Run: npx expo prebuild --clean\n' +
        '2. Run: npx expo run:android (or run:ios)\n' +
        '3. Start: npx expo start --dev-client\n\n' +
        'See ENABLE_CALLS.md for details.',
        [{ text: 'OK' }]
      );
      get().resetCallState();
      return;
    }
    
    console.log('📞 answerCall called with state:', { callId, callType, hasCaller: !!caller });
    console.log('📞 getLocalStream function available:', typeof getLocalStream);
    
    if (!socket) {
      Alert.alert('Error', 'Not connected. Please check your connection.');
      return;
    }
    
    if (!callId) {
      console.error('❌ Missing callId when answering call');
      Alert.alert('Error', 'Call information missing. Please try again.');
      return;
    }
    
    if (!callType) {
      console.error('❌ Missing callType when answering call');
      Alert.alert('Error', 'Call type missing. Please try again.');
      return;
    }
    
    if (typeof getLocalStream !== 'function') {
      console.error('❌ getLocalStream is not a function:', typeof getLocalStream);
      Alert.alert('Error', 'Call functionality not available. Please restart the app.');
      return;
    }
    
    try {
      console.log('📞 Answering call:', { callId, callType });
      
      // Get local media stream first
      const localStream = await getLocalStream(callType);
      set({ localStream });
      console.log('✅ Local stream obtained for answer');
      
      // Create peer connection
      const peerConnection = createPeerConnection();
      console.log('✅ Peer connection created for answer');
      
      // Set up remote stream handler using ontrack (react-native-webrtc uses ontrack, not onaddstream)
      peerConnection.ontrack = (event) => {
        console.log('📞 Remote track received (answer):', event.track.kind);
        if (event.streams && event.streams.length > 0) {
          console.log('✅ Setting remote stream from event.streams');
          set({ remoteStream: event.streams[0] });
        } else if (event.track) {
          // Create a stream from the track if no stream is provided
          const stream = new MediaStream([event.track]);
          console.log('✅ Creating remote stream from track');
          set({ remoteStream: stream });
        }
      };
      
      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && socket) {
          console.log('📤 Sending ICE candidate (answer)');
          socket.emit('webrtc:ice-candidate', {
            callId,
            candidate: event.candidate,
            receiverId: get().caller?.userId,
          });
        }
      };
      
      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        console.log('📞 Connection state (answer):', state);
        if (state === 'connected') {
          console.log('✅ WebRTC connection established (answer)');
          const { callState } = get();
          if (callState !== 'in-call') {
            set({ callState: 'in-call' });
            get().startCallTimer();
          }
        } else if (state === 'failed' || state === 'disconnected') {
          console.error('❌ WebRTC connection failed (answer):', state);
        }
      };
      
      set({ peerConnection });
      
      // Emit answer - the offer will come from caller, then we'll create answer
      socket.emit('call:answer', { callId });
      console.log('📤 Emitted call:answer event');
      // Don't set to 'in-call' yet - wait for offer and answer exchange
    } catch (error) {
      console.error('❌ Error answering call:', error);
      Alert.alert('Error', error.message || 'Failed to answer call');
      get().resetCallState();
    }
  },
  
  // Reject call
  rejectCall: () => {
    const { socket } = useAuthStore.getState();
    const { callId } = get();
    
    if (socket && callId) {
      socket.emit('call:reject', { callId, reason: 'rejected' });
    }
    
    get().resetCallState();
  },
  
  // End call
  endCall: (reason) => {
    const { socket } = useAuthStore.getState();
    const { callId } = get();
    
    if (socket && callId) {
      socket.emit('call:end', { callId, reason });
    }
    
    get().resetCallState();
  },
  
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
  
  // Handle incoming call
  handleIncomingCall: (callData) => {
    console.log('📞 handleIncomingCall received:', JSON.stringify(callData, null, 2));
    
    // Validate required fields
    if (!callData) {
      console.error('❌ handleIncomingCall: callData is null or undefined');
      Alert.alert('Error', 'Invalid call data received');
      return;
    }
    
    if (!callData.callId) {
      console.error('❌ handleIncomingCall: missing callId');
      Alert.alert('Error', 'Call ID missing');
      return;
    }
    
    if (!callData.callType) {
      console.error('❌ handleIncomingCall: missing callType');
      Alert.alert('Error', 'Call type missing');
      return;
    }
    
    // Try to get caller info from users list if callerInfo is incomplete
    let callerInfo = callData.callerInfo || {};
    const { users } = useChatStore.getState();
    
    // If callerInfo doesn't have fullname, try to find user in users list
    if (!callerInfo.fullname && callData.callerId) {
      const callerIdStr = typeof callData.callerId === 'object' 
        ? callData.callerId._id || callData.callerId 
        : callData.callerId;
      
      const foundUser = users.find(u => {
        const uId = typeof u._id === 'object' ? u._id._id || u._id : u._id;
        return String(uId) === String(callerIdStr);
      });
      
      if (foundUser) {
        callerInfo = {
          userId: foundUser._id,
          fullname: foundUser.fullname,
          profilePic: foundUser.profilePic,
        };
        console.log('📞 Found caller in users list:', callerInfo);
      }
    }
    
    // Ensure callerInfo has at least userId
    if (!callerInfo.userId && callData.callerId) {
      callerInfo.userId = callData.callerId;
    }
    
    // If still no fullname, use a default
    if (!callerInfo.fullname) {
      callerInfo.fullname = 'Unknown';
      console.warn('⚠️ Caller fullname not found, using "Unknown"');
    }
    
    const authUser = useAuthStore.getState().authUser;
    if (!authUser) {
      console.error('❌ handleIncomingCall: authUser is null');
      Alert.alert('Error', 'User not authenticated');
      return;
    }
    
    console.log('📞 Setting call state:', {
      callId: callData.callId,
      callType: callData.callType,
      callerInfo: callerInfo,
    });
    
    set({
      callId: callData.callId,
      callType: callData.callType,
      callState: 'ringing',
      caller: callerInfo,
      receiver: {
        userId: authUser._id,
        fullname: authUser.fullname,
        profilePic: authUser.profilePic,
      },
    });
    
    console.log('✅ Call state set successfully');
  },
  
  // Handle call answered
  handleCallAnswered: () => {
    set({ callState: 'in-call' });
    get().startCallTimer();
  },
  
  // Handle call rejected
  handleCallRejected: () => {
    Alert.alert('Call Rejected', 'The call was rejected.');
    get().resetCallState();
  },
  
  // Handle WebRTC offer (when receiving an incoming call)
  handleWebRTCOffer: async (offer) => {
    try {
      console.log('📞 Handling WebRTC offer');
      console.log('📞 getLocalStream function available:', typeof getLocalStream);
      const { callType, callId, caller, localStream, peerConnection: existingPC } = get();
      const { socket } = useAuthStore.getState();
      
      if (typeof getLocalStream !== 'function') {
        console.error('❌ getLocalStream is not a function:', typeof getLocalStream);
        Alert.alert('Error', 'Call functionality not available. Please restart the app.');
        get().resetCallState();
        return;
      }
      
      // Get local media stream if not already set
      let localStreamToUse = localStream;
      if (!localStreamToUse) {
        console.log('📞 Getting local stream for answer...');
        localStreamToUse = await getLocalStream(callType);
        set({ localStream: localStreamToUse });
      }
      
      // Use existing peer connection if available, otherwise create new one
      let peerConnection = existingPC;
      if (!peerConnection) {
        console.log('📞 Creating peer connection for answer...');
        peerConnection = createPeerConnection();
        
        // Set up remote stream handler using ontrack
        peerConnection.ontrack = (event) => {
          console.log('📞 Remote track received (answer):', event.track.kind);
          if (event.streams && event.streams.length > 0) {
            console.log('✅ Setting remote stream from event.streams (answer)');
            set({ remoteStream: event.streams[0] });
          } else if (event.track) {
            const stream = new MediaStream([event.track]);
            console.log('✅ Creating remote stream from track (answer)');
            set({ remoteStream: stream });
          }
        };
        
        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
          if (event.candidate && socket && callId) {
            console.log('📤 Sending ICE candidate (answer)');
            socket.emit('webrtc:ice-candidate', {
              callId,
              candidate: event.candidate,
              receiverId: caller?.userId,
            });
          }
        };
        
        // Handle connection state changes
        peerConnection.onconnectionstatechange = () => {
          const state = peerConnection.connectionState;
          console.log('📞 Connection state (answer):', state);
          if (state === 'connected') {
            console.log('✅ WebRTC connection established (answer)');
            const { callState } = get();
            if (callState !== 'in-call') {
              set({ callState: 'in-call' });
              get().startCallTimer();
            }
          }
        };
        
        set({ peerConnection });
      }
      
      console.log('📞 Setting remote description and creating answer...');
      await setRemoteDescription(peerConnection, offer);
      
      const answer = await createAnswer(peerConnection, localStreamToUse, offer);
      console.log('✅ Answer created');
      
      if (socket && callId && caller) {
        console.log('📤 Sending WebRTC answer to caller');
        socket.emit('webrtc:answer', {
          callId,
          answer,
          callerId: caller.userId,
        });
      } else {
        console.error('❌ Cannot send answer - missing socket, callId, or caller');
      }
    } catch (error) {
      console.error('❌ Error handling WebRTC offer:', error);
      Alert.alert('Error', 'Failed to process call offer: ' + (error.message || 'Unknown error'));
      get().resetCallState();
    }
  },
  
  // Handle WebRTC answer
  handleWebRTCAnswer: async (answer) => {
    try {
      const { peerConnection } = get();
      if (!peerConnection) {
        throw new Error('Peer connection not initialized');
      }
      
      await setRemoteDescription(peerConnection, answer);
    } catch (error) {
      console.error('Error handling WebRTC answer:', error);
      Alert.alert('Error', 'Failed to process call answer');
      get().resetCallState();
    }
  },
  
  // Handle ICE candidate
  handleICECandidate: async (candidate) => {
    try {
      const { peerConnection } = get();
      if (peerConnection) {
        await addIceCandidate(peerConnection, candidate);
      }
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  },
  
  // Initialize call with media
  initializeCallWithMedia: async () => {
    try {
      const { callType, callId, receiver } = get();
      console.log('📞 Initializing call with media:', { callType, callId });
      
      const localStream = await getLocalStream(callType);
      set({ localStream });
      console.log('✅ Local stream obtained for caller');
      
      const peerConnection = createPeerConnection();
      console.log('✅ Peer connection created for caller');
      
      // Set up remote stream handler using ontrack
      peerConnection.ontrack = (event) => {
        console.log('📞 Remote track received (caller):', event.track.kind);
        if (event.streams && event.streams.length > 0) {
          console.log('✅ Setting remote stream from event.streams (caller)');
          set({ remoteStream: event.streams[0] });
        } else if (event.track) {
          const stream = new MediaStream([event.track]);
          console.log('✅ Creating remote stream from track (caller)');
          set({ remoteStream: stream });
        }
      };
      
      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          const { socket } = useAuthStore.getState();
          const { callId: currentCallId, receiver: currentReceiver } = get();
          if (socket && currentCallId) {
            console.log('📤 Sending ICE candidate (caller)');
            socket.emit('webrtc:ice-candidate', {
              callId: currentCallId,
              candidate: event.candidate,
              receiverId: currentReceiver?.userId,
            });
          }
        }
      };
      
      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        console.log('📞 Connection state (caller):', state);
        if (state === 'connected') {
          console.log('✅ WebRTC connection established (caller)');
          // Ensure we're in call state when connected
          const { callState } = get();
          if (callState === 'calling' || callState === 'ringing') {
            set({ callState: 'in-call' });
            get().startCallTimer();
          }
        } else if (state === 'failed' || state === 'disconnected') {
          console.error('❌ WebRTC connection failed (caller):', state);
        }
      };
      
      set({ peerConnection });
      
      // Create and send offer
      console.log('📤 Creating offer...');
      const offer = await createOffer(peerConnection, localStream);
      console.log('✅ Offer created');
      
      const { socket } = useAuthStore.getState();
      const { callId: currentCallId, receiver: currentReceiver } = get();
      
      if (socket && currentCallId) {
        console.log('📤 Sending WebRTC offer to:', currentReceiver?.userId);
        socket.emit('webrtc:offer', {
          callId: currentCallId,
          offer,
          receiverId: currentReceiver?.userId,
        });
      } else {
        console.error('❌ Cannot send offer - missing socket or callId');
      }
    } catch (error) {
      console.error('❌ Error initializing call with media:', error);
      Alert.alert('Error', error.message || 'Failed to initialize call');
      get().resetCallState();
    }
  },
}));
