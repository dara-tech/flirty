import { FaPhone, FaVideo } from "react-icons/fa";
import { useCallStore } from "../store/useCallStore";
import { useAuthStore } from "../store/useAuthStore";
import toast from "react-hot-toast";

const GroupCallButton = ({ groupId, variant = "default" }) => {
  const { initiateGroupCall, callState, isGroupCall, roomId } = useCallStore();
  const { authUser, onlineUsers } = useAuthStore();
  
  const isInCall = callState === 'in-call' || callState === 'calling' || callState === 'ringing';
  const isInThisGroupCall = isGroupCall && roomId && roomId.includes(groupId);
  
  const handleVoiceCall = async () => {
    if (isInCall && !isInThisGroupCall) {
      toast.error("You are already in a call");
      return;
    }
    
    if (isInThisGroupCall) {
      toast.info("Already in this group call");
      return;
    }
    
    try {
      await initiateGroupCall(groupId, 'voice');
    } catch (error) {
      console.error('Error initiating group voice call:', error);
      toast.error(error.message || "Failed to start group call");
    }
  };
  
  const handleVideoCall = async () => {
    if (isInCall && !isInThisGroupCall) {
      toast.error("You are already in a call");
      return;
    }
    
    if (isInThisGroupCall) {
      toast.info("Already in this group call");
      return;
    }
    
    try {
      await initiateGroupCall(groupId, 'video');
    } catch (error) {
      console.error('Error initiating group video call:', error);
      toast.error(error.message || "Failed to start group call");
    }
  };
  
  if (variant === "compact") {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={handleVoiceCall}
          className="btn btn-ghost btn-sm btn-circle hover:bg-base-200 transition-colors"
          title="Group voice call"
          disabled={isInCall && !isInThisGroupCall}
        >
          <FaPhone className="w-4 h-4 text-base-content/60" />
        </button>
        <button
          onClick={handleVideoCall}
          className="btn btn-ghost btn-sm btn-circle hover:bg-base-200 transition-colors"
          title="Group video call"
          disabled={isInCall && !isInThisGroupCall}
        >
          <FaVideo className="w-4 h-4 text-base-content/60" />
        </button>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleVoiceCall}
        className="btn btn-primary btn-sm w-full"
        disabled={isInCall && !isInThisGroupCall}
      >
        <FaPhone className="w-4 h-4 mr-2" />
        Voice Call
      </button>
      <button
        onClick={handleVideoCall}
        className="btn btn-primary btn-sm w-full"
        disabled={isInCall && !isInThisGroupCall}
      >
        <FaVideo className="w-4 h-4 mr-2" />
        Video Call
      </button>
    </div>
  );
};

export default GroupCallButton;

