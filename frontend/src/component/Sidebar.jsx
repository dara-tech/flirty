import { useEffect, useState } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { FaUsers, FaTimes, FaBars, FaSearch, FaImage, FaFileAlt, FaCheck, FaCheckDouble, FaUserPlus, FaComment, FaMicrophone } from "react-icons/fa";
import SidebarSkeleton from "./skeletons/SideBarSkeleton";
import CreateGroupModal from "./CreateGroupModal";
import ProfileImage from "./ProfileImage";
import { formatDistanceToNow } from "date-fns";

const Sidebar = () => {
  const { 
    getUsers, 
    users, 
    groups,
    getGroups,
    selectedUser, 
    selectedGroup,
    setSelectedUser, 
    setSelectedGroup,
    isUsersLoading, 
    isGroupsLoading,
    lastMessages, 
    groupLastMessages,
    typingUsers 
  } = useChatStore();
  const { onlineUsers } = useAuthStore();
  const [showOnlineOnly, setShowOnlineOnly] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Auto-open sidebar on mobile when on chat page to show conversation list
  useEffect(() => {
    // On mobile, always show sidebar when no chat is selected so user can see conversations
    if (window.innerWidth < 1024 && !selectedUser && !selectedGroup) {
      setIsMobileOpen(true);
    }
  }, [selectedUser, selectedGroup]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [activeTab, setActiveTab] = useState("chats"); // "chats" or "groups"

  useEffect(() => {
    getUsers();
    getGroups();
  }, [getUsers, getGroups]);

  // Listen for custom event to open sidebar on mobile
  useEffect(() => {
    const handleOpenSidebar = () => {
      setIsMobileOpen(true);
    };
    window.addEventListener('openSidebar', handleOpenSidebar);
    return () => window.removeEventListener('openSidebar', handleOpenSidebar);
  }, []);

  // Filter users to show only those who have chatted (have messages)
  // Convert user._id to string for comparison
  const usersWithMessages = users.filter((user) => {
    const userId = typeof user._id === 'string' ? user._id : user._id.toString();
    return lastMessages[userId] || lastMessages[user._id];
  });

  // Sort users by most recent message first
  const sortedUsersWithMessages = [...usersWithMessages].sort((a, b) => {
    const aId = typeof a._id === 'string' ? a._id : a._id.toString();
    const bId = typeof b._id === 'string' ? b._id : b._id.toString();
    const aMessage = lastMessages[aId] || lastMessages[a._id];
    const bMessage = lastMessages[bId] || lastMessages[b._id];
    
    if (!aMessage && !bMessage) return 0;
    if (!aMessage) return 1;
    if (!bMessage) return -1;
    
    return new Date(bMessage.createdAt) - new Date(aMessage.createdAt);
  });

  // Filter users based on online status and search query (only show users with messages)
  const filteredUsers = sortedUsersWithMessages.filter((user) => {
    const matchesSearch = user.fullname.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesOnline = !showOnlineOnly || onlineUsers.includes(user._id);
    return matchesSearch && matchesOnline;
  });

  // Filter groups based on search query
  const filteredGroups = groups.filter((group) => {
    return group.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Handle user selection - don't close sidebar on desktop, only on mobile
  const handleUserSelect = (user) => {
    setSelectedUser(user);
    // Only close sidebar on mobile, keep it open on desktop
    if (window.innerWidth < 1024) {
      setIsMobileOpen(false);
    }
  };

  // Handle group selection - don't close sidebar on desktop, only on mobile
  const handleGroupSelect = (group) => {
    setSelectedGroup(group);
    // Only close sidebar on mobile, keep it open on desktop
    if (window.innerWidth < 1024) {
      setIsMobileOpen(false);
    }
  };

  if (isUsersLoading || isGroupsLoading) return <SidebarSkeleton />;

  return (
    <>
      {/* Mobile Toggle Button - Hidden since Contact button in bottom nav handles it */}
      <button
        data-sidebar-toggle
        onClick={() => setIsMobileOpen(true)}
        className="hidden"
      >
        <FaBars className="size-5 text-white" />
      </button>

      {/* Sidebar Container */}
      <aside className={`
        fixed inset-0 lg:relative
        h-full w-full ${selectedUser || selectedGroup ? 'lg:w-80' : 'lg:w-full'} lg:h-[calc(100vh-4rem)]
        bg-base-100 lg:bg-base-100
        transform transition-transform duration-300 ease-in-out
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${selectedUser || selectedGroup ? 'lg:border-r' : ''} border-base-200/50 flex flex-col
        z-40 
        shadow-lg lg:shadow-none
        pb-20 lg:pb-0
        top-0 lg:top-0
      `}>
        {/* Header */}
        <div className="border-b border-base-200/50 bg-base-100 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-primary/10 rounded-xl">
                <FaComment className="size-5 text-primary" />
              </div>
              <div>
                <span className="font-bold text-lg text-base-content block">Chats</span>
                <span className="text-xs text-base-content/60">
                  {usersWithMessages.length} {usersWithMessages.length === 1 ? 'conversation' : 'conversations'}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {activeTab === "groups" && (
                <button
                  onClick={() => setShowCreateGroup(true)}
                  className="btn btn-ghost btn-sm btn-circle hover:bg-primary/10 hover:text-primary transition-all"
                  title="Create Group"
                >
                  <FaUserPlus className="size-5" />
                </button>
              )}
              {/* Mobile Close Button */}
              <button
                onClick={() => setIsMobileOpen(false)}
                className="lg:hidden p-2 hover:bg-base-200 rounded-lg transition-colors"
              >
                <FaTimes className="size-5 text-base-content/70" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 p-1 bg-base-200/50 rounded-lg">
            <button
              onClick={() => setActiveTab("chats")}
              className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                activeTab === "chats" 
                  ? "bg-primary text-white shadow-sm" 
                  : "text-base-content/60 hover:text-base-content hover:bg-base-200"
              }`}
            >
              Chats
            </button>
            <button
              onClick={() => setActiveTab("groups")}
              className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                activeTab === "groups" 
                  ? "bg-primary text-white shadow-sm" 
                  : "text-base-content/60 hover:text-base-content hover:bg-base-200"
              }`}
            >
              Groups
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-base-content/40" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-base-100 rounded-lg text-sm border-2 border-base-300 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200 placeholder:text-base-content/40"
            />
          </div>

          {/* Filter Options */}
          <div className="flex items-center justify-between">
            <label className="cursor-pointer flex items-center gap-2">
              <input
                type="checkbox"
                checked={showOnlineOnly}
                onChange={(e) => setShowOnlineOnly(e.target.checked)}
                className="checkbox checkbox-primary checkbox-sm"
              />
              <span className="text-sm">Show online only</span>
            </label>
            <span className="text-xs text-base-content/60">
              {(() => {
                const onlineInConversations = usersWithMessages.filter(user => 
                  onlineUsers.includes(user._id)
                ).length;
                return `${onlineInConversations} ${onlineInConversations === 1 ? 'online' : 'online'}`;
              })()}
            </span>
          </div>
        </div>

        {/* Users/Groups List */}
        <div className="flex-1 overflow-y-auto hide-scrollbar">
          <div className="p-3 space-y-2">
            {activeTab === "chats" ? (
              <>
                {filteredUsers.map((user) => {
                  const userId = typeof user._id === 'string' ? user._id : user._id?.toString() || `user-${Math.random()}`;
                  return (
              <button
                key={userId}
                onClick={() => handleUserSelect(user)}
                className={`
                  w-full p-3 rounded-xl flex items-center gap-4
                  hover:bg-base-200/70 active:bg-base-200
                  transition-all duration-200 ease-in-out
                  ${selectedUser?._id === user._id 
                    ? "bg-primary/10 border border-primary/30 shadow-sm" 
                    : "border border-transparent"}
                `}
              >
                <div className="relative">
                  <ProfileImage
                    src={user.profilePic}
                    alt={user.fullname || user.name}
                    className="size-12 object-cover rounded-full"
                  />
                  {onlineUsers.includes(user._id) && (
                    <span className="absolute bottom-0 right-0 size-3 bg-green-500 rounded-full ring-2 ring-base-100" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center gap-2">
                    <div className={`font-medium truncate ${
                      selectedUser?._id === user._id ? "text-primary" : ""
                    }`}>
                      {user.fullname}
                    </div>
                    <div className="text-xs text-base-content/60 flex-shrink-0">
                      {onlineUsers.includes(user._id) ? "Online" : "Offline"}
                    </div>
                  </div>
                  {typingUsers.includes(user._id) ? (
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1">
                        <div className="typing-indicator">
                          <span className="dot"></span>
                          <span className="dot"></span>
                          <span className="dot"></span>
                        </div>
                      </div>
                      <span className="text-xs text-primary/70 flex-shrink-0">typing...</span>
                    </div>
                  ) : (() => {
                    const userId = typeof user._id === 'string' ? user._id : user._id.toString();
                    const lastMessage = lastMessages[userId] || lastMessages[user._id];
                    return lastMessage ? (
                      <div className="flex items-center gap-2 mt-1">
                        {/* Message type icon */}
                        {lastMessage.audio ? (
                          <FaMicrophone className="size-3 text-primary/70 flex-shrink-0" />
                        ) : lastMessage.image ? (
                          <FaImage className="size-3 text-base-content/60 flex-shrink-0" />
                        ) : lastMessage.file ? (
                          <FaFileAlt className="size-3 text-base-content/60 flex-shrink-0" />
                        ) : null}

                        {/* Message preview */}
                        <div className="text-sm truncate flex-1">
                          {(() => {
                            const msgSenderId = typeof lastMessage.senderId === 'object' ? lastMessage.senderId._id : lastMessage.senderId;
                            const isFromUser = msgSenderId === user._id || msgSenderId === userId;
                            return isFromUser ? (
                              <span className="text-base-content/60">
                                {lastMessage.audio ? 'Voice message' :
                                 lastMessage.image ? 'Sent an image' :
                                 lastMessage.file ? 'Sent a file' :
                                 lastMessage.text}
                              </span>
                            ) : (
                              <span className="text-primary">
                                You: {lastMessage.audio ? 'Voice message' :
                                      lastMessage.image ? 'Sent an image' :
                                      lastMessage.file ? 'Sent a file' :
                                      lastMessage.text}
                              </span>
                            );
                          })()}
                        </div>

                        {/* Message status */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {(() => {
                            const msgSenderId = typeof lastMessage.senderId === 'object' ? lastMessage.senderId._id : lastMessage.senderId;
                            const isFromUser = msgSenderId === user._id || msgSenderId === userId;
                            return !isFromUser && (
                              lastMessage.seen ? (
                                <FaCheckDouble className="size-3 text-primary" />
                              ) : (
                                <FaCheck className="size-3 text-base-content/60" />
                              )
                            );
                          })()}
                          <span className="text-xs text-base-content/60">
                            {formatDistanceToNow(new Date(lastMessage.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
              </button>
                  );
                })}
                
                 {filteredUsers.length === 0 && (
                   <div className="text-center py-12">
                     <div className="size-16 rounded-full bg-base-200 flex items-center justify-center mx-auto mb-4">
                       <FaUsers className="size-8 text-base-content/30" />
                     </div>
                     <p className="text-base-content/60 font-medium">
                       {searchQuery || showOnlineOnly 
                         ? "No conversations found" 
                         : "No conversations yet"}
                     </p>
                     <p className="text-sm text-base-content/40 mt-1">
                       {searchQuery || showOnlineOnly 
                         ? "Try adjusting your search or filters" 
                         : "Start chatting with someone to see conversations here"}
                     </p>
                   </div>
                 )}
              </>
            ) : (
              <>
                {filteredGroups.map((group) => {
                  const groupId = typeof group._id === 'string' ? group._id : group._id?.toString() || `group-${Math.random()}`;
                  return (
                  <button
                    key={groupId}
                    onClick={() => handleGroupSelect(group)}
                    className={`
                      w-full p-3 rounded-xl flex items-center gap-4
                      hover:bg-base-200/70 active:bg-base-200
                      transition-all duration-200 ease-in-out
                      ${selectedGroup?._id === group._id 
                        ? "bg-primary/10 border border-primary/30 shadow-sm" 
                        : "border border-transparent"}
                    `}
                  >
                    <div className="relative">
                      <ProfileImage
                        src={group.groupPic}
                        alt={group.name}
                        className="size-12 object-cover rounded-full"
                      />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center gap-2">
                        <div className={`font-medium truncate ${
                          selectedGroup?._id === group._id ? "text-primary" : ""
                        }`}>
                          {group.name}
                        </div>
                        <div className="text-xs text-base-content/60 flex-shrink-0">
                          {group.members?.length || 0} members
                        </div>
                      </div>
                      {groupLastMessages[group._id] && (
                        <div className="flex items-center gap-2 mt-1">
                          {groupLastMessages[group._id].image ? (
                            <FaImage className="size-3 text-base-content/60 flex-shrink-0" />
                          ) : null}
                          <div className="text-sm truncate flex-1">
                            <span className="text-base-content/60">
                              {groupLastMessages[group._id].senderId?.fullname || "Someone"}: {
                                groupLastMessages[group._id].image 
                                  ? 'Sent an image' 
                                  : groupLastMessages[group._id].text
                              }
                            </span>
                          </div>
                          <span className="text-xs text-base-content/60">
                            {formatDistanceToNow(new Date(groupLastMessages[group._id].createdAt), { addSuffix: true })}
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                  );
                })}
                
                {filteredGroups.length === 0 && (
                  <div className="text-center text-zinc-500 py-8">
                    No groups found
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 lg:hidden z-40"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Create Group Modal */}
      <CreateGroupModal
        isOpen={showCreateGroup}
        onClose={() => {
          setShowCreateGroup(false);
          getGroups(); // Refresh groups list
        }}
      />
    </>
  );
};

export default Sidebar;