import { useEffect, useRef, useState } from "react";
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
    isVideoEnabled,
    isScreenSharing,
    screenShareStream,
  } = useCallStore();
  
  const localAudioRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [isLocalVideoSmall, setIsLocalVideoSmall] = useState(true);
  
  useEffect(() => {
    // Attach local stream to audio element
    if (localAudioRef.current && localStream) {
      localAudioRef.current.srcObject = localStream;
    }
  }, [localStream]);
  
  useEffect(() => {
    // Attach remote stream to audio element
    const audioElement = remoteAudioRef.current;
    if (!audioElement || !remoteStream) return;
    
    let isMounted = true;
    let playPromise = null;
    
    const attachAndPlay = async () => {
      if (!isMounted || !audioElement || !remoteStream) return;
      
      try {
        // Set srcObject
        if (audioElement.srcObject !== remoteStream) {
          if (playPromise) {
            playPromise.catch(() => {}); // Ignore abort errors
          }
          audioElement.srcObject = remoteStream;
        }
        
        // Play audio
        if (audioElement.paused) {
          try {
            playPromise = audioElement.play();
            await playPromise;
            playPromise = null;
          } catch (err) {
            // Ignore AbortError (happens when audio is removed/changed during play)
            if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
              if (isMounted) {
                console.warn('Error playing remote audio:', err.name);
              }
            }
            playPromise = null;
          }
        }
      } catch (error) {
        if (isMounted && error.name !== 'AbortError') {
          console.error('Error attaching remote audio:', error);
        }
      }
    };
    
    attachAndPlay();
    
    return () => {
      isMounted = false;
      if (playPromise) {
        playPromise.catch(() => {}); // Ignore abort errors
      }
    };
  }, [remoteStream]);
  
  useEffect(() => {
    // Handle speaker output and ensure audio plays
    const audioElement = remoteAudioRef.current;
    if (!audioElement || !remoteStream) return;
    
    let isMounted = true;
    let playPromise = null;
    
    const updateAudio = async () => {
      if (!isMounted || !audioElement || !remoteStream) return;
      
      try {
        audioElement.volume = 1.0;
        audioElement.setAttribute('playsinline', 'true');
        
        // Try to play if paused
        if (audioElement.paused) {
          try {
            playPromise = audioElement.play();
            await playPromise;
            playPromise = null;
          } catch (err) {
            // Ignore AbortError and NotAllowedError
            if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
              if (isMounted) {
                console.warn('Error playing audio:', err.name);
              }
            }
            playPromise = null;
          }
        }
      } catch (error) {
        if (isMounted && error.name !== 'AbortError') {
          console.error('Error updating audio:', error);
        }
      }
    };
    
    updateAudio();
    
    return () => {
      isMounted = false;
      if (playPromise) {
        playPromise.catch(() => {}); // Ignore abort errors
      }
    };
  }, [isSpeakerEnabled, remoteStream]);
  
  // Handle local video (camera or screen share)
  useEffect(() => {
    const videoElement = localVideoRef.current;
    if (!videoElement) return;
    
    let isMounted = true;
    let playPromise = null;
    
    const attachAndPlay = async () => {
      if (!isMounted || !videoElement) return;
      
      try {
        // Only show local video if video is enabled or screen sharing
        if (!isVideoEnabled && !isScreenSharing) {
          // Clear video element if video is disabled
          if (videoElement.srcObject) {
            videoElement.srcObject = null;
          }
          return;
        }
        
        let streamToUse = null;
        if (isScreenSharing && screenShareStream) {
          streamToUse = screenShareStream;
        } else if (localStream && isVideoEnabled) {
          streamToUse = localStream;
        }
        
        if (!streamToUse) {
          if (videoElement.srcObject) {
            videoElement.srcObject = null;
          }
          return;
        }
        
        const videoTracks = streamToUse.getVideoTracks();
        if (videoTracks.length === 0) {
          if (videoElement.srcObject) {
            videoElement.srcObject = null;
          }
          return;
        }
        
        // Check if video tracks are actually enabled
        const hasEnabledVideoTracks = videoTracks.some(track => track.enabled && track.readyState === 'live');
        if (!hasEnabledVideoTracks) {
          if (videoElement.srcObject) {
            videoElement.srcObject = null;
          }
          return;
        }
        
        if (videoElement.srcObject !== streamToUse) {
          if (playPromise) {
            playPromise.catch(() => {});
          }
          videoElement.srcObject = streamToUse;
        }
        
        if (videoElement.paused) {
          try {
            playPromise = videoElement.play();
            await playPromise;
            playPromise = null;
          } catch (err) {
            if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
              console.warn('Error playing local video:', err.name);
            }
            playPromise = null;
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
  }, [localStream, isScreenSharing, screenShareStream, isVideoEnabled]);
  
  // Handle remote video
  useEffect(() => {
    const videoElement = remoteVideoRef.current;
    if (!videoElement || !remoteStream) return;
    
    let isMounted = true;
    let playPromise = null;
    
    const attachAndPlay = async () => {
      if (!isMounted || !videoElement || !remoteStream) return;
      
      const videoTracks = remoteStream.getVideoTracks();
      if (videoTracks.length === 0) {
        // No video tracks - hide video element
        if (videoElement.srcObject) {
          videoElement.srcObject = null;
        }
        return;
      }
      
      if (videoElement.srcObject !== remoteStream) {
        if (playPromise) {
          playPromise.catch(() => {});
        }
        videoElement.srcObject = remoteStream;
      }
      
      if (videoElement.paused) {
        try {
          playPromise = videoElement.play();
          await playPromise;
          playPromise = null;
        } catch (err) {
          if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
            console.warn('Error playing remote video:', err.name);
          }
          playPromise = null;
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
  }, [remoteStream]);
  
  if (callState !== 'in-call') return null;
  
  const displayUser = receiver || caller;
  
  // Check for actual video tracks (not just enabled state)
  const remoteVideoTracks = remoteStream?.getVideoTracks() || [];
  const localVideoTracks = localStream?.getVideoTracks() || [];
  const screenShareTracks = screenShareStream?.getVideoTracks() || [];
  
  // Strictly check if video tracks exist and are actually working
  // Only consider video active if tracks are enabled AND live
  const hasRemoteVideo = remoteVideoTracks.length > 0 && 
                         remoteVideoTracks.some(track => 
                           track.enabled && 
                           track.readyState === 'live' &&
                           !track.muted
                         );
  
  const hasLocalVideo = (isScreenSharing && screenShareTracks.length > 0 && 
                         screenShareTracks.some(track => track.readyState === 'live')) || 
                        (isVideoEnabled && localVideoTracks.length > 0 && 
                         localVideoTracks.some(track => 
                           track.enabled && 
                           track.readyState === 'live' &&
                           !track.muted
                         ));
  
  // For voice calls: Show video view ONLY if we have actual working video
  // Show profile picture view if:
  // - No video at all, OR
  // - Video is disabled, OR
  // - Video tracks exist but are not enabled/live
  const showVideoView = (hasRemoteVideo || hasLocalVideo) && (isVideoEnabled || hasRemoteVideo);
  
  // Show profile picture view when:
  // - Video view shouldn't be shown, OR
  // - Both local and remote video are disabled/not available
  const shouldShowProfileView = !showVideoView || (!hasRemoteVideo && !hasLocalVideo);
  
  return (
    <div className={`fixed inset-0 z-50 flex flex-col ${showVideoView && hasRemoteVideo ? 'bg-black' : 'bg-base-100'}`}>
      {shouldShowProfileView ? (
        // Audio-only view (default for voice calls) - always show this unless video is confirmed
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
      ) : (
        // Video view (when video is active)
        <div className="flex-1 relative bg-black">
          {/* Remote Video (Main) */}
          {hasRemoteVideo ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted={false}
              className="w-full h-full object-cover"
              style={{ backgroundColor: '#000' }}
            />
          ) : (
            // Fallback: show profile picture if remote video not available
            <div className="w-full h-full flex flex-col items-center justify-center bg-base-100">
              <ProfileImage
                src={displayUser?.profilePic}
                alt={displayUser?.fullname}
                className="w-48 h-48 rounded-full object-cover ring-4 ring-primary shadow-2xl mb-4"
              />
              <h2 className="text-2xl font-bold text-base-content">
                {displayUser?.fullname || "Calling..."}
              </h2>
            </div>
          )}
          
          {/* Local Video (Picture-in-Picture) - only show if actually has video */}
          {hasLocalVideo && (
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
                style={{ backgroundColor: '#000' }}
              />
              {isScreenSharing && (
                <div className="absolute top-2 left-2 bg-red-500 text-white text-xs px-2 py-1 rounded">
                  Sharing Screen
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
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
