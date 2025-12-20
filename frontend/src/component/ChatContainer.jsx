// ChatContainer.jsx
import { useEffect, useRef, useState, useCallback } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { FaEdit, FaTrash, FaImage, FaSpinner, FaEllipsisV, FaCopy, FaShare, FaThumbtack, FaMicrophone, FaFile, FaLink, FaDownload, FaTimes, FaSave, FaTimesCircle, FaSmile, FaVideo } from "react-icons/fa";
import ChatHeader from "./ChatHeader";
import MessageInput from "./MessageInput";
import MessageSkeleton from "./skeletons/MessageSkeleton";
import EditMessageModal from "./EditMessageModal";
import DeleteMessageModal from "./DeleteMessageModal";
import ForwardMessageModal from "./ForwardMessageModal";
import ForwardMultipleMessagesModal from "./ForwardMultipleMessagesModal";
import ProfileImage from "./ProfileImage";
import AudioPlayer from "./AudioPlayer";
import { formatMessageTime, normalizeId } from "../lib/utils";
import toast from "react-hot-toast";

// Helper function to enhance Cloudinary image URLs with quality parameters
const getHighQualityImageUrl = (url, isThumbnail = false) => {
  if (!url || typeof url !== 'string') return url;
  // Check if it's a Cloudinary URL
  if (!url.includes('cloudinary.com') || !url.includes('/upload/')) {
    return url;
  }
  
  // Use best quality for both thumbnails and full view
  // Limit width for thumbnails to improve performance
  const quality = 'q_auto:best';
  const format = 'f_auto';
  const width = isThumbnail ? 'w_800,c_limit' : 'w_1920,c_limit';
  const transformations = `${quality},${format},${width}`;
  
  // Split URL at /upload/
  const parts = url.split('/upload/');
  if (parts.length !== 2) return url;
  
  const beforeUpload = parts[0] + '/upload/';
  const afterUpload = parts[1];
  
  // Check if transformations already exist
  // Cloudinary URLs can be:
  // 1. /upload/v1234567890/folder/image.jpg (version only)
  // 2. /upload/q_auto/folder/image.jpg (transformations)
  // 3. /upload/folder/image.jpg (no transformations)
  
  // If it starts with version number, insert transformations before version
  if (afterUpload.match(/^v\d+\//)) {
    return `${beforeUpload}${transformations}/${afterUpload}`;
  }
  
  // Check if there are existing transformations (before first slash)
  const firstSlash = afterUpload.indexOf('/');
  if (firstSlash > 0) {
    const existingTransformations = afterUpload.substring(0, firstSlash);
    const rest = afterUpload.substring(firstSlash);
    
    // If it already has quality transformations, replace them
    if (existingTransformations.includes('q_')) {
      // Remove old quality and width, add new ones
      const cleaned = existingTransformations
        .replace(/q_[^\/,]*/g, '')
        .replace(/w_\d+[^\/,]*/g, '')
        .replace(/f_[^\/,]*/g, '')
        .replace(/c_[^\/,]*/g, '')
        .replace(/,,+/g, ',')
        .replace(/^,|,$/g, '');
      
      const newTransformations = cleaned 
        ? `${cleaned},${transformations}` 
        : transformations;
      
      return `${beforeUpload}${newTransformations}${rest}`;
    } else {
      // Add transformations to existing ones
      return `${beforeUpload}${existingTransformations},${transformations}${rest}`;
    }
  }
  
  // No transformations, add them before the path
  return `${beforeUpload}${transformations}/${afterUpload}`;
};

const ChatContainer = () => {
  const { 
    messages, 
    getMessages,
    getGroupMessages,
    loadMoreMessages,
    loadMoreGroupMessages,
    isMessagesLoading,
    isLoadingMoreMessages,
    hasMoreMessages,
    selectedUser,
    selectedGroup,
    selectedSavedMessages,
    getSavedMessages,
    subscribeToGroupMessages,
    unsubscribeFromGroupMessages,
    editMessage,
    deleteMessage,
    deleteMessageMedia,
    markVoiceAsListened,
    saveMessage,
    unsaveMessage,
    pinMessage,
    unpinMessage,
    addReaction,
    removeReaction,
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
    isCurrentUserUploading,
    uploadProgress,
    uploadType,
    uploadingImagePreview,
    typingUsers,
    groupTypingUsers,
    groupEditingUsers,
    groupDeletingUsers,
    groupUploadingPhotoUsers,
  } = useChatStore();
  const { authUser, socket } = useAuthStore();
  const messageEndRef = useRef(null);
  const messageTopRef = useRef(null); // For detecting scroll to top
  const messagesContainerRef = useRef(null); // Container ref for scroll detection
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
  const [pinningMessage, setPinningMessage] = useState(null);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [forwardingMessages, setForwardingMessages] = useState(null); // For multiple messages
  const [selectedMessages, setSelectedMessages] = useState([]); // For message selection mode
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [viewingMedia, setViewingMedia] = useState(null); // { type: 'image' | 'file', url: string, fileName?: string }
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState(null);
  const menuRefs = useRef({});
  const reactionPickerRefs = useRef({});
  const prevChatRef = useRef(null);

  const isGroupChat = !!selectedGroup;
  const isSavedMessages = !!selectedSavedMessages;
  
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
    const currentChatId = selectedUser?._id || selectedGroup?._id || (selectedSavedMessages ? 'saved' : null);
    const prevChatId = prevChatRef.current;
    
    // Only clear messages if switching to a different chat (to avoid showing wrong messages)
    if (currentChatId && prevChatId && currentChatId !== prevChatId) {
      // Clear messages when switching chats - new messages will load immediately
      useChatStore.setState({ messages: [] });
    }
    
    // Load messages in background without blocking UI (like Telegram)
    if (selectedSavedMessages) {
      // Load saved messages
      getSavedMessages(1, 50).then((data) => {
        // Backend returns { messages, pagination: {...} }
        const savedMessages = data?.messages || data?.data?.messages || [];
        // Messages are already sorted newest first, reverse for display (oldest to newest)
        useChatStore.setState({ messages: savedMessages.reverse() });
      }).catch((error) => {
        console.error("Failed to load saved messages:", error);
      });
      prevChatRef.current = 'saved';
    } else if (selectedUser?._id) {
      getMessages(selectedUser._id);
      prevChatRef.current = selectedUser._id;
    } else if (selectedGroup?._id) {
      getGroupMessages(selectedGroup._id);
      subscribeToGroupMessages();
      prevChatRef.current = selectedGroup._id;
    } else {
      // Clear messages when no chat is selected
      prevChatRef.current = null;
      useChatStore.setState({ messages: [] });
    }

    return () => {
      // Don't unsubscribe from messages here - it's handled globally in ChatPage
      unsubscribeFromGroupMessages();
      // Stop any active status indicators when switching chats
      if (isGroupChat && selectedGroup?._id) {
        sendGroupEditingStatus(selectedGroup._id, false);
        sendGroupDeletingStatus(selectedGroup._id, false);
        sendGroupUploadingPhotoStatus(selectedGroup._id, false);
      } else if (!isGroupChat && !isSavedMessages && selectedUser?._id) {
        sendEditingStatus(selectedUser._id, false);
        sendDeletingStatus(selectedUser._id, false);
        sendUploadingPhotoStatus(selectedUser._id, false);
      }
    };
  }, [selectedUser?._id, selectedGroup?._id, selectedSavedMessages, getMessages, getGroupMessages, getSavedMessages, subscribeToGroupMessages, unsubscribeFromGroupMessages, isGroupChat, isSavedMessages, sendEditingStatus, sendDeletingStatus, sendUploadingPhotoStatus]);

  // Close reaction picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (reactionPickerMessageId) {
        const pickerElement = reactionPickerRefs.current[reactionPickerMessageId];
        if (pickerElement && !pickerElement.contains(event.target)) {
          setReactionPickerMessageId(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [reactionPickerMessageId]);

  // Normalize ID helper - using centralized utility function

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

  // Scroll to bottom (newest messages) when messages load initially
  useEffect(() => {
    if (messages.length > 0 && !isLoadingMoreMessages && !isMessagesLoading) {
      const container = messagesContainerRef.current;
      if (container) {
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
          container.scrollTo({ top: container.scrollHeight, behavior: 'auto' }); // Scroll to bottom
        });
      }
    }
  }, [selectedUser?._id, selectedGroup?._id, isMessagesLoading]); // Only on chat change

  // Scroll to bottom when new message arrives (if user is near bottom)
  useEffect(() => {
    if (messages.length > 0 && !isLoadingMoreMessages) {
      const container = messagesContainerRef.current;
      if (container) {
        // Check if user is near the bottom (where new messages appear)
        const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        const isNearBottom = scrollBottom < 150;
        
        if (isNearBottom) {
          // Scroll to bottom for new messages
          requestAnimationFrame(() => {
            container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
          });
        }
      }
    }
  }, [messages.length, isLoadingMoreMessages]);

  // Infinite scroll: Load more messages when scrolling to top (with debouncing and scroll preservation)
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || !hasMoreMessages) return;

    let scrollTimeout;
    let isRequestPending = false;

    // Function to preserve and restore scroll position
    const preserveScrollPosition = () => {
      if (!container) return null;
      // Preserve the scroll position relative to the content
      // When loading older messages at top, we need to maintain the user's scroll position
      const scrollHeight = container.scrollHeight;
      const scrollTop = container.scrollTop;
      return { scrollHeight, scrollTop };
    };

    const restoreScrollPosition = (previousState) => {
      if (!container || !previousState) return;
      requestAnimationFrame(() => {
        const newScrollHeight = container.scrollHeight;
        const heightDifference = newScrollHeight - previousState.scrollHeight;
        // Adjust scroll position to maintain visual position
        container.scrollTop = previousState.scrollTop + heightDifference;
      });
    };

    const handleScroll = () => {
      // Debounce scroll handler
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        if (isRequestPending || isLoadingMoreMessages) return;
        
        // Load more when scrolling to top (within 300px from top) - this is where older messages are
        const scrollTop = container.scrollTop;
        
        // Load more when near top (within 300px) - this is where older messages are
        if (scrollTop < 300 && messages.length > 0) {
          const oldestMessage = messages[0]; // First message in array (oldest)
          if (oldestMessage?._id) {
            isRequestPending = true;
            const previousState = preserveScrollPosition();
            
            const onScrollPreserve = (prevState) => {
              if (prevState) {
                restoreScrollPosition(prevState);
              } else {
                return previousState;
              }
            };
            
            if (isGroupChat && selectedGroup?._id) {
              loadMoreGroupMessages(selectedGroup._id, oldestMessage._id, onScrollPreserve)
                .finally(() => {
                  isRequestPending = false;
                });
            } else if (!isGroupChat && selectedUser?._id) {
              loadMoreMessages(selectedUser._id, oldestMessage._id, onScrollPreserve)
                .finally(() => {
                  isRequestPending = false;
                });
            }
          }
        }
      }, 150); // Debounce 150ms
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      clearTimeout(scrollTimeout);
      container.removeEventListener('scroll', handleScroll);
    };
  }, [hasMoreMessages, isLoadingMoreMessages, messages, isGroupChat, selectedUser?._id, selectedGroup?._id, loadMoreMessages, loadMoreGroupMessages]);

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

  const handleCopyMessage = async (message) => {
    try {
      let textToCopy = '';
      
      // Handle different message types
      if (message.text && message.text.trim()) {
        textToCopy = message.text;
      } else if (message.image) {
        textToCopy = 'Image';
      } else if (message.audio) {
        textToCopy = 'Voice message';
      } else if (message.video) {
        textToCopy = 'Video';
      } else if (message.file) {
        textToCopy = message.fileName || 'File';
      } else if (message.link) {
        textToCopy = message.link;
      } else {
        textToCopy = '';
      }
      
      if (!textToCopy) {
        toast.error("Nothing to copy");
        return;
      }
      
      // Use modern clipboard API with fallback
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textToCopy);
        toast.success("Message copied to clipboard");
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = textToCopy;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        toast.success("Message copied to clipboard");
      }
      
      setOpenMenuMessageId(null);
    } catch (error) {
      console.error('Failed to copy message:', error);
      toast.error("Failed to copy message");
    }
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

  // Enhanced checkmark icons with animations
  const CheckIcon = ({ className, isSeen = false }) => {
    if (isSeen) {
      // Double check (seen) - Enhanced with animation
      return (
        <svg 
          viewBox="0 0 20 12" 
          className={`${className} transition-all duration-300 ${isSeen ? 'animate-pulse-once' : ''}`}
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
        >
          <path 
            d="M1 6L4.5 9.5L11 3" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            className="drop-shadow-sm"
          />
          <path 
            d="M6 6L9.5 9.5L16 3" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            className="drop-shadow-sm"
          />
        </svg>
      );
    } else {
      // Single check (sent) - Enhanced
      return (
        <svg 
          viewBox="0 0 20 12" 
          className={className}
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
        >
          <path 
            d="M1 6L4.5 9.5L15 1" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            className="opacity-70"
          />
        </svg>
      );
    }
  };

  const MessageStatus = ({ message, isOnImage = false, isInline = false }) => {
    const senderId = typeof message.senderId === 'object' ? message.senderId._id : message.senderId;
    const isMyMessage = senderId === authUser._id;
    const [showTooltip, setShowTooltip] = useState(false);
    const { groups, users, selectedUser } = useChatStore();
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
    
    // Return seen indicator - inline or standalone
    if (isInline) {
      // Inline version (inside bubble)
      return (
        <span 
          className="relative inline-flex items-center group/status"
          onMouseEnter={() => message.seen && setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          {/* Direct messages: show checkmark inside bubble only when NOT seen */}
          {isMyMessage && !message.groupId && !message.seen && (
            <div className="relative inline-flex items-center justify-center transition-all duration-300 opacity-70">
              <CheckIcon 
                isSeen={false}
                className={`${isOnImage 
                  ? 'w-3 h-3 text-white drop-shadow-lg' 
                  : 'w-3 h-3 text-primary-content drop-shadow-sm'
                }`}
              />
            </div>
          )}
          
          {/* Group messages: show avatars */}
          {isMyMessage && message.groupId && uniqueSeenBy && uniqueSeenBy.length > 0 && (
            <div 
              className="relative flex items-center -space-x-1.5 group/seen"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
            >
              {uniqueSeenBy.slice(0, 2).map((seen, idx) => {
                const userId = seen.userId;
                const userInfo = getUserInfo(userId);
                return (
                  <div
                    key={idx}
                    className="relative transition-all duration-200 hover:scale-125 hover:z-10"
                    style={{ zIndex: 2 - idx }}
                  >
                    <ProfileImage
                      src={userInfo.profilePic}
                      alt={userInfo.fullname}
                      className={`rounded-full object-cover shadow-md ${isOnImage 
                        ? 'w-5 h-5 ring-2 ring-white/50 shadow-lg' 
                        : 'w-5 h-5 ring-2 ring-primary-content/30 shadow-md'
                      }`}
                    />
                    {idx === 0 && (
                      <div className={`absolute -bottom-0.5 -right-0.5 rounded-full ${isOnImage 
                        ? 'bg-green-500 ring-2 ring-white' 
                        : 'bg-green-500 ring-2 ring-primary-content'
                      } w-2 h-2`}></div>
                    )}
                  </div>
                );
              })}
              {uniqueSeenBy.length > 2 && (
                <div className={`rounded-full flex items-center justify-center text-[9px] font-bold shadow-md transition-all hover:scale-110 ${isOnImage 
                  ? 'w-5 h-5 bg-white/30 text-white ring-2 ring-white/50 backdrop-blur-sm' 
                  : 'w-5 h-5 bg-primary-content/25 text-primary-content ring-2 ring-primary-content/30 backdrop-blur-sm'
                }`}>
                  +{uniqueSeenBy.length - 2}
                </div>
              )}
              {/* Enhanced Tooltip for group seen status */}
              {showTooltip && (
                <div className={`absolute ${isOnImage ? 'bottom-full right-0 mb-3' : 'bottom-full right-0 mb-3'} w-64 bg-gradient-to-br from-base-100 to-base-200/95 backdrop-blur-xl rounded-2xl shadow-2xl z-50 border border-base-300/50 animate-in fade-in slide-in-from-bottom-2 duration-200 overflow-hidden`}>
                  <div className="px-4 py-3 border-b border-base-300/30">
                    <div className="flex items-center gap-2">
                      <CheckIcon isSeen={true} className="w-4 h-4 text-primary" />
                      <span className="font-semibold text-sm">Seen by ({uniqueSeenBy.length})</span>
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {uniqueSeenBy.map((seen, idx) => {
                      const userId = seen.userId;
                      const userInfo = getUserInfo(userId);
                      const seenDate = new Date(seen.seenAt || Date.now());
                      const diffMins = Math.floor((Date.now() - seenDate.getTime()) / 60000);
                      const seenTimeText = diffMins < 1 ? 'just now' : diffMins < 60 ? `${diffMins}m ago` : seenDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      
                      return (
                        <div key={idx} className="px-4 py-2.5 hover:bg-base-200/50 transition-colors flex items-center gap-3">
                          <ProfileImage
                            src={userInfo.profilePic}
                            alt={userInfo.fullname}
                            className="w-8 h-8 rounded-full ring-2 ring-base-300"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-base-content truncate">{userInfo.fullname}</p>
                            <p className="text-xs text-base-content/60">{seenTimeText}</p>
                          </div>
                          <CheckIcon isSeen={true} className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </span>
      );
    }
    
    // Standalone version (below bubble - Enhanced)
    // Get peer info from message.receiverId (populated) or selectedUser
    const getPeerInfo = () => {
      if (message.receiverId && typeof message.receiverId === 'object' && message.receiverId.profilePic) {
        return {
          profilePic: message.receiverId.profilePic || "/avatar.png",
          fullname: message.receiverId.fullname || "Peer"
        };
      }
      if (selectedUser?.profilePic) {
        return {
          profilePic: selectedUser.profilePic || "/avatar.png",
          fullname: selectedUser.fullname || "Peer"
        };
      }
      // Fallback to getUserInfo if receiverId is just an ID
      if (message.receiverId) {
        return getUserInfo(message.receiverId);
      }
      return {
        profilePic: "/avatar.png",
        fullname: "Peer"
      };
    };
    
    const peerInfo = getPeerInfo();
    
    return (
      <div className="relative flex items-center">
        {isMyMessage && !message.groupId && message.seen && (
          <span 
            className="relative flex items-center group/status"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <div className="relative inline-flex items-center justify-center transition-all duration-300 hover:scale-110 w-3.5 h-3.5">
              <ProfileImage
                src={peerInfo.profilePic}
                alt={peerInfo.fullname}
                className="w-3.5 h-3.5 rounded-full object-cover ring-1 ring-primary/30 shadow-sm"
              />
            </div>
            {/* Enhanced Tooltip for seen status */}
            {showTooltip && (
              <div className="absolute bottom-full right-0 mb-3 px-4 py-2.5 bg-gradient-to-br from-base-100 to-base-200/95 backdrop-blur-xl text-base-content text-xs rounded-2xl shadow-2xl whitespace-nowrap z-50 border border-base-300/50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <ProfileImage
                      src={peerInfo.profilePic}
                      alt={peerInfo.fullname}
                      className="w-5 h-5 rounded-full object-cover ring-2 ring-primary/30 shadow-md"
                    />
                    <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping opacity-50"></div>
                  </div>
                  <span className="font-semibold text-base-content">{getSeenTooltip()}</span>
                </div>
                <div className="absolute top-full right-6 w-0 h-0 border-x-[6px] border-x-transparent border-t-base-100 border-solid drop-shadow-lg"></div>
              </div>
            )}
          </span>
        )}
        {isMyMessage && message.groupId && uniqueSeenBy && uniqueSeenBy.length > 0 && (
          <span 
            className="relative flex items-center group/status cursor-pointer"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <div className="flex items-center -space-x-1.5">
              {uniqueSeenBy.slice(0, 3).map((seen, idx) => {
                const userId = seen.userId;
                const userInfo = getUserInfo(userId);
                
                return (
                  <div
                    key={idx}
                    className="relative transition-all duration-200 hover:scale-125 hover:z-10"
                    style={{ zIndex: 3 - idx }}
                  >
                    <ProfileImage
                      src={userInfo.profilePic}
                      alt={userInfo.fullname}
                      className="w-6 h-6 rounded-full object-cover ring-2 ring-base-300 shadow-md"
                    />
                    {idx === 0 && (
                      <div className="absolute -bottom-0.5 -right-0.5 rounded-full bg-green-500 ring-2 ring-base-100 w-2.5 h-2.5"></div>
                    )}
                  </div>
                );
              })}
              {uniqueSeenBy.length > 3 && (
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-base-200 text-base-content ring-2 ring-base-300 shadow-md transition-all hover:scale-110 backdrop-blur-sm">
                  +{uniqueSeenBy.length - 3}
                </div>
              )}
            </div>
            {/* Enhanced Tooltip for group seen status */}
            {showTooltip && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-80 max-w-[90vw] bg-gradient-to-br from-base-100 to-base-200/95 backdrop-blur-xl text-base-content text-xs rounded-2xl shadow-2xl z-50 border border-base-300/50 animate-in fade-in slide-in-from-bottom-2 duration-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-base-300/30 bg-base-200/30">
                  <div className="flex items-center gap-2.5">
                    <div className="relative">
                      <CheckIcon isSeen={true} className="w-4 h-4 text-primary drop-shadow-sm" />
                      <div className="absolute inset-0 rounded-full bg-primary/30 animate-ping opacity-50"></div>
                    </div>
                    <span className="font-semibold text-sm">Seen by ({uniqueSeenBy.length})</span>
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto hide-scrollbar">
                  {uniqueSeenBy.map((seen, idx) => {
                    const userId = seen.userId;
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
                      <div key={idx} className="px-4 py-2.5 hover:bg-base-200/50 transition-colors flex items-center gap-3">
                        <div className="relative flex-shrink-0">
                          <ProfileImage
                            src={userInfo.profilePic}
                            alt={userInfo.fullname}
                            className="w-9 h-9 rounded-full object-cover ring-2 ring-base-300 shadow-sm"
                          />
                          {isOnline && (
                            <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full ring-2 ring-base-100 shadow-sm"></span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-base-content truncate">{userInfo.fullname}</p>
                          <p className="text-xs text-base-content/60">
                            {diffMins < 1 ? "just now" : diffMins < 60 ? `${diffMins}m ago` : `${Math.floor(diffMins / 60)}h ago`}
                          </p>
                        </div>
                        <CheckIcon isSeen={true} className="w-3.5 h-3.5 text-primary flex-shrink-0 drop-shadow-sm" />
                      </div>
                    );
                  })}
                </div>
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
            <ProfileImage
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
      
      const actionText = actionType === 'editing' ? 'editing' : actionType === 'deleting' ? 'deleting' : 'uploading';
      
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
            <ProfileImage
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

  // Toggle selection mode
  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    if (isSelectionMode) {
      setSelectedMessages([]);
    }
  };

  // Handle forward multiple messages
  const handleForwardMultiple = () => {
    if (selectedMessages.length > 0) {
      setForwardingMessages(selectedMessages);
      setIsSelectionMode(false);
      setSelectedMessages([]);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-base-100 h-full relative">
      <ChatHeader 
        onToggleSelectionMode={toggleSelectionMode}
        isSelectionMode={isSelectionMode}
      />
      
      {/* Selection Mode Toolbar */}
      {isSelectionMode && (
        <div className="px-4 py-3 bg-primary/10 border-b border-primary/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSelectionMode}
              className="p-2 rounded-full hover:bg-base-200 transition-colors"
            >
              <FaTimes className="w-4 h-4 text-base-content" />
            </button>
            <span className="text-sm font-medium text-base-content">
              {selectedMessages.length} message(s) selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            {selectedMessages.length > 0 && (
              <button
                onClick={handleForwardMultiple}
                className="px-4 py-2 bg-primary text-primary-content rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <FaShare className="w-4 h-4" />
                <span>Forward</span>
              </button>
            )}
          </div>
        </div>
      )}
      
      {/* Pinned Message Section - Below Header (Show only last pinned) */}
      {(() => {
        const pinnedMessages = messages.filter(msg => msg.pinned);
        if (pinnedMessages.length === 0) return null;
        
        // Get the most recently pinned message (by pinnedAt or createdAt)
        const lastPinnedMessage = pinnedMessages.sort((a, b) => {
          const aTime = a.pinnedAt ? new Date(a.pinnedAt).getTime() : new Date(a.createdAt).getTime();
          const bTime = b.pinnedAt ? new Date(b.pinnedAt).getTime() : new Date(b.createdAt).getTime();
          return bTime - aTime;
        })[0];
        
        return (
          <div className="px-4 sm:px-6 py-2 border-b border-base-300/50 bg-base-200/30">
            <div 
              className="flex items-center gap-3 cursor-pointer hover:bg-base-200/50 rounded-lg p-2 -mx-2 transition-colors"
              onClick={() => {
                // Scroll to pinned message
                const messageElement = document.querySelector(`[data-message-id="${lastPinnedMessage._id}"]`);
                if (messageElement) {
                  messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  messageElement.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
                  setTimeout(() => {
                    messageElement.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
                  }, 2000);
                }
              }}
            >
              <div className="flex-shrink-0">
                {lastPinnedMessage.image ? (
                  <img 
                    src={Array.isArray(lastPinnedMessage.image) ? lastPinnedMessage.image[0] : lastPinnedMessage.image} 
                    alt="Pinned" 
                    className="w-10 h-10 rounded object-cover"
                  />
                ) : lastPinnedMessage.file ? (
                  <div className="w-10 h-10 rounded bg-base-300 flex items-center justify-center">
                    <FaFile className="w-5 h-5 text-base-content/60" />
                  </div>
                ) : lastPinnedMessage.audio ? (
                  <div className="w-10 h-10 rounded bg-base-300 flex items-center justify-center">
                    <FaMicrophone className="w-5 h-5 text-base-content/60" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded bg-base-300 flex items-center justify-center">
                    <FaThumbtack className="w-5 h-5 text-base-content/60" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <FaThumbtack className="w-3 h-3 text-primary flex-shrink-0" />
                  <span className="text-sm font-medium text-primary">Pinned message</span>
                </div>
                <p className="text-xs text-base-content/60 truncate mt-0.5">
                  {lastPinnedMessage.image ? "Photo" : lastPinnedMessage.audio ? "Voice message" : lastPinnedMessage.file ? lastPinnedMessage.fileName || "File" : lastPinnedMessage.text || "Message"}
                </p>
              </div>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await unpinMessage(lastPinnedMessage._id);
                  } catch (error) {
                    console.error("Failed to unpin message:", error);
                  }
                }}
                className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center hover:bg-base-300 transition-colors text-base-content/60 hover:text-base-content"
                title="Unpin"
              >
                <FaTimes className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })()}
      
      {/* Standard chat: newest at bottom, load more when scrolling up */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto hide-scrollbar p-4 sm:p-6 min-h-0 relative flex flex-col"
      >
        {/* Subtle loading indicator at top - only show when initially loading and no messages */}
        {isMessagesLoading && messages.length === 0 && (
          <div className="flex justify-center py-2 sticky top-0 bg-base-100/80 backdrop-blur-sm z-10 -mx-4 sm:-mx-6 px-4 sm:px-6">
            <div className="flex items-center gap-2 text-base-content/50 bg-base-200/60 px-2.5 py-1 rounded-full">
              <div className="w-3 h-3 border-2 border-primary/50 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-[10px] font-medium">Loading...</span>
            </div>
          </div>
        )}
        
        {/* Loading indicator for pagination - shown at top (oldest messages area) */}
        {isLoadingMoreMessages && (
          <div className="flex justify-center py-3 sticky top-0 bg-base-100/80 backdrop-blur-sm z-10 -mx-4 sm:-mx-6 px-4 sm:px-6">
            <div className="flex items-center gap-2 text-base-content/70 bg-base-200/80 px-3 py-1.5 rounded-full">
              <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              <span className="text-xs font-medium">Loading older messages...</span>
            </div>
          </div>
        )}
        
        {/* Messages - displayed in normal order (oldest first, newest last) */}
        {messages.map((message, index) => {
          const senderId = typeof message.senderId === 'object' ? message.senderId._id : message.senderId;
          const isMyMessage = senderId === authUser._id;
          const isLastMessage = index === messages.length - 1;
          const isLastMyMessage = isMyMessage && isLastMessage;
          
          // Check if this is a call status message
          const isCallStatusMessage = message.text && message.text.startsWith('📞');
          // Check if this is a pin status message
          const isPinStatusMessage = message.text && message.text.startsWith('📌');
          
          // Render call status message differently
          if (isCallStatusMessage) {
            return (
              <div key={message._id} className="flex justify-center my-3">
                <div className="px-4 py-2 bg-base-200/50 rounded-full text-xs text-base-content/60 flex items-center gap-2">
                  <span>{message.text}</span>
                  <span className="text-[10px] opacity-50">
                    {formatMessageTime(message.createdAt)}
                  </span>
                </div>
              </div>
            );
          }
          
          // Render pin status message differently
          if (isPinStatusMessage) {
            return (
              <div key={message._id} className="flex justify-center my-3">
                <div className="px-4 py-2 bg-base-200/50 rounded-full text-xs text-base-content/60 flex items-center gap-2">
                  <span>{message.text}</span>
                  <span className="text-[10px] opacity-50">
                    {formatMessageTime(message.createdAt)}
                  </span>
                </div>
              </div>
            );
          }
          
          // Check if previous message is from same sender (for grouping)
          const prevMessage = index > 0 ? messages[index - 1] : null;
          const prevSenderId = prevMessage ? (typeof prevMessage.senderId === 'object' ? prevMessage.senderId._id : prevMessage.senderId) : null;
          const isConsecutive = prevSenderId === senderId;
          const showAvatar = !isConsecutive && !isMyMessage;
          const messageSpacing = isConsecutive ? "mb-1" : "mb-4";
          
          return (
          <div 
            key={message._id}
            data-message-id={message._id}
            className={`flex flex-col ${isMyMessage ? "items-end" : "items-start"} group ${messageSpacing} relative transition-all duration-200`}
          >
            <div className={`flex flex-col ${isMyMessage ? "items-end" : "items-start"} max-w-[85%] sm:max-w-[75%]`}>
            <div className={`flex items-end gap-2.5 ${isMyMessage ? "flex-row-reverse" : ""}`}>
              {/* Avatar - only show for received messages and when not consecutive */}
              {showAvatar && (
                <div className="flex-shrink-0 mb-1">
                  <ProfileImage
                    src={typeof message.senderId === 'object' ? message.senderId.profilePic : "/avatar.png"}
                    alt={typeof message.senderId === 'object' ? message.senderId.fullname : "User"}
                    className="size-8 rounded-full ring-2 ring-base-200"
                  />
                </div>
              )}
              
              {/* Spacer for consecutive messages */}
              {isConsecutive && !isMyMessage && <div className="w-8 flex-shrink-0" />}
              
              {/* Selection Checkbox */}
              {isSelectionMode && (
                <input
                  type="checkbox"
                  checked={selectedMessages.some(m => normalizeId(m._id) === normalizeId(message._id))}
                  onChange={(e) => {
                    e.stopPropagation();
                    if (e.target.checked) {
                      setSelectedMessages(prev => [...prev, message]);
                    } else {
                      setSelectedMessages(prev => prev.filter(m => normalizeId(m._id) !== normalizeId(message._id)));
                    }
                  }}
                  className="mr-2 w-5 h-5 rounded border-base-300 text-primary focus:ring-primary"
                />
              )}

              {/* Message Bubble */}
              {message.image ? (
                /* Image Message - Enhanced styling */
                (() => {
                  // Handle both single image (string) and multiple images (array)
                  const images = Array.isArray(message.image) ? message.image : [message.image];
                  const isMultiple = images.length > 1;
                  
                  return (
                    <div 
                      className={`relative group/message transition-all duration-200 hover:scale-[1.01] ${
                        isMyMessage 
                          ? "rounded-3xl rounded-br-sm" 
                          : "rounded-3xl rounded-bl-sm"
                      } overflow-hidden ${
                        isMultiple 
                          ? "max-w-[400px] sm:max-w-[450px]" 
                          : "max-w-[280px] sm:max-w-[320px]"
                      }`}
                    >
                      {isMultiple ? (
                      /* Multiple Images - Grid Layout */
                      <div className={`grid gap-1 ${
                        images.length === 1 ? 'grid-cols-1' :
                        images.length === 2 ? 'grid-cols-2' :
                        images.length === 3 ? 'grid-cols-2' :
                        images.length === 4 ? 'grid-cols-2' :
                        'grid-cols-3'
                      }`}>
                        {images.map((imgUrl, idx) => (
                          <div 
                            key={idx} 
                            className="relative cursor-pointer group/image aspect-square overflow-hidden"
                            onClick={() => setViewingMedia({ type: 'image', url: imgUrl })}
                          >
                            <img
                              src={getHighQualityImageUrl(imgUrl, true)}
                              alt={`Attachment ${idx + 1}`}
                              className="w-full h-full object-cover"
                              style={{ imageRendering: 'auto' }}
                              loading="lazy"
                            />
                            {images.length > 4 && idx === 3 && (
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-semibold text-lg">
                                +{images.length - 4}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      /* Single Image */
                      <div className="relative cursor-pointer group/image">
                        <img
                          src={getHighQualityImageUrl(images[0], true)}
                          alt="Attachment"
                          className="w-full h-auto object-contain"
                          style={{ imageRendering: 'auto' }}
                          loading="lazy"
                          onClick={() => setViewingMedia({ type: 'image', url: images[0] })}
                        />
                      </div>
                    )}
                    {/* Delete image button - only for sender */}
                    {isMyMessage && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (confirm(`Delete ${isMultiple ? 'all images' : 'this image'}?`)) {
                            try {
                              await deleteMessageMedia(message._id, 'image');
                              toast.success('Image(s) deleted');
                            } catch (error) {
                              console.error('Failed to delete image:', error);
                            }
                          }
                        }}
                        className="absolute top-2 right-2 opacity-0 group-hover/message:opacity-100 transition-opacity bg-error text-error-content rounded-full p-1.5 hover:bg-error/90 shadow-lg z-10"
                        title={`Delete ${isMultiple ? 'all images' : 'image'}`}
                      >
                        <FaTimes className="w-3 h-3" />
                      </button>
                    )}
                    {/* Enhanced gradient overlay for better text readability - only for single image */}
                    {!isMultiple && (
                      <div className={`absolute inset-0 bg-gradient-to-t ${
                        isMyMessage 
                          ? "from-black/75 via-black/40 to-transparent" 
                          : "from-black/70 via-black/30 to-transparent"
                      } pointer-events-none `} />
                    )}
                    
                    {/* Enhanced text overlay on image if exists */}
                    {message.text && (
                      <div className={`absolute bottom-0 left-0 right-0 p-4 pb-5 ${
                        isMultiple ? 'bg-black/60 backdrop-blur-sm rounded-b-3xl' : ''
                      }`}>
                        <p className={`text-sm leading-relaxed font-semibold tracking-wide ${
                          isMyMessage ? 'text-white' : 'text-white'
                        } drop-shadow-2xl`}>
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
                    
                    {/* Enhanced inline status indicators on image - only for single image */}
                    {isMyMessage && !isMultiple && (
                      <div className={`absolute bottom-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg backdrop-blur-md border border-white/10 ${
                        "bg-black/70 shadow-lg"
                      }`}>
                        {message.edited && (
                          <span className="text-[11px] italic font-medium text-white/90">
                            (edited)
                          </span>
                        )}
                        {/* Seen indicator inside bubble (only on last message) */}
                        {isLastMyMessage && (
                          <div className="ml-1.5">
                            <MessageStatus message={message} isInline={true} isOnImage={true} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
                })()
              ) : message.audio ? (
                /* Audio Message - Custom player with waveform */
                <div 
                  className={`relative group/message max-w-[320px] sm:max-w-[360px] px-4 py-3 transition-all duration-200 hover:scale-[1.01] ${
                    isMyMessage 
                      ? "bg-gradient-to-br from-primary to-primary/90 text-primary-content rounded-3xl rounded-br-sm shadow-lg shadow-primary/20" 
                      : "bg-base-200/95 backdrop-blur-sm text-base-content rounded-3xl rounded-bl-sm shadow-lg shadow-black/10 border border-base-300/50"
                  }`}
                >
                  {/* Custom Audio Player */}
                  <AudioPlayer 
                    src={message.audio} 
                    isMyMessage={isMyMessage}
                    messageId={message._id}
                    onPlay={async (msgId) => {
                      if (!isMyMessage) {
                        try {
                          await markVoiceAsListened(msgId);
                        } catch (error) {
                          console.error('Failed to mark voice as listened:', error);
                        }
                      }
                    }}
                  />
                  
                  {/* Text with audio if exists */}
                  {message.text ? (
                    <div className="mt-3 pt-3 border-t border-primary-content/25">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm leading-relaxed flex-1 min-w-0 tracking-wide ${isMyMessage ? 'text-primary-content/95' : 'text-base-content'}`}>
                          {message.text}
                        </span>
                        
                        {/* Inline status indicators (Enhanced Telegram style) */}
                        <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                          {/* Edited indicator */}
                          {message.edited && (
                            <span 
                              className={`text-[10px] italic font-medium opacity-80 ${
                                isMyMessage ? 'text-primary-content/80' : 'text-base-content/70'
                              }`}
                            >
                              (edited)
                            </span>
                          )}
                          
                          {/* Seen indicator inside bubble (only for my messages and only on last message) */}
                          {isLastMyMessage && (
                            <MessageStatus message={message} isInline={true} />
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Inline status indicators when no text (Enhanced Telegram style) */
                    <div className="flex items-center justify-end gap-1 mt-3">
                      {/* Edited indicator */}
                      {message.edited && (
                        <span 
                          className={`text-[10px] italic font-medium opacity-80 ${
                            isMyMessage ? 'text-primary-content/80' : 'text-base-content/70'
                          }`}
                        >
                          (edited)
                        </span>
                      )}
                      
                      {/* Seen indicator inside bubble (only for my messages and only on last message) */}
                      {isLastMyMessage && (
                        <MessageStatus message={message} isInline={true} />
                      )}
                    </div>
                  )}
                  
                </div>
              ) : message.file ? (
                /* File Message - Enhanced styling */
                <div 
                  className={`relative group/message max-w-[320px] sm:max-w-[360px] px-5 py-4 transition-all duration-200 hover:scale-[1.01] ${
                    isMyMessage 
                      ? "bg-gradient-to-br from-primary to-primary/90 text-primary-content rounded-3xl rounded-br-sm shadow-lg shadow-primary/20" 
                      : "bg-base-200/95 backdrop-blur-sm text-base-content rounded-3xl rounded-bl-sm shadow-lg shadow-black/10 border border-base-300/50"
                  }`}
                >
                  <div
                    onClick={() => setViewingMedia({ type: 'file', url: message.file, fileName: message.fileName || 'File' })}
                    className="flex items-center gap-3 hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    <div className={`flex-shrink-0 size-12 rounded-xl flex items-center justify-center transition-all ${
                      isMyMessage 
                        ? 'bg-primary-content/25 shadow-lg shadow-primary-content/10' 
                        : 'bg-primary/15 shadow-md'
                    }`}>
                      <FaFile className={`size-6 ${isMyMessage ? 'text-primary-content' : 'text-primary'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${
                        isMyMessage ? 'text-primary-content' : 'text-base-content'
                      }`}>
                        {message.fileName || "File"}
                      </p>
                      {message.fileSize && (
                        <p className={`text-xs mt-1 ${
                          isMyMessage ? 'text-primary-content/70' : 'text-base-content/60'
                        }`}>
                          {(message.fileSize / 1024).toFixed(2)} KB
                        </p>
                      )}
                    </div>
                    <FaDownload className={`size-4 flex-shrink-0 ${
                      isMyMessage ? 'text-primary-content/70' : 'text-base-content/60'
                    }`} />
                  </div>
                  
                  {/* Text with file if exists */}
                  {message.text && (
                    <div className={`mt-3 pt-3 border-t ${
                      isMyMessage ? 'border-primary-content/25' : 'border-base-300/60'
                    }`}>
                      <p className={`text-sm leading-relaxed tracking-wide ${
                        isMyMessage ? 'text-primary-content' : 'text-base-content'
                      }`}>
                        {message.text}
                      </p>
                    </div>
                  )}
                  
                </div>
              ) : message.link ? (
                /* Link Message - Enhanced styling */
                <div 
                  className={`relative group/message max-w-[320px] sm:max-w-[360px] px-5 py-4 transition-all duration-200 hover:scale-[1.01] ${
                    isMyMessage 
                      ? "bg-gradient-to-br from-primary to-primary/90 text-primary-content rounded-3xl rounded-br-sm shadow-lg shadow-primary/20" 
                      : "bg-base-200/95 backdrop-blur-sm text-base-content rounded-3xl rounded-bl-sm shadow-lg shadow-black/10 border border-base-300/50"
                  }`}
                >
                  <a
                    href={message.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 hover:opacity-90 transition-opacity mb-2"
                  >
                    <div className={`flex-shrink-0 size-11 rounded-xl flex items-center justify-center transition-all ${
                      isMyMessage 
                        ? 'bg-primary-content/25 shadow-lg shadow-primary-content/10' 
                        : 'bg-primary/15 shadow-md'
                    }`}>
                      <FaLink className={`size-5 ${isMyMessage ? 'text-primary-content' : 'text-primary'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${
                        isMyMessage ? 'text-primary-content' : 'text-base-content'
                      }`}>
                        {message.link}
                      </p>
                    </div>
                  </a>
                  
                  {/* Text with link if exists */}
                  {message.text && (
                    <div className={`mt-2 pt-2 border-t ${
                      isMyMessage ? 'border-primary-content/25' : 'border-base-300/60'
                    }`}>
                      <p className={`text-sm leading-relaxed tracking-wide ${
                        isMyMessage ? 'text-primary-content' : 'text-base-content'
                      }`}>
                        {message.text.replace(message.link, '').trim() || message.text}
                      </p>
                    </div>
                  )}
                  
                </div>
              ) : (
                /* Text Message - Enhanced styling */
                <div 
                  className={`relative px-4 py-2.5 text-sm transition-all duration-200 hover:scale-[1.01] group/message ${
                    isMyMessage
                      ? "bg-gradient-to-br from-primary to-primary/90 text-primary-content rounded-3xl rounded-br-sm shadow-lg shadow-primary/20"
                      : "bg-base-200/95 backdrop-blur-sm text-base-content rounded-3xl rounded-bl-sm shadow-lg shadow-black/10 border border-base-300/50"
                  }`}
                >
                  
                  {/* Message text with inline status (Enhanced Telegram style) */}
                  <div className="flex items-center gap-1.5">
                    {message.text && (
                      <span className={`leading-relaxed break-words flex-1 min-w-0 font-normal tracking-wide ${
                        isMyMessage ? 'text-primary-content' : 'text-base-content'
                      }`}>
                        {message.text}
                      </span>
                    )}
                    
                    {/* Inline status indicators (Enhanced Telegram style) */}
                    <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                      {/* Edited indicator */}
                      {message.edited && (
                        <span 
                          className={`text-[10px] italic font-medium opacity-80 ${
                            isMyMessage ? 'text-primary-content/80' : 'text-base-content/70'
                          }`}
                        >
                          (edited)
                        </span>
                      )}
                      
                      {/* Seen indicator inside bubble (only for my messages and only on last message) */}
                      {isLastMyMessage && (
                        <MessageStatus message={message} isInline={true} />
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Forwarded From Display - Below message bubble */}
              {message.forwardedFrom && (
                <div className={`mt-1.5 ${isMyMessage ? 'text-right' : 'text-left'}`}>
                  <div className="inline-flex items-center gap-1.5 text-xs text-base-content/50">
                    <FaShare className="w-3 h-3 flex-shrink-0" />
                    <span>
                      Forwarded from <span className="font-medium text-base-content/70">{message.forwardedFrom.senderName || 'Unknown'}</span>
                      {message.forwardedFrom.chatName && (
                        <> in <span className="font-medium text-base-content/70">{message.forwardedFrom.chatName}</span></>
                      )}
                    </span>
                  </div>
                </div>
              )}

              {/* Reactions Display */}
              {message.reactions && message.reactions.length > 0 && (
                <div className={`flex flex-wrap gap-1.5 mt-1.5 ${isMyMessage ? 'justify-end' : 'justify-start'}`}>
                  {Object.entries(
                    message.reactions.reduce((acc, reaction) => {
                      const emoji = reaction.emoji;
                      if (!acc[emoji]) {
                        acc[emoji] = [];
                      }
                      acc[emoji].push(reaction);
                      return acc;
                    }, {})
                  ).map(([emoji, reactions]) => {
                    const hasMyReaction = reactions.some(r => 
                      normalizeId(r.userId?._id || r.userId) === normalizeId(authUser?._id)
                    );
                    const reactionUsers = reactions.map(r => {
                      if (typeof r.userId === 'object' && r.userId.fullname) {
                        const time = r.createdAt ? formatMessageTime(r.createdAt) : '';
                        return `${r.userId.fullname}${time ? ` (${time})` : ''}`;
                      }
                      const time = r.createdAt ? formatMessageTime(r.createdAt) : '';
                      return `Someone${time ? ` (${time})` : ''}`;
                    });
                    const tooltipText = reactionUsers.length > 0 
                      ? `${reactionUsers.join(', ')}${reactionUsers.length > 1 ? ` and ${reactions.length - reactionUsers.length} more` : ''}`
                      : 'Reacted';
                    
                    return (
                      <button
                        key={emoji}
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (hasMyReaction) {
                            await removeReaction(message._id);
                          } else {
                            await addReaction(message._id, emoji);
                          }
                        }}
                        className={`px-2 py-1 rounded-full text-xs flex items-center gap-1 transition-all duration-200 reaction-button-enter ${
                          hasMyReaction
                            ? 'bg-primary text-primary-content shadow-md hover:shadow-lg hover:scale-110 active:scale-95'
                            : 'bg-base-200 hover:bg-base-300 text-base-content hover:scale-110 active:scale-95'
                        }`}
                        title={tooltipText}
                      >
                        <span className="text-sm">{emoji}</span>
                        <span className="font-medium">{reactions.length}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Reaction Picker */}
              {reactionPickerMessageId === message._id && (
                <div 
                  className={`relative ${isMyMessage ? 'ml-auto' : 'mr-auto'} mt-2 reaction-picker-enter`}
                  ref={(el) => { if (el) reactionPickerRefs.current[message._id] = el; }}
                >
                  <div className="bg-base-100 rounded-2xl shadow-2xl border border-base-300/50 p-3 flex gap-2 backdrop-blur-sm">
                    {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji) => {
                      const hasMyReaction = message.reactions?.some(r => 
                        r.emoji === emoji && normalizeId(r.userId?._id || r.userId) === normalizeId(authUser?._id)
                      );
                      return (
                        <button
                          key={emoji}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (hasMyReaction) {
                              await removeReaction(message._id);
                            } else {
                              await addReaction(message._id, emoji);
                            }
                            setReactionPickerMessageId(null);
                          }}
                          className={`text-2xl p-2 rounded-lg transition-all duration-200 hover:bg-base-200 hover:scale-125 active:scale-95 ${
                            hasMyReaction ? 'bg-primary/20 ring-2 ring-primary/50' : ''
                          }`}
                          title={hasMyReaction ? 'Remove reaction' : 'Add reaction'}
                        >
                          {emoji}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* Enhanced Timestamp and three dots menu - outside bubble */}
              {isMyMessage && (
                <div className="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-200 mt-1">
                  {/* Timestamp outside bubble */}
                  <span 
                    className="text-[11px] font-medium whitespace-nowrap text-base-content/60 px-2 py-1 rounded-md bg-base-200/50 backdrop-blur-sm"
                    title={formatMessageTime(message.createdAt)}
                  >
                    {formatMessageTime(message.createdAt)}
                  </span>
                  
                  {/* Three dots menu button */}
                  <div className="relative" ref={(el) => { if (el) menuRefs.current[message._id] = el; }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuMessageId(openMenuMessageId === message._id ? null : message._id);
                      }}
                      className="p-1.5 rounded-full transition-all bg-base-200/80 hover:bg-base-300 text-base-content/70 hover:text-base-content shadow-sm hover:shadow active:scale-95"
                      title="More options"
                    >
                      <FaEllipsisV className="w-3.5 h-3.5" />
                    </button>
                    
                    {/* Dropdown Menu */}
                    {openMenuMessageId === message._id && (
                      <div 
                        onClick={(e) => e.stopPropagation()}
                        className={`absolute ${isMyMessage ? 'right-0' : 'left-0'} bottom-full mb-2 w-64 bg-base-100 rounded-xl shadow-2xl border border-base-300/50 z-50 overflow-hidden backdrop-blur-sm`}>
                        {/* Message Preview */}
                        <div className="p-3 border-b border-base-200 bg-base-200/30">
                          <p className="text-xs font-medium text-base-content/60 mb-2">Message:</p>
                          <div className="bg-base-100 rounded-lg p-2.5 border border-base-300 max-h-32 overflow-y-auto">
                            {message.audio ? (
                              <div className="flex items-center gap-2">
                                <FaMicrophone className="size-3.5 text-primary flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <AudioPlayer 
                                    src={message.audio} 
                                    isMyMessage={false}
                                    messageId={message._id}
                                  />
                                  {message.text && (
                                    <p className="text-xs text-base-content/70 mt-1.5 line-clamp-2">{message.text}</p>
                                  )}
                                </div>
                              </div>
                            ) : message.image ? (
                              <div className="flex items-center gap-2">
                                <FaImage className="size-3.5 text-primary flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-base-content">Photo</p>
                                  {message.text && (
                                    <p className="text-xs text-base-content/70 mt-1 line-clamp-2">{message.text}</p>
                                  )}
                                </div>
                              </div>
                            ) : message.video ? (
                              <div className="flex items-center gap-2">
                                <FaVideo className="size-3.5 text-primary flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-base-content">Video</p>
                                  {message.text && (
                                    <p className="text-xs text-base-content/70 mt-1 line-clamp-2">{message.text}</p>
                                  )}
                                </div>
                              </div>
                            ) : message.file ? (
                              <div className="flex items-center gap-2">
                                <FaFile className="size-3.5 text-primary flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-base-content truncate">
                                    {message.fileName || "File"}
                                  </p>
                                  {message.text && (
                                    <p className="text-xs text-base-content/70 mt-1 line-clamp-2">{message.text}</p>
                                  )}
                                </div>
                              </div>
                            ) : message.text ? (
                              <p className="text-xs text-base-content line-clamp-4">{message.text}</p>
                            ) : (
                              <p className="text-xs text-base-content/60 italic">Empty message</p>
                            )}
                          </div>
                        </div>
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
                                handleCopyMessage(message);
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm text-base-content hover:bg-base-200 transition-colors flex items-center gap-3"
                            >
                              <FaCopy className="w-4 h-4" />
                              <span>Copy</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setForwardingMessage(message);
                                setOpenMenuMessageId(null);
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm text-base-content hover:bg-base-200 transition-colors flex items-center gap-3"
                            >
                              <FaShare className="w-4 h-4" />
                              <span>Forward</span>
                            </button>
                            {/* Save/Unsave Message */}
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const isSaved = message.savedBy?.some(s => normalizeId(s.userId?._id || s.userId) === normalizeId(authUser?._id));
                                  if (isSaved) {
                                    await unsaveMessage(message._id);
                                  } else {
                                    await saveMessage(message._id);
                                  }
                                  setOpenMenuMessageId(null);
                                } catch (error) {
                                  console.error('Failed to save/unsave message:', error);
                                }
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm text-base-content hover:bg-base-200 transition-colors flex items-center gap-3"
                            >
                              <FaSave className="w-4 h-4" />
                              <span>{message.savedBy?.some(s => normalizeId(s.userId?._id || s.userId) === normalizeId(authUser?._id)) ? "Unsave" : "Save"}</span>
                            </button>
                            {/* Delete Individual Media */}
                            {message.image && (
                              <>
                                <div className="border-t border-base-200 my-1"></div>
                                <div className="px-4 py-2 text-xs font-medium text-base-content/60">Delete Media</div>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (confirm('Delete this image?')) {
                                      try {
                                        await deleteMessageMedia(message._id, 'image');
                                        toast.success('Image deleted');
                                        setOpenMenuMessageId(null);
                                      } catch (error) {
                                        console.error('Failed to delete image:', error);
                                      }
                                    }
                                  }}
                                  className="w-full px-4 py-2.5 text-left text-sm text-error hover:bg-error/10 transition-colors flex items-center gap-3"
                                >
                                  <FaImage className="w-4 h-4" />
                                  <span>Delete image</span>
                                </button>
                              </>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (message.pinned) {
                                  // Direct unpin without confirmation
                                  unpinMessage(message._id).catch(error => {
                                    console.error("Failed to unpin message:", error);
                                  });
                                  setOpenMenuMessageId(null);
                                } else {
                                  // Show pin confirmation modal
                                  setPinningMessage(message);
                                  setOpenMenuMessageId(null);
                                }
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm text-base-content hover:bg-base-200 transition-colors flex items-center gap-3"
                            >
                              <FaThumbtack className="w-4 h-4" />
                              <span>{message.pinned ? "Unpin" : "Pin"}</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setReactionPickerMessageId(reactionPickerMessageId === message._id ? null : message._id);
                                setOpenMenuMessageId(null);
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm text-base-content hover:bg-base-200 transition-colors flex items-center gap-3"
                            >
                              <FaSmile className="w-4 h-4" />
                              <span>Add reaction</span>
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
                                handleCopyMessage(message);
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm text-base-content hover:bg-base-200 transition-colors flex items-center gap-3"
                            >
                              <FaCopy className="w-4 h-4" />
                              <span>Copy</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setForwardingMessage(message);
                                setOpenMenuMessageId(null);
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm text-base-content hover:bg-base-200 transition-colors flex items-center gap-3"
                            >
                              <FaShare className="w-4 h-4" />
                              <span>Forward</span>
                            </button>
                            {/* Save/Unsave Message */}
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const isSaved = message.savedBy?.some(s => normalizeId(s.userId?._id || s.userId) === normalizeId(authUser?._id));
                                  if (isSaved) {
                                    await unsaveMessage(message._id);
                                  } else {
                                    await saveMessage(message._id);
                                  }
                                  setOpenMenuMessageId(null);
                                } catch (error) {
                                  console.error('Failed to save/unsave message:', error);
                                }
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm text-base-content hover:bg-base-200 transition-colors flex items-center gap-3"
                            >
                              <FaSave className="w-4 h-4" />
                              <span>{message.savedBy?.some(s => normalizeId(s.userId?._id || s.userId) === normalizeId(authUser?._id)) ? "Unsave" : "Save"}</span>
                            </button>
                            {/* Delete Individual Media for text messages */}
                            {(message.video || message.audio || message.file) && (
                              <>
                                <div className="border-t border-base-200 my-1"></div>
                                <div className="px-4 py-2 text-xs font-medium text-base-content/60">Delete Media</div>
                                {message.video && (
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      if (confirm('Delete this video?')) {
                                        try {
                                          await deleteMessageMedia(message._id, 'video');
                                          toast.success('Video deleted');
                                          setOpenMenuMessageId(null);
                                        } catch (error) {
                                          console.error('Failed to delete video:', error);
                                        }
                                      }
                                    }}
                                    className="w-full px-4 py-2.5 text-left text-sm text-error hover:bg-error/10 transition-colors flex items-center gap-3"
                                  >
                                    <FaFile className="w-4 h-4" />
                                    <span>Delete video</span>
                                  </button>
                                )}
                                {message.audio && (
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      if (confirm('Delete this audio?')) {
                                        try {
                                          await deleteMessageMedia(message._id, 'audio');
                                          toast.success('Audio deleted');
                                          setOpenMenuMessageId(null);
                                        } catch (error) {
                                          console.error('Failed to delete audio:', error);
                                        }
                                      }
                                    }}
                                    className="w-full px-4 py-2.5 text-left text-sm text-error hover:bg-error/10 transition-colors flex items-center gap-3"
                                  >
                                    <FaMicrophone className="w-4 h-4" />
                                    <span>Delete audio</span>
                                  </button>
                                )}
                                {message.file && (
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      if (confirm('Delete this file?')) {
                                        try {
                                          await deleteMessageMedia(message._id, 'file');
                                          toast.success('File deleted');
                                          setOpenMenuMessageId(null);
                                        } catch (error) {
                                          console.error('Failed to delete file:', error);
                                        }
                                      }
                                    }}
                                    className="w-full px-4 py-2.5 text-left text-sm text-error hover:bg-error/10 transition-colors flex items-center gap-3"
                                  >
                                    <FaFile className="w-4 h-4" />
                                    <span>Delete file</span>
                                  </button>
                                )}
                              </>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (message.pinned) {
                                  // Direct unpin without confirmation
                                  unpinMessage(message._id).catch(error => {
                                    console.error("Failed to unpin message:", error);
                                  });
                                  setOpenMenuMessageId(null);
                                } else {
                                  // Show pin confirmation modal
                                  setPinningMessage(message);
                                  setOpenMenuMessageId(null);
                                }
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm text-base-content hover:bg-base-200 transition-colors flex items-center gap-3"
                            >
                              <FaThumbtack className="w-4 h-4" />
                              <span>{message.pinned ? "Unpin" : "Pin"}</span>
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
              
              {/* Timestamp for received messages */}
              {!isMyMessage && (
                <div className="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-200 mt-1">
                  {/* Sender name for group chats */}
                  {isGroupChat && !isConsecutive && (
                    <span className="text-[10px] font-semibold text-base-content/70 px-2 py-0.5 rounded-md bg-base-200/50 backdrop-blur-sm">
                      {typeof message.senderId === 'object' ? message.senderId.fullname : 'User'}
                    </span>
                  )}
                  {/* Timestamp */}
                  <span 
                    className="text-[11px] font-medium whitespace-nowrap text-base-content/60 px-2 py-1 rounded-md bg-base-200/50 backdrop-blur-sm"
                    title={formatMessageTime(message.createdAt)}
                  >
                    {formatMessageTime(message.createdAt)}
                  </span>
                  
                  {/* Three dots menu button for received messages */}
                  <div className="relative" ref={(el) => { if (el) menuRefs.current[message._id] = el; }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuMessageId(openMenuMessageId === message._id ? null : message._id);
                      }}
                      className="p-1.5 rounded-full transition-all bg-base-200/80 hover:bg-base-300 text-base-content/70 hover:text-base-content shadow-sm hover:shadow active:scale-95"
                      title="More options"
                    >
                      <FaEllipsisV className="w-3.5 h-3.5" />
                    </button>
                    
                    {/* Dropdown Menu for received messages */}
                    {openMenuMessageId === message._id && (
                      <div 
                        onClick={(e) => e.stopPropagation()}
                        className={`absolute ${isMyMessage ? 'right-0' : 'left-0'} bottom-full mb-2 w-64 bg-base-100 rounded-xl shadow-2xl border border-base-300/50 z-50 overflow-hidden backdrop-blur-sm`}>
                        {/* Message Preview */}
                        <div className="p-3 border-b border-base-200 bg-base-200/30">
                          <p className="text-xs font-medium text-base-content/60 mb-2">Message:</p>
                          <div className="bg-base-100 rounded-lg p-2.5 border border-base-300 max-h-32 overflow-y-auto">
                            {message.audio ? (
                              <div className="flex items-center gap-2">
                                <FaMicrophone className="size-3.5 text-primary flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <AudioPlayer 
                                    src={message.audio} 
                                    isMyMessage={false}
                                    messageId={message._id}
                                  />
                                  {message.text && (
                                    <p className="text-xs text-base-content/70 mt-1.5 line-clamp-2">{message.text}</p>
                                  )}
                                </div>
                              </div>
                            ) : message.image ? (
                              <div className="flex items-center gap-2">
                                <FaImage className="size-3.5 text-primary flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-base-content">Photo</p>
                                  {message.text && (
                                    <p className="text-xs text-base-content/70 mt-1 line-clamp-2">{message.text}</p>
                                  )}
                                </div>
                              </div>
                            ) : message.video ? (
                              <div className="flex items-center gap-2">
                                <FaVideo className="size-3.5 text-primary flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-base-content">Video</p>
                                  {message.text && (
                                    <p className="text-xs text-base-content/70 mt-1 line-clamp-2">{message.text}</p>
                                  )}
                                </div>
                              </div>
                            ) : message.file ? (
                              <div className="flex items-center gap-2">
                                <FaFile className="size-3.5 text-primary flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-base-content truncate">
                                    {message.fileName || "File"}
                                  </p>
                                  {message.text && (
                                    <p className="text-xs text-base-content/70 mt-1 line-clamp-2">{message.text}</p>
                                  )}
                                </div>
                              </div>
                            ) : message.text ? (
                              <p className="text-xs text-base-content line-clamp-4">{message.text}</p>
                            ) : (
                              <p className="text-xs text-base-content/60 italic">Empty message</p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyMessage(message);
                          }}
                          className="w-full px-4 py-2.5 text-left text-sm text-base-content hover:bg-base-200 transition-colors flex items-center gap-3"
                        >
                          <FaCopy className="w-4 h-4" />
                          <span>Copy</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setForwardingMessage(message);
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
                            setReactionPickerMessageId(reactionPickerMessageId === message._id ? null : message._id);
                            setOpenMenuMessageId(null);
                          }}
                          className="w-full px-4 py-2.5 text-left text-sm text-base-content hover:bg-base-200 transition-colors flex items-center gap-3"
                        >
                          <FaSmile className="w-4 h-4" />
                          <span>Add reaction</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            {/* Standalone seen status (peer image) - only for last message in direct chat, always visible, below bubble */}
            {isMyMessage && isLastMyMessage && !message.groupId && message.seen && (
              <div className={`mt-2 flex ${isMyMessage ? "justify-end" : "justify-start"}`}>
                <MessageStatus message={message} isInline={false} />
              </div>
            )}
            </div>
            
          </div>
          );
        })}
        
        {/* Typing/action indicators at bottom (newest messages area) */}
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
            {/* Receiver sees when sender is uploading */}
            {isUserUploadingPhoto && !isUserTyping && !isUserEditing && !isUserDeleting && !isCurrentUserUploading && (
              <div ref={messageEndRef}>
                <ActionIndicator message="uploading..." icon={FaImage} />
              </div>
            )}
            {/* Sender's own upload progress - Show image preview if uploading image */}
            {isCurrentUserUploading && uploadingImagePreview && !isUserTyping && !isUserEditing && !isUserDeleting && (
              <div ref={messageEndRef} className="flex items-end gap-2 max-w-[85%] sm:max-w-[75%] ml-auto">
                <div className="relative max-w-[280px] sm:max-w-[320px] rounded-3xl rounded-br-sm overflow-hidden">
                  {/* Uploading image preview */}
                  <img
                    src={uploadingImagePreview}
                    alt="Uploading"
                    className="w-full h-auto object-contain opacity-60"
                  />
                  {/* Loading overlay */}
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                    <FaSpinner className="size-6 text-white animate-spin" />
                  </div>
                </div>
              </div>
            )}
            {/* Sender's upload progress for files (no preview) */}
            {isCurrentUserUploading && !uploadingImagePreview && uploadType === 'file' && !isUserTyping && !isUserEditing && !isUserDeleting && (
              <div ref={messageEndRef} className="flex items-end gap-2 max-w-[85%] sm:max-w-[75%] ml-auto">
                <div className="px-4 py-3 rounded-2xl rounded-br-md bg-gradient-to-br from-primary to-primary/90 text-primary-content shadow-sm">
                  <div className="flex items-center gap-2">
                    <FaSpinner className="w-4 h-4 animate-spin" />
                    <span className="text-xs font-medium">
                      Uploading file...
                    </span>
                  </div>
                </div>
              </div>
            )}
            {!isUserTyping && !isUserEditing && !isUserDeleting && !isCurrentUserUploading && !isUserUploadingPhoto && (
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
                    <div className="flex items-end gap-2 max-w-[85%] sm:max-w-[75%]">
                      <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-base-200 shadow-sm">
                        <div className="flex items-center gap-2">
                          <FaImage className="w-4 h-4 text-primary animate-pulse" />
                          <span className="text-xs text-base-content/70 font-medium">
                            {groupUploading.length === 1 ? 'Uploading image...' : `${groupUploading.length} uploading images...`}
                          </span>
                        </div>
                      </div>
                    </div>
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
        {!isSavedMessages && <MessageInput />}
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
      
      {/* Media Viewer Modal (Image/File) */}
      {viewingMedia && (
        <div 
          className="fixed inset-0 bg-black/95 backdrop-blur-sm z-50 flex items-center justify-center"
          onClick={() => setViewingMedia(null)}
        >
          <div className="relative w-full h-full flex flex-col">
            {/* Close button */}
            <button
              onClick={() => setViewingMedia(null)}
              className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors"
            >
              <FaTimesCircle className="w-6 h-6" />
            </button>
            
            {/* Media content */}
            <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
              {viewingMedia.type === 'image' ? (
                <img
                  src={getHighQualityImageUrl(viewingMedia.url)}
                  alt="Full view"
                  className="max-w-full max-h-full object-contain"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div className="max-w-2xl w-full bg-base-100 rounded-2xl p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-col items-center gap-6">
                    <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center">
                      <FaFile className="w-12 h-12 text-primary" />
                    </div>
                    <div className="text-center">
                      <h3 className="text-xl font-semibold text-base-content mb-2">{viewingMedia.fileName}</h3>
                      <p className="text-base-content/60">Click download to save this file</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Action buttons */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-3">
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    if (viewingMedia.type === 'image') {
                      // Download image
                      const response = await fetch(viewingMedia.url);
                      const blob = await response.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `image-${Date.now()}.jpg`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      window.URL.revokeObjectURL(url);
                      toast.success("Image saved");
                    } else {
                      // Download file
                      const a = document.createElement('a');
                      a.href = viewingMedia.url;
                      a.download = viewingMedia.fileName || 'file';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      toast.success("File downloaded");
                    }
                  } catch (error) {
                    console.error("Failed to save:", error);
                    toast.error("Failed to save");
                  }
                }}
                className="px-6 py-3 bg-primary hover:bg-primary/90 text-primary-content rounded-full flex items-center gap-2 transition-colors shadow-lg"
              >
                <FaSave className="w-5 h-5" />
                <span className="font-medium">Save</span>
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Pin Message Confirmation Modal */}
      {pinningMessage && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-base-100 rounded-2xl shadow-2xl max-w-md w-full border border-base-300/50 overflow-hidden">
            <div className="px-6 py-6">
              <p className="text-base-content text-center mb-6">Would you like to pin this message?</p>
              <div className="flex items-center gap-3 mb-6">
                <input
                  type="radio"
                  id="pin-option"
                  checked
                  readOnly
                  className="w-4 h-4 text-primary border-base-300 focus:ring-primary focus:ring-2"
                />
                <label htmlFor="pin-option" className="flex-1 text-base-content cursor-pointer">
                  Pin for me and {isGroupChat ? selectedGroup?.name : selectedUser?.fullname || "User"}
                </label>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-base-300/50">
              <button
                onClick={() => setPinningMessage(null)}
                className="flex-1 px-4 py-2.5 rounded-lg bg-base-200 hover:bg-base-300 text-base-content font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await pinMessage(pinningMessage._id);
                    setPinningMessage(null);
                  } catch (error) {
                    console.error("Failed to pin message:", error);
                  }
                }}
                className="flex-1 px-4 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-content font-medium transition-colors"
              >
                Pin
              </button>
            </div>
          </div>
        </div>
      )}
      
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
              // updateMessageImage will handle OSS upload internally
              await updateMessageImage(currentMessage._id, reader.result);
              if (!isGroupChat && selectedUser?._id) {
                sendUploadingPhotoStatus(selectedUser._id, false);
              }
              setUpdatingImageMessage(null);
              toast.success("Image updated successfully");
            } catch (error) {
              console.error("Failed to update image:", error);
              toast.error("Failed to update image. Please try again.");
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

      {/* Forward Message Modal */}
      {forwardingMessage && (
        <ForwardMessageModal
          message={forwardingMessage}
          onClose={() => setForwardingMessage(null)}
        />
      )}

      {/* Forward Multiple Messages Modal */}
      {forwardingMessages && forwardingMessages.length > 0 && (
        <ForwardMultipleMessagesModal
          messages={forwardingMessages}
          onClose={() => setForwardingMessages(null)}
        />
      )}
    </div>
  );
};

export default ChatContainer;
