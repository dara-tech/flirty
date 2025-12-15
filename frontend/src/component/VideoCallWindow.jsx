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
  
  // Ref to track loading start time
  const loadingStartTimeRef = useRef(null);
  
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
      // If no stream at all and we're in a video call, show loading initially
      if (!localStream && !isScreenSharing && !screenShareStream) {
        // Only show loading if we haven't timed out yet
        if (!loadingStartTimeRef.current || Date.now() - loadingStartTimeRef.current < 3000) {
          setLocalCameraState('loading');
          if (!loadingStartTimeRef.current) {
            loadingStartTimeRef.current = Date.now();
          }
          return;
        } else {
          // Timed out waiting for stream
          setLocalCameraState('off');
          loadingStartTimeRef.current = null;
          return;
        }
      }
      
      if (!track) {
        setLocalCameraState('off');
        loadingStartTimeRef.current = null;
        return;
      }
      
      if (track.readyState === 'ended') {
        setLocalCameraState('ended');
        loadingStartTimeRef.current = null;
        return;
      }
      
      if (!track.enabled) {
        setLocalCameraState('off');
        loadingStartTimeRef.current = null;
        return;
      }
      
      if (track.readyState === 'live' && track.enabled && !track.muted) {
        setLocalCameraState('on');
        loadingStartTimeRef.current = null;
        return;
      }
      
      // Track exists but not ready - check if it's actually starting or stuck
      if (track.readyState !== 'live' && track.readyState !== 'ended') {
        // Track is starting up - give it time
        setLocalCameraState('loading');
        if (!loadingStartTimeRef.current) {
          loadingStartTimeRef.current = Date.now();
        }
      } else if (track.readyState === 'live' && (!track.enabled || track.muted)) {
        // Track is live but disabled/muted - show as off
        setLocalCameraState('off');
        loadingStartTimeRef.current = null;
      } else {
        // Unknown state - set to loading
        setLocalCameraState('loading');
        if (!loadingStartTimeRef.current) {
          loadingStartTimeRef.current = Date.now();
        }
      }
    };
    
    // Initial state check
    updateLocalCameraState();
    
    // Safety timeout: If stuck in loading for more than 5 seconds, assume error
    const loadingTimeout = setInterval(() => {
      if (loadingStartTimeRef.current && Date.now() - loadingStartTimeRef.current > 5000) {
        // Check current state
        const currentTrack = isScreenSharing && screenShareStream 
          ? screenShareStream.getVideoTracks()[0]
          : localStream?.getVideoTracks()[0];
        
        if (currentTrack && currentTrack.readyState !== 'live') {
          setLocalCameraState('off');
          loadingStartTimeRef.current = null;
        } else if (currentTrack && currentTrack.readyState === 'live') {
          // Track became ready, reset timer
          loadingStartTimeRef.current = null;
          updateLocalCameraState();
        }
      }
    }, 500);
    
    // Listen to track state changes
    if (track) {
      track.onended = () => {
        setLocalCameraState('ended');
        loadingStartTimeRef.current = null;
      };
      
      // Monitor enabled state (no event, so we check periodically)
      const checkEnabled = () => {
        if (track.readyState === 'ended') return;
        updateLocalCameraState();
      };
      
      const enabledCheckInterval = setInterval(checkEnabled, 200);
      
      return () => {
        clearInterval(enabledCheckInterval);
        clearInterval(loadingTimeout);
      };
    } else {
      // No track - clear intervals and reset loading time
      loadingStartTimeRef.current = null;
      return () => {
        clearInterval(loadingTimeout);
      };
    }
  }, [localStream, isScreenSharing, screenShareStream, isVideoEnabled]);
  
  // Local Video Element Management - Always keep stream connected, just show/hide video
  useEffect(() => {
    const videoElement = localVideoRef.current;
    if (!videoElement) return;
    
    let isMounted = true;
    let playPromise = null;
    
    const attachAndPlay = async () => {
      if (!isMounted || !videoElement) return;
      
      try {
        // Determine which stream to use - always use stream if it exists
        let streamToUse = null;
        if (isScreenSharing && screenShareStream) {
          streamToUse = screenShareStream;
        } else if (localStream) {
          // Always attach localStream if it exists, even if camera is off
          // The stream stays connected, we just hide/show the video element
          streamToUse = localStream;
        }
        
        // Always attach stream if it exists - keep it connected
        if (streamToUse) {
          if (videoElement.srcObject !== streamToUse) {
            if (playPromise) {
              playPromise.catch(() => {});
            }
            videoElement.srcObject = streamToUse;
            videoElement.muted = true; // Always mute local video to avoid echo
          }
          
          // Always try to play if paused - stream should always be playing
          if (videoElement.paused) {
            try {
              playPromise = videoElement.play();
              await playPromise;
              playPromise = null;
            } catch (err) {
              if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
                // If play fails, try again after a short delay
                setTimeout(() => {
                  if (isMounted && videoElement && videoElement.srcObject) {
                    videoElement.play().catch(() => {});
                  }
                }, 500);
              }
              playPromise = null;
            }
          }
        } else {
          // Only clear if stream doesn't exist at all
          if (videoElement.srcObject) {
            videoElement.srcObject = null;
          }
        }
      } catch (error) {
        console.error('Error attaching local video:', error);
      }
    };
    
    attachAndPlay();
    
    return () => {
      isMounted = false;
      if (playPromise) {
        playPromise.catch(() => {});
      }
    };
  }, [localStream, isScreenSharing, screenShareStream]);
  
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
        }
        
        // Ensure video plays - hide loading only after video plays
        if (videoElement.paused) {
          try {
            playPromise = videoElement.play();
            await playPromise;
            playPromise = null;
          } catch (err) {
            if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
              if (isMounted) {
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
        handleTrackChange();
      }
    };
    
    const removeTrackHandler = (event) => {
      if (event.track.kind === 'video') {
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
      }
    };
    
    // Check if there are any video tracks at all
    if (videoTracks.length === 0) {
      // No video tracks - clear video element immediately to prevent frozen frame
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
        clearVideoElement();
      }
      return;
    }
    
    // If video element exists but srcObject is null and we have active tracks, reattach
    if (hasActiveTracks && !videoElement.srcObject) {
      videoElement.srcObject = remoteStream;
      videoElement.play().catch(err => {
        if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
        }
      });
    } else if (hasActiveTracks) {
      // Stream changed or tracks were re-enabled - always update srcObject to ensure latest tracks
      if (videoElement.srcObject !== remoteStream) {
        videoElement.srcObject = remoteStream;
      }
      // Ensure video is playing
      if (videoElement.paused) {
        videoElement.play().catch(err => {
          if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
          }
        });
      }
    }
  }, [remoteStream]);
  
  useEffect(() => {
    // Handle speaker output for audio and ensure it plays
    const videoElement = remoteVideoRef.current;
    if (!videoElement || !remoteStream) return;
    
    const updateAudioOutput = async () => {
      try {
        videoElement.volume = 1.0;
        videoElement.setAttribute('playsinline', 'true');
        
        // Set audio output device if setSinkId is supported
        if ('setSinkId' in HTMLVideoElement.prototype) {
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioOutputs = devices.filter(device => device.kind === 'audiooutput');
            
            if (audioOutputs.length > 0) {
              const targetDeviceId = isSpeakerEnabled
                ? audioOutputs.find(d => d.label.toLowerCase().includes('speaker') || d.label.toLowerCase().includes('headphone'))?.deviceId || audioOutputs[0]?.deviceId || ''
                : 'default';
              
              try {
                await videoElement.setSinkId(targetDeviceId);
              } catch (err) {
              }
            }
          } catch (err) {
          }
        }
        
        // Try to play if paused (with error handling)
        if (videoElement.paused) {
          videoElement.play().catch(err => {
            // Ignore AbortError (happens when video is removed/changed)
            if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
            }
          });
        }
      } catch (error) {
        console.error('Error updating audio output:', error);
      }
    };
    
    updateAudioOutput();
  }, [isSpeakerEnabled, remoteStream]);
  
  if (callState !== 'in-call') return null;
  
  const displayUser = receiver || caller;
  
  // Local video presence (for self preview)
  const localVideoTracks = localStream?.getVideoTracks() || [];
  const screenShareVideoTracks = screenShareStream?.getVideoTracks() || [];
  const hasLocalCameraVideo =
    !isScreenSharing &&
    isVideoEnabled &&
    localVideoTracks.some(
      (track) => track.readyState === 'live' && track.enabled && !track.muted
    );
  const hasScreenShareVideo =
    isScreenSharing &&
    screenShareVideoTracks.some((track) => track.readyState === 'live');
  const hasLocalVideo = hasLocalCameraVideo || hasScreenShareVideo;
  
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
        
        {/* Local Video (Picture-in-Picture) - Always render video element, show/hide based on state */}
        {/* Stream is always connected, we just show/hide the video element */}
        {(localStream || screenShareStream) && (
          <div
            className={`absolute ${
              isLocalVideoSmall
                ? 'bottom-24 right-4 w-32 h-48'
                : 'inset-0'
            } bg-black rounded-lg overflow-hidden transition-all duration-300 cursor-pointer border-2 border-primary ${
              hasLocalVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            onClick={() => setIsLocalVideoSmall(!isLocalVideoSmall)}
          >
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-contain"
              onLoadedMetadata={() => {
              }}
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
            {!hasLocalVideo && localStream && !isScreenSharing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full overflow-hidden mx-auto mb-2">
                    <ProfileImage
                      src={caller?.profilePic}
                      alt="You"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="text-xs text-white/80">Camera off</p>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Local Camera Off State - small card when no stream at all */}
        {!localStream && !screenShareStream && !isScreenSharing && (
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
