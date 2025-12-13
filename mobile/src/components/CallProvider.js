import React, { useEffect, useRef } from 'react';
import { useCallStore } from '../store/useCallStore';
import { useAuthStore } from '../store/useAuthStore';
import CallModal from './CallModal';
import VoiceCallWindow from './VoiceCallWindow';
import VideoCallWindow from './VideoCallWindow';

const CallProvider = () => {
  const callState = useCallStore((state) => state.callState);
  const callType = useCallStore((state) => state.callType);
  const callId = useCallStore((state) => state.callId);
  const socket = useAuthStore((state) => state.socket);
  const initializedRef = useRef(false);
  const socketRef = useRef(null);
  
  // Set up socket listeners for call events
  useEffect(() => {
    if (!socket) return;
    
    // Skip if already set up for this socket instance
    if (socketRef.current === socket) return;
    
    socketRef.current = socket;
    
    // Get handlers from store inside effect to avoid dependency issues
    const callStore = useCallStore.getState();
    
    // Incoming call
    const handleIncoming = (data) => {
      console.log('📞 Incoming call:', data);
      callStore.handleIncomingCall?.(data);
    };
    
    // Call answered
    const handleAnswered = () => {
      console.log('📞 Call answered');
      callStore.handleCallAnswered?.();
    };
    
    // Call rejected
    const handleRejected = () => {
      console.log('📞 Call rejected');
      callStore.handleCallRejected?.();
    };
    
    // Call ringing
    const handleRinging = (data) => {
      console.log('📞 Call ringing:', data);
      useCallStore.setState({ callState: 'ringing' });
    };
    
    // WebRTC offer
    const handleOffer = (data) => {
      console.log('📞 WebRTC offer received:', data);
      callStore.handleWebRTCOffer?.(data.offer);
    };
    
    // WebRTC answer
    const handleAnswer = (data) => {
      console.log('📞 WebRTC answer received:', data);
      callStore.handleWebRTCAnswer?.(data.answer);
    };
    
    // ICE candidate
    const handleICE = (data) => {
      console.log('📞 ICE candidate received:', data);
      callStore.handleICECandidate?.(data.candidate);
    };
    
    // Call ended
    const handleEnded = () => {
      console.log('📞 Call ended');
      useCallStore.getState().resetCallState();
    };
    
    socket.on('call:incoming', handleIncoming);
    socket.on('call:answered', handleAnswered);
    socket.on('call:rejected', handleRejected);
    socket.on('call:ringing', handleRinging);
    socket.on('webrtc:offer', handleOffer);
    socket.on('webrtc:answer', handleAnswer);
    socket.on('webrtc:ice-candidate', handleICE);
    socket.on('call:ended', handleEnded);
    
    return () => {
      socket.off('call:incoming', handleIncoming);
      socket.off('call:answered', handleAnswered);
      socket.off('call:rejected', handleRejected);
      socket.off('call:ringing', handleRinging);
      socket.off('webrtc:offer', handleOffer);
      socket.off('webrtc:answer', handleAnswer);
      socket.off('webrtc:ice-candidate', handleICE);
      socket.off('call:ended', handleEnded);
      socketRef.current = null;
    };
  }, [socket]); // Only depend on socket
  
  // Initialize call with media when state becomes 'calling' (for caller)
  useEffect(() => {
    if (callState === 'calling' && !initializedRef.current && callId) {
      initializedRef.current = true;
      const { initializeCallWithMedia } = useCallStore.getState();
      initializeCallWithMedia?.();
    } else if (callState === 'idle') {
      initializedRef.current = false;
    }
  }, [callState, callId]); // Remove initializeCallWithMedia from dependencies
  
  return (
    <>
      {/* Incoming Call Modal */}
      <CallModal />
      
      {/* Active Call Windows */}
      {callState === 'in-call' && (
        callType === 'video' ? (
          <VideoCallWindow />
        ) : (
          <VoiceCallWindow />
        )
      )}
    </>
  );
};

export default CallProvider;
