import {
  FaPhone,
  FaMicrophone,
  FaMicrophoneSlash,
  FaVideo,
  FaVideoSlash,
  FaVolumeUp,
  FaVolumeMute,
  FaDesktop,
} from "react-icons/fa";
import { useCallStore } from "../store/useCallStore";
import { formatCallDuration } from "../lib/webrtc";
import useWebRTC from "../hooks/useWebRTC";

const CallControls = () => {
  const {
    isMuted,
    isVideoEnabled,
    isSpeakerEnabled,
    isScreenSharing,
    callDuration,
    callType,
    toggleMute,
    toggleVideo,
    toggleSpeaker,
    endCall,
  } = useCallStore();
  
  const { toggleScreenShare } = useWebRTC();
  
  return (
    <div className="flex flex-col items-center gap-4">
      {/* Call Duration */}
      <div className="text-base-content/70 text-sm font-medium">
        {formatCallDuration(callDuration)}
      </div>
      
      {/* Control Buttons */}
      <div className="flex items-center gap-3">
        {/* Mute/Unmute */}
        <button
          onClick={toggleMute}
          className={`btn btn-circle ${
            isMuted
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-base-300 hover:bg-base-300/80'
          } border-0`}
          aria-label={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? (
            <FaMicrophoneSlash className="w-5 h-5" />
          ) : (
            <FaMicrophone className="w-5 h-5" />
          )}
        </button>
        
        {/* Video On/Off (only for video calls) */}
        {callType === 'video' && (
          <button
            onClick={toggleVideo}
            className={`btn btn-circle ${
              !isVideoEnabled
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-base-300 hover:bg-base-300/80'
            } border-0`}
            aria-label={isVideoEnabled ? "Turn off video" : "Turn on video"}
          >
            {isVideoEnabled ? (
              <FaVideo className="w-5 h-5" />
            ) : (
              <FaVideoSlash className="w-5 h-5" />
            )}
          </button>
        )}
        
        {/* Screen Share (only for video calls) */}
        {callType === 'video' && (
          <button
            onClick={toggleScreenShare}
            className={`btn btn-circle ${
              isScreenSharing
                ? 'bg-primary hover:bg-primary/90 text-white'
                : 'bg-base-300 hover:bg-base-300/80'
            } border-0`}
            aria-label={isScreenSharing ? "Stop sharing screen" : "Share screen"}
          >
            <FaDesktop className="w-5 h-5" />
          </button>
        )}
        
        {/* Speaker */}
        <button
          onClick={toggleSpeaker}
          className={`btn btn-circle ${
            isSpeakerEnabled
              ? 'bg-primary hover:bg-primary/90 text-white'
              : 'bg-base-300 hover:bg-base-300/80'
          } border-0`}
          aria-label={isSpeakerEnabled ? "Turn off speaker" : "Turn on speaker"}
        >
          {isSpeakerEnabled ? (
            <FaVolumeUp className="w-5 h-5" />
          ) : (
            <FaVolumeMute className="w-5 h-5" />
          )}
        </button>
        
        {/* End Call */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔴 End call button clicked');
            if (endCall) {
              endCall();
            } else {
              console.error('❌ endCall function is not defined');
            }
          }}
          className="btn btn-circle bg-red-500 hover:bg-red-600 text-white border-0"
          aria-label="End call"
          type="button"
        >
          <FaPhone className="w-5 h-5 rotate-[135deg]" />
        </button>
      </div>
    </div>
  );
};

export default CallControls;
