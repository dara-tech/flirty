import { useEffect, useState } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { useFolderStore } from "../store/useFolderStore";
import { FaUsers, FaTimes, FaBars, FaSearch, FaImage, FaFileAlt, FaCheck, FaCheckDouble, FaUserPlus, FaComment, FaMicrophone, FaBookmark, FaFolder, FaChevronDown, FaChevronRight} from "react-icons/fa";
import SidebarSkeleton from "./skeletons/SideBarSkeleton";
import CreateGroupModal from "./CreateGroupModal";
import FolderManagementModal from "./FolderManagementModal";
import ProfileImage from "./ProfileImage";
import SavedMessages from "./SavedMessages";
import { formatDistanceToNow } from "date-fns";
import { getFolderIcon, DEFAULT_FOLDER_ICON } from "../lib/folderIcons";

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
  const { folders, getFolders, toggleFolderExpansion, addConversationToFolder, removeConversationFromFolder, getFolderForConversation } = useFolderStore();
  const [showOnlineOnly, setShowOnlineOnly] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [showFolderManagement, setShowFolderManagement] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);

  // Auto-open sidebar on mobile when on chat page to show conversation list
  useEffect(() => {
    // On mobile, always show sidebar when no chat is selected so user can see conversations
    if (window.innerWidth < 1024 && !selectedUser && !selectedGroup) {
      setIsMobileOpen(true);
    }
  }, [selectedUser, selectedGroup]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [activeTab, setActiveTab] = useState("chats"); // "chats", "groups", or "saved"

  useEffect(() => {
    getUsers();
    getGroups();
    getFolders();
  }, [getUsers, getGroups, getFolders]);

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

  // Separate conversations into folders and unorganized
  const getConversationsInFolders = () => {
    const inFolders = new Set();
    folders.forEach((folder) => {
      folder.conversations.forEach((conv) => {
        if (conv.type === "user") {
          inFolders.add(conv.id.toString());
        }
      });
    });
    return inFolders;
  };

  const conversationsInFolders = getConversationsInFolders();
  const unorganizedUsers = filteredUsers.filter((user) => {
    const userId = typeof user._id === 'string' ? user._id : user._id.toString();
    return !conversationsInFolders.has(userId);
  });

  // Get users in a specific folder
  const getUsersInFolder = (folder) => {
    const folderUserIds = folder.conversations
      .filter((conv) => conv.type === "user")
      .map((conv) => conv.id.toString());
    
    return filteredUsers.filter((user) => {
      const userId = typeof user._id === 'string' ? user._id : user._id.toString();
      return folderUserIds.includes(userId);
    });
  };

  // Handle context menu for moving conversations to folders
  const handleContextMenu = (e, user) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      user,
    });
  };

  const handleMoveToFolder = async (folderId, user) => {
    const userId = typeof user._id === 'string' ? user._id : user._id.toString();
    try {
      await addConversationToFolder(folderId, "user", userId);
      setContextMenu(null);
    } catch (error) {
      console.error("Failed to move conversation to folder:", error);
    }
  };

  const handleRemoveFromFolder = async (folderId, user) => {
    const userId = typeof user._id === 'string' ? user._id : user._id.toString();
    try {
      await removeConversationFromFolder(folderId, "user", userId);
      setContextMenu(null);
    } catch (error) {
      console.error("Failed to remove conversation from folder:", error);
    }
  };

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
              {activeTab === "chats" && (
                <button
                  onClick={() => setShowFolderManagement(true)}
                  className="btn btn-ghost btn-sm btn-circle hover:bg-primary/10 hover:text-primary transition-all"
                  title="Manage Folders"
                >
                  <FaFolder className="size-5" />
                </button>
              )}
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
            <button
              onClick={() => setActiveTab("saved")}
              className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "saved" 
                  ? "bg-primary text-white shadow-sm" 
                  : "text-base-content/60 hover:text-base-content hover:bg-base-200"
              }`}
              title="Saved Messages"
            >
              <FaBookmark className="size-3.5" />
              <span className="hidden sm:inline">Saved</span>
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
                {/* Folders */}
                {folders.map((folder) => {
                  const folderUsers = getUsersInFolder(folder);
                  if (folderUsers.length === 0 && !searchQuery) return null;
                  
                  return (
                    <div key={folder._id} className="space-y-1">
                      <button
                        onClick={() => toggleFolderExpansion(folder._id)}
                        className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-base-200/70 transition-colors"
                      >
                        {folder.isExpanded ? (
                          <FaChevronDown className="size-3 text-base-content/60" />
                        ) : (
                          <FaChevronRight className="size-3 text-base-content/60" />
                        )}
                        {(() => {
                          const FolderIconComponent = getFolderIcon(folder.icon || DEFAULT_FOLDER_ICON);
                          return <FolderIconComponent className="size-5" style={{ color: folder.color }} />;
                        })()}
                        <div
                          className="w-1 h-4 rounded-full"
                          style={{ backgroundColor: folder.color }}
                        />
                        <span className="flex-1 text-left font-medium text-sm text-base-content">
                          {folder.name}
                        </span>
                        <span className="text-xs text-base-content/60">
                          {folderUsers.length}
                        </span>
                      </button>
                      {folder.isExpanded && (
                        <div className="ml-6 space-y-1">
                          {folderUsers.map((user) => {
                            const userId = typeof user._id === 'string' ? user._id : user._id?.toString() || `user-${Math.random()}`;
                            const lastMessage = lastMessages[userId] || lastMessages[user._id];
                            return (
                              <button
                                key={userId}
                                onClick={() => handleUserSelect(user)}
                                onContextMenu={(e) => handleContextMenu(e, user)}
                                className={`
                                  w-full p-2 rounded-lg flex items-center gap-3
                                  hover:bg-base-200/70 active:bg-base-200
                                  transition-all duration-200
                                  ${selectedUser?._id === user._id 
                                    ? "bg-primary/10 border border-primary/30" 
                                    : "border border-transparent"}
                                `}
                              >
                                <div className="relative">
                                  <ProfileImage
                                    src={user.profilePic}
                                    alt={user.fullname}
                                    className="size-10 object-cover rounded-full"
                                  />
                                  {onlineUsers.includes(user._id) && (
                                    <span className="absolute bottom-0 right-0 size-2.5 bg-green-500 rounded-full ring-2 ring-base-100" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm truncate">
                                    {user.fullname}
                                  </div>
                                  {lastMessage && (
                                    <div className="text-xs text-base-content/60 truncate mt-0.5">
                                      {lastMessage.text || "Media"}
                                    </div>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Unorganized Conversations */}
                {unorganizedUsers.map((user) => {
                  const userId = typeof user._id === 'string' ? user._id : user._id?.toString() || `user-${Math.random()}`;
                  return (
              <button
                key={userId}
                onClick={() => handleUserSelect(user)}
                onContextMenu={(e) => handleContextMenu(e, user)}
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
                
                 {(filteredUsers.length === 0 || (unorganizedUsers.length === 0 && folders.length === 0)) && (
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
            ) : activeTab === "groups" ? (
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
            ) : activeTab === "saved" ? (
              <SavedMessages />
            ) : null}
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
      <FolderManagementModal
        isOpen={showFolderManagement}
        onClose={() => {
          setShowFolderManagement(false);
          getFolders(); // Refresh folders list
        }}
      />
      
      {/* Context Menu for Moving Conversations */}
      {contextMenu && (() => {
        const userId = typeof contextMenu.user._id === 'string' 
          ? contextMenu.user._id 
          : contextMenu.user._id?.toString() || String(contextMenu.user._id);
        const currentFolder = getFolderForConversation("user", userId);
        const isInFolder = !!currentFolder;
        
        // Debug logging (can be removed later)
        if (process.env.NODE_ENV === 'development') {
          console.log('Context menu debug:', {
            userId,
            userIdType: typeof userId,
            foldersCount: folders.length,
            currentFolder: currentFolder ? { id: currentFolder._id, name: currentFolder.name } : null,
            isInFolder,
            folders: folders.map(f => ({
              id: f._id,
              name: f.name,
              conversations: f.conversations?.map(c => ({
                type: c.type,
                id: c.id,
                idType: typeof c.id
              }))
            }))
          });
        }
        
        return (
          <div
            className="fixed z-50 bg-base-100 rounded-lg shadow-xl border border-base-300 py-2 min-w-[200px]"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {isInFolder ? (
              <>
                <div className="px-3 py-2 text-xs font-semibold text-base-content/60 border-b border-base-300">
                  Remove from Folder
                </div>
                <div className="px-3 py-2 text-sm text-base-content/60 border-b border-base-300">
                  Currently in: <span className="font-medium">{currentFolder.name}</span>
                </div>
                <button
                  onClick={() => handleRemoveFromFolder(currentFolder._id, contextMenu.user)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-base-200 flex items-center gap-2 text-red-500"
                >
                  <span>Remove from "{currentFolder.name}"</span>
                </button>
                <div className="border-t border-base-300 mt-1">
                  <div className="px-3 py-2 text-xs font-semibold text-base-content/60">
                    Or move to another folder:
                  </div>
                  {folders.filter(f => f._id !== currentFolder._id).length === 0 ? (
                    <div className="px-3 py-2 text-sm text-base-content/60">
                      No other folders available
                    </div>
                  ) : (
                    folders
                      .filter(f => f._id !== currentFolder._id)
                      .map((folder) => {
                        const FolderIconComponent = getFolderIcon(folder.icon || DEFAULT_FOLDER_ICON);
                        return (
                          <button
                            key={folder._id}
                            onClick={() => handleMoveToFolder(folder._id, contextMenu.user)}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-base-200 flex items-center gap-2"
                          >
                            <FolderIconComponent className="size-4" style={{ color: folder.color }} />
                            <div
                              className="w-1 h-4 rounded-full"
                              style={{ backgroundColor: folder.color }}
                            />
                            <span className="flex-1">{folder.name}</span>
                          </button>
                        );
                      })
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="px-3 py-2 text-xs font-semibold text-base-content/60 border-b border-base-300">
                  Move to Folder
                </div>
                {folders.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-base-content/60">
                    No folders. Create one first!
                  </div>
                ) : (
                  folders.map((folder) => {
                    const FolderIconComponent = getFolderIcon(folder.icon || DEFAULT_FOLDER_ICON);
                    return (
                      <button
                        key={folder._id}
                        onClick={() => handleMoveToFolder(folder._id, contextMenu.user)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-base-200 flex items-center gap-2"
                      >
                        <FolderIconComponent className="size-4" style={{ color: folder.color }} />
                        <div
                          className="w-1 h-4 rounded-full"
                          style={{ backgroundColor: folder.color }}
                        />
                        <span className="flex-1">{folder.name}</span>
                      </button>
                    );
                  })
                )}
              </>
            )}
            <div className="border-t border-base-300 mt-1">
              <button
                onClick={() => setContextMenu(null)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-base-200 text-base-content/60"
              >
                Cancel
              </button>
            </div>
          </div>
        );
      })()}
      
      {/* Overlay to close context menu */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setContextMenu(null)}
        />
      )}
    </>
  );
};

export default Sidebar;