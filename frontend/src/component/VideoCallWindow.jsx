import { useEffect, useRef, useState } from "react";
import { useCallStore } from "../store/useCallStore";
import CallControls from "./CallControls";
import ProfileImage from "./ProfileImage";
import { formatCallDuration } from "../lib/webrtc";

// Camera State Machine - Senior UI Pattern
// States: 'loading' | 'on' | 'off' | 'error' | 'replacing' | 'ended'

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
    callDuration,
  } = useCallStore();
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [isLocalVideoSmall, setIsLocalVideoSmall] = useState(true);
  
  // Camera State Machine - Track state, not button state
  // States: 'loading' | 'on' | 'off' | 'error' | 'replacing' | 'ended'
  const [localCameraState, setLocalCameraState] = useState('loading');
  const [remoteCameraState, setRemoteCameraState] = useState('loading');
  
  // Local Camera State Machine - Always reflect TRACK STATE
  useEffect(() => {
    const videoElement = localVideoRef.current;
    if (!videoElement) return;
    
    // Determine which stream to use
    let streamToUse = null;
    let track = null;
    
    if (isScreenSharing && screenShareStream) {
      streamToUse = screenShareStream;
      track = screenShareStream.getVideoTracks()[0];
    } else if (localStream) {
      streamToUse = localStream;
      track = localStream.getVideoTracks()[0];
    }
    
    // State Machine: Determine state from track
    const updateLocalCameraState = () => {
      if (!track) {
        setLocalCameraState('off');
        return;
      }
      
      if (track.readyState === 'ended') {
        setLocalCameraState('ended');
        return;
      }
      
      if (!track.enabled) {
        setLocalCameraState('off');
        return;
      }
      
      if (track.readyState === 'live' && track.enabled && !track.muted) {
        setLocalCameraState('on');
        return;
      }
      
      setLocalCameraState('loading');
    };
    
    // Initial state check
    updateLocalCameraState();
    
    // Listen to track state changes
    if (track) {
      track.onended = () => {
        setLocalCameraState('ended');
      };
      
      // Monitor enabled state (no event, so we check periodically)
      const checkEnabled = () => {
        if (track.readyState === 'ended') return;
        updateLocalCameraState();
      };
      
      const enabledCheckInterval = setInterval(checkEnabled, 200);
      
      return () => {
        clearInterval(enabledCheckInterval);
      };
    }
  }, [localStream, isScreenSharing, screenShareStream, isVideoEnabled]);
  
  // Local Video Element Management - Show video only when state is 'on'
  useEffect(() => {
    const videoElement = localVideoRef.current;
    if (!videoElement) return;
    
    let isMounted = true;
    let playPromise = null;
    
    const attachAndPlay = async () => {
      if (!isMounted || !videoElement) return;
      
      // State Machine Rule: Only show video when state is 'on'
      if (localCameraState !== 'on') {
        if (videoElement.srcObject) {
          videoElement.srcObject = null;
        }
        return;
      }
      
      try {
        // Determine which stream to use
        let streamToUse = null;
        if (isScreenSharing && screenShareStream) {
          streamToUse = screenShareStream;
        } else if (localStream) {
          const videoTracks = localStream.getVideoTracks();
          const hasActiveTracks = videoTracks.some(track => 
            track.enabled && track.readyState === 'live' && !track.muted
          );
          if (hasActiveTracks) {
            streamToUse = localStream;
          }
        }
        
        if (!streamToUse) {
          if (videoElement.srcObject) {
            videoElement.srcObject = null;
          }
          return;
        }
        
        // Update video source if stream changed
        if (videoElement.srcObject !== streamToUse) {
          if (playPromise) {
            playPromise.catch(() => {});
          }
          videoElement.srcObject = streamToUse;
          console.log('📹 Local video stream attached');
        }
        
        // Ensure video plays
        if (videoElement.paused) {
          try {
            playPromise = videoElement.play();
            await playPromise;
            playPromise = null;
            console.log('✅ Local video playing');
          } catch (err) {
            if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
              console.warn('⚠️ Error playing local video:', err.name);
            }
            playPromise = null;
          }
        }
      } catch (error) {
        console.error('Error attaching local video:', error);
        if (videoElement.srcObject) {
          videoElement.srcObject = null;
        }
      }
    };
    
    attachAndPlay();
    
    return () => {
      isMounted = false;
      if (playPromise) {
        playPromise.catch(() => {});
      }
    };
  }, [localCameraState, localStream, isScreenSharing, screenShareStream]);
  
  // Remote Camera State Machine - Always reflect TRACK STATE
  useEffect(() => {
    if (!remoteStream) {
      setRemoteCameraState('off');
      return;
    }
    
    const videoTracks = remoteStream.getVideoTracks();
    const track = videoTracks[0];
    
    // State Machine: Determine state from track
    const updateRemoteCameraState = () => {
      if (!track) {
        setRemoteCameraState('off');
        return;
      }
      
      if (track.readyState === 'ended') {
        setRemoteCameraState('ended');
        return;
      }
      
      if (!track.enabled) {
        setRemoteCameraState('off');
        return;
      }
      
      if (track.muted) {
        setRemoteCameraState('off');
        return;
      }
      
      if (track.readyState === 'live' && track.enabled && !track.muted) {
        setRemoteCameraState('on');
        return;
      }
      
      setRemoteCameraState('loading');
    };
    
    // Initial state check
    updateRemoteCameraState();
    
    // Listen to track state changes
    if (track) {
      track.onended = () => {
        setRemoteCameraState('ended');
      };
      
      track.onmute = () => {
        setRemoteCameraState('off');
      };
      
      track.onunmute = () => {
        if (track.enabled && track.readyState === 'live') {
          setRemoteCameraState('on');
        }
      };
      
      // Monitor enabled state (no event, so we check periodically)
      const checkEnabled = () => {
        if (track.readyState === 'ended') return;
        updateRemoteCameraState();
      };
      
      const enabledCheckInterval = setInterval(checkEnabled, 200);
      
      return () => {
        clearInterval(enabledCheckInterval);
      };
    }
  }, [remoteStream]);
  
  // Remote Video Element Management - Show video only when state is 'on'
  useEffect(() => {
    const videoElement = remoteVideoRef.current;
    if (!videoElement) return;
    
    if (!remoteStream) {
      if (videoElement.srcObject) {
        videoElement.srcObject = null;
      }
      return;
    }
    
    let isMounted = true;
    let playPromise = null;
    
    // State Machine Rule: Only show video when state is 'on'
    const attachAndPlay = async () => {
      if (!isMounted || !videoElement || !remoteStream) return;
      
      // Universal Black Screen Safety Guard
      if (remoteCameraState !== 'on') {
        if (videoElement.srcObject) {
          videoElement.pause();
          videoElement.srcObject = null;
          videoElement.currentTime = 0;
          videoElement.load();
        }
        return;
      }
      
      try {
        // Update video source if stream changed
        if (videoElement.srcObject !== remoteStream) {
          if (playPromise) {
            playPromise.catch(() => {});
          }
          videoElement.srcObject = remoteStream;
          console.log('📹 Remote video stream attached');
        }
        
        // Ensure video plays - hide loading only after video plays
        if (videoElement.paused) {
          try {
            playPromise = videoElement.play();
            await playPromise;
            playPromise = null;
            console.log('✅ Remote video playing');
          } catch (err) {
            if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
              if (isMounted) {
                console.warn('⚠️ Error playing remote video:', err.name);
              }
            }
            playPromise = null;
          }
        }
      } catch (error) {
        console.error('Error attaching remote video:', error);
        if (videoElement.srcObject) {
          videoElement.srcObject = null;
        }
      }
    };
    
    attachAndPlay();
    
    // Listen for stream track changes
    const handleTrackChange = () => {
      if (isMounted && videoElement && remoteStream) {
        attachAndPlay();
      }
    };
    
    const videoTracks = remoteStream.getVideoTracks();
    videoTracks.forEach(track => {
      track.addEventListener('ended', handleTrackChange);
      track.addEventListener('mute', handleTrackChange);
      track.addEventListener('unmute', handleTrackChange);
    });
    
    const addTrackHandler = (event) => {
      if (event.track.kind === 'video') {
        console.log('📹 Video track added to remote stream');
        handleTrackChange();
      }
    };
    
    const removeTrackHandler = (event) => {
      if (event.track.kind === 'video') {
        console.log('📹 Video track removed from remote stream');
        handleTrackChange();
      }
    };
    
    remoteStream.addEventListener('addtrack', addTrackHandler);
    remoteStream.addEventListener('removetrack', removeTrackHandler);
    
    // Cleanup
    return () => {
      isMounted = false;
      if (playPromise) {
        playPromise.catch(() => {});
      }
      videoTracks.forEach(track => {
        track.removeEventListener('ended', handleTrackChange);
        track.removeEventListener('mute', handleTrackChange);
        track.removeEventListener('unmute', handleTrackChange);
      });
      remoteStream.removeEventListener('addtrack', addTrackHandler);
      remoteStream.removeEventListener('removetrack', removeTrackHandler);
    };
  }, [remoteCameraState, remoteStream]);
  
  // Watch for remoteStream changes to clear video when tracks are removed or reattach when added back
  useEffect(() => {
    const videoElement = remoteVideoRef.current;
    if (!videoElement) return;
    
    if (!remoteStream) {
      // No remote stream - clear video element immediately
      console.log('📹 No remote stream - clearing video element');
      if (videoElement.srcObject) {
        videoElement.pause();
        videoElement.srcObject = null;
        videoElement.load();
      }
      return;
    }
    
    const videoTracks = remoteStream.getVideoTracks();
    
    // Clear video element completely to prevent frozen frames
    const clearVideoElement = () => {
      if (!videoElement) return;
      
      try {
        videoElement.pause();
        videoElement.srcObject = null;
        videoElement.currentTime = 0;
        videoElement.load();
        // Force repaint
        videoElement.style.display = 'none';
        requestAnimationFrame(() => {
          if (videoElement) {
            videoElement.style.display = '';
          }
        });
      } catch (error) {
        console.warn('Error clearing video element:', error);
      }
    };
    
    // Check if there are any video tracks at all
    if (videoTracks.length === 0) {
      // No video tracks - clear video element immediately to prevent frozen frame
      console.log('📹 No video tracks in remote stream - clearing video element immediately');
      if (videoElement.srcObject) {
        clearVideoElement();
      }
      return;
    }
    
    // Check if tracks are active
    const hasActiveTracks = videoTracks.some(track => 
      track.enabled && 
      track.readyState === 'live' &&
      !track.muted
    );
    
    // Check if all tracks are disabled/ended (video was turned off)
    const allTracksDisabled = videoTracks.length > 0 && 
      videoTracks.every(track => 
        !track.enabled || track.readyState === 'ended'
      );
    
    // If no active tracks or all tracks disabled, clear video element immediately
    if (!hasActiveTracks || allTracksDisabled) {
      if (videoElement.srcObject) {
        console.log('📹 Clearing video element - no active tracks or all disabled');
        clearVideoElement();
      }
      return;
    }
    
    // If video element exists but srcObject is null and we have active tracks, reattach
    if (hasActiveTracks && !videoElement.srcObject) {
      console.log('📹 Reattaching video element - tracks restored');
      videoElement.srcObject = remoteStream;
      videoElement.play().catch(err => {
        if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
          console.warn('Error playing video after reattach:', err.name);
        }
      });
    } else if (hasActiveTracks) {
      // Stream changed or tracks were re-enabled - always update srcObject to ensure latest tracks
      if (videoElement.srcObject !== remoteStream) {
        console.log('📹 Updating video element srcObject - stream changed or tracks re-enabled');
        videoElement.srcObject = remoteStream;
      }
      // Ensure video is playing
      if (videoElement.paused) {
        videoElement.play().catch(err => {
          if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
            console.warn('Error playing video after update:', err.name);
          }
        });
      }
    }
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
      {/* Remote Video (Main) - State Machine UI */}
      <div className="flex-1 relative bg-black">
        {/* Universal Black Screen Safety Guard - Show video ONLY when state is 'on' */}
        {remoteCameraState === 'on' && remoteStream && (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
            onError={(e) => {
              console.error('Remote video error:', e);
              setRemoteCameraState('error');
            }}
          />
        )}
        
        {/* Loading State */}
        {remoteCameraState === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-base-100">
            <div className="text-center">
              <div className="w-24 h-24 rounded-full overflow-hidden mx-auto mb-4 ring-4 ring-primary animate-pulse">
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
        
        {/* Camera Off State - Show avatar, never black screen */}
        {remoteCameraState === 'off' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-base-100">
            <div className="text-center">
              <div className="w-48 h-48 rounded-full overflow-hidden mx-auto mb-6 ring-4 ring-primary shadow-2xl">
                <ProfileImage
                  src={displayUser?.profilePic}
                  alt={displayUser?.fullname}
                  className="w-full h-full object-cover"
                />
              </div>
              <h2 className="text-2xl font-bold text-base-content mb-2">
                {displayUser?.fullname || "Calling..."}
              </h2>
              <p className="text-base-content/70 text-lg font-medium mb-2">
                {formatCallDuration(callDuration)}
              </p>
              <p className="text-base-content/50 text-sm">Camera Off</p>
            </div>
          </div>
        )}
        
        {/* Error/Ended State - Track dead */}
        {(remoteCameraState === 'error' || remoteCameraState === 'ended') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-base-100">
            <div className="text-center">
              <div className="w-48 h-48 rounded-full overflow-hidden mx-auto mb-6 ring-4 ring-error shadow-2xl">
                <ProfileImage
                  src={displayUser?.profilePic}
                  alt={displayUser?.fullname}
                  className="w-full h-full object-cover"
                />
              </div>
              <h2 className="text-2xl font-bold text-base-content mb-2">
                {displayUser?.fullname || "Calling..."}
              </h2>
              <p className="text-base-content/70 text-lg font-medium mb-2">
                {formatCallDuration(callDuration)}
              </p>
              <p className="text-error text-sm">Camera disconnected</p>
            </div>
          </div>
        )}
        
        {/* Fallback - No stream at all */}
        {!remoteStream && remoteCameraState !== 'loading' && (
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
        
        {/* Local Video (Picture-in-Picture) - State Machine UI */}
        {/* Show video ONLY when state is 'on' */}
        {localCameraState === 'on' && (
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
                setLocalCameraState('error');
              }}
            />
            {isScreenSharing && (
              <div className="absolute top-2 left-2 bg-red-500 text-white text-xs px-2 py-1 rounded">
                Sharing Screen
              </div>
            )}
          </div>
        )}
        
        {/* Local Camera Off State - Show avatar, never black screen */}
        {localCameraState === 'off' && !isScreenSharing && (
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
        
        {/* Local Camera Loading State */}
        {localCameraState === 'loading' && !isScreenSharing && (
          <div className="absolute bottom-24 right-4 w-32 h-48 bg-base-200 rounded-lg flex items-center justify-center border-2 border-base-300">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full overflow-hidden mx-auto mb-2 animate-pulse">
                <ProfileImage
                  src={caller?.profilePic}
                  alt="You"
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="text-xs text-base-content/60">Loading...</p>
            </div>
          </div>
        )}
        
        {/* Local Camera Error/Ended State */}
        {(localCameraState === 'error' || localCameraState === 'ended') && !isScreenSharing && (
          <div className="absolute bottom-24 right-4 w-32 h-48 bg-base-200 rounded-lg flex items-center justify-center border-2 border-error">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full overflow-hidden mx-auto mb-2">
                <ProfileImage
                  src={caller?.profilePic}
                  alt="You"
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="text-xs text-error">Camera error</p>
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
