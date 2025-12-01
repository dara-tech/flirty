import { useEffect, useState, useRef } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { FaComment, FaSearch, FaImage, FaFileAlt, FaCheck, FaCheckDouble, FaUserPlus, FaTh, FaTrash, FaEdit } from "react-icons/fa";
import CreateGroupModal from "../component/CreateGroupModal";
import DeleteConversationModal from "../component/DeleteConversationModal";
import DeleteGroupModal from "../component/DeleteGroupModal";
import { formatDistanceToNow } from "date-fns";
import SidebarSkeleton from "../component/skeletons/SideBarSkeleton";
import toast from "react-hot-toast";

const ConversationsListPage = () => {
  const { 
    getUsers, 
    users,
    getContacts,
    contacts,
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
    deleteGroup
  } = useChatStore();
  const { onlineUsers, authUser } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [activeTab, setActiveTab] = useState("chats");
  const longPressTimer = useRef(null);
  const longPressGroupTimer = useRef(null);
  const [conversationToDelete, setConversationToDelete] = useState(null);
  const [groupToDelete, setGroupToDelete] = useState(null);

  useEffect(() => {
    // Only load data if user is authenticated
    if (!authUser) return;
    
    // Get contacts and users (users loads lastMessages needed for conversations list)
    getContacts();
    getUsers(); // This loads lastMessages which is needed to show conversations
    getGroups();
    
    // Clear unread counts when viewing chats page
    // This will be handled by individual chat selection, but we can also clear all here
    
    // Cleanup long press timers on unmount
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
      if (longPressGroupTimer.current) {
        clearTimeout(longPressGroupTimer.current);
      }
    };
  }, [authUser, getContacts, getUsers, getGroups]);

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

  // Filter conversations based on search query
  const filteredConversations = sortedConversations.filter((conv) => {
    const matchesSearch = conv.user.fullname.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

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
            <h1 className="text-lg font-semibold text-base-content">Chats</h1>
            {activeTab === "groups" && (
              <button
                onClick={() => setShowCreateGroup(true)}
                className="p-2 hover:bg-base-200/50 rounded-lg transition-colors"
                title="Create Group"
              >
                <FaUserPlus className="size-5 text-base-content/70" />
              </button>
            )}
            {activeTab === "chats" && (
              <div className="w-9"></div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-2 p-1 bg-base-200/50 rounded-lg mb-3">
            <button
              onClick={() => setActiveTab("chats")}
              className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                activeTab === "chats" 
                  ? "bg-primary text-white" 
                  : "text-base-content/60 hover:text-base-content hover:bg-base-200"
              }`}
            >
              Chats
            </button>
            <button
              onClick={() => setActiveTab("groups")}
              className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                activeTab === "groups" 
                  ? "bg-primary text-white" 
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
              placeholder="Search (⌘K)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-base-100 rounded-lg text-sm border-2 border-base-300 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200 placeholder:text-base-content/40"
            />
          </div>
        </div>

        {/* Conversations List - Scrollable */}
        <div className="flex-1 overflow-y-auto hide-scrollbar">
          {activeTab === "chats" ? (
            <>
              {hasLoaded && filteredConversations.length === 0 ? (
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
              ) : filteredConversations.length > 0 ? (
                filteredConversations.map((conv) => {
                  const user = conv.user;
                  const lastMessage = conv.lastMessage;
                  const userId = normalizeId(user._id);
                  const isSelected = normalizeId(selectedUser?._id) === userId;
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
                      className="conversation-item relative w-full"
                    >
                      <button
                        onClick={() => handleUserSelect(user)}
                        className={`w-full px-4 py-3 flex items-center gap-3 transition-all duration-200 ${
                          isSelected 
                            ? 'bg-primary/10 border-l-4 border-primary' 
                            : 'hover:bg-base-200/50 border-l-4 border-transparent'
                        }`}
                      >
                        <div className="relative flex-shrink-0">
                          <img
                            src={user.profilePic || "/avatar.png"}
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
                                {(() => {
                                  const msgSenderId = typeof lastMessage.senderId === 'object' ? lastMessage.senderId._id : lastMessage.senderId;
                                  const isFromUser = msgSenderId === user._id || msgSenderId === userId;
                                  const content = lastMessage.image ? 'Sent an image' :
                                                 lastMessage.file ? 'Sent a file' :
                                                 lastMessage.text;
                                  return isFromUser ? content : `You: ${content}`;
                                })()}
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
            </>
          ) : (
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
                  const isSelected = selectedGroup?._id === group._id;
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
                      className={`w-full px-4 py-3 flex items-center gap-3 transition-all duration-200 ${
                        isSelected 
                          ? 'bg-primary/10 border-l-4 border-primary' 
                          : 'hover:bg-base-200/50 border-l-4 border-transparent'
                      }`}
                    >
                      <div className="relative flex-shrink-0">
                        <img
                          src={group.groupPic || "/avatar.png"}
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
                                    {lastMsg.senderId?.fullname || "Someone"}: {
                                      lastMsg.image 
                                  ? 'Sent an image' 
                                        : lastMsg.text
                              }
                              {' • '}
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
          )}
        </div>

      {/* Create Group Modal */}
      <CreateGroupModal
        isOpen={showCreateGroup}
        onClose={() => {
          setShowCreateGroup(false);
          getGroups();
        }}
      />

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
        group={groupToDelete}
        onDelete={handleConfirmDeleteGroup}
        isDeleting={false}
      />
    </div>
    </>
  );
};

export default ConversationsListPage;

