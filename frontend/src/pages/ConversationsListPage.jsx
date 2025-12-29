import { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { useCallStore } from "../store/useCallStore";
import { useFolderStore } from "../store/useFolderStore";
import { FaComment, FaSearch, FaImage, FaFileAlt, FaCheck, FaCheckDouble, FaUserPlus, FaTh, FaTrash, FaEdit, FaMicrophone, FaBookmark, FaUsers, FaPhone, FaVideo, FaFolder, FaChevronDown, FaChevronRight } from "react-icons/fa";
import CreateGroupModal from "../component/CreateGroupModal";
import FolderManagementModal from "../component/FolderManagementModal";
import DeleteConversationModal from "../component/DeleteConversationModal";
import DeleteGroupModal from "../component/DeleteGroupModal";
import ProfileImage from "../component/ProfileImage";
import { formatDistanceToNow } from "date-fns";
import SidebarSkeleton from "../component/skeletons/SideBarSkeleton";
import toast from "react-hot-toast";
import { getFolderIcon, DEFAULT_FOLDER_ICON } from "../lib/folderIcons";

const ConversationsListPage = () => {
  const { 
    getUsers, 
    users,
    getAllUsers,
    allUsers,
    isAllUsersLoading,
    getContacts,
    contacts,
    groups,
    getGroups,
    selectedUser, 
    selectedGroup,
    selectedSavedMessages,
    setSelectedUser, 
    setSelectedGroup,
    setSelectedSavedMessages,
    isUsersLoading, 
    isGroupsLoading,
    lastMessages, 
    groupLastMessages,
    typingUsers,
    editingUsers,
    deletingUsers,
    uploadingPhotoUsers,
    groupTypingUsers,
    groupEditingUsers,
    groupDeletingUsers,
    groupUploadingPhotoUsers,
    unreadMessages,
    deleteConversation,
    deleteGroup,
    conversationPagination,
    loadMoreConversations,
    isLoadingMoreConversations
  } = useChatStore();
  const { onlineUsers, authUser } = useAuthStore();
  const { initiateCall, callState } = useCallStore();
  const { folders, getFolders, toggleFolderExpansion, addConversationToFolder, removeConversationFromFolder } = useFolderStore();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showFolderManagement, setShowFolderManagement] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  
  // Determine active tab from URL or default to "chats"
  const view = searchParams.get('view') || 'chats';
  const activeTab = view === 'contacts' ? 'contacts' : (view === 'groups' ? 'groups' : 'chats');
  
  const longPressTimer = useRef(null);
  const longPressGroupTimer = useRef(null);
  const [conversationToDelete, setConversationToDelete] = useState(null);
  const [groupToDelete, setGroupToDelete] = useState(null);
  const loadedTabsRef = useRef(new Set()); // Track which tabs have been loaded (use ref to avoid re-renders)

  // Load data only for the active tab (lazy loading)
  useEffect(() => {
    // Only load data if user is authenticated
    if (!authUser) return;
    
    // Load folders when chats tab is active
    if (activeTab === "chats") {
      getFolders();
    }
    
    // Load data based on active tab - only load once per tab
    if (activeTab === "chats" && !loadedTabsRef.current.has("chats")) {
      // Load chats tab data
      getContacts(); // Needed for contacts functionality
      getUsers(); // This loads lastMessages which is needed to show conversations
      loadedTabsRef.current.add("chats");
    } else if (activeTab === "groups" && !loadedTabsRef.current.has("groups")) {
      // Load groups tab data
      getGroups();
      loadedTabsRef.current.add("groups");
    } else if (activeTab === "contacts" && !loadedTabsRef.current.has("contacts")) {
      // Load contacts tab data
      getAllUsers();
      loadedTabsRef.current.add("contacts");
    }
    
    // Cleanup long press timers on unmount
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
      if (longPressGroupTimer.current) {
        clearTimeout(longPressGroupTimer.current);
      }
    };
  }, [activeTab, authUser, getContacts, getUsers, getGroups, getAllUsers, getFolders]);

  // Debounced search for users not in conversations (chats tab only)
  useEffect(() => {
    // Only search when on chats tab and search query is at least 2 characters
    if (activeTab !== "chats") return;
    
    const searchTimer = setTimeout(() => {
      if (searchQuery && searchQuery.length >= 2) {
        getAllUsers(searchQuery);
      }
      // Note: We don't clear allUsers when search is cleared - it's fine to leave them
      // The search results will just be filtered to show nothing when searchQuery is empty
    }, 300); // 300ms debounce

    return () => clearTimeout(searchTimer);
  }, [searchQuery, activeTab, getAllUsers]);

  // Helper function to normalize IDs for consistent comparison
  const normalizeId = (id) => {
    if (!id) return null;
    if (typeof id === 'string') return id;
    if (typeof id === 'object' && id._id) return id._id.toString();
    return id?.toString();
  };

  // Ensure we have valid data structures (before using them)
  const safeLastMessages = lastMessages && typeof lastMessages === 'object' ? lastMessages : {};
  const safeUsers = Array.isArray(users) ? users : [];
  const safeGroups = Array.isArray(groups) ? groups : [];

  // Build conversations list from lastMessages - this is the source of truth
  // Extract user info from messages if not found in users array
  const usersWithMessages = Object.keys(safeLastMessages)
    .map((targetId) => {
      try {
        const targetIdNormalized = normalizeId(targetId);
        const lastMessage = safeLastMessages[targetId];
        
        if (!lastMessage || !targetIdNormalized) return null;
        
        // First, try to find the user from users array
        let user = safeUsers.find(u => {
          if (!u || !u._id) return false;
          const userId = normalizeId(u._id);
          return userId === targetIdNormalized;
        });
        
        // If user not found in users array, extract from the message (populated senderId/receiverId)
        if (!user && lastMessage && authUser && authUser._id) {
          const authUserId = normalizeId(authUser._id);
          const senderIdRaw = lastMessage.senderId;
          const receiverIdRaw = lastMessage.receiverId;
          const senderId = normalizeId(senderIdRaw);
          const receiverId = normalizeId(receiverIdRaw);
          
          // Determine which user is the target (not the auth user)
          let targetUserData = null;
          if (senderId === authUserId && receiverIdRaw && typeof receiverIdRaw === 'object' && receiverIdRaw._id) {
            // I'm the sender, target is receiver
            targetUserData = receiverIdRaw;
          } else if (senderId !== authUserId && senderIdRaw && typeof senderIdRaw === 'object' && senderIdRaw._id) {
            // I'm the receiver, target is sender
            targetUserData = senderIdRaw;
          }
          
          // If we found user data in the message, use it
          if (targetUserData && normalizeId(targetUserData._id) === targetIdNormalized) {
            user = {
              _id: targetUserData._id,
              fullname: targetUserData.fullname || 'Unknown',
              profilePic: targetUserData.profilePic || null,
              email: targetUserData.email || null
            };
          }
        }
        
        if (!user || !user._id || !user.fullname) return null;
        
        return {
          user,
          lastMessage: lastMessage,
          targetId: targetIdNormalized
        };
      } catch (error) {
        console.error('Error processing conversation:', error);
        return null;
      }
    })
    .filter(Boolean); // Remove null entries

  // Sort conversations by most recent message first
  const sortedConversations = [...usersWithMessages].sort((a, b) => {
    if (!a.lastMessage && !b.lastMessage) return 0;
    if (!a.lastMessage) return 1;
    if (!b.lastMessage) return -1;
    
    const aDate = new Date(a.lastMessage.createdAt);
    const bDate = new Date(b.lastMessage.createdAt);
    return bDate - aDate;
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
  
  // Filter conversations based on search query
  const filteredConversations = sortedConversations.filter((conv) => {
    const matchesSearch = conv.user.fullname.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  // Separate filtered conversations into folders and unorganized
  const unorganizedConversations = filteredConversations.filter((conv) => {
    const userId = normalizeId(conv.user._id);
    return !conversationsInFolders.has(userId);
  });

  // Get conversations in a specific folder
  const getConversationsInFolder = (folder) => {
    const folderUserIds = folder.conversations
      .filter((conv) => conv.type === "user")
      .map((conv) => conv.id.toString());
    
    return filteredConversations.filter((conv) => {
      const userId = normalizeId(conv.user._id);
      return folderUserIds.includes(userId);
    });
  };

  // Get the folder that contains a specific user conversation
  const getFolderForUser = (userId) => {
    const normalizedUserId = normalizeId(userId);
    return folders.find((folder) =>
      folder.conversations.some(
        (conv) => conv.type === "user" && normalizeId(conv.id) === normalizedUserId
      )
    );
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
    const userId = normalizeId(user._id);
    try {
      await addConversationToFolder(folderId, "user", userId);
      setContextMenu(null);
      getFolders(); // Refresh folders
    } catch (error) {
      console.error("Failed to move conversation to folder:", error);
    }
  };

  const handleRemoveFromFolder = async (folderId, user) => {
    const userId = normalizeId(user._id);
    try {
      await removeConversationFromFolder(folderId, "user", userId);
      setContextMenu(null);
      getFolders(); // Refresh folders
      toast.success("Removed from folder");
    } catch (error) {
      console.error("Failed to remove conversation from folder:", error);
    }
  };

  // Filter groups based on search query
  const filteredGroups = safeGroups.filter((group) => {
    return group.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleUserSelect = (user) => {
    setSelectedUser(user);
    // ChatPage will show the chat on the right side
  };

  const handleGroupSelect = (group) => {
    setSelectedGroup(group);
    // ChatPage will show the chat on the right side
  };

  const handleLongPressStart = (user) => {
    longPressTimer.current = setTimeout(() => {
      handleDeleteConversation(user);
    }, 1000); // 1 second
  };

  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleDeleteConversation = (user) => {
    setConversationToDelete(user);
  };

  const handleLongPressGroupStart = (group) => {
    longPressGroupTimer.current = setTimeout(() => {
      handleDeleteGroup(group);
    }, 1000); // 1 second
  };

  const handleLongPressGroupEnd = () => {
    if (longPressGroupTimer.current) {
      clearTimeout(longPressGroupTimer.current);
      longPressGroupTimer.current = null;
    }
  };

  const handleDeleteGroup = (group) => {
    // Only allow deletion if user is the admin/owner
    const normalizeId = (id) => {
      if (!id) return null;
      if (typeof id === 'string') return id;
      if (typeof id === 'object' && id._id) return id._id.toString();
      return id.toString();
    };
    
    const authUserId = normalizeId(authUser?._id);
    const groupAdminId = normalizeId(group.admin?._id || group.admin);
    
    if (authUserId === groupAdminId) {
      setGroupToDelete(group);
    }
  };

  const handleConfirmDeleteGroup = async (groupId) => {
    // Close modal instantly for smooth UX
    setGroupToDelete(null);
    
    // Clear selection immediately if deleted group was selected
    const normalizeId = (id) => {
      if (!id) return null;
      if (typeof id === 'string') return id;
      if (typeof id === 'object' && id._id) return id._id.toString();
      return id.toString();
    };
    if (normalizeId(selectedGroup?._id) === normalizeId(groupId)) {
      setSelectedGroup(null);
    }
    
    // Start deletion in background (fire-and-forget for smoother UX)
    deleteGroup(groupId).catch((error) => {
      // Only show error if deletion failed
      toast.error(error.response?.data?.error || "Failed to delete group");
      // Reload groups to restore state on error
      getGroups();
    });
  };

  const handleConfirmDelete = async (userId, deleteType) => {
    // Close modal instantly for smooth UX
    setConversationToDelete(null);
    
    // Clear selection immediately if deleted user was selected
    const normalizeId = (id) => {
      if (!id) return null;
      if (typeof id === 'string') return id;
      if (typeof id === 'object' && id._id) return id._id.toString();
      return id.toString();
    };
    if (normalizeId(selectedUser?._id) === normalizeId(userId)) {
          setSelectedUser(null);
        }
    
    // Start deletion in background (fire-and-forget for smoother UX like Telegram)
    // The optimistic update in deleteConversation will handle immediate UI feedback
    // No need to await - just fire and let it run in background
    deleteConversation(userId, deleteType).catch((error) => {
      // Only show error if deletion failed
      toast.error(error.response?.data?.error || "Failed to delete conversation");
      // Reload conversations to restore state on error
      getUsers();
    });
  };

  // Show loading skeleton while data is being loaded
  if (isUsersLoading || isGroupsLoading) return <SidebarSkeleton type="chats" />;
  
  // Only show empty state if data has finished loading and there are no conversations
  const hasLoaded = !isUsersLoading && !isGroupsLoading;

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
            <h1 className="text-lg font-semibold text-base-content">
              {activeTab === "chats" ? "Chats" : activeTab === "groups" ? "Groups" : "Contacts"}
            </h1>
            {activeTab === "chats" && (
              <button
                onClick={() => setShowFolderManagement(true)}
                className="p-2 hover:bg-base-200/50 rounded-lg transition-colors"
                title="Manage Folders"
              >
                <FaFolder className="size-5 text-base-content/70" />
              </button>
            )}
            {activeTab === "groups" && (
              <button
                onClick={() => setShowCreateGroup(true)}
                className="p-2 hover:bg-base-200/50 rounded-lg transition-colors"
                title="Create Group"
              >
                <FaUserPlus className="size-5 text-base-content/70" />
              </button>
            )}
            {(activeTab === "contacts") && (
              <div className="w-9"></div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-2 p-1 bg-base-200/50 rounded-lg mb-3">
            <button
              onClick={() => navigate('/?view=chats')}
              className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                activeTab === "chats" 
                  ? "bg-primary text-white" 
                  : "text-base-content/60 hover:text-base-content hover:bg-base-200"
              }`}
            >
              Chats
            </button>
            <button
              onClick={() => navigate('/?view=groups')}
              className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                activeTab === "groups" 
                  ? "bg-primary text-white" 
                  : "text-base-content/60 hover:text-base-content hover:bg-base-200"
              }`}
            >
              Groups
            </button>
            <button
              onClick={() => navigate('/?view=contacts')}
              className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                activeTab === "contacts" 
                  ? "bg-primary text-white" 
                  : "text-base-content/60 hover:text-base-content hover:bg-base-200"
              }`}
            >
              Contacts
            </button>
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

        {/* Conversations List - Scrollable */}
        <div className="flex-1 overflow-y-auto hide-scrollbar pb-16 lg:pb-20">
          {activeTab === "chats" ? (
            <>
              {/* Saved Messages - First item in chat list (like Telegram) */}
              {!searchQuery && (
                <button
                  onClick={() => setSelectedSavedMessages(true)}
                  className="w-full px-4 py-3 flex items-center gap-3 transition-all duration-200 hover:bg-base-200/50 border-l-4 border-transparent"
                >
                  <div className="relative flex-shrink-0">
                    <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <FaBookmark className="size-6 text-primary" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="font-semibold text-base-content">Saved Messages</div>
                    <div className="text-sm text-base-content/50">Messages you saved</div>
                  </div>
                </button>
              )}

              {/* Folders */}
              {!searchQuery && folders.map((folder) => {
                const folderConversations = getConversationsInFolder(folder);
                if (folderConversations.length === 0) return null;
                
                return (
                  <div key={folder._id} className="space-y-1">
                    <button
                      onClick={() => toggleFolderExpansion(folder._id)}
                      className="w-full px-4 py-2 flex items-center gap-2 hover:bg-base-200/50 transition-colors"
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
                        {folderConversations.length}
                      </span>
                    </button>
                    {folder.isExpanded && (
                      <div className="ml-6 space-y-1">
                        {folderConversations.map((conv) => {
                          const user = conv.user;
                          const lastMessage = conv.lastMessage;
                          const userId = normalizeId(user._id);
                          const unreadCount = unreadMessages[userId] || unreadMessages[user._id] || 0;
                          const hasUnread = unreadCount > 0;
                          
                          return (
                            <div
                              key={user._id}
                              onContextMenu={(e) => handleContextMenu(e, user)}
                              className="conversation-item relative w-full"
                            >
                              <button
                                onClick={() => handleUserSelect(user)}
                                className="w-full px-4 py-2 flex items-center gap-3 transition-all duration-200 hover:bg-base-200/50 border-l-4 border-transparent"
                              >
                                <div className="relative flex-shrink-0">
                                  <ProfileImage
                                    src={user.profilePic}
                                    alt={user.fullname}
                                    className="size-10 rounded-full object-cover"
                                  />
                                  {onlineUsers.includes(user._id) && (
                                    <span className="absolute bottom-0 right-0 size-2.5 bg-green-500 rounded-full ring-2 ring-base-100" />
                                  )}
                                  {hasUnread && (
                                    <span className="absolute -top-1 -right-1 min-w-[18px] h-4.5 px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-semibold rounded-full">
                                      {unreadCount > 99 ? '99+' : unreadCount}
                                    </span>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0 text-left">
                                  <div className={`text-sm truncate ${hasUnread ? 'font-bold text-base-content' : 'font-semibold text-base-content'}`}>
                                    {user.fullname}
                                  </div>
                                  {lastMessage && (
                                    <div className={`text-xs truncate ${hasUnread ? 'font-semibold text-base-content' : 'text-base-content/50'}`}>
                                      {lastMessage.text || "Media"}
                                    </div>
                                  )}
                                </div>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {hasLoaded && filteredConversations.length === 0 && unorganizedConversations.length === 0 && folders.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="size-16 rounded-full bg-base-200 flex items-center justify-center mx-auto mb-4">
                    <FaComment className="size-8 text-base-content/30" />
                  </div>
                  <p className="text-base-content/60 font-medium">
                    {searchQuery 
                      ? "No conversations found" 
                      : "No conversations yet"}
                  </p>
                  <p className="text-sm text-base-content/40 mt-1">
                    {searchQuery 
                      ? "Try adjusting your search" 
                      : "Start chatting with someone to see conversations here"}
                  </p>
                </div>
              ) : unorganizedConversations.length > 0 ? (
                unorganizedConversations.map((conv) => {
                  const user = conv.user;
                  const lastMessage = conv.lastMessage;
                  const userId = normalizeId(user._id);
                  const unreadCount = unreadMessages[userId] || unreadMessages[user._id] || 0;
                  const hasUnread = unreadCount > 0;
                  
                  // Check real-time status indicators (normalize IDs for comparison)
                  const normalizeIdInArray = (arr) => arr.map(id => normalizeId(id));
                  const isUserTyping = normalizeIdInArray(typingUsers).includes(userId) || typingUsers.includes(user._id);
                  const isUserEditing = normalizeIdInArray(editingUsers).includes(userId) || editingUsers.includes(user._id);
                  const isUserDeleting = normalizeIdInArray(deletingUsers).includes(userId) || deletingUsers.includes(user._id);
                  const isUserUploadingPhoto = normalizeIdInArray(uploadingPhotoUsers).includes(userId) || uploadingPhotoUsers.includes(user._id);
                  
                  return (
                    <div
                      key={user._id}
                      onMouseDown={() => handleLongPressStart(user)}
                      onMouseUp={handleLongPressEnd}
                      onMouseLeave={handleLongPressEnd}
                      onTouchStart={() => handleLongPressStart(user)}
                      onTouchEnd={handleLongPressEnd}
                      onContextMenu={(e) => handleContextMenu(e, user)}
                      className="conversation-item relative w-full"
                    >
                      <button
                        onClick={() => handleUserSelect(user)}
                        className="w-full px-4 py-3 flex items-center gap-3 transition-all duration-200 hover:bg-base-200/50 border-l-4 border-transparent"
                      >
                        <div className="relative flex-shrink-0">
                          <ProfileImage
                            src={user.profilePic}
                            alt={user.fullname}
                            className="size-12 rounded-full object-cover"
                          />
                          {onlineUsers.includes(user._id) && (
                            <span className="absolute bottom-0 right-0 size-3 bg-green-500 rounded-full ring-2 ring-base-100" />
                          )}
                          {hasUnread && (
                            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 flex items-center justify-center bg-red-500 text-white text-xs font-semibold rounded-full">
                              {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <div className={`truncate ${hasUnread ? 'font-bold text-base-content' : 'font-semibold text-base-content'}`}>
                            {user.fullname}
                          </div>
                          <div className={`text-sm truncate flex items-center gap-1.5 ${hasUnread ? 'font-semibold text-base-content' : 'text-base-content/50'}`}>
                            {isUserEditing ? (
                              <span className="flex items-center gap-1.5 text-primary/70">
                                <FaEdit className="w-3 h-3 animate-pulse" />
                                <span>editing message...</span>
                              </span>
                            ) : isUserDeleting ? (
                              <span className="flex items-center gap-1.5 text-primary/70">
                                <FaTrash className="w-3 h-3 animate-pulse" />
                                <span>deleting message...</span>
                              </span>
                            ) : isUserUploadingPhoto ? (
                              <span className="flex items-center gap-1.5 text-primary/70">
                                <FaImage className="w-3 h-3 animate-pulse" />
                                <span>uploading photo...</span>
                              </span>
                            ) : isUserTyping ? (
                              <span className="text-primary/70">typing...</span>
                            ) : lastMessage ? (
                              <>
                                <div className="flex items-center gap-2">
                                {(() => {
                                  const msgSenderId = typeof lastMessage.senderId === 'object' ? lastMessage.senderId._id : lastMessage.senderId;
                                  const isFromUser = msgSenderId === user._id || msgSenderId === userId;
                                    
                                    // Show icon for media types
                                    if (lastMessage.audio) {
                                      return (
                                        <>
                                          <FaMicrophone className="size-3 text-primary/70 flex-shrink-0" />
                                          <span>{isFromUser ? 'Voice message' : 'You: Voice message'}</span>
                                        </>
                                      );
                                    }
                                    if (lastMessage.image) {
                                      return (
                                        <>
                                          <FaImage className="size-3 text-primary/70 flex-shrink-0" />
                                          <span>{isFromUser ? 'Sent an image' : 'You: Sent an image'}</span>
                                        </>
                                      );
                                    }
                                    if (lastMessage.file) {
                                      return (
                                        <>
                                          <FaFileAlt className="size-3 text-primary/70 flex-shrink-0" />
                                          <span>{isFromUser ? 'Sent a file' : 'You: Sent a file'}</span>
                                        </>
                                      );
                                    }
                                    
                                    // Text message
                                    const content = lastMessage.text;
                                    return <span>{isFromUser ? content : `You: ${content}`}</span>;
                                })()}
                                </div>
                                {' • '}
                                {formatDistanceToNow(new Date(lastMessage.createdAt), { addSuffix: true })}
                              </>
                            ) : (
                              onlineUsers.includes(user._id) ? "online" : "offline"
                            )}
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })
              ) : null}

              {/* Search Results - Users not in conversations */}
              {searchQuery && searchQuery.length >= 2 && (
                <>
                  {/* Filter allUsers to exclude users already in conversations */}
                  {(() => {
                    const existingUserIds = new Set(
                      users.map(u => normalizeId(u._id))
                    );
                    const searchResults = (allUsers || []).filter((user) => {
                      const userId = normalizeId(user._id);
                      const authUserId = normalizeId(authUser?._id);
                      // Exclude current user and users already in conversations
                      return userId !== authUserId && !existingUserIds.has(userId);
                    });

                    if (isAllUsersLoading) {
                      return (
                        <div className="px-4 py-3 border-t border-base-300">
                          <div className="flex items-center justify-center gap-2 text-base-content/60">
                            <span className="loading loading-spinner loading-sm"></span>
                            <span className="text-sm">Searching users...</span>
                          </div>
                        </div>
                      );
                    }

                    if (searchResults.length === 0 && !isAllUsersLoading) {
                      return null; // Don't show anything if no results
                    }

                    return (
                      <>
                        {searchResults.length > 0 && (
                          <div className="px-4 py-2 border-t border-base-300">
                            <div className="text-xs font-semibold text-base-content/60 uppercase tracking-wide mb-2">
                              Start New Conversation
                            </div>
                            {searchResults.map((user) => {
                              const userId = normalizeId(user._id);
                              return (
                                <button
                                  key={user._id}
                                  onClick={() => handleUserSelect(user)}
                                  className="w-full px-4 py-3 flex items-center gap-3 transition-all duration-200 hover:bg-base-200/50 border-l-4 border-transparent rounded-lg mb-1"
                                >
                                  <div className="relative flex-shrink-0">
                                    <ProfileImage
                                      src={user.profilePic}
                                      alt={user.fullname}
                                      className="size-10 rounded-full object-cover"
                                    />
                                    {onlineUsers.includes(user._id) && (
                                      <span className="absolute bottom-0 right-0 size-2.5 bg-green-500 rounded-full ring-2 ring-base-100" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0 text-left">
                                    <div className="text-sm font-semibold text-base-content truncate">
                                      {user.fullname}
                                    </div>
                                    {user.email && (
                                      <div className="text-xs text-base-content/50 truncate">
                                        {user.email}
                                      </div>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </>
              )}
              
              {/* Load More Conversations Button (Telegram-style pagination) */}
              {!searchQuery && conversationPagination?.hasMore && (
                <div className="px-4 py-3 border-t border-base-300">
                  <button
                    onClick={loadMoreConversations}
                    disabled={isLoadingMoreConversations}
                    className="w-full px-4 py-2 bg-base-200 hover:bg-base-300 text-base-content rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isLoadingMoreConversations ? (
                      <>
                        <span className="loading loading-spinner loading-sm"></span>
                        <span>Loading page {conversationPagination.page + 1}...</span>
                      </>
                    ) : (
                      <>
                        <span>Load More Conversations</span>
                        <span className="text-xs text-base-content/60">
                          (Page {conversationPagination.page + 1} of {conversationPagination.totalPages} • {conversationPagination.total - filteredConversations.length} more)
                        </span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          ) : activeTab === "groups" ? (
            <>
              {filteredGroups.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="size-16 rounded-full bg-base-200 flex items-center justify-center mx-auto mb-4">
                    <FaUserPlus className="size-8 text-base-content/30" />
                  </div>
                  <p className="text-base-content/60 font-medium">No groups found</p>
                  <p className="text-sm text-base-content/40 mt-1">
                    Create a group to start group chatting
                  </p>
                </div>
              ) : (
                filteredGroups.map((group) => {
                  const authUserId = normalizeId(authUser?._id);
                  const groupAdminId = normalizeId(group.admin?._id || group.admin);
                  const isOwner = authUserId === groupAdminId;
                  
                  return (
                    <div
                      key={group._id}
                      onMouseDown={() => isOwner && handleLongPressGroupStart(group)}
                      onMouseUp={handleLongPressGroupEnd}
                      onMouseLeave={handleLongPressGroupEnd}
                      onTouchStart={() => isOwner && handleLongPressGroupStart(group)}
                      onTouchEnd={handleLongPressGroupEnd}
                      className="conversation-item relative w-full"
                    >
                      <button
                      onClick={() => handleGroupSelect(group)}
                      className="w-full px-4 py-3 flex items-center gap-3 transition-all duration-200 hover:bg-base-200/50 border-l-4 border-transparent"
                    >
                      <div className="relative flex-shrink-0">
                        <ProfileImage
                          src={group.groupPic}
                          alt={group.name}
                          className="size-12 rounded-full object-cover"
                        />
                        {(() => {
                          const groupId = normalizeId(group._id);
                          const unreadCount = unreadMessages[groupId] || unreadMessages[group._id] || 0;
                          const hasUnread = unreadCount > 0;
                          
                          return hasUnread ? (
                            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 flex items-center justify-center bg-red-500 text-white text-xs font-semibold rounded-full">
                              {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                          ) : null;
                        })()}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="font-semibold text-base-content truncate">{group.name}</div>
                        <div className="text-sm text-base-content/50 truncate">
                          {(() => {
                            const groupId = normalizeId(group._id);
                            const groupTyping = groupTypingUsers[groupId] || [];
                            const groupEditing = groupEditingUsers[groupId] || [];
                            const groupDeleting = groupDeletingUsers[groupId] || [];
                            const groupUploading = groupUploadingPhotoUsers[groupId] || [];
                            
                            // Get user names for status indicators
                            const getStatusUserNames = (userIds, allMembers) => {
                              const names = userIds.map(userId => {
                                const member = allMembers.find(m => {
                                  const mId = normalizeId(typeof m === 'object' && m._id ? m._id : m);
                                  const uId = normalizeId(userId);
                                  return mId === uId;
                                });
                                return typeof member === 'object' && member?.fullname ? member.fullname : "Someone";
                              });
                              
                              if (names.length === 0) return "";
                              if (names.length === 1) return names[0];
                              if (names.length === 2) return `${names[0]} and ${names[1]}`;
                              return `${names[0]} and ${names.length - 1} others`;
                            };
                            
                            const allMembers = group.admin && group.members ? [group.admin, ...group.members] : (group.members || []);
                            
                            if (groupEditing.length > 0) {
                              const names = getStatusUserNames(groupEditing, allMembers);
                              return (
                                <span className="flex items-center gap-1.5 text-primary/70">
                                  <FaEdit className="w-3 h-3 animate-pulse" />
                                  <span>{names} {groupEditing.length === 1 ? 'is' : 'are'} editing...</span>
                                </span>
                              );
                            } else if (groupDeleting.length > 0) {
                              const names = getStatusUserNames(groupDeleting, allMembers);
                              return (
                                <span className="flex items-center gap-1.5 text-primary/70">
                                  <FaTrash className="w-3 h-3 animate-pulse" />
                                  <span>{names} {groupDeleting.length === 1 ? 'is' : 'are'} deleting...</span>
                                </span>
                              );
                            } else if (groupUploading.length > 0) {
                              const names = getStatusUserNames(groupUploading, allMembers);
                              return (
                                <span className="flex items-center gap-1.5 text-primary/70">
                                  <FaImage className="w-3 h-3 animate-pulse" />
                                  <span>{names} {groupUploading.length === 1 ? 'is' : 'are'} uploading photo...</span>
                                </span>
                              );
                            } else if (groupTyping.length > 0) {
                              const names = groupTyping.map(t => t.senderName || "Someone").slice(0, 2);
                              const displayNames = names.length === 1 ? names[0] : 
                                                   names.length === 2 ? `${names[0]} and ${names[1]}` : 
                                                   `${names[0]} and ${groupTyping.length - 1} others`;
                              return (
                                <span className="text-primary/70">
                                  {displayNames} {groupTyping.length === 1 ? 'is' : 'are'} typing...
                                </span>
                              );
                            } else {
                              const lastMsg = groupLastMessages[groupId] || groupLastMessages[group._id];
                              if (lastMsg) {
                                return (
                                  <>
                                    <div className="flex items-center gap-2">
                                      {lastMsg.senderId?.fullname || "Someone"}:{' '}
                                      {lastMsg.audio ? (
                                        <>
                                          <FaMicrophone className="size-3 text-primary/70 flex-shrink-0" />
                                          <span>Voice message</span>
                                        </>
                                      ) : lastMsg.image ? (
                                        <>
                                          <FaImage className="size-3 text-primary/70 flex-shrink-0" />
                                          <span>Sent an image</span>
                                        </>
                                      ) : lastMsg.file ? (
                                        <>
                                          <FaFileAlt className="size-3 text-primary/70 flex-shrink-0" />
                                          <span>{lastMsg.fileName || "File"}</span>
                                        </>
                                      ) : (
                                        <span>{lastMsg.text || "Message"}</span>
                                      )}
                                    </div>
                                    <span>{' • '}</span>
                                    {formatDistanceToNow(new Date(lastMsg.createdAt), { addSuffix: true })}
                                  </>
                                );
                              } else {
                                return `${group.members?.length || 0} members`;
                              }
                            }
                          })()}
                        </div>
                      </div>
                    </button>
                  </div>
                  );
                })
              )}
            </>
          ) : activeTab === "contacts" ? (
            <>
              {/* Contacts List */}
              {(() => {
                const safeAllUsers = Array.isArray(allUsers) ? allUsers : [];
                const filteredContacts = safeAllUsers.filter((user) => {
                  // Exclude current user
                  if (user._id === authUser?._id) return false;
                  
                  const matchesSearch = user.fullname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                       user.email?.toLowerCase().includes(searchQuery.toLowerCase());
                  return matchesSearch;
                });

                const getStatusText = (user) => {
                  if (onlineUsers.includes(user._id)) {
                    return "online";
                  }
                  return "last seen just now";
                };

                const handleContactSelect = (user) => {
                  setSelectedUser(user);
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
                  return (
                    <div className="text-center py-12 px-4">
                      <div className="loading loading-spinner loading-lg text-primary"></div>
                      <p className="text-sm text-base-content/60 mt-4">Loading contacts...</p>
                    </div>
                  );
                }

                if (filteredContacts.length === 0) {
                  return (
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
                  );
                }

                return filteredContacts.map((user) => {
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
                });
              })()}
            </>
          ) : null}
        </div>
      </div>

      {/* Create Group Modal */}
      <CreateGroupModal
        isOpen={showCreateGroup}
        onClose={() => {
          setShowCreateGroup(false);
          getGroups();
        }}
      />

      {/* Folder Management Modal */}
      <FolderManagementModal
        isOpen={showFolderManagement}
        onClose={() => {
          setShowFolderManagement(false);
          getFolders(); // Refresh folders list
        }}
      />

      {/* Context Menu for Moving Conversations */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-base-100 rounded-lg shadow-xl border border-base-300 py-2 min-w-[200px]"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 text-xs font-semibold text-base-content/60 border-b border-base-300">
            Move to Folder
          </div>
          {folders.length === 0 ? (
            <div className="px-3 py-2 text-sm text-base-content/60">
              No folders. Create one first!
            </div>
          ) : (() => {
            // Get the folder that already contains this conversation (if any)
            const currentFolder = contextMenu?.user 
              ? getFolderForUser(contextMenu.user._id)
              : null;
            
            // Filter out folders that already contain this conversation
            const availableFolders = folders.filter(
              (folder) => folder._id !== currentFolder?._id
            );
            
            return (
              <>
                {availableFolders.map((folder) => (
                  <button
                    key={folder._id}
                    onClick={() => handleMoveToFolder(folder._id, contextMenu.user)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-base-200 flex items-center gap-2"
                  >
                    {(() => {
                      const FolderIconComponent = getFolderIcon(folder.icon || DEFAULT_FOLDER_ICON);
                      return <FolderIconComponent className="size-4" style={{ color: folder.color }} />;
                    })()}
                    <div
                      className="w-1 h-4 rounded-full"
                      style={{ backgroundColor: folder.color }}
                    />
                    <span className="flex-1">{folder.name}</span>
                  </button>
                ))}
              </>
            );
          })()}
          {(() => {
            // Get the folder that already contains this conversation (if any)
            const currentFolder = contextMenu?.user 
              ? getFolderForUser(contextMenu.user._id)
              : null;
            
            // Show "Remove from Folder" option if conversation is in a folder
            if (currentFolder) {
              return (
                <div className="border-t border-base-300 mt-1">
                  <button
                    onClick={() => handleRemoveFromFolder(currentFolder._id, contextMenu.user)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-base-200 text-red-500/80 flex items-center gap-2"
                  >
                    <FaTrash className="size-3" />
                    Remove from "{currentFolder.name}"
                  </button>
                </div>
              );
            }
            return null;
          })()}
          <div className="border-t border-base-300 mt-1">
            <button
              onClick={() => setContextMenu(null)}
              className="w-full px-3 py-2 text-left text-sm hover:bg-base-200 text-base-content/60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      
      {/* Overlay to close context menu */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setContextMenu(null)}
        />
      )}

      {/* Delete Conversation Modal */}
      <DeleteConversationModal
        isOpen={!!conversationToDelete}
        onClose={() => setConversationToDelete(null)}
        user={conversationToDelete}
        onDelete={handleConfirmDelete}
        isDeleting={false}
      />

      {/* Delete Group Modal */}
      <DeleteGroupModal
        isOpen={!!groupToDelete}
        onClose={() => setGroupToDelete(null)}
        onConfirm={handleConfirmDeleteGroup}
      />
    </>
  );
};

export default ConversationsListPage;

