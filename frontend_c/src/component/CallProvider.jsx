import { useEffect, useRef } from "react";
import { useCallStore } from "../store/useCallStore";
import useWebRTC from "../hooks/useWebRTC";
import CallModal from "./CallModal";
import VoiceCallWindow from "./VoiceCallWindow";
import VideoCallWindow from "./VideoCallWindow";
import GroupCallWindow from "./GroupCallWindow";

const CallProvider = () => {
  const {
    callState,
    callType,
    isGroupCall,
  } = useCallStore();
  
  const { initializeCall, answerCallWithMedia } = useWebRTC();
  const initializedRef = useRef(false);
  
  // Initialize call when state becomes 'calling' (only for 1-on-1 calls)
  useEffect(() => {
    if (callState === 'calling' && !initializedRef.current && !isGroupCall) {
      initializedRef.current = true;
      initializeCall(true);
    } else if (callState === 'idle') {
      initializedRef.current = false;
    }
  }, [callState, initializeCall, isGroupCall]);
  
  return (
    <>
      {/* Incoming Call Modal */}
      <CallModal answerCallWithMedia={answerCallWithMedia} />
      
      {/* Active Call Windows */}
      {callState === 'in-call' && (
        <>
          {isGroupCall ? (
            <GroupCallWindow />
          ) : callType === 'video' ? (
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
