import { useEffect, useRef } from "react";
import { useCallStore } from "../store/useCallStore";
import useWebRTC from "../hooks/useWebRTC";
import CallModal from "./CallModal";
import VoiceCallWindow from "./VoiceCallWindow";
import VideoCallWindow from "./VideoCallWindow";

const CallProvider = () => {
  const {
    callState,
    callType,
  } = useCallStore();
  
  const { initializeCall, answerCallWithMedia } = useWebRTC();
  const initializedRef = useRef(false);
  
  // Initialize call when state becomes 'calling'
  useEffect(() => {
    if (callState === 'calling' && !initializedRef.current) {
      initializedRef.current = true;
      initializeCall(true);
    } else if (callState === 'idle') {
      initializedRef.current = false;
    }
  }, [callState, initializeCall]);
  
  return (
    <>
      {/* Incoming Call Modal */}
      <CallModal answerCallWithMedia={answerCallWithMedia} />
      
      {/* Active Call Windows */}
      {callState === 'in-call' && (
        <>
          {callType === 'video' ? (
            <VideoCallWindow />
          ) : (
            <VoiceCallWindow />
          )}
        </>
      )}
    </>
  );
};

export default CallProvider;
