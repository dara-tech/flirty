import { useEffect, useRef } from "react";
import { useCallStore } from "../store/useCallStore";
import CallControls from "./CallControls";
import ProfileImage from "./ProfileImage";

const VoiceCallWindow = () => {
  const {
    callState,
    caller,
    receiver,
    localStream,
    remoteStream,
    isSpeakerEnabled,
  } = useCallStore();
  
  const localAudioRef = useRef(null);
  const remoteAudioRef = useRef(null);
  
  useEffect(() => {
    // Attach local stream to audio element
    if (localAudioRef.current && localStream) {
      localAudioRef.current.srcObject = localStream;
    }
  }, [localStream]);
  
  useEffect(() => {
    // Attach remote stream to audio element
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
      
      // Ensure audio plays
      remoteAudioRef.current.play().catch(err => {
        console.error('Error playing remote audio:', err);
      });
    }
  }, [remoteStream]);
  
  useEffect(() => {
    // Handle speaker output and ensure audio plays
    if (remoteAudioRef.current) {
      remoteAudioRef.current.volume = 1.0;
      remoteAudioRef.current.setAttribute('playsinline', 'true');
      
      // Try to play if paused
      if (remoteAudioRef.current.paused && remoteStream) {
        remoteAudioRef.current.play().catch(err => {
          console.error('Error playing audio:', err);
        });
      }
    }
  }, [isSpeakerEnabled, remoteStream]);
  
  if (callState !== 'in-call') return null;
  
  const displayUser = receiver || caller;
  
  return (
    <div className="fixed inset-0 bg-base-100 z-50 flex flex-col items-center justify-center">
      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-24">
        {/* Profile Picture */}
        <div className="mb-8">
          <ProfileImage
            src={displayUser?.profilePic}
            alt={displayUser?.fullname}
            className="w-48 h-48 rounded-full object-cover ring-4 ring-primary shadow-2xl"
          />
        </div>
        
        {/* User Name */}
        <h2 className="text-3xl font-bold text-base-content mb-2">
          {displayUser?.fullname || "Calling..."}
        </h2>
        
        {/* Call Status */}
        <p className="text-base-content/60 text-lg">
          Voice Call
        </p>
      </div>
      
      {/* Call Controls */}
      <div className="absolute bottom-8 left-0 right-0 px-4 z-10">
        <CallControls />
      </div>
      
      {/* Hidden Audio Elements */}
      <audio ref={localAudioRef} autoPlay muted />
      <audio ref={remoteAudioRef} autoPlay />
    </div>
  );
};

export default VoiceCallWindow;
