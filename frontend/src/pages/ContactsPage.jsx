import { useEffect, useState } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { useCallStore } from "../store/useCallStore";
import { FaUsers, FaSearch, FaTh, FaPhone, FaVideo } from "react-icons/fa";
import ProfileImage from "../component/ProfileImage";
import SidebarSkeleton from "../component/skeletons/SideBarSkeleton";
import toast from "react-hot-toast";

const ContactsPage = () => {
  const { 
    getAllUsers,
    allUsers,
    isAllUsersLoading,
    setSelectedUser, 
    selectedUser,
  } = useChatStore();
  const { onlineUsers, authUser } = useAuthStore();
  const { initiateCall, callState } = useCallStore();
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    getAllUsers(); // Get all users for contacts page
  }, [getAllUsers]);

  // Filter all users based on search query (excluding current user)
  const safeUsers = Array.isArray(allUsers) ? allUsers : [];
  const filteredUsers = safeUsers.filter((user) => {
    // Exclude current user
    if (user._id === authUser?._id) return false;
    
    const matchesSearch = user.fullname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.email?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });


  // Get status text for user
  const getStatusText = (user) => {
    if (onlineUsers.includes(user._id)) {
      return "online";
    }
    // For now, show "last seen just now" for offline users
    // In a real app, you'd track last seen timestamps
    return "last seen just now";
  };

  const handleContactSelect = (user) => {
    setSelectedUser(user);
    // No need to navigate - ChatPage will show the chat on the right side
  };

  const handleCall = async (userId, callType, e) => {
    if (e) {
      e.stopPropagation();
    }
    
    if (callState !== 'idle') {
      toast.error("You are already in a call");
      return;
    }

    try {
      await initiateCall(userId, callType);
    } catch (error) {
      toast.error(error.message || "Failed to start call");
    }
  };


  if (isAllUsersLoading) {
    return <SidebarSkeleton />;
  }

  return (
    <>
      <div className="h-full flex flex-col overflow-hidden bg-base-100">
        {/* Header - Fixed */}
        <div className="flex-shrink-0 border-b border-base-200/50 bg-base-100 px-4 py-3">
          {/* Top Bar */}
          <div className="flex items-center justify-between mb-3">
            <button className="p-2 hover:bg-base-200/50 rounded-lg transition-colors">
              <FaTh className="size-5 text-base-content/70" />
            </button>
            <h1 className="text-lg font-semibold text-base-content">Contacts</h1>
            <div className="w-9"></div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-base-content/40" />
            <input
              type="text"
              placeholder="Search (⌘K)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-base-100 rounded-lg text-sm border-2 border-base-300 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200 placeholder:text-base-content/40"
            />
          </div>
        </div>

        {/* Contacts List - Scrollable */}
        <div className="flex-1 overflow-y-auto hide-scrollbar pb-16 lg:pb-20">
          {filteredUsers.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="size-16 rounded-full bg-base-200 flex items-center justify-center mx-auto mb-4">
                <FaUsers className="size-8 text-base-content/30" />
              </div>
              <p className="text-base-content/60 font-medium">
                {searchQuery ? "No users found" : "No users available"}
              </p>
              <p className="text-sm text-base-content/40 mt-1">
                {searchQuery 
                  ? "Try adjusting your search" 
                  : "No other users in the system"}
              </p>
            </div>
          ) : (
            filteredUsers.map((user) => {
              const isOnline = onlineUsers.includes(user._id);
              const isInCall = callState !== 'idle';
              const isSelf = user._id === authUser?._id;
              
              return (
                <div
                  key={user._id}
                  className="w-full px-4 py-3 flex items-center gap-3 transition-all duration-200 hover:bg-base-200/50 border-l-4 border-transparent group"
                >
                  <button
                    onClick={() => handleContactSelect(user)}
                    className="flex-1 flex items-center gap-3 min-w-0"
                  >
                    <div className="relative flex-shrink-0">
                      <ProfileImage
                        src={user.profilePic}
                        alt={user.fullname}
                        className="size-12 rounded-full object-cover"
                      />
                      {isOnline && (
                        <span className="absolute bottom-0 right-0 size-3 bg-green-500 rounded-full ring-2 ring-base-100" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="font-semibold text-base-content truncate">{user.fullname}</div>
                      <div className="text-sm text-base-content/50 truncate capitalize">
                        {getStatusText(user)}
                      </div>
                    </div>
                  </button>
                  
                  {/* Call Buttons */}
                  {!isSelf && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => handleCall(user._id, 'voice', e)}
                        disabled={isInCall}
                        className="p-2 hover:bg-base-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Voice call"
                      >
                        <FaPhone className="size-4 text-primary" />
                      </button>
                      <button
                        onClick={(e) => handleCall(user._id, 'video', e)}
                        disabled={isInCall}
                        className="p-2 hover:bg-base-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Video call"
                      >
                        <FaVideo className="size-4 text-primary" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

    </>
  );
};

export default ContactsPage;

