import { FaTimes, FaBars, FaAngleLeft, FaInfoCircle } from "react-icons/fa";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import CallButton from "./CallButton";
import ProfileImage from "./ProfileImage";

const ChatHeader = () => {
  const { selectedUser, selectedGroup, setSelectedUser, setSelectedGroup } = useChatStore();
  const { onlineUsers } = useAuthStore();
  const [isMobile, setIsMobile] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const isGroup = !!selectedGroup;
  const displayName = isGroup ? selectedGroup?.name : selectedUser?.fullname || "Unknown";
  const displayPic = isGroup 
    ? selectedGroup?.groupPic || "/avatar.png"
    : selectedUser?.profilePic || "/avatar.png";
  const displayStatus = isGroup
    ? `${(selectedGroup?.admin ? 1 : 0) + (selectedGroup?.members?.length || 0)} members`
    : selectedUser && onlineUsers.includes(selectedUser._id) ? "Online" : "Offline";

  const handleClose = () => {
    if (isGroup) {
      setSelectedGroup(null);
    } else {
      setSelectedUser(null);
    }
  };

  const handleBackToList = () => {
    if (isGroup) {
      setSelectedGroup(null);
    } else {
      setSelectedUser(null);
    }
    // On mobile, ensure we're on the chat page to show contacts
    if (isMobile && window.location.pathname !== '/') {
      navigate("/");
    }
  };

  return (
    <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-base-200/50 flex items-center justify-between bg-base-100/95 backdrop-blur-sm sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Back to list button */}
        <button
          onClick={handleBackToList}
          className="btn btn-ghost btn-sm btn-circle hover:bg-base-200 transition-colors"
          title="Back to conversations"
        >
          <FaAngleLeft className="size-5 text-base-content/60" />
        </button>
        
        <div className="relative">
          <ProfileImage
            src={displayPic}
            alt={displayName}
            className="size-10 sm:size-11 rounded-full object-cover ring-2 ring-base-200 shadow-sm"
          />
          {!isGroup && selectedUser && onlineUsers.includes(selectedUser._id) && (
            <span className="absolute bottom-0 right-0 size-3 sm:size-3.5 bg-green-500 rounded-full ring-2 ring-base-100 shadow-sm" />
          )}
        </div>

        <div>
          <h3 className="font-semibold text-sm sm:text-base leading-tight text-base-content">{displayName}</h3>
          <p className="text-xs text-base-content/50 mt-0.5">
            {displayStatus}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {/* Call buttons (only for direct chats, not groups) */}
        {!isGroup && selectedUser && (
          <CallButton userId={selectedUser._id} variant="compact" />
        )}
        {!isGroup && selectedUser && (
          <button
            onClick={() => {
              if (isMobile) {
                // Navigate to full page route on mobile
                navigate(`/user/${selectedUser._id}/info`);
              } else {
                // Show in right panel on desktop - trigger via custom event
                window.dispatchEvent(new CustomEvent('showUserInfo', { detail: { userId: selectedUser._id } }));
              }
            }}
            className="btn btn-ghost btn-sm btn-circle hover:bg-base-200 transition-colors"
            title="User info"
          >
            <FaInfoCircle className="size-5 text-base-content/60" />
          </button>
        )}
        {isGroup && (
          <button
            onClick={() => {
              if (isMobile) {
                // Navigate to full page route on mobile
                navigate(`/group/${selectedGroup._id}/info`);
              } else {
                // Show in right panel on desktop - trigger via custom event
                window.dispatchEvent(new CustomEvent('showGroupInfo', { detail: { groupId: selectedGroup._id } }));
              }
            }}
            className="btn btn-ghost btn-sm btn-circle hover:bg-base-200 transition-colors"
            title="Group info"
          >
            <FaInfoCircle className="size-5 text-base-content/60" />
          </button>
        )}
        {isMobile ? (
          <button 
            onClick={handleClose}
            className="btn btn-ghost btn-sm btn-circle hover:bg-base-200 transition-colors"
          >
            <FaTimes className="size-5 text-base-content/60" />
          </button>
        ) : (
          <button 
            onClick={handleClose}
            className="btn btn-ghost btn-sm btn-circle hover:bg-base-200 transition-colors"
            title="Close chat"
          >
            <FaTimes className="size-5 text-base-content/60" />
          </button>
        )}
      </div>

    </div>
  );
};
export default ChatHeader;