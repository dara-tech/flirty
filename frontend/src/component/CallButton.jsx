import { FaPhone, FaVideo } from "react-icons/fa";
import { useCallStore } from "../store/useCallStore";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import toast from "react-hot-toast";

const CallButton = ({ userId, variant = "default" }) => {
  const { initiateCall, callState } = useCallStore();
  const { onlineUsers, authUser } = useAuthStore();
  const { users } = useChatStore();
  
  // Helper function to normalize IDs for consistent comparison
  const normalizeId = (id) => {
    if (!id) return null;
    if (typeof id === 'string') return id.trim();
    if (typeof id === 'object' && id._id) {
      const nestedId = typeof id._id === 'string' ? id._id.trim() : String(id._id).trim();
      return nestedId;
    }
    return String(id).trim();
  };
  
  // Check if trying to call self
  const authUserId = normalizeId(authUser?._id);
  const receiverId = normalizeId(userId);
  const isSelf = authUserId && receiverId && authUserId === receiverId;
  
  const isOnline = onlineUsers.includes(userId);
  const isInCall = callState !== 'idle';
  const isDisabled = isInCall || isSelf;
  
  let offlineToastShown = false;

  // Removed showOfflineToast and offline toast as requested.

  const handleVoiceCall = async () => {
    // Prevent self-calls
    if (isSelf) {
      toast.error("You cannot call yourself");
      return;
    }
    
    // Allow calling offline users, but show a warning
    // Offline: no toast, just proceed
    if (!isOnline) {
      // No toast
    }
    
    if (isInCall) {
      toast.error("You are already in a call");
      return;
    }
    
    try {
      await initiateCall(userId, 'voice');
      offlineToastShown = false; // reset after call attempt
    } catch (error) {
      toast.error(error.message || "Failed to start call");
    }
  };
  
  const handleVideoCall = async () => {
    // Prevent self-calls
    if (isSelf) {
      toast.error("You cannot call yourself");
      return;
    }
    
    // Allow calling offline users, but show a warning
    // Offline: no toast, just proceed
    if (!isOnline) {
      // No toast
    }
    
    if (isInCall) {
      toast.error("You are already in a call");
      return;
    }
    
    try {
      await initiateCall(userId, 'video');
      offlineToastShown = false; // reset after call attempt
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
          title={isSelf ? "Cannot call yourself" : "Voice call" + (!isOnline ? " (user is offline)" : "")}
        >
          <FaPhone className="w-4 h-4" />
        </button>
        <button
          onClick={handleVideoCall}
          disabled={isDisabled}
          className="btn btn-sm btn-circle btn-ghost"
          title={isSelf ? "Cannot call yourself" : "Video call" + (!isOnline ? " (user is offline)" : "")}
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
        title={isSelf ? "Cannot call yourself" : !isOnline ? "User is offline" : "Voice call"}
      >
        <FaPhone className="w-4 h-4" />
        <span className="hidden sm:inline">Call</span>
      </button>
      <button
        onClick={handleVideoCall}
        disabled={isDisabled}
        className="btn btn-sm btn-secondary gap-2"
        title={isSelf ? "Cannot call yourself" : !isOnline ? "User is offline" : "Video call"}
      >
        <FaVideo className="w-4 h-4" />
        <span className="hidden sm:inline">Video</span>
      </button>
    </div>
  );
};

export default CallButton;
