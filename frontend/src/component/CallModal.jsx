import { useEffect, useState } from "react";
import { FaPhone, FaVideo, FaTimes } from "react-icons/fa";
import { useCallStore } from "../store/useCallStore";
import { useAuthStore } from "../store/useAuthStore";
import ProfileImage from "./ProfileImage";
import toast from "react-hot-toast";

const CallModal = ({ answerCallWithMedia }) => {
  const {
    callState,
    callType,
    caller,
    receiver,
    rejectCall,
    endCall,
  } = useCallStore();
  const { authUser } = useAuthStore();
  const [isAnswering, setIsAnswering] = useState(false);
  
  const isIncoming = callState === 'ringing';
  const isRequesting = callState === 'calling';
  
  // Helper to normalize IDs
  const normalizeId = (id) => {
    if (!id) return null;
    if (typeof id === 'string') return id;
    if (typeof id === 'object' && id._id) return String(id._id);
    return String(id);
  };
  
  // Check if current user is the caller
  const isCurrentUserCaller = () => {
    if (!caller || !authUser) {
      return false;
    }
    try {
      const callerId = normalizeId(caller.userId);
      const authUserId = normalizeId(authUser._id);
      const result = callerId === authUserId;
      return result;
    } catch (error) {
      console.error('Error checking if user is caller:', error);
      return false;
    }
  };
  
  // Verify this is an incoming call for the current user
  const isCallForCurrentUser = () => {
    if (!caller || !authUser) return false;
    
    const callerId = normalizeId(caller.userId);
    const authUserId = normalizeId(authUser._id);
    
    // If no receiver info, check if caller is not current user (incoming call)
    if (!receiver) {
      return callerId !== authUserId;
    }
    
    const receiverId = normalizeId(receiver.userId);
    
    // This is an incoming call if the caller is not the current user and receiver is current user
    return callerId !== authUserId && receiverId === authUserId;
  };
  
  useEffect(() => {
    // Auto-reject after 60 seconds if not answered (for incoming calls)
    if (isIncoming && isCallForCurrentUser()) {
      const timeout = setTimeout(() => {
        rejectCall();
        toast("Call timed out");
      }, 60000);
      
      return () => clearTimeout(timeout);
    }
  }, [isIncoming, rejectCall]);
  
  // Show modal immediately when call state is 'calling' or 'ringing'
  // For requesting (caller): show if calling state, has caller and receiver, and user is the caller
  // For incoming (receiver): show if ringing state, has caller, and user is the receiver
  
  let shouldShowModal = false;
  let displayUser = null;
  
  // Debug logging
  if (callState === 'calling' || callState === 'ringing') {
    const callerId = caller ? normalizeId(caller.userId) : null;
    const authUserId = authUser ? normalizeId(authUser._id) : null;
    const receiverId = receiver ? normalizeId(receiver.userId) : null;
    
    console.log('📞 CallModal check:', {
      callState,
      isRequesting,
      isIncoming,
      callerId,
      authUserId,
      receiverId,
      isCurrentUserCaller: isCurrentUserCaller(),
      isCallForCurrentUser: isCallForCurrentUser(),
      hasCaller: !!caller,
      hasReceiver: !!receiver,
    });
  }
  
  // Determine if we should show modal and which user to display
  const userIsCaller = isCurrentUserCaller();
  const userIsReceiver = isCallForCurrentUser();
  
  if (isRequesting && caller && receiver) {
    // Show requesting modal if user is the caller
    if (userIsCaller) {
      shouldShowModal = true;
      displayUser = receiver; // Show receiver's info to caller
    }
  } 
  
  // Also check if caller is in 'ringing' state (shouldn't happen, but handle it)
  if (isIncoming && caller) {
    if (userIsReceiver) {
      // Receiver sees incoming call
      shouldShowModal = true;
      displayUser = caller; // Show caller's info to receiver
    } else if (userIsCaller && receiver) {
      // Caller accidentally in ringing state - still show requesting modal
      shouldShowModal = true;
      displayUser = receiver; // Show receiver's info to caller
    }
  }
  
  // Don't show if conditions not met
  if (!shouldShowModal || !displayUser) {
    if (callState === 'calling' || callState === 'ringing') {
      console.log('❌ CallModal not showing:', { shouldShowModal, displayUser: !!displayUser });
    }
    return null;
  }
  
  console.log('✅ CallModal showing:', { callState, isRequesting, isIncoming, displayUser: displayUser?.fullname });
  
  const handleAnswer = async () => {
    if (isAnswering) return; // Prevent double-click
    
    setIsAnswering(true);
    try {
      await answerCallWithMedia();
    } catch (error) {
      console.error('Error answering call:', error);
      toast.error(error.message || "Failed to answer call");
      rejectCall();
    } finally {
      setIsAnswering(false);
    }
  };
  
  const handleReject = () => {
    if (isAnswering) return; // Prevent action while answering
    rejectCall();
  };
  
  const handleEndCall = () => {
    endCall('cancelled');
  };
  
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-base-100 rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
        {/* User Info */}
        <div className="mb-6">
          <div className="relative inline-block mb-4">
            <ProfileImage
              src={displayUser?.profilePic}
              alt={displayUser?.fullname}
              className="w-32 h-32 rounded-full object-cover ring-4 ring-primary"
            />
            {callType === 'video' && (
              <div className="absolute bottom-0 right-0 bg-secondary rounded-full p-2">
                <FaVideo className="w-5 h-5 text-secondary-content" />
              </div>
            )}
          </div>
          <h2 className="text-2xl font-bold text-base-content mb-2">
            {displayUser?.fullname}
          </h2>
          <p className="text-base-content/60">
            {isRequesting 
              ? `Requesting ${callType === 'video' ? 'video' : 'voice'} call...`
              : `${callType === 'video' ? 'Video' : 'Voice'} call incoming...`
            }
          </p>
        </div>
        
        {/* Call Controls */}
        {isRequesting ? (
          // Requesting state - only show End button
          <div className="flex justify-center">
            <button
              onClick={handleEndCall}
              className="btn btn-circle btn-lg bg-red-500 hover:bg-red-600 border-0 text-white"
              aria-label="End call"
            >
              <FaTimes className="w-6 h-6" />
            </button>
          </div>
        ) : (
          // Incoming call - show Reject and Answer buttons
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
              disabled={isAnswering}
              className={`btn btn-circle btn-lg ${
                callType === 'video'
                  ? 'bg-green-500 hover:bg-green-600'
                  : 'bg-primary hover:bg-primary/90'
              } border-0 text-white ${isAnswering ? 'opacity-50 cursor-not-allowed' : ''}`}
              aria-label="Answer call"
            >
              {isAnswering ? (
                <span className="loading loading-spinner loading-md"></span>
              ) : callType === 'video' ? (
                <FaVideo className="w-6 h-6" />
              ) : (
                <FaPhone className="w-6 h-6" />
              )}
            </button>
          </div>
        )}
        
        {/* Ring/Requesting Animation */}
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
