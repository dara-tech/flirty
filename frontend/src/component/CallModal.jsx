import { useEffect } from "react";
import { FaPhone, FaVideo, FaTimes } from "react-icons/fa";
import { useCallStore } from "../store/useCallStore";
import ProfileImage from "./ProfileImage";
import toast from "react-hot-toast";

const CallModal = ({ answerCallWithMedia }) => {
  const {
    callState,
    callType,
    caller,
    rejectCall,
  } = useCallStore();
  
  const isIncoming = callState === 'ringing';
  
  useEffect(() => {
    // Auto-reject after 60 seconds if not answered
    if (isIncoming) {
      const timeout = setTimeout(() => {
        rejectCall();
        toast("Call timed out", { icon: 'ℹ️' });
      }, 60000);
      
      return () => clearTimeout(timeout);
    }
  }, [isIncoming, rejectCall]);
  
  if (!isIncoming || !caller) return null;
  
  const handleAnswer = async () => {
    try {
      await answerCallWithMedia();
    } catch (error) {
      toast.error(error.message || "Failed to answer call");
      rejectCall();
    }
  };
  
  const handleReject = () => {
    rejectCall();
  };
  
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-base-100 rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
        {/* Caller Info */}
        <div className="mb-6">
          <div className="relative inline-block mb-4">
            <ProfileImage
              src={caller.profilePic}
              alt={caller.fullname}
              className="w-32 h-32 rounded-full object-cover ring-4 ring-primary"
            />
            {callType === 'video' && (
              <div className="absolute bottom-0 right-0 bg-secondary rounded-full p-2">
                <FaVideo className="w-5 h-5 text-secondary-content" />
              </div>
            )}
          </div>
          <h2 className="text-2xl font-bold text-base-content mb-2">
            {caller.fullname}
          </h2>
          <p className="text-base-content/60">
            {callType === 'video' ? 'Video' : 'Voice'} call incoming...
          </p>
        </div>
        
        {/* Call Controls */}
        <div className="flex justify-center gap-4">
          {/* Reject Button */}
          <button
            onClick={handleReject}
            className="btn btn-circle btn-lg bg-red-500 hover:bg-red-600 border-0 text-white"
            aria-label="Reject call"
          >
            <FaTimes className="w-6 h-6" />
          </button>
          
          {/* Answer Button */}
          <button
            onClick={handleAnswer}
            className={`btn btn-circle btn-lg ${
              callType === 'video'
                ? 'bg-green-500 hover:bg-green-600'
                : 'bg-primary hover:bg-primary/90'
            } border-0 text-white`}
            aria-label="Answer call"
          >
            {callType === 'video' ? (
              <FaVideo className="w-6 h-6" />
            ) : (
              <FaPhone className="w-6 h-6" />
            )}
          </button>
        </div>
        
        {/* Ring Animation */}
        <div className="mt-8">
          <div className="flex justify-center gap-2">
            <span className="w-2 h-2 bg-primary rounded-full animate-pulse"></span>
            <span className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></span>
            <span className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CallModal;
