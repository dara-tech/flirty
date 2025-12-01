import { FaPhone, FaVideo } from "react-icons/fa";
import { useCallStore } from "../store/useCallStore";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import toast from "react-hot-toast";

const CallButton = ({ userId, variant = "default" }) => {
  const { initiateCall, callState } = useCallStore();
  const { onlineUsers } = useAuthStore();
  const { users } = useChatStore();
  
  const isOnline = onlineUsers.includes(userId);
  const isInCall = callState !== 'idle';
  const isDisabled = !isOnline || isInCall;
  
  const handleVoiceCall = async () => {
    if (!isOnline) {
      toast.error("User is offline");
      return;
    }
    
    if (isInCall) {
      toast.error("You are already in a call");
      return;
    }
    
    try {
      await initiateCall(userId, 'voice');
    } catch (error) {
      toast.error(error.message || "Failed to start call");
    }
  };
  
  const handleVideoCall = async () => {
    if (!isOnline) {
      toast.error("User is offline");
      return;
    }
    
    if (isInCall) {
      toast.error("You are already in a call");
      return;
    }
    
    try {
      await initiateCall(userId, 'video');
    } catch (error) {
      toast.error(error.message || "Failed to start video call");
    }
  };
  
  if (variant === "compact") {
    return (
      <div className="flex gap-1">
        <button
          onClick={handleVoiceCall}
          disabled={isDisabled}
          className="btn btn-sm btn-circle btn-ghost"
          title={!isOnline ? "User is offline" : "Voice call"}
        >
          <FaPhone className="w-4 h-4" />
        </button>
        <button
          onClick={handleVideoCall}
          disabled={isDisabled}
          className="btn btn-sm btn-circle btn-ghost"
          title={!isOnline ? "User is offline" : "Video call"}
        >
          <FaVideo className="w-4 h-4" />
        </button>
      </div>
    );
  }
  
  return (
    <div className="flex gap-2">
      <button
        onClick={handleVoiceCall}
        disabled={isDisabled}
        className="btn btn-sm btn-primary gap-2"
        title={!isOnline ? "User is offline" : "Voice call"}
      >
        <FaPhone className="w-4 h-4" />
        <span className="hidden sm:inline">Call</span>
      </button>
      <button
        onClick={handleVideoCall}
        disabled={isDisabled}
        className="btn btn-sm btn-secondary gap-2"
        title={!isOnline ? "User is offline" : "Video call"}
      >
        <FaVideo className="w-4 h-4" />
        <span className="hidden sm:inline">Video</span>
      </button>
    </div>
  );
};

export default CallButton;
