// ChatContainer.jsx
import { useEffect, useRef, useState, useCallback } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { FaCheckDouble, FaCheck, FaEdit, FaTrash, FaImage, FaSpinner, FaEllipsisV, FaCopy, FaShare, FaThumbtack, FaMicrophone } from "react-icons/fa";
import ChatHeader from "./ChatHeader";
import MessageInput from "./MessageInput";
import MessageSkeleton from "./skeletons/MessageSkeleton";
import EditMessageModal from "./EditMessageModal";
import DeleteMessageModal from "./DeleteMessageModal";
import { formatMessageTime } from "../lib/utils";
import toast from "react-hot-toast";

const ChatContainer = () => {
  const { 
    messages, 
    getMessages,
    getGroupMessages,
    isMessagesLoading, 
    selectedUser,
    selectedGroup,
    subscribeToGroupMessages,
    unsubscribeFromGroupMessages,
    editMessage,
    deleteMessage,
    updateMessageImage,
    sendEditingStatus,
    sendDeletingStatus,
    sendUploadingPhotoStatus,
    sendGroupEditingStatus,
    sendGroupDeletingStatus,
    sendGroupUploadingPhotoStatus,
    editingUsers,
    deletingUsers,
    uploadingPhotoUsers,
    typingUsers,
    groupTypingUsers,
    groupEditingUsers,
    groupDeletingUsers,
    groupUploadingPhotoUsers,
  } = useChatStore();
  const { authUser, socket } = useAuthStore();
  const messageEndRef = useRef(null);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [deletingMessage, setDeletingMessage] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [updatingImageMessage, setUpdatingImageMessage] = useState(null);
  const [isUpdatingImage, setIsUpdatingImage] = useState(false);
  const imageInputRef = useRef(null);
  const uploadStatusTimeoutRef = useRef(null);
  const filePickerOpenedRef = useRef(false);
  const [openMenuMessageId, setOpenMenuMessageId] = useState(null);
  const menuRefs = useRef({});

  const isGroupChat = !!selectedGroup;
  
  // Cleanup effect to stop upload status when updatingImageMessage is cleared
  useEffect(() => {
    return () => {
      // Clear any pending timeout
      if (uploadStatusTimeoutRef.current) {
        clearTimeout(uploadStatusTimeoutRef.current);
        uploadStatusTimeoutRef.current = null;
      }
      // Stop upload status if component unmounts or updatingImageMessage is cleared
      if (updatingImageMessage && !isGroupChat && selectedUser?._id) {
        sendUploadingPhotoStatus(selectedUser._id, false);
      }
    };
  }, [updatingImageMessage, isGroupChat, selectedUser?._id, sendUploadingPhotoStatus]);

  useEffect(() => {
    if (selectedUser?._id) {
      getMessages(selectedUser._id);
    } else if (selectedGroup?._id) {
      getGroupMessages(selectedGroup._id);
      subscribeToGroupMessages();
    }

    return () => {
      // Don't unsubscribe from messages here - it's handled globally in ChatPage
      unsubscribeFromGroupMessages();
      // Stop any active status indicators when switching chats
      if (isGroupChat && selectedGroup?._id) {
        sendGroupEditingStatus(selectedGroup._id, false);
        sendGroupDeletingStatus(selectedGroup._id, false);
        sendGroupUploadingPhotoStatus(selectedGroup._id, false);
      } else if (!isGroupChat && selectedUser?._id) {
        sendEditingStatus(selectedUser._id, false);
        sendDeletingStatus(selectedUser._id, false);
        sendUploadingPhotoStatus(selectedUser._id, false);
      }
    };
  }, [selectedUser?._id, selectedGroup?._id, getMessages, getGroupMessages, subscribeToGroupMessages, unsubscribeFromGroupMessages, isGroupChat, sendEditingStatus, sendDeletingStatus, sendUploadingPhotoStatus]);

  // Normalize ID helper - memoized to avoid recreating on every render
  const normalizeId = useCallback((id) => {
    if (!id) return null;
    if (typeof id === 'string') return id;
    if (typeof id === 'object' && id._id) return id._id.toString();
    return id.toString();
  }, []);

  // Mark messages as seen when viewing chat (separate effect to handle ID normalization)
  useEffect(() => {
    if (!selectedUser?._id || isGroupChat || !socket) return;

    const selectedUserId = normalizeId(selectedUser._id);
    const authUserId = normalizeId(authUser._id);

    // Mark existing messages as seen (messages sent by the selected user to me)
    messages.forEach(message => {
      const msgSenderId = normalizeId(message.senderId);
      // Only mark as seen if: message is from selected user AND I'm the receiver AND it's not seen yet
      if (!message.seen && msgSenderId === selectedUserId && msgSenderId !== authUserId) {
        socket.emit("messageSeen", {
          messageId: message._id,
          senderId: msgSenderId
        });
      }
    });
  }, [messages, selectedUser, socket, isGroupChat, authUser, normalizeId]);
  
  // Check if user is performing any action
  const selectedUserId = selectedUser?._id ? normalizeId(selectedUser._id) : null;
  const normalizeIdInArray = (arr) => arr.map(id => normalizeId(id));
  const isUserTyping = !isGroupChat && selectedUserId && normalizeIdInArray(typingUsers).includes(selectedUserId);
  const isUserEditing = !isGroupChat && selectedUserId && normalizeIdInArray(editingUsers).includes(selectedUserId);
  const isUserDeleting = !isGroupChat && selectedUserId && normalizeIdInArray(deletingUsers).includes(selectedUserId);
  const isUserUploadingPhoto = !isGroupChat && selectedUserId && normalizeIdInArray(uploadingPhotoUsers).includes(selectedUserId);

  // Handle new messages being marked as seen (direct messages and group messages)
  useEffect(() => {
    if (!socket) return;

    // Direct messages
    if (!isGroupChat && selectedUser) {
    const selectedUserId = normalizeId(selectedUser._id);
    const authUserId = normalizeId(authUser._id);
    
    const handleNewMessage = (newMessage) => {
      const msgSenderId = normalizeId(newMessage.senderId);
      // Only mark as seen if: message is from selected user AND I'm the receiver AND it's not seen yet
      if (msgSenderId === selectedUserId && msgSenderId !== authUserId && !newMessage.seen) {
        socket.emit("messageSeen", {
          messageId: newMessage._id,
          senderId: msgSenderId
        });
      }
    };

    socket.on("newMessage", handleNewMessage);

    return () => {
      socket.off("newMessage", handleNewMessage);
    };
    }
    
    // Group messages - mark as seen when viewing
    if (isGroupChat && selectedGroup && messages.length > 0) {
      const authUserId = normalizeId(authUser._id);
      const groupId = normalizeId(selectedGroup._id);
      
      // Mark unread group messages as seen
      messages.forEach(message => {
        if (message.groupId && normalizeId(message.groupId) === groupId) {
          // Check if already seen by this user
          const seenBy = message.seenBy || [];
          const alreadySeen = seenBy.some(
            s => normalizeId(s.userId) === authUserId
          );
          
          // Only mark as seen if not from self and not already seen
          const msgSenderId = normalizeId(message.senderId);
          if (!alreadySeen && msgSenderId !== authUserId) {
            socket.emit("groupMessageSeen", {
              messageId: message._id,
              groupId: groupId
            });
          }
        }
      });
    }
  }, [selectedUser, selectedGroup, socket, isGroupChat, authUser, messages, normalizeId]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, messages.map((msg) => msg.seen).join(","), typingUsers]);

  const handleTyping = (e) => {
    if (!selectedUser?._id || isGroupChat) return;
    
    if (!isTyping) {
      setIsTyping(true);
      socket.emit("typing", {
        receiverId: selectedUser._id
      });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket.emit("stopTyping", {
        receiverId: selectedUser._id
      });
    }, 2000);
  };

  const handleCopyMessage = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Message copied to clipboard");
    setOpenMenuMessageId(null);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (openMenuMessageId) {
        const menuRef = menuRefs.current[openMenuMessageId];
        if (menuRef && !menuRef.contains(e.target)) {
          setOpenMenuMessageId(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuMessageId]);

  const MessageStatus = ({ message, isOnImage = false }) => {
    const senderId = typeof message.senderId === 'object' ? message.senderId._id : message.senderId;
    const isMyMessage = senderId === authUser._id;
    const [showTooltip, setShowTooltip] = useState(false);
    const { groups, users } = useChatStore();
    const { onlineUsers } = useAuthStore();
    
    // Deduplicate seenBy array - remove duplicate users
    const getUniqueSeenBy = () => {
      if (!message.seenBy || !Array.isArray(message.seenBy)) return [];
      
      const normalizeId = (id) => {
        if (!id) return null;
        if (typeof id === 'string') return id;
        if (typeof id === 'object' && id._id) return id._id.toString();
        return id.toString();
      };
      
      const seenMap = new Map();
      
      message.seenBy.forEach((seen) => {
        const userId = seen.userId;
        const userIdStr = normalizeId(typeof userId === 'object' ? userId._id : userId);
        
        if (userIdStr && !seenMap.has(userIdStr)) {
          seenMap.set(userIdStr, seen);
        } else if (userIdStr && seenMap.has(userIdStr)) {
          // Keep the earliest seenAt time
          const existing = seenMap.get(userIdStr);
          const existingSeenAt = existing.seenAt ? new Date(existing.seenAt).getTime() : 0;
          const currentSeenAt = seen.seenAt ? new Date(seen.seenAt).getTime() : 0;
          
          if (currentSeenAt > 0 && (existingSeenAt === 0 || currentSeenAt < existingSeenAt)) {
            seenMap.set(userIdStr, seen);
          }
        }
      });
      
      return Array.from(seenMap.values());
    };
    
    const uniqueSeenBy = getUniqueSeenBy();
    
    // Get group members for profile pics - exclude admin from members if it's there
    const getGroupMembers = () => {
      if (!message.groupId) return [];
      const group = groups.find(g => g._id === message.groupId);
      if (!group) return [];
      
      const normalizeId = (id) => {
        if (!id) return null;
        if (typeof id === 'string') return id;
        if (typeof id === 'object' && id._id) return id._id.toString();
        return id.toString();
      };
      
      const adminId = normalizeId(group.admin?._id || group.admin);
      const allMembers = [];
      
      // Add admin if exists
      if (group.admin) {
        allMembers.push(group.admin);
      }
      
      // Add members, excluding admin if it's mistakenly in members array
      if (group.members && Array.isArray(group.members)) {
        group.members.forEach((member) => {
          const memberId = normalizeId(member._id || member);
          if (memberId !== adminId) {
            allMembers.push(member);
          }
        });
      }
      
      return allMembers;
    };
    
    // Get user profile pic and name
    const getUserInfo = (userId) => {
      const normalizedId = (id) => {
        if (!id) return null;
        if (typeof id === 'string') return id;
        if (typeof id === 'object' && id._id) return id._id.toString();
        return id.toString();
      };
      
      // If userId is already a populated object with profilePic
      if (typeof userId === 'object' && userId.profilePic) {
        return {
          profilePic: userId.profilePic || "/avatar.png",
          fullname: userId.fullname || "Someone"
        };
      }
      
      const userIdStr = normalizedId(userId);
      if (userIdStr === normalizedId(authUser._id)) {
        return {
          profilePic: authUser.profilePic || "/avatar.png",
          fullname: authUser.fullname || "You"
        };
      }
      
      // Check in group members
      const groupMembers = getGroupMembers();
      const member = groupMembers.find(m => {
        const mId = normalizedId(typeof m === 'object' ? m._id : m);
        return mId === userIdStr;
      });
      if (member && typeof member === 'object') {
        return {
          profilePic: member.profilePic || "/avatar.png",
          fullname: member.fullname || "Someone"
        };
      }
      
      // Check in users
      const user = users.find(u => normalizedId(u._id) === userIdStr);
      if (user) {
        return {
          profilePic: user.profilePic || "/avatar.png",
          fullname: user.fullname || "Someone"
        };
      }
      
      return {
        profilePic: "/avatar.png",
        fullname: "Someone"
      };
    };
    
    // Format seen time for tooltip
    const getSeenTooltip = () => {
      if (!message.seen || !message.seenAt) return null;
      const seenDate = new Date(message.seenAt);
      const now = new Date();
      const diffMs = now - seenDate;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      
      if (diffMins < 1) return "Seen just now";
      if (diffMins < 60) return `Seen ${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
      if (diffHours < 24) return `Seen ${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
      if (diffDays < 7) return `Seen ${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
      return `Seen ${seenDate.toLocaleDateString()} at ${seenDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    };
    
    // Return only seen indicator (no timestamp/edited here - they're inside bubble)
    return (
      <div className="relative flex items-center">
        {isMyMessage && !message.groupId && (
          <span 
            className="relative flex items-center group/status"
            onMouseEnter={() => message.seen && setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            {message.seen ? (
              <FaCheckDouble 
                className="w-4 h-4 text-primary transition-all duration-300"
              />
            ) : (
              <FaCheck 
                className="w-4 h-4 text-base-content/40 transition-all duration-300"
              />
            )}
            {/* Tooltip for seen status */}
            {showTooltip && message.seen && (
              <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-base-100/95 backdrop-blur-xl text-base-content text-xs rounded-xl shadow-2xl whitespace-nowrap z-50 border border-base-300/50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="flex items-center gap-2">
                  <FaCheckDouble className="w-3 h-3 text-primary" />
                  <span className="font-medium">{getSeenTooltip()}</span>
                </div>
                <div className="absolute top-full right-4 w-0 h-0 border-x-4 border-x-transparent border-t-base-100 border-solid"></div>
              </div>
            )}
          </span>
        )}
        {isMyMessage && message.groupId && uniqueSeenBy && uniqueSeenBy.length > 0 && (
          <span 
            className="relative flex items-center group/status"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <div className="flex items-center -space-x-1">
              {uniqueSeenBy.slice(0, 3).map((seen, idx) => {
                const userId = seen.userId; // May be populated object or ID
                const userInfo = getUserInfo(userId);
                
                return (
                  <div
                    key={idx}
                    className="relative transition-transform hover:scale-110"
                    style={{ zIndex: 3 - idx }}
                  >
                    <img
                      src={userInfo.profilePic}
                      alt={userInfo.fullname}
                      className="w-5 h-5 rounded-full object-cover"
                    />
                  </div>
                );
              })}
              {uniqueSeenBy.length > 3 && (
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold bg-base-200 text-base-content">
                  +{uniqueSeenBy.length - 3}
                </div>
              )}
            </div>
            {/* Tooltip for group seen status - contained within chat area */}
            {showTooltip && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-80 max-w-[90vw] px-4 py-3 bg-base-100/95 backdrop-blur-xl text-base-content text-xs rounded-xl shadow-2xl z-50 border border-base-300/50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="font-semibold mb-2 text-sm flex items-center gap-2">
                  <FaCheckDouble className="w-3.5 h-3.5 text-primary" />
                  <span>Seen by ({uniqueSeenBy.length})</span>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto hide-scrollbar">
                  {uniqueSeenBy.map((seen, idx) => {
                    const userId = seen.userId; // May be populated object or ID
                    const userInfo = getUserInfo(userId);
                    const userIdStr = typeof userId === 'object' && userId._id 
                      ? userId._id.toString() 
                      : userId?.toString() || '';
                    const seenDate = new Date(seen.seenAt || Date.now());
                    const diffMins = Math.floor((Date.now() - seenDate.getTime()) / 60000);
                    const normalizeId = (id) => {
                      if (!id) return null;
                      if (typeof id === 'string') return id;
                      if (typeof id === 'object' && id._id) return id._id.toString();
                      return id.toString();
                    };
                    const isOnline = onlineUsers.includes(normalizeId(userId));
                    
                    return (
                      <div key={idx} className="flex items-center gap-3 group/item hover:bg-base-200/50 rounded-lg p-2 -m-2 transition-all duration-200 cursor-default">
                        <div className="relative flex-shrink-0">
                          <img
                            src={userInfo.profilePic}
                            alt={userInfo.fullname}
                            className="w-9 h-9 rounded-full object-cover ring-2 ring-base-300 shadow-sm"
                          />
                          {isOnline && (
                            <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full ring-2 ring-base-100 shadow-sm"></span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm text-base-content truncate">{userInfo.fullname}</div>
                          <div className="text-xs text-base-content/60">
                            {diffMins < 1 ? "just now" : diffMins < 60 ? `${diffMins}m ago` : `${Math.floor(diffMins / 60)}h ago`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="absolute top-full right-4 w-0 h-0 border-x-4 border-x-transparent border-t-base-100 border-solid"></div>
              </div>
            )}
          </span>
        )}
      </div>
    );
  };

  const TypingIndicator = () => {
    if (isGroupChat && selectedGroup) {
      const groupTyping = groupTypingUsers[selectedGroup._id] || [];
      if (groupTyping.length === 0) return null;
      
      const { groups, contacts } = useChatStore.getState();
      const currentGroup = groups.find(g => g._id === selectedGroup._id);
      const allMembers = currentGroup ? [currentGroup.admin, ...currentGroup.members] : [];
      
      // Get user info for typing users
      const typingUsersInfo = groupTyping.map(({ userId, senderName }) => {
        const member = allMembers.find(m => {
          const mId = typeof m === 'string' ? m : (m._id || m);
          const uId = typeof userId === 'string' ? userId : (userId._id || userId);
          return String(mId) === String(uId);
        });
        return {
          userId,
          name: senderName || (typeof member === 'object' && member?.fullname) || "Someone",
          profilePic: typeof member === 'object' && member?.profilePic ? member.profilePic : null
        };
      });
      
      const displayNames = typingUsersInfo.map(u => u.name).join(", ");
      const firstUserPic = typingUsersInfo[0]?.profilePic || selectedGroup?.groupPic || "/avatar.png";
      
      return (
        <div className="flex items-end gap-2 max-w-[85%] sm:max-w-[75%]">
          <div className="flex-shrink-0 opacity-60">
            <div className="size-7 rounded-full overflow-hidden ring-1 ring-base-300">
              <img
                src={firstUserPic}
                alt="typing"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
          <div className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-base-200 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs text-base-content/70 font-medium">{displayNames} {groupTyping.length === 1 ? 'is' : 'are'} typing</span>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-base-content/40 rounded-full animate-bounce" 
                      style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-base-content/40 rounded-full animate-bounce" 
                      style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-base-content/40 rounded-full animate-bounce" 
                      style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        </div>
      );
    }
    
    // Direct message typing indicator
    const displayPic = selectedUser?.profilePic || "/avatar.png";
    
    return (
      <div className="flex items-end gap-2 max-w-[85%] sm:max-w-[75%]">
        <div className="flex-shrink-0 opacity-60">
          <div className="size-7 rounded-full overflow-hidden ring-1 ring-base-300">
            <img
              src={displayPic}
              alt="profile pic"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
        <div className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-base-200 shadow-sm">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 bg-base-content/40 rounded-full animate-bounce" 
                  style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-base-content/40 rounded-full animate-bounce" 
                  style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 bg-base-content/40 rounded-full animate-bounce" 
                  style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    );
  };

  const ActionIndicator = ({ message, icon: Icon, users, actionType }) => {
    if (isGroupChat && selectedGroup && users && users.length > 0) {
      const { groups } = useChatStore.getState();
      const currentGroup = groups.find(g => g._id === selectedGroup._id);
      const allMembers = currentGroup ? [currentGroup.admin, ...currentGroup.members] : [];
      
      // Get user info for action users
      const actionUsersInfo = users.map((userId) => {
        const member = allMembers.find(m => {
          const mId = typeof m === 'string' ? m : (m._id || m);
          const uId = typeof userId === 'string' ? userId : (userId._id || userId);
          return String(mId) === String(uId);
        });
        return {
          userId,
          name: typeof member === 'object' && member?.fullname ? member.fullname : "Someone",
          profilePic: typeof member === 'object' && member?.profilePic ? member.profilePic : null
        };
      });
      
      const displayNames = actionUsersInfo.map(u => u.name).join(", ");
      const firstUserPic = actionUsersInfo[0]?.profilePic || selectedGroup?.groupPic || "/avatar.png";
      
      const actionText = actionType === 'editing' ? 'editing' : actionType === 'deleting' ? 'deleting' : 'uploading photo';
      
      return (
        <div className="flex items-end gap-2 max-w-[85%] sm:max-w-[75%]">
          <div className="flex-shrink-0 opacity-60">
            <div className="size-7 rounded-full overflow-hidden ring-1 ring-base-300">
              <img
                src={firstUserPic}
                alt={actionText}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
          <div className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-base-200 shadow-sm">
            <div className="flex items-center gap-2">
              <Icon className="w-4 h-4 text-base-content/60 animate-pulse" />
              <span className="text-xs text-base-content/60 italic">
                {displayNames} {users.length === 1 ? 'is' : 'are'} {actionText}...
              </span>
            </div>
          </div>
        </div>
      );
    }
    
    // Direct message action indicator
    const displayPic = selectedUser?.profilePic || "/avatar.png";
    
    return (
      <div className="flex items-end gap-2 max-w-[85%] sm:max-w-[75%]">
        <div className="flex-shrink-0 opacity-60">
          <div className="size-7 rounded-full overflow-hidden ring-1 ring-base-300">
            <img
              src={displayPic}
              alt="profile pic"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
        <div className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-base-200 shadow-sm">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-base-content/60 animate-pulse" />
            <span className="text-xs text-base-content/60 italic">{message}</span>
          </div>
        </div>
      </div>
    );
  };

  if (isMessagesLoading) return <MessageSkeleton />;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-base-100 h-full relative">
      <ChatHeader />
      <div className="flex-1 overflow-y-auto hide-scrollbar p-4 sm:p-6 space-y-2 min-h-0 relative">
        {messages.map((message) => {
          const senderId = typeof message.senderId === 'object' ? message.senderId._id : message.senderId;
          const isMyMessage = senderId === authUser._id;
          
          return (
          <div 
            key={message._id} 
            className={`flex flex-col ${isMyMessage ? "items-end" : "items-start"} group mb-1 relative`}
          >
            <div className={`flex items-end gap-2 max-w-[85%] sm:max-w-[75%] ${isMyMessage ? "flex-row-reverse" : ""}`}>
              {/* Message Bubble */}
              {message.image ? (
                /* Image Message - Special styling */
                <div 
                  className={`relative group/message max-w-[280px] sm:max-w-[320px] ${
                    isMyMessage ? "rounded-2xl rounded-br-md" : "rounded-2xl rounded-bl-md"
                  } overflow-hidden shadow-md`}
                >
                  {/* Image */}
                  <div className="relative">
                    <img
                      src={message.image}
                      alt="Attachment"
                      className="w-full h-auto object-cover"
                    />
                    {/* Gradient overlay for better text readability */}
                    <div className={`absolute inset-0 bg-gradient-to-t ${
                      isMyMessage 
                        ? "from-black/60 via-black/20 to-transparent" 
                        : "from-black/50 via-black/10 to-transparent"
                    } pointer-events-none`} />
                    
                    
                    {/* Text overlay on image if exists */}
                    {message.text && (
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <p className={`text-sm leading-relaxed ${
                          isMyMessage ? 'text-white' : 'text-white'
                        } drop-shadow-md`}>
                          {message.text}
                        </p>
                      </div>
                    )}
                    
                    
                    {/* Loading overlay for image update */}
                    {isUpdatingImage && updatingImageMessage?._id === message._id && (
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center rounded-2xl">
                        <div className="flex flex-col items-center gap-2">
                          <FaSpinner className="size-5 text-white animate-spin" />
                          <span className="text-xs text-white font-medium">Updating image...</span>
                        </div>
                      </div>
                    )}
                    
                    {/* Timestamp and edited on image */}
                    {isMyMessage && (
                      <div className={`absolute bottom-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-full backdrop-blur-md ${
                        "bg-black/40"
                      }`}>
                        <span className="text-[10px] font-medium text-white/90">
                          {formatMessageTime(message.createdAt)}
                        </span>
                        {message.edited && (
                          <span className="text-[10px] italic text-white/80">
                            (edited)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : message.audio ? (
                /* Audio Message - Special styling */
                <div 
                  className={`relative group/message max-w-[320px] sm:max-w-[360px] px-4 py-3 rounded-2xl shadow-md ${
                    isMyMessage 
                      ? "bg-primary text-primary-content rounded-br-md" 
                      : "bg-base-200 text-base-content rounded-bl-md"
                  }`}
                >
                  {/* Audio player */}
                  <div className="flex items-center gap-3">
                    <FaMicrophone className={`size-5 flex-shrink-0 ${isMyMessage ? 'text-primary-content/80' : 'text-primary'}`} />
                    <audio
                      src={message.audio}
                      controls
                      className="flex-1 h-8"
                      controlsList="nodownload"
                    />
                  </div>
                  
                  {/* Text with audio if exists */}
                  {message.text && (
                    <p className={`text-sm mt-2 leading-relaxed ${isMyMessage ? 'text-primary-content/90' : 'text-base-content'}`}>
                      {message.text}
                    </p>
                  )}
                  
                  {/* Footer with timestamp and edited */}
                  <div className={`flex items-center justify-end gap-1.5 mt-2 ${
                    isMyMessage
                      ? "text-primary-content/70" 
                      : "text-base-content/60"
                  }`}>
                    <span className="text-[10px] font-medium opacity-70">
                      {formatMessageTime(message.createdAt)}
                    </span>
                    {message.edited && (
                      <span className="text-[10px] italic opacity-60">
                        (edited)
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                /* Text Message - Standard styling */
                <div 
                  className={`relative px-4 py-2.5 rounded-2xl text-sm group/message shadow-sm ${
                    isMyMessage
                      ? "bg-primary text-primary-content rounded-br-md"
                      : "bg-base-200 text-base-content rounded-bl-md"
                  }`}
                >
                  
                  {/* Message text */}
                  {message.text && (
                    <p className={`leading-relaxed ${isMyMessage ? 'text-primary-content' : 'text-base-content'}`}>
                      {message.text}
                    </p>
                  )}
                  
                  {/* Footer with timestamp and edited */}
                  <div className={`flex items-center justify-end gap-1.5 mt-1.5 ${
                    isMyMessage
                      ? "text-primary-content/70" 
                      : "text-base-content/60"
                  }`}>
                    <span className="text-[10px] font-medium opacity-70">
                      {formatMessageTime(message.createdAt)}
                    </span>
                    {message.edited && (
                      <span className="text-[10px] italic opacity-60">
                        (edited)
                      </span>
                    )}
                  </div>
                </div>
              )}
              
              {/* Three dots menu button - outside chat bubble */}
              {isMyMessage && (
                <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <div className="relative" ref={(el) => { if (el) menuRefs.current[message._id] = el; }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuMessageId(openMenuMessageId === message._id ? null : message._id);
                      }}
                      className="p-1.5 rounded-full transition-all bg-base-300/50 hover:bg-base-300/70 text-base-content"
                      title="More options"
                    >
                      <FaEllipsisV className="w-3.5 h-3.5" />
                    </button>
                    
                    {/* Dropdown Menu */}
                    {openMenuMessageId === message._id && (
                      <div className={`absolute ${isMyMessage ? 'right-0' : 'left-0'} top-full mt-1 w-48 bg-base-300 rounded-lg shadow-xl border border-base-200 z-50 overflow-hidden`}>
                        {message.image ? (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setUpdatingImageMessage(message);
                                if (isGroupChat && selectedGroup?._id) {
                                  sendGroupUploadingPhotoStatus(selectedGroup._id, true);
                                } else if (!isGroupChat && selectedUser?._id) {
                                  sendUploadingPhotoStatus(selectedUser._id, true);
                                  // Set a timeout to stop the status if no file is selected within 30 seconds
                                  // This handles the case where user cancels the file picker
                                  if (uploadStatusTimeoutRef.current) {
                                    clearTimeout(uploadStatusTimeoutRef.current);
                                  }
                                  filePickerOpenedRef.current = true;
                                  uploadStatusTimeoutRef.current = setTimeout(() => {
                                    // Stop the status if file picker was opened but no file was selected
                                    if (filePickerOpenedRef.current && !isUpdatingImage) {
                                      sendUploadingPhotoStatus(selectedUser._id, false);
                                      setUpdatingImageMessage(null);
                                      filePickerOpenedRef.current = false;
                                    }
                                  }, 5000); // 5 seconds timeout - if no file selected, stop status
                                }
                                imageInputRef.current?.click();
                                setOpenMenuMessageId(null);
                              }}
                              disabled={isUpdatingImage || isDeleting}
                              className="w-full px-4 py-2.5 text-left text-sm text-base-content hover:bg-base-200 transition-colors flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <FaImage className="w-4 h-4" />
                              <span>Change image</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyMessage(message.text || 'Image');
                                setOpenMenuMessageId(null);
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm text-base-content hover:bg-base-200 transition-colors flex items-center gap-3"
                            >
                              <FaCopy className="w-4 h-4" />
                              <span>Copy</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toast.info("Forward feature coming soon");
                                setOpenMenuMessageId(null);
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm text-base-content hover:bg-base-200 transition-colors flex items-center gap-3"
                            >
                              <FaShare className="w-4 h-4" />
                              <span>Forward</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toast.info("Pin feature coming soon");
                                setOpenMenuMessageId(null);
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm text-base-content hover:bg-base-200 transition-colors flex items-center gap-3"
                            >
                              <FaThumbtack className="w-4 h-4" />
                              <span>Pin</span>
                            </button>
                            <div className="border-t border-base-200 my-1"></div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingMessage(message);
                                if (!isGroupChat && selectedUser?._id) {
                                  sendDeletingStatus(selectedUser._id, true);
                                }
                                setOpenMenuMessageId(null);
                              }}
                              disabled={isDeleting}
                              className="w-full px-4 py-2.5 text-left text-sm text-red-500 hover:bg-red-500/10 transition-colors flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <FaTrash className="w-4 h-4" />
                              <span>Delete</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingMessage(message);
                                if (isGroupChat && selectedGroup?._id) {
                                  sendGroupEditingStatus(selectedGroup._id, true);
                                } else if (!isGroupChat && selectedUser?._id) {
                                  sendEditingStatus(selectedUser._id, true);
                                }
                                setOpenMenuMessageId(null);
                              }}
                              disabled={isDeleting}
                              className="w-full px-4 py-2.5 text-left text-sm text-base-content hover:bg-base-200 transition-colors flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <FaEdit className="w-4 h-4" />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyMessage(message.text);
                                setOpenMenuMessageId(null);
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm text-base-content hover:bg-base-200 transition-colors flex items-center gap-3"
                            >
                              <FaCopy className="w-4 h-4" />
                              <span>Copy</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toast.info("Forward feature coming soon");
                                setOpenMenuMessageId(null);
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm text-base-content hover:bg-base-200 transition-colors flex items-center gap-3"
                            >
                              <FaShare className="w-4 h-4" />
                              <span>Forward</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toast.info("Pin feature coming soon");
                                setOpenMenuMessageId(null);
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm text-base-content hover:bg-base-200 transition-colors flex items-center gap-3"
                            >
                              <FaThumbtack className="w-4 h-4" />
                              <span>Pin</span>
                            </button>
                            <div className="border-t border-base-200 my-1"></div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingMessage(message);
                                setOpenMenuMessageId(null);
                              }}
                              disabled={isDeleting}
                              className="w-full px-4 py-2.5 text-left text-sm text-red-500 hover:bg-red-500/10 transition-colors flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <FaTrash className="w-4 h-4" />
                              <span>Delete</span>
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            {/* Seen indicator - below bubble, only on hover */}
            {isMyMessage && (
              <div className={`opacity-0 group-hover:opacity-100 transition-opacity duration-200 mt-1 ${isMyMessage ? "mr-2" : "ml-2"}`}>
                <MessageStatus message={message} />
              </div>
            )}
          </div>
          );
        })}
        
        {!isGroupChat && (
          <>
            {isUserTyping && (
              <div ref={messageEndRef}>
                <TypingIndicator />
              </div>
            )}
            {isUserEditing && !isUserTyping && (
              <div ref={messageEndRef}>
                <ActionIndicator message="editing message..." icon={FaEdit} />
              </div>
            )}
            {isUserDeleting && !isUserTyping && !isUserEditing && (
              <div ref={messageEndRef}>
                <ActionIndicator message="deleting message..." icon={FaTrash} />
              </div>
            )}
            {isUserUploadingPhoto && !isUserTyping && !isUserEditing && !isUserDeleting && (
              <div ref={messageEndRef}>
                <ActionIndicator message="uploading photo..." icon={FaImage} />
              </div>
            )}
            {!isUserTyping && !isUserEditing && !isUserDeleting && !isUserUploadingPhoto && (
              <div ref={messageEndRef} />
            )}
          </>
        )}
        {isGroupChat && selectedGroup && (
          <>
            {(() => {
              const groupTyping = groupTypingUsers[selectedGroup._id] || [];
              const groupEditing = groupEditingUsers[selectedGroup._id] || [];
              const groupDeleting = groupDeletingUsers[selectedGroup._id] || [];
              const groupUploading = groupUploadingPhotoUsers[selectedGroup._id] || [];
              
              if (groupTyping.length > 0) {
                return (
                  <div ref={messageEndRef}>
                    <TypingIndicator />
                  </div>
                );
              } else if (groupEditing.length > 0) {
                return (
                  <div ref={messageEndRef}>
                    <ActionIndicator message="" icon={FaEdit} users={groupEditing} actionType="editing" />
                  </div>
                );
              } else if (groupDeleting.length > 0) {
                return (
                  <div ref={messageEndRef}>
                    <ActionIndicator message="" icon={FaTrash} users={groupDeleting} actionType="deleting" />
                  </div>
                );
              } else if (groupUploading.length > 0) {
                return (
                  <div ref={messageEndRef}>
                    <ActionIndicator message="" icon={FaImage} users={groupUploading} actionType="uploading" />
                  </div>
                );
              } else {
                return <div ref={messageEndRef} />;
              }
            })()}
          </>
        )}
      </div>
      {/* Message Input - Only visible on mobile (desktop shows in bottom toolbar) */}
      <div className="lg:hidden flex-shrink-0 mt-auto w-full">
        <MessageInput />
      </div>
      
      {/* Edit Message Modal */}
      <EditMessageModal
        isOpen={!!editingMessage}
        onClose={() => {
          setEditingMessage(null);
          if (isGroupChat && selectedGroup?._id) {
            sendGroupEditingStatus(selectedGroup._id, false);
          } else if (!isGroupChat && selectedUser?._id) {
            sendEditingStatus(selectedUser._id, false);
          }
        }}
        message={editingMessage}
        onSave={async (messageId, text) => {
          if (isGroupChat && selectedGroup?._id) {
            sendGroupEditingStatus(selectedGroup._id, false);
          } else if (!isGroupChat && selectedUser?._id) {
            sendEditingStatus(selectedUser._id, false);
          }
          await editMessage(messageId, text);
        }}
      />
      
      {/* Delete Message Modal */}
      <DeleteMessageModal
        isOpen={!!deletingMessage}
        onClose={() => {
          setDeletingMessage(null);
          if (isGroupChat && selectedGroup?._id) {
            sendGroupDeletingStatus(selectedGroup._id, false);
          } else if (!isGroupChat && selectedUser?._id) {
            sendDeletingStatus(selectedUser._id, false);
          }
        }}
        message={deletingMessage}
        onDelete={async (messageId, deleteType) => {
          setIsDeleting(true);
          try {
            await deleteMessage(messageId, deleteType);
            setDeletingMessage(null);
            if (isGroupChat && selectedGroup?._id) {
              sendGroupDeletingStatus(selectedGroup._id, false);
            } else if (!isGroupChat && selectedUser?._id) {
              sendDeletingStatus(selectedUser._id, false);
            }
          } catch (error) {
            console.error("Failed to delete message:", error);
            if (isGroupChat && selectedGroup?._id) {
              sendGroupDeletingStatus(selectedGroup._id, false);
            } else if (!isGroupChat && selectedUser?._id) {
              sendDeletingStatus(selectedUser._id, false);
            }
          } finally {
            setIsDeleting(false);
          }
        }}
        isDeleting={isDeleting}
      />
      
      {/* Hidden input for image update */}
      <input
        type="file"
        ref={imageInputRef}
        className="hidden"
        accept="image/*"
        onFocus={() => {
          filePickerOpenedRef.current = true;
        }}
        onBlur={() => {
          // If file picker closes without selecting a file, stop the status after a short delay
          // This handles the case where user cancels the file picker
          setTimeout(() => {
            if (filePickerOpenedRef.current && !isUpdatingImage && updatingImageMessage) {
              const file = imageInputRef.current?.files?.[0];
              if (!file) {
                // No file was selected, user cancelled
                if (!isGroupChat && selectedUser?._id) {
                  sendUploadingPhotoStatus(selectedUser._id, false);
                }
                setUpdatingImageMessage(null);
                filePickerOpenedRef.current = false;
                if (uploadStatusTimeoutRef.current) {
                  clearTimeout(uploadStatusTimeoutRef.current);
                  uploadStatusTimeoutRef.current = null;
                }
              }
            }
          }, 100); // Small delay to allow onChange to fire if file was selected
        }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          const currentMessage = updatingImageMessage;
          
          // Clear the timeout since we're handling the file selection now
          if (uploadStatusTimeoutRef.current) {
            clearTimeout(uploadStatusTimeoutRef.current);
            uploadStatusTimeoutRef.current = null;
          }
          
          filePickerOpenedRef.current = false; // File was selected
          
          // If no file selected (user cancelled), stop the status
          if (!file || !currentMessage) {
            if (!isGroupChat && selectedUser?._id) {
              sendUploadingPhotoStatus(selectedUser._id, false);
            }
            setUpdatingImageMessage(null);
            e.target.value = ""; // Reset input
            return;
          }
          
          setIsUpdatingImage(true);
          const reader = new FileReader();
          
          reader.onloadend = async () => {
            try {
              await updateMessageImage(currentMessage._id, reader.result);
              if (!isGroupChat && selectedUser?._id) {
                sendUploadingPhotoStatus(selectedUser._id, false);
              }
              setUpdatingImageMessage(null);
            } catch (error) {
              console.error("Failed to update image:", error);
              if (!isGroupChat && selectedUser?._id) {
                sendUploadingPhotoStatus(selectedUser._id, false);
              }
              setUpdatingImageMessage(null);
            } finally {
              setIsUpdatingImage(false);
              e.target.value = ""; // Reset input
            }
          };
          
          reader.onerror = () => {
            console.error("Failed to read image file");
            if (!isGroupChat && selectedUser?._id) {
              sendUploadingPhotoStatus(selectedUser._id, false);
            }
            setUpdatingImageMessage(null);
            setIsUpdatingImage(false);
            e.target.value = ""; // Reset input
          };
          
          reader.readAsDataURL(file);
        }}
      />
    </div>
  );
};

export default ChatContainer;
