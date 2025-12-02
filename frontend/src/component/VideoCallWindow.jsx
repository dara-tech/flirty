import { useEffect, useRef, useState } from "react";
import { useCallStore } from "../store/useCallStore";
import CallControls from "./CallControls";
import ProfileImage from "./ProfileImage";

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
    
    let isMounted = true;
    let playPromise = null;
    
    // Update video source if stream changed
    if (videoElement.srcObject !== remoteStream) {
      // Cancel any pending play operations
      if (playPromise) {
        playPromise.catch(() => {}); // Ignore abort errors
      }
      videoElement.srcObject = remoteStream;
    }
    
    // Ensure video plays with proper error handling
    const playVideo = async () => {
      if (!isMounted || !videoElement || !remoteStream) return;
      
      try {
        // Cancel previous play promise if exists
        if (playPromise) {
          playPromise.catch(() => {}); // Ignore abort errors
        }
        
        playPromise = videoElement.play();
        await playPromise;
        playPromise = null;
      } catch (err) {
        // Ignore AbortError (happens when video is removed/changed during play)
        if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
          // Only log non-abort errors
          if (isMounted) {
            console.warn('Error playing remote video:', err.name);
          }
        }
        playPromise = null;
      }
    };
    
    playVideo();
    
    // Handle track changes (screen share replacing camera)
    const handleVideoUpdate = () => {
      if (isMounted && videoElement && remoteStream) {
        if (videoElement.srcObject !== remoteStream) {
          videoElement.srcObject = remoteStream;
        }
        playVideo();
      }
    };
    
    // Listen for track changes
    const videoTracks = remoteStream.getVideoTracks();
    videoTracks.forEach(track => {
      track.addEventListener('ended', handleVideoUpdate);
      track.addEventListener('mute', handleVideoUpdate);
      track.addEventListener('unmute', handleVideoUpdate);
    });
    
    const addTrackHandler = (event) => {
      if (event.track.kind === 'video') {
        handleVideoUpdate();
      }
    };
    
    remoteStream.addEventListener('addtrack', addTrackHandler);
    
    // Cleanup
    return () => {
      isMounted = false;
      if (playPromise) {
        playPromise.catch(() => {}); // Ignore abort errors
      }
      videoTracks.forEach(track => {
        track.removeEventListener('ended', handleVideoUpdate);
        track.removeEventListener('mute', handleVideoUpdate);
        track.removeEventListener('unmute', handleVideoUpdate);
      });
      remoteStream.removeEventListener('addtrack', addTrackHandler);
    };
  }, [remoteStream]);
  
  useEffect(() => {
    // Handle speaker output for audio and ensure it plays
    const videoElement = remoteVideoRef.current;
    if (!videoElement || !remoteStream) return;
    
    videoElement.volume = 1.0;
    videoElement.setAttribute('playsinline', 'true');
    
    // Try to play if paused (with error handling)
    if (videoElement.paused) {
      videoElement.play().catch(err => {
        // Ignore AbortError (happens when video is removed/changed)
        if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
          console.warn('Error playing video:', err.name);
        }
      });
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
                <ProfileImage
                  src={displayUser?.profilePic}
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
                <ProfileImage
                  src={caller?.profilePic}
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
