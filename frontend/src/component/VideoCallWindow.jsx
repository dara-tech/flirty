import { useEffect, useRef, useState } from "react";
import { useCallStore } from "../store/useCallStore";
import CallControls from "./CallControls";

const VideoCallWindow = () => {
  const {
    callState,
    caller,
    receiver,
    localStream,
    remoteStream,
    isVideoEnabled,
    isSpeakerEnabled,
  } = useCallStore();
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [isLocalVideoSmall, setIsLocalVideoSmall] = useState(true);
  
  useEffect(() => {
    // Attach local stream to video element
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);
  
  useEffect(() => {
    // Attach remote stream to video element
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      
      // Ensure video plays
      remoteVideoRef.current.play().catch(err => {
        console.error('Error playing remote video:', err);
      });
    }
  }, [remoteStream]);
  
  useEffect(() => {
    // Handle speaker output for audio and ensure it plays
    if (remoteVideoRef.current) {
      remoteVideoRef.current.volume = 1.0;
      remoteVideoRef.current.setAttribute('playsinline', 'true');
      
      // Try to play if paused
      if (remoteVideoRef.current.paused && remoteStream) {
        remoteVideoRef.current.play().catch(err => {
          console.error('Error playing video:', err);
        });
      }
    }
  }, [isSpeakerEnabled, remoteStream]);
  
  if (callState !== 'in-call') return null;
  
  const displayUser = receiver || caller;
  
  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col overflow-hidden">
      {/* Remote Video (Main) */}
      <div className="flex-1 relative">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
        
        {/* Loading State */}
        {!remoteStream && (
          <div className="absolute inset-0 flex items-center justify-center bg-base-100">
            <div className="text-center">
              <div className="w-24 h-24 rounded-full overflow-hidden mx-auto mb-4 ring-4 ring-primary">
                <img
                  src={displayUser?.profilePic || "/avatar.png"}
                  alt={displayUser?.fullname}
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="text-base-content/60">Connecting...</p>
            </div>
          </div>
        )}
        
        {/* Local Video (Picture-in-Picture) */}
        {localStream && isVideoEnabled && (
          <div
            className={`absolute ${
              isLocalVideoSmall
                ? 'bottom-24 right-4 w-32 h-48'
                : 'inset-0'
            } bg-black rounded-lg overflow-hidden transition-all duration-300 cursor-pointer border-2 border-primary`}
            onClick={() => setIsLocalVideoSmall(!isLocalVideoSmall)}
          >
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
          </div>
        )}
        
        {/* Local Video Placeholder when disabled */}
        {localStream && !isVideoEnabled && (
          <div className="absolute bottom-24 right-4 w-32 h-48 bg-base-200 rounded-lg flex items-center justify-center border-2 border-base-300">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full overflow-hidden mx-auto mb-2">
                <img
                  src={caller?.profilePic || "/avatar.png"}
                  alt="You"
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="text-xs text-base-content/60">Camera off</p>
            </div>
          </div>
        )}
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

export default VideoCallWindow;
