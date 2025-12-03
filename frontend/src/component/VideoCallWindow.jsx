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
    const videoElement = localVideoRef.current;
    if (!videoElement) return;
    
    let isMounted = true;
    let playPromise = null;
    
    const attachAndPlay = async () => {
      if (!isMounted || !videoElement) return;
      
      try {
        // Determine which stream to use
        let streamToUse = null;
        if (isScreenSharing && screenShareStream) {
          streamToUse = screenShareStream;
        } else if (localStream && isVideoEnabled) {
          streamToUse = localStream;
        }
        
        if (!streamToUse) {
          // Clear video if no stream
          if (videoElement.srcObject) {
            videoElement.srcObject = null;
          }
          return;
        }
        
        // Check if stream has video tracks
        const videoTracks = streamToUse.getVideoTracks();
        if (videoTracks.length === 0) {
          console.warn('Stream has no video tracks');
          if (videoElement.srcObject) {
            videoElement.srcObject = null;
          }
          return;
        }
        
        // Validation: Check if video tracks are enabled and live
        const activeVideoTracks = videoTracks.filter(track => 
          track.enabled && 
          track.readyState === 'live' &&
          !track.muted
        );
        
        if (activeVideoTracks.length === 0) {
          console.warn('No active video tracks in stream');
          if (videoElement.srcObject) {
            videoElement.srcObject = null;
          }
          return;
        }
        
        // Ensure all video tracks are enabled
        videoTracks.forEach(track => {
          if (track.readyState === 'live' && !track.enabled) {
            track.enabled = true;
            console.log('✅ Enabled video track:', track.label);
          }
        });
        
        // Update video source if stream changed
        if (videoElement.srcObject !== streamToUse) {
          // Cancel any pending play operations
          if (playPromise) {
            playPromise.catch(() => {}); // Ignore abort errors
          }
          videoElement.srcObject = streamToUse;
          console.log('📹 Local video stream attached:', {
            hasVideoTracks: videoTracks.length > 0,
            activeVideoTracks: activeVideoTracks.length,
            videoTrackEnabled: videoTracks[0]?.enabled,
            videoTrackReadyState: videoTracks[0]?.readyState,
            videoTrackLabel: videoTracks[0]?.label,
            isScreenSharing,
          });
        }
        
        // Ensure video plays
        if (videoElement.paused) {
          try {
            playPromise = videoElement.play();
            await playPromise;
            playPromise = null;
            console.log('✅ Local video playing successfully');
          } catch (err) {
            // Ignore AbortError (happens when video is removed/changed during play)
            if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
              console.warn('⚠️ Error playing local video:', err.name, err.message);
            }
            playPromise = null;
          }
        } else {
          console.log('✅ Local video already playing');
        }
      } catch (error) {
        console.error('Error attaching local video:', error);
        // Clear video on error to prevent test pattern
        if (videoElement.srcObject) {
          videoElement.srcObject = null;
        }
      }
    };
    
    attachAndPlay();
    
    // Cleanup
    return () => {
      isMounted = false;
      if (playPromise) {
        playPromise.catch(() => {}); // Ignore abort errors
      }
    };
  }, [localStream, isScreenSharing, screenShareStream, isVideoEnabled]);
  
  useEffect(() => {
    const videoElement = remoteVideoRef.current;
    if (!videoElement || !remoteStream) {
      // Clear video if no remote stream
      if (videoElement?.srcObject) {
        videoElement.srcObject = null;
      }
      return;
    }
    
    let isMounted = true;
    let playPromise = null;
    
    const attachAndPlay = async () => {
      if (!isMounted || !videoElement || !remoteStream) return;
      
      try {
        // Check if stream has video tracks
        const videoTracks = remoteStream.getVideoTracks();
        if (videoTracks.length === 0) {
          console.warn('Remote stream has no video tracks');
          if (videoElement.srcObject) {
            videoElement.srcObject = null;
          }
          return;
        }
        
        // Validation: Check if video tracks are enabled and live
        const activeVideoTracks = videoTracks.filter(track => 
          track.enabled && 
          track.readyState === 'live' &&
          !track.muted
        );
        
        if (activeVideoTracks.length === 0) {
          console.warn('No active video tracks in remote stream');
          // Don't clear video element - tracks might become active soon
          // Just log and wait
          return;
        }
        
        // Update video source if stream changed
        if (videoElement.srcObject !== remoteStream) {
          // Cancel any pending play operations
          if (playPromise) {
            playPromise.catch(() => {}); // Ignore abort errors
          }
          videoElement.srcObject = remoteStream;
          console.log('📹 Remote video stream attached:', {
            hasVideoTracks: videoTracks.length > 0,
            activeVideoTracks: activeVideoTracks.length,
            videoTrackEnabled: videoTracks[0]?.enabled,
            videoTrackReadyState: videoTracks[0]?.readyState,
            videoTrackLabel: videoTracks[0]?.label,
          });
        }
        
        // Ensure video plays
        if (videoElement.paused) {
          try {
            playPromise = videoElement.play();
            await playPromise;
            playPromise = null;
            console.log('✅ Remote video playing successfully');
          } catch (err) {
            // Ignore AbortError (happens when video is removed/changed during play)
            if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
              if (isMounted) {
                console.warn('⚠️ Error playing remote video:', err.name, err.message);
              }
            }
            playPromise = null;
          }
        }
      } catch (error) {
        console.error('Error attaching remote video:', error);
        // Don't clear video on error - might be temporary
      }
    };
    
    attachAndPlay();
    
    // Handle track changes (screen share replacing camera)
    const handleVideoUpdate = () => {
      if (isMounted && videoElement && remoteStream) {
        const videoTracks = remoteStream.getVideoTracks();
        const hasActiveTracks = videoTracks.some(track => 
          track.enabled && track.readyState === 'live'
        );
        
        if (hasActiveTracks) {
          if (videoElement.srcObject !== remoteStream) {
            videoElement.srcObject = remoteStream;
          }
          attachAndPlay();
        }
      }
    };
    
    // Listen for track changes
    const videoTracks = remoteStream.getVideoTracks();
    videoTracks.forEach(track => {
      track.addEventListener('ended', handleVideoUpdate);
      track.addEventListener('mute', handleVideoUpdate);
      track.addEventListener('unmute', handleVideoUpdate);
      track.addEventListener('enabled', handleVideoUpdate);
    });
    
    const addTrackHandler = (event) => {
      if (event.track.kind === 'video') {
        handleVideoUpdate();
      }
    };
    
    const removeTrackHandler = (event) => {
      if (event.track.kind === 'video') {
        handleVideoUpdate();
      }
    };
    
    remoteStream.addEventListener('addtrack', addTrackHandler);
    remoteStream.addEventListener('removetrack', removeTrackHandler);
    
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
        track.removeEventListener('enabled', handleVideoUpdate);
      });
      remoteStream.removeEventListener('addtrack', addTrackHandler);
      remoteStream.removeEventListener('removetrack', removeTrackHandler);
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
        {((isScreenSharing && screenShareStream) || (localStream && isVideoEnabled && localStream.getVideoTracks().length > 0)) && (
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
              onError={(e) => {
                console.error('Local video error:', e);
                // Show error state if video fails to load
              }}
            />
            {isScreenSharing && (
              <div className="absolute top-2 left-2 bg-red-500 text-white text-xs px-2 py-1 rounded">
                Sharing Screen
              </div>
            )}
            {/* Show error if video track is not available */}
            {localStream && localStream.getVideoTracks().length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <p className="text-white text-xs text-center px-2">Camera not available</p>
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
