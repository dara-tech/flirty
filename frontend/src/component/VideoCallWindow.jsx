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
    isScreenSharing,
    screenShareStream,
  } = useCallStore();
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [isLocalVideoSmall, setIsLocalVideoSmall] = useState(true);
  
  useEffect(() => {
    // Attach local stream or screen share to video element
    if (localVideoRef.current) {
      if (isScreenSharing && screenShareStream) {
        localVideoRef.current.srcObject = screenShareStream;
      } else if (localStream) {
        localVideoRef.current.srcObject = localStream;
      }
    }
  }, [localStream, isScreenSharing, screenShareStream]);
  
  useEffect(() => {
    const videoElement = remoteVideoRef.current;
    if (!videoElement || !remoteStream) return;
    
    // Update video source if stream changed
    if (videoElement.srcObject !== remoteStream) {
      videoElement.srcObject = remoteStream;
    }
    
    // Ensure video plays
    videoElement.play().catch(err => {
      console.error('Error playing remote video:', err);
    });
    
    // Handle track changes (screen share replacing camera)
    const handleVideoUpdate = () => {
      if (videoElement && remoteStream) {
        videoElement.srcObject = remoteStream;
        videoElement.play().catch(() => {});
      }
    };
    
    // Listen for track changes
    const videoTracks = remoteStream.getVideoTracks();
    videoTracks.forEach(track => {
      track.addEventListener('ended', handleVideoUpdate);
      track.addEventListener('mute', handleVideoUpdate);
      track.addEventListener('unmute', handleVideoUpdate);
    });
    
    remoteStream.addEventListener('addtrack', (event) => {
      if (event.track.kind === 'video') {
        handleVideoUpdate();
      }
    });
    
    // Cleanup
    return () => {
      videoTracks.forEach(track => {
        track.removeEventListener('ended', handleVideoUpdate);
        track.removeEventListener('mute', handleVideoUpdate);
        track.removeEventListener('unmute', handleVideoUpdate);
      });
    };
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
        
        {/* Local Video (Picture-in-Picture) - Screen Share or Camera */}
        {((isScreenSharing && screenShareStream) || (localStream && isVideoEnabled)) && (
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
              className="w-full h-full object-contain"
            />
            {isScreenSharing && (
              <div className="absolute top-2 left-2 bg-red-500 text-white text-xs px-2 py-1 rounded">
                Sharing Screen
              </div>
            )}
          </div>
        )}
        
        {/* Local Video Placeholder when camera disabled and not screen sharing */}
        {localStream && !isVideoEnabled && !isScreenSharing && (
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
