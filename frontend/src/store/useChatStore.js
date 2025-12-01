import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axois";
import { useAuthStore } from "./useAuthStore";

export const useChatStore = create((set, get) => ({
  messages: [],
  users: [],
  contacts: [],
  pendingRequests: [],
  isContactsLoading: false,
  isRequestsLoading: false,
  groups: [],
  selectedUser: null,
  selectedGroup: null,
  isUsersLoading: false,
  isGroupsLoading: false,
  isMessagesLoading: false,
  typingUsers: [],
  editingUsers: [],
  deletingUsers: [],
  uploadingPhotoUsers: [],
  groupTypingUsers: {}, // { groupId: [{ userId, senderName }] }
  groupEditingUsers: {}, // { groupId: [userId] }
  groupDeletingUsers: {}, // { groupId: [userId] }
  groupUploadingPhotoUsers: {}, // { groupId: [userId] }
  lastMessages: {},
  groupLastMessages: {},
  unreadMessages: {}, // { userId: count } or { groupId: count }
  setTypingUsers: (users) => set({ typingUsers: users }),

  getUsers: async () => {
    const state = get();
    const authUser = useAuthStore.getState().authUser;
    
    // Don't try to load users if not authenticated
    if (!authUser) {
      set({ users: [], lastMessages: {}, isUsersLoading: false });
      return;
    }
    
    // Only show loading if we don't have users data yet
    if (state.users.length === 0) {
      set({ isUsersLoading: true });
    }
    try {
      const [usersRes, lastMessagesRes] = await Promise.all([
        axiosInstance.get("/messages/users"),
        axiosInstance.get("/messages/last-messages")
      ]);

      const lastMessagesMap = {};
      if (!authUser || !authUser._id) {
        set({ users: [], lastMessages: {} });
        return;
      }
      const authUserId = typeof authUser._id === 'string' ? authUser._id : authUser._id.toString();
      
      if (lastMessagesRes.data && Array.isArray(lastMessagesRes.data)) {
        const normalizeId = (id) => {
          if (!id) return null;
          if (typeof id === 'string') return id;
          if (typeof id === 'object' && id._id) return id._id.toString();
          return id.toString();
        };
        
        const authUserIdNormalized = normalizeId(authUser._id);
        
        lastMessagesRes.data.forEach(msg => {
          // Get sender and receiver IDs, handling both object and string formats
          const senderIdRaw = msg.senderId;
          const receiverIdRaw = msg.receiverId;
          const senderId = normalizeId(senderIdRaw);
          const receiverId = normalizeId(receiverIdRaw);
          
          // Skip if senderId or receiverId is missing
          if (!senderId || !receiverId) return;
          
          // Determine target ID (the other user in the conversation)
          // If I'm the sender, target is receiver. If I'm the receiver, target is sender.
          const targetIdRaw = senderId === authUserIdNormalized ? receiverIdRaw : senderIdRaw;
          const targetIdStr = normalizeId(targetIdRaw);
          
          // Skip if targetId is missing
          if (!targetIdStr) return;
          
          // Store with multiple key formats for compatibility
          lastMessagesMap[targetIdStr] = msg;
          if (targetIdRaw && typeof targetIdRaw !== 'string') {
            lastMessagesMap[targetIdRaw] = msg;
          }
        });
      }

      // Remove duplicate users based on _id
      const uniqueUsers = [];
      const seenIds = new Set();
      const usersData = usersRes.data || [];
      
      // Add users from users endpoint
      usersData.forEach(user => {
        const userId = typeof user._id === 'string' ? user._id : user._id?.toString();
        if (userId && !seenIds.has(userId)) {
          seenIds.add(userId);
          uniqueUsers.push(user);
        }
      });

      // Also extract users from lastMessages if they're populated (as fallback)
      if (lastMessagesRes.data && Array.isArray(lastMessagesRes.data)) {
        lastMessagesRes.data.forEach(msg => {
          const senderIdRaw = msg.senderId;
          const receiverIdRaw = msg.receiverId;
          
          // Extract user data if populated
          [senderIdRaw, receiverIdRaw].forEach(userData => {
            if (userData && typeof userData === 'object' && userData._id && userData.fullname) {
              const userId = normalizeId(userData._id);
              // Only add if not already in users array and not the auth user
              if (userId && !seenIds.has(userId) && userId !== authUserIdNormalized) {
                seenIds.add(userId);
                uniqueUsers.push({
                  _id: userData._id,
                  fullname: userData.fullname || 'Unknown',
                  profilePic: userData.profilePic || null,
                  email: userData.email || null
                });
              }
            }
          });
        });
      }

      // Set lastMessages from server response
      // If messages were deleted from DB, they won't be in this response
      set({ 
        users: uniqueUsers,
        lastMessages: lastMessagesMap
      });
    } catch (error) {
      // Only log non-401 errors (401 is expected when not authenticated)
      if (error.response?.status !== 401) {
        console.error("Error loading users:", error);
        toast.error(error.response?.data?.message || error.response?.data?.error || "Failed to load users");
      }
      // Clear users on error (except 401)
      if (error.response?.status !== 401) {
        set({ users: [], lastMessages: {} });
      }
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getMessages: async (userId) => {
    set({ isMessagesLoading: true });
    try {
      const res = await axiosInstance.get(`/messages/${userId}`);
      set({ messages: res.data });

      const authUser = useAuthStore.getState().authUser;
      if (!authUser || !authUser._id) return;
      
      // Clear unread count for this user when viewing messages
      const userIdStr = typeof userId === 'string' ? userId : userId?.toString();
      set((state) => ({
        unreadMessages: {
          ...state.unreadMessages,
          [userIdStr]: 0,
          [userId]: 0 // Also clear with original format
        }
      }));
      
      // Normalize IDs for comparison
      const normalizeId = (id) => {
        if (!id) return null;
        if (typeof id === 'string') return id;
        if (typeof id === 'object' && id._id) return id._id.toString();
        return id.toString();
      };
      
      // Only mark messages as seen if we actually loaded messages (not empty array)
      // This prevents marking messages as seen if the conversation was deleted
      if (res.data && res.data.length > 0) {
        const authUserId = normalizeId(authUser._id);
        const unseenMessages = res.data.filter(msg => {
          if (msg.seen) return false;
          const msgSenderId = normalizeId(msg.senderId);
          return msgSenderId !== authUserId;
        });
        
        if (unseenMessages.length > 0) {
          const socket = useAuthStore.getState().socket;
          if (socket) {
            unseenMessages.forEach((msg) => {
              const msgSenderId = normalizeId(msg.senderId);
              socket.emit("messageSeen", { messageId: msg._id, senderId: msgSenderId });
            });
          }
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load messages");
    } finally {
      set({ isMessagesLoading: false });
    }
  },

  sendMessage: async (messageData) => {
    const { selectedUser } = get();
    try {
      await axiosInstance.post(`/messages/send/${selectedUser._id}`, messageData);
      // Don't add message here - let socket handler add it to prevent duplicates
      // The socket event will handle adding the message in real-time
    } catch (error) {
      // Only log non-401 errors (401 is expected when not authenticated)
      if (error.response?.status !== 401) {
        toast.error(error.response?.data?.message || "Failed to send message");
      }
    }
  },

  editMessage: async (messageId, text) => {
    try {
      const res = await axiosInstance.put(`/messages/edit/${messageId}`, { text });
      const editedMessage = res.data;
      const authUser = useAuthStore.getState().authUser;
      if (!authUser || !authUser._id) return;
      
      set((state) => {
        // Update messages array
        const updatedMessages = state.messages.map((msg) =>
          msg._id === messageId ? editedMessage : msg
        );

        // Check if this is a group message or direct message
        if (editedMessage.groupId) {
          // Group message - update groupLastMessages
          const updatedGroupLastMessages = { ...state.groupLastMessages };
          const lastMessage = updatedGroupLastMessages[editedMessage.groupId];
          if (lastMessage && lastMessage._id === messageId) {
            updatedGroupLastMessages[editedMessage.groupId] = editedMessage;
          }
          return {
            messages: updatedMessages,
            groupLastMessages: updatedGroupLastMessages
          };
        } else {
          // Direct message - update lastMessages
          const normalizeId = (id) => {
            if (!id) return null;
            if (typeof id === 'string') return id;
            if (typeof id === 'object' && id._id) return id._id.toString();
            return id.toString();
          };
          
          const authUserId = normalizeId(authUser._id);
          const senderId = normalizeId(editedMessage.senderId);
          const receiverId = normalizeId(editedMessage.receiverId);
          
          // Determine target ID (the other user in the conversation)
          const targetIdRaw = senderId === authUserId ? editedMessage.receiverId : editedMessage.senderId;
          const targetIdStr = normalizeId(targetIdRaw);
          
          const updatedLastMessages = { ...state.lastMessages };
          
          // Check all possible keys for the last message
          let lastMessage = null;
          let lastMessageKey = null;
          Object.keys(updatedLastMessages).forEach((key) => {
            const normalizedKey = normalizeId(key);
            if (normalizedKey === targetIdStr && updatedLastMessages[key]) {
              lastMessage = updatedLastMessages[key];
              lastMessageKey = key;
            }
          });
          
          if (lastMessage && normalizeId(lastMessage._id) === normalizeId(messageId)) {
            // Update with multiple key formats for compatibility
            updatedLastMessages[targetIdStr] = editedMessage;
            if (lastMessageKey && lastMessageKey !== targetIdStr) {
              updatedLastMessages[lastMessageKey] = editedMessage;
            }
            if (targetIdRaw && typeof targetIdRaw !== 'string') {
              updatedLastMessages[targetIdRaw] = editedMessage;
            }
          }

          return {
            messages: updatedMessages,
            lastMessages: updatedLastMessages
          };
        }
      });
      return editedMessage;
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to edit message");
      throw error;
    }
  },

  deleteMessage: async (messageId, deleteType = "forEveryone") => {
    try {
      // Optimistically remove message from UI for immediate feedback
      if (deleteType === "forEveryone") {
        set((state) => {
          const normalizeId = (id) => {
            if (!id) return null;
            if (typeof id === 'string') return id;
            if (typeof id === 'object' && id._id) return id._id.toString();
            return id.toString();
          };
          
          const targetId = normalizeId(messageId);
          const updatedMessages = state.messages.filter((msg) => {
            const msgId = normalizeId(msg._id);
            return msgId !== targetId;
          });
          
          return { messages: updatedMessages };
        });
      }
      
      await axiosInstance.delete(`/messages/${messageId}`, {
        data: { deleteType }
      });
      // Socket event will confirm and handle proper state updates (including lastMessages)
      // The optimistic update above gives immediate UI feedback
    } catch (error) {
      // If delete fails, reload messages to restore state
      const state = get();
      if (state.selectedUser?._id) {
        get().getMessages(state.selectedUser._id);
      } else if (state.selectedGroup?._id) {
        get().getGroupMessages(state.selectedGroup._id);
      }
      toast.error(error.response?.data?.error || "Failed to delete message");
      throw error;
    }
  },

  updateMessageImage: async (messageId, image) => {
    try {
      const res = await axiosInstance.put(`/messages/update-image/${messageId}`, { image });
      const updatedMessage = res.data;
      const authUser = useAuthStore.getState().authUser;
      if (!authUser || !authUser._id) return;
      
      set((state) => {
        // Update messages array
        const updatedMessages = state.messages.map((msg) =>
          msg._id === messageId ? updatedMessage : msg
        );

        // Check if this is a group message or direct message
        if (updatedMessage.groupId) {
          // Group message - update groupLastMessages
          const updatedGroupLastMessages = { ...state.groupLastMessages };
          const lastMessage = updatedGroupLastMessages[updatedMessage.groupId];
          if (lastMessage && lastMessage._id === messageId) {
            updatedGroupLastMessages[updatedMessage.groupId] = updatedMessage;
          }
          return {
            messages: updatedMessages,
            groupLastMessages: updatedGroupLastMessages
          };
        } else {
          // Direct message - update lastMessages
          const normalizeId = (id) => {
            if (!id) return null;
            if (typeof id === 'string') return id;
            if (typeof id === 'object' && id._id) return id._id.toString();
            return id.toString();
          };
          
          const authUserId = normalizeId(authUser._id);
          const senderId = normalizeId(updatedMessage.senderId);
          
          // Determine target ID (the other user in the conversation)
          const targetIdRaw = senderId === authUserId ? updatedMessage.receiverId : updatedMessage.senderId;
          const targetIdStr = normalizeId(targetIdRaw);
          
          const updatedLastMessages = { ...state.lastMessages };
          
          // Check all possible keys for the last message
          let lastMessage = null;
          let lastMessageKey = null;
          Object.keys(updatedLastMessages).forEach((key) => {
            const normalizedKey = normalizeId(key);
            if (normalizedKey === targetIdStr && updatedLastMessages[key]) {
              lastMessage = updatedLastMessages[key];
              lastMessageKey = key;
            }
          });
          
          if (lastMessage && normalizeId(lastMessage._id) === normalizeId(messageId)) {
            // Update with multiple key formats for compatibility
            updatedLastMessages[targetIdStr] = updatedMessage;
            if (lastMessageKey && lastMessageKey !== targetIdStr) {
              updatedLastMessages[lastMessageKey] = updatedMessage;
            }
            if (targetIdRaw && typeof targetIdRaw !== 'string') {
              updatedLastMessages[targetIdRaw] = updatedMessage;
            }
          }

          return {
            messages: updatedMessages,
            lastMessages: updatedLastMessages
          };
        }
      });
      return updatedMessage;
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to update image");
      throw error;
    }
  },

  subscribeToMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) {
      console.log("⚠️ subscribeToMessages: No socket available");
      return;
    }

    console.log("✅ Setting up socket listeners for messages");

    // Remove existing listeners first to prevent duplicates
    socket.off("newMessage");
    socket.off("messageSeenUpdate");
    socket.off("messageEdited");
    socket.off("messageDeleted");
    socket.off("conversationDeleted");

    socket.on("newMessage", (newMessage) => {
      set(state => {
        // Always update last messages for all users
        const authUser = useAuthStore.getState().authUser;
        if (!authUser || !authUser._id) return state;
        
        // Normalize IDs for comparison
        const normalizeId = (id) => {
          if (!id) return null;
          if (typeof id === 'string') return id;
          if (typeof id === 'object' && id._id) return id._id.toString();
          return id.toString();
        };
        
        // Get sender and receiver IDs, handling both object and string formats
        const senderIdRaw = newMessage.senderId;
        const receiverIdRaw = newMessage.receiverId;
        const senderId = normalizeId(senderIdRaw);
        const receiverId = normalizeId(receiverIdRaw);
        const authUserId = normalizeId(authUser._id);
        
        if (!senderId || !receiverId || !authUserId) return state;
        
        // Determine target ID (the other user in the conversation)
        // If I'm the sender, target is receiver. If I'm the receiver, target is sender.
        const targetId = senderId === authUserId ? receiverId : senderId;
        const targetIdStr = targetId;
        
        // Check if message already exists to prevent duplicates
        const messageExists = state.messages.some(msg => msg._id === newMessage._id);
        
        // Update messages array only if from selected user and message doesn't exist
        const currentSelectedUser = state.selectedUser;
        let isSelectedChat = false;
        
        if (currentSelectedUser) {
          const selectedUserIdNormalized = normalizeId(currentSelectedUser._id);
          const normalizedReceiverId = normalizeId(receiverIdRaw);
          const normalizedSenderId = normalizeId(senderIdRaw);
          
          // Check if this message is for the currently selected chat
          // The message belongs to the selected chat if:
          // - I'm the sender (senderId === authUserId) and selectedUser is the receiver (selectedUserId === receiverId), OR
          // - I'm the receiver (senderId !== authUserId) and selectedUser is the sender (selectedUserId === senderId)
          // Also check targetIdStr as a fallback
          isSelectedChat = selectedUserIdNormalized && (
            // Case 1: I'm the sender, selectedUser is the receiver
            (senderId === authUserId && selectedUserIdNormalized === normalizedReceiverId) ||
            // Case 2: I'm the receiver, selectedUser is the sender
            (senderId !== authUserId && selectedUserIdNormalized === normalizedSenderId) ||
            // Case 3: Fallback - check targetIdStr
            (targetIdStr && selectedUserIdNormalized === targetIdStr)
          );
        }
        
        // Always add message if it's for the selected chat (whether sender or receiver)
        const updatedMessages = isSelectedChat && !messageExists
          ? [...state.messages, newMessage]
          : state.messages;

        // Update last messages for the conversation (store with both string and object ID keys for compatibility)
        const updatedLastMessages = {
          ...state.lastMessages,
          [targetIdStr]: newMessage,
        };
        
        // Also store with original format keys for compatibility
        if (receiverIdRaw && normalizeId(receiverIdRaw) === targetIdStr) {
          updatedLastMessages[receiverId] = newMessage;
          if (typeof receiverIdRaw === 'object' && receiverIdRaw._id) {
            updatedLastMessages[receiverIdRaw._id.toString()] = newMessage;
          }
        }
        if (senderIdRaw && normalizeId(senderIdRaw) === targetIdStr) {
          updatedLastMessages[senderId] = newMessage;
          if (typeof senderIdRaw === 'object' && senderIdRaw._id) {
            updatedLastMessages[senderIdRaw._id.toString()] = newMessage;
          }
        }

        // Ensure the other user is in the users array so they appear in conversations list
        // Extract user data from populated senderId/receiverId if available
        let updatedUsers = [...state.users];
        let targetUser = null;
        
        // Get the target user from the message (sender if I'm receiver, receiver if I'm sender)
        if (senderId === authUserId) {
          // I'm the sender, so target is the receiver
          if (receiverIdRaw && typeof receiverIdRaw === 'object' && receiverIdRaw.fullname) {
            targetUser = receiverIdRaw;
          }
        } else {
          // I'm the receiver, so target is the sender
          if (senderIdRaw && typeof senderIdRaw === 'object' && senderIdRaw.fullname) {
            targetUser = senderIdRaw;
          }
        }
        
        // Add target user to users array if not already present
        if (targetUser && targetUser._id) {
          const targetUserId = normalizeId(targetUser._id);
          const userExists = updatedUsers.some(u => normalizeId(u._id) === targetUserId);
          
          if (!userExists) {
            // Add the user to the array with proper structure
            updatedUsers.push({
              _id: targetUser._id,
              fullname: targetUser.fullname || 'Unknown',
              profilePic: targetUser.profilePic || null,
              email: targetUser.email || null
            });
          }
        }

        // Update unread count if message is from someone else and not currently viewing this chat
        const isIncomingMessage = senderId !== authUserId;
        const updatedUnreadMessages = { ...state.unreadMessages };
        
        if (isIncomingMessage && !isSelectedChat) {
          updatedUnreadMessages[targetIdStr] = (updatedUnreadMessages[targetIdStr] || 0) + 1;
        }

        return {
          messages: updatedMessages,
          users: updatedUsers,
          lastMessages: updatedLastMessages,
          unreadMessages: updatedUnreadMessages
        };
      });
    });

    socket.on("messageSeenUpdate", ({ messageId, seenAt }) => {
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg._id === messageId 
            ? { ...msg, seen: true, seenAt: seenAt || new Date().toISOString() } 
            : msg
        ),
      }));
    });

    socket.on("messageEdited", (editedMessage) => {
      console.log("📝 Received messageEdited event:", editedMessage);
      set((state) => {
        const authUser = useAuthStore.getState().authUser;
        if (!authUser || !authUser._id || !editedMessage) {
          console.log("⚠️ messageEdited: Missing authUser or editedMessage");
          return state;
        }
        
        // Normalize IDs for consistent comparison
        const normalizeId = (id) => {
          if (!id) return null;
          if (typeof id === 'string') return id;
          if (typeof id === 'object' && id._id) return id._id.toString();
          return id.toString();
        };
        
        const editedMessageId = normalizeId(editedMessage._id);
        if (!editedMessageId) {
          console.log("⚠️ messageEdited: No editedMessageId found");
          return state;
        }
        
        console.log(`✅ Processing messageEdited for message ${editedMessageId}`);
        
        // Determine user IDs for chat matching
        const authUserId = normalizeId(authUser._id);
        const senderIdRaw = editedMessage.senderId;
        const receiverIdRaw = editedMessage.receiverId;
        const senderId = normalizeId(senderIdRaw);
        const receiverId = normalizeId(receiverIdRaw);
        
        // Always update messages array if the edited message exists in it
        // This ensures real-time updates for the user viewing the chat
        let messageUpdated = false;
        const updatedMessages = state.messages.map((msg) => {
          const msgId = normalizeId(msg._id);
          if (msgId === editedMessageId) {
            messageUpdated = true;
            // Replace entire message object with edited version (includes edited flag and new text)
            // This ensures the UI shows the updated text and edited indicator
            // Return the complete edited message object from the server
            return editedMessage;
          }
          return msg;
        });
        
        // If message wasn't found but should be in this chat, add it (edge case)
        // This shouldn't normally happen, but ensures robustness
        if (!messageUpdated && state.messages.length > 0) {
          // Message might not be in array yet, but socket event says it was edited
          // This can happen if messages array is stale - in this case, lastMessages update is enough
        }
        
        // Determine target ID (the other user in the conversation)
        const targetIdRaw = senderId === authUserId ? receiverIdRaw : senderIdRaw;
        const targetIdStr = normalizeId(targetIdRaw);
        
        if (!targetIdStr) return { messages: updatedMessages, lastMessages: state.lastMessages };
        
        // Always update lastMessages if this message is in it
        const updatedLastMessages = { ...state.lastMessages };
        let shouldUpdateLastMessages = false;
        
        // Check all possible keys for the last message
        Object.keys(updatedLastMessages).forEach((key) => {
          const normalizedKey = normalizeId(key);
          const lastMsg = updatedLastMessages[key];
          
          // Update if this key matches the target user AND the message ID matches
          if (normalizedKey === targetIdStr && lastMsg) {
            const lastMsgId = normalizeId(lastMsg._id);
            if (lastMsgId === editedMessageId) {
              shouldUpdateLastMessages = true;
              // Update with multiple key formats for compatibility
              updatedLastMessages[targetIdStr] = editedMessage;
              if (key !== targetIdStr) {
                updatedLastMessages[key] = editedMessage;
              }
              if (targetIdRaw && typeof targetIdRaw !== 'string') {
                updatedLastMessages[targetIdRaw] = editedMessage;
              }
            }
          }
        });
        
        // If message is in lastMessages but wasn't found above, add it anyway
        // This ensures the conversation list shows the edited message
        if (!shouldUpdateLastMessages && updatedLastMessages[targetIdStr]) {
          const existingLastMsg = updatedLastMessages[targetIdStr];
          if (existingLastMsg && normalizeId(existingLastMsg._id) === editedMessageId) {
            updatedLastMessages[targetIdStr] = editedMessage;
            if (targetIdRaw && typeof targetIdRaw !== 'string') {
              updatedLastMessages[targetIdRaw] = editedMessage;
            }
          }
        }

        const hasChanges = messageUpdated || shouldUpdateLastMessages;
        if (hasChanges) {
          console.log(`✅ messageEdited: Updated message ${editedMessageId} in state`);
        } else {
          console.log(`⚠️ messageEdited: No changes made for message ${editedMessageId}`);
        }

        return {
          messages: updatedMessages,
          lastMessages: updatedLastMessages
        };
      });
    });

    socket.on("conversationDeleted", ({ userId, deleteType = "forEveryone" }) => {
      console.log("🗑️ Received conversationDeleted event:", { userId, deleteType });
      set((state) => {
        const authUser = useAuthStore.getState().authUser;
        if (!authUser || !authUser._id) {
          console.log("⚠️ conversationDeleted: Missing authUser");
          return state;
        }
        
        const normalizeId = (id) => {
          if (!id) return null;
          if (typeof id === 'string') return id;
          if (typeof id === 'object' && id._id) return id._id.toString();
          return id.toString();
        };
        
        const userIdNormalized = normalizeId(userId);
        const authUserIdNormalized = normalizeId(authUser._id);
        
        console.log(`🗑️ Processing conversationDeleted for userId: ${userIdNormalized}, authUserId: ${authUserIdNormalized}, deleteType: ${deleteType}`);
        
        // For "forEveryone", both users should remove the conversation
        // For "forMe", only the user who deleted should remove it
        // Since this socket event is sent to the appropriate user(s), we always remove
        // Remove from lastMessages - check all keys and remove matching ones
        const updatedLastMessages = { ...state.lastMessages };
        const keysToDelete = [];
        Object.keys(updatedLastMessages).forEach((key) => {
          const normalizedKey = normalizeId(key);
          if (normalizedKey === userIdNormalized) {
            keysToDelete.push(key);
          }
        });
        keysToDelete.forEach(key => {
          delete updatedLastMessages[key];
          console.log(`🗑️ Removed lastMessage for key: ${key}`);
        });
        
        // Remove from unreadMessages - check all keys and remove matching ones
        const updatedUnreadMessages = { ...state.unreadMessages };
        const unreadKeysToDelete = [];
        Object.keys(updatedUnreadMessages).forEach((key) => {
          const normalizedKey = normalizeId(key);
          if (normalizedKey === userIdNormalized) {
            unreadKeysToDelete.push(key);
          }
        });
        unreadKeysToDelete.forEach(key => {
          delete updatedUnreadMessages[key];
          console.log(`🗑️ Removed unreadMessages for key: ${key}`);
        });
        
        // Clear messages if this conversation was selected
        const currentSelectedUserId = state.selectedUser?._id ? normalizeId(state.selectedUser._id) : null;
        const shouldClearMessages = currentSelectedUserId === userIdNormalized;
        
        console.log(`🗑️ Conversation deleted - lastMessages keys removed: ${keysToDelete.length}, unreadMessages keys removed: ${unreadKeysToDelete.length}, clearMessages: ${shouldClearMessages}`);
        
        return {
          lastMessages: updatedLastMessages,
          unreadMessages: updatedUnreadMessages,
          messages: shouldClearMessages ? [] : state.messages,
          selectedUser: shouldClearMessages ? null : state.selectedUser
        };
      });
    });

    socket.on("messageDeleted", ({ messageId, deleteType = "forEveryone", newLastMessage, conversationDeleted }) => {
      console.log("🗑️ Received messageDeleted event:", { messageId, deleteType, hasNewLastMessage: !!newLastMessage, conversationDeleted });
      set((state) => {
        const authUser = useAuthStore.getState().authUser;
        if (!authUser || !authUser._id) {
          console.log("⚠️ messageDeleted: Missing authUser");
          return state;
        }
        
        // Normalize IDs for comparison
        const normalizeId = (id) => {
          if (!id) return null;
          if (typeof id === 'string') return id;
          if (typeof id === 'object' && id._id) return id._id.toString();
          return id.toString();
        };
        
        // Find the deleted message to check if user is sender or receiver
        const deletedMessage = state.messages.find((msg) => {
          const msgId = normalizeId(msg._id);
          const targetId = normalizeId(messageId);
          return msgId === targetId;
        });
        
        // If message not found in current messages, still update lastMessages if needed
        if (!deletedMessage) {
          // Check if we need to update lastMessages even if message isn't in current view
          const updatedLastMessages = { ...state.lastMessages };
          let foundDeletedInLastMessages = false;
          const keysToUpdate = [];
          const targetUserIds = new Set();
          
          // Check all lastMessages to see if any match the deleted message ID
          Object.keys(updatedLastMessages).forEach((key) => {
            const lastMsg = updatedLastMessages[key];
            if (lastMsg && normalizeId(lastMsg._id) === normalizeId(messageId)) {
              foundDeletedInLastMessages = true;
              
              // Find the target user ID from this last message
              const msgSenderId = normalizeId(lastMsg.senderId);
              const msgReceiverId = normalizeId(lastMsg.receiverId);
              const authUserId = normalizeId(useAuthStore.getState().authUser?._id);
              const msgTargetId = msgSenderId === authUserId ? msgReceiverId : msgSenderId;
              
              if (msgTargetId) {
                targetUserIds.add(msgTargetId);
                keysToUpdate.push({ key, targetId: msgTargetId });
              }
            }
          });
          
          // Update or remove lastMessages based on newLastMessage from backend
          if (foundDeletedInLastMessages) {
            if (conversationDeleted || !newLastMessage) {
              // Conversation is now empty, remove all matching keys
              keysToUpdate.forEach(({ key }) => {
                delete updatedLastMessages[key];
              });
            } else if (newLastMessage) {
              // Update with new last message from backend
              const authUserId = normalizeId(useAuthStore.getState().authUser?._id);
              const senderId = normalizeId(newLastMessage.senderId);
              const receiverId = normalizeId(newLastMessage.receiverId);
              const targetId = senderId === authUserId ? receiverId : senderId;
              const targetIdStr = normalizeId(targetId);
              
              keysToUpdate.forEach(({ key, targetId: msgTargetId }) => {
                if (normalizeId(msgTargetId) === targetIdStr) {
                  updatedLastMessages[targetIdStr] = newLastMessage;
                  if (key !== targetIdStr) {
                    updatedLastMessages[key] = newLastMessage;
                  }
                } else {
                  delete updatedLastMessages[key];
                }
              });
            }
            
            return { lastMessages: updatedLastMessages };
          }
          
          return state;
        }
        
        const authUserId = normalizeId(authUser._id);
        const deletedSenderId = normalizeId(deletedMessage.senderId);
        const deletedReceiverId = normalizeId(deletedMessage.receiverId);
        const isMyMessage = deletedSenderId === authUserId;
        const isReceiver = deletedReceiverId === authUserId;
        
        // For "forMe" deletions: if I received this event, it means I'm the one who deleted it
        // So I should always remove it from my view (regardless of whether I'm sender or receiver)
        // For "forEveryone" deletions: always remove from everyone's view
        let shouldRemove = false;
        if (deleteType === "forEveryone") {
          shouldRemove = true; // Always remove when deleted for everyone
        } else if (deleteType === "forMe") {
          // If I received a "forMe" delete event, it means I deleted it, so always remove from my view
          // The backend only sends "forMe" events to the user who performed the deletion
          shouldRemove = true;
        }
        
        // Remove message from messages array only if shouldRemove is true
        const updatedMessages = shouldRemove
          ? state.messages.filter((msg) => {
              const msgId = normalizeId(msg._id);
              const targetId = normalizeId(messageId);
              return msgId !== targetId;
            })
          : state.messages;

        // Update lastMessages if this was the last message and it was removed
        const updatedLastMessages = { ...state.lastMessages };
        
        if (shouldRemove && deletedMessage && !deletedMessage.groupId) {
          // Determine the target user ID (the other user in the conversation)
          // If I'm the sender, target is receiver. If I'm the receiver, target is sender.
          const targetIdRaw = isMyMessage 
            ? deletedMessage.receiverId 
            : deletedMessage.senderId;
          
          const targetIdStr = normalizeId(targetIdRaw);
          
          // Check all possible keys for the last message (string and object formats)
          let lastMessage = null;
          let lastMessageKey = null;
          
          // Try to find last message using various key formats
          Object.keys(updatedLastMessages).forEach((key) => {
            const normalizedKey = normalizeId(key);
            if (normalizedKey === targetIdStr && updatedLastMessages[key]) {
              lastMessage = updatedLastMessages[key];
              lastMessageKey = key;
            }
          });
          
          if (lastMessage && normalizeId(lastMessage._id) === normalizeId(messageId)) {
            // Use newLastMessage from backend if provided (more reliable than searching in current messages)
            if (newLastMessage) {
              // Update with new last message from backend
              updatedLastMessages[targetIdStr] = newLastMessage;
              if (lastMessageKey && lastMessageKey !== targetIdStr) {
                updatedLastMessages[lastMessageKey] = newLastMessage;
              }
              if (targetIdRaw && typeof targetIdRaw !== 'string') {
                updatedLastMessages[targetIdRaw] = newLastMessage;
              }
            } else if (!conversationDeleted) {
              // Try to find new last message from current messages (fallback)
              const foundNewLastMessage = updatedMessages
                .filter((msg) => {
                  if (!msg || !msg.senderId || !msg.receiverId) return false;
                  const msgSenderId = normalizeId(msg.senderId);
                  const msgReceiverId = normalizeId(msg.receiverId);
                  // Determine target ID for this message
                  const msgTargetId = msgSenderId === authUserId ? msgReceiverId : msgSenderId;
                  return msgTargetId && normalizeId(msgTargetId) === targetIdStr;
                })
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
              
              if (foundNewLastMessage) {
                updatedLastMessages[targetIdStr] = foundNewLastMessage;
                if (lastMessageKey && lastMessageKey !== targetIdStr) {
                  updatedLastMessages[lastMessageKey] = foundNewLastMessage;
                }
                if (targetIdRaw && typeof targetIdRaw !== 'string') {
                  updatedLastMessages[targetIdRaw] = foundNewLastMessage;
                }
              } else {
                // No more messages in this conversation, remove all key formats
                delete updatedLastMessages[targetIdStr];
                if (lastMessageKey && lastMessageKey !== targetIdStr) {
                  delete updatedLastMessages[lastMessageKey];
                }
                if (targetIdRaw && typeof targetIdRaw !== 'string') {
                  delete updatedLastMessages[targetIdRaw];
                }
              }
            } else {
              // Conversation is deleted (no messages remain), remove all key formats
              delete updatedLastMessages[targetIdStr];
              if (lastMessageKey && lastMessageKey !== targetIdStr) {
                delete updatedLastMessages[lastMessageKey];
              }
              if (targetIdRaw && typeof targetIdRaw !== 'string') {
                delete updatedLastMessages[targetIdRaw];
              }
            }
          }
        }

        return {
          messages: updatedMessages,
          lastMessages: updatedLastMessages
        };
      });
    });
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    
    socket.off("newMessage");
    socket.off("messageSeenUpdate");
    socket.off("messageEdited");
    socket.off("messageDeleted");
    socket.off("conversationDeleted");
  },

  subscribeToTyping: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    
    set({ typingUsers: [], editingUsers: [], deletingUsers: [], uploadingPhotoUsers: [] });

    socket.on("typing", ({ senderId }) => {
      set((state) => ({
        typingUsers: [...new Set([...state.typingUsers, senderId])]
      }));
    });

    socket.on("stopTyping", ({ senderId }) => {
      set((state) => {
        const updatedTypingUsers = state.typingUsers.filter(id => id !== senderId);
        return { typingUsers: updatedTypingUsers };
      });
    });

    // Editing indicator listeners
    socket.on("editing", ({ senderId }) => {
      set((state) => ({
        editingUsers: [...new Set([...state.editingUsers, senderId])]
      }));
    });

    socket.on("stopEditing", ({ senderId }) => {
      set((state) => {
        const updatedEditingUsers = state.editingUsers.filter(id => id !== senderId);
        return { editingUsers: updatedEditingUsers };
      });
    });

    // Deleting indicator listeners
    socket.on("deleting", ({ senderId }) => {
      set((state) => ({
        deletingUsers: [...new Set([...state.deletingUsers, senderId])]
      }));
    });

    socket.on("stopDeleting", ({ senderId }) => {
      set((state) => {
        const updatedDeletingUsers = state.deletingUsers.filter(id => id !== senderId);
        return { deletingUsers: updatedDeletingUsers };
      });
    });

    // Uploading photo indicator listeners
    socket.on("uploadingPhoto", ({ senderId }) => {
      set((state) => ({
        uploadingPhotoUsers: [...new Set([...state.uploadingPhotoUsers, senderId])]
      }));
    });

    socket.on("stopUploadingPhoto", ({ senderId }) => {
      set((state) => {
        const updatedUploadingPhotoUsers = state.uploadingPhotoUsers.filter(id => id !== senderId);
        return { uploadingPhotoUsers: updatedUploadingPhotoUsers };
      });
    });
  },

  unsubscribeFromTyping: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    
    socket.off("typing");
    socket.off("stopTyping");
    socket.off("editing");
    socket.off("stopEditing");
    socket.off("deleting");
    socket.off("stopDeleting");
    socket.off("uploadingPhoto");
    socket.off("stopUploadingPhoto");
  },

  sendTypingStatus: (receiverId, isTyping) => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    
    if (isTyping) {
      socket.emit("typing", { receiverId });
    } else {
      socket.emit("stopTyping", { receiverId });
    }
  },

  sendEditingStatus: (receiverId, isEditing) => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    
    if (isEditing) {
      socket.emit("editing", { receiverId });
    } else {
      socket.emit("stopEditing", { receiverId });
    }
  },

  sendDeletingStatus: (receiverId, isDeleting) => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    
    if (isDeleting) {
      socket.emit("deleting", { receiverId });
    } else {
      socket.emit("stopDeleting", { receiverId });
    }
  },

  sendUploadingPhotoStatus: (receiverId, isUploading) => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    
    if (isUploading) {
      socket.emit("uploadingPhoto", { receiverId });
    } else {
      socket.emit("stopUploadingPhoto", { receiverId });
    }
  },

  // Group status indicators
  sendGroupTypingStatus: (groupId, isTyping) => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    
    if (isTyping) {
      socket.emit("groupTyping", { groupId });
    } else {
      socket.emit("groupStopTyping", { groupId });
    }
  },

  sendGroupEditingStatus: (groupId, isEditing) => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    
    if (isEditing) {
      socket.emit("groupEditing", { groupId });
    } else {
      socket.emit("groupStopEditing", { groupId });
    }
  },

  sendGroupDeletingStatus: (groupId, isDeleting) => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    
    if (isDeleting) {
      socket.emit("groupDeleting", { groupId });
    } else {
      socket.emit("groupStopDeleting", { groupId });
    }
  },

  sendGroupUploadingPhotoStatus: (groupId, isUploading) => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    
    if (isUploading) {
      socket.emit("groupUploadingPhoto", { groupId });
    } else {
      socket.emit("groupStopUploadingPhoto", { groupId });
    }
  },

  setSelectedUser: (selectedUser) => {
    set({ selectedUser, selectedGroup: null });
  },

  // Group functions
  getGroups: async () => {
    const authUser = useAuthStore.getState().authUser;
    
    // Don't try to load groups if not authenticated
    if (!authUser) {
      set({ groups: [], groupLastMessages: {}, isGroupsLoading: false });
      return;
    }
    
    const state = get();
    // Only show loading if we don't have groups data yet
    if (state.groups.length === 0) {
      set({ isGroupsLoading: true });
    }
    try {
      const [groupsRes, lastMessagesRes] = await Promise.all([
        axiosInstance.get("/groups/my-groups"),
        axiosInstance.get("/groups/last-messages")
      ]);

      const groupLastMessagesMap = {};
      const normalizeId = (id) => {
        if (!id) return null;
        if (typeof id === 'string') return id;
        if (typeof id === 'object' && id._id) return id._id.toString();
        return id?.toString();
      };
      
      lastMessagesRes.data.forEach(msg => {
        const groupId = normalizeId(msg.groupId);
        if (groupId) {
          // Store with normalized key for consistency
          groupLastMessagesMap[groupId] = msg;
        }
      });

      set({ 
        groups: groupsRes.data,
        groupLastMessages: groupLastMessagesMap
      });
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to load groups");
    } finally {
      set({ isGroupsLoading: false });
    }
  },

  subscribeToGroups: () => {
    const socket = useAuthStore.getState().socket;
    const authUser = useAuthStore.getState().authUser;
    if (!authUser || !authUser._id || !socket) return;

    // Remove existing listeners first to prevent duplicates
    socket.off("groupCreated");
    socket.off("addedToGroup");
    socket.off("removedFromGroup");
    socket.off("groupDeleted");
    socket.off("groupTyping");
    socket.off("groupStopTyping");
    socket.off("groupEditing");
    socket.off("groupStopEditing");
    socket.off("groupDeleting");
    socket.off("groupStopDeleting");
    socket.off("groupUploadingPhoto");
    socket.off("groupStopUploadingPhoto");
    socket.off("newGroupMessage");

    socket.on("groupCreated", ({ group, memberId }) => {
      if (!authUser || !authUser._id || memberId !== authUser._id.toString()) return;
      set(state => ({
        groups: [group, ...state.groups]
      }));
    });

    socket.on("addedToGroup", ({ group, memberId }) => {
      if (!authUser || !authUser._id || memberId !== authUser._id.toString()) return;
      set(state => {
        // Check if group already exists
        const groupExists = state.groups.some(g => g._id === group._id);
        if (!groupExists) {
          return { groups: [group, ...state.groups] };
        }
        return state;
      });
      toast.success(`You were added to ${group.name}`);
    });

    socket.on("removedFromGroup", ({ group, memberId }) => {
      if (!authUser || !authUser._id || memberId !== authUser._id.toString()) return;
      set(state => ({
        groups: state.groups.filter(g => {
          const gId = typeof g._id === 'string' ? g._id : g._id?.toString();
          const groupId = typeof group._id === 'string' ? group._id : group._id?.toString();
          return gId !== groupId;
        })
      }));
      toast.success(`You were removed from ${group.name}`);
    });

    // Global group status indicators (for group list)
    const normalizeId = (id) => {
      if (!id) return null;
      if (typeof id === 'string') return id;
      if (typeof id === 'object' && id._id) return id._id.toString();
      return id.toString();
    };

    socket.on("groupTyping", ({ groupId, senderId, senderName }) => {
      const authUserId = normalizeId(authUser._id);
      if (normalizeId(senderId) === authUserId) return; // Don't show own typing
      
      set(state => {
        const groupIdStr = normalizeId(groupId);
        // Check both normalized and original format
        const currentTyping = state.groupTypingUsers[groupIdStr] || state.groupTypingUsers[groupId] || [];
        const exists = currentTyping.some(u => normalizeId(u.userId) === normalizeId(senderId));
        
        if (!exists) {
          return {
            groupTypingUsers: {
              ...state.groupTypingUsers,
              [groupIdStr]: [...currentTyping, { userId: senderId, senderName: senderName || "Someone" }]
            }
          };
        }
        return state;
      });
    });

    socket.on("groupStopTyping", ({ groupId, senderId }) => {
      set(state => {
        const groupIdStr = normalizeId(groupId);
        const currentTyping = state.groupTypingUsers[groupIdStr] || state.groupTypingUsers[groupId] || [];
        return {
          groupTypingUsers: {
            ...state.groupTypingUsers,
            [groupIdStr]: currentTyping.filter(u => normalizeId(u.userId) !== normalizeId(senderId))
          }
        };
      });
    });

    socket.on("groupEditing", ({ groupId, senderId }) => {
      const authUserId = normalizeId(authUser._id);
      if (normalizeId(senderId) === authUserId) return; // Don't show own editing
      
      set(state => {
        const groupIdStr = normalizeId(groupId);
        const currentEditing = state.groupEditingUsers[groupIdStr] || state.groupEditingUsers[groupId] || [];
        const senderIdStr = normalizeId(senderId);
        const exists = currentEditing.some(id => normalizeId(id) === senderIdStr);
        
        if (!exists) {
          return {
            groupEditingUsers: {
              ...state.groupEditingUsers,
              [groupIdStr]: [...currentEditing, senderId]
            }
          };
        }
        return state;
      });
    });

    socket.on("groupStopEditing", ({ groupId, senderId }) => {
      set(state => {
        const groupIdStr = normalizeId(groupId);
        const senderIdStr = normalizeId(senderId);
        const currentEditing = state.groupEditingUsers[groupIdStr] || state.groupEditingUsers[groupId] || [];
        return {
          groupEditingUsers: {
            ...state.groupEditingUsers,
            [groupIdStr]: currentEditing.filter(id => normalizeId(id) !== senderIdStr)
          }
        };
      });
    });

    socket.on("groupDeleting", ({ groupId, senderId }) => {
      const authUserId = normalizeId(authUser._id);
      if (normalizeId(senderId) === authUserId) return; // Don't show own deleting
      
      set(state => {
        const groupIdStr = normalizeId(groupId);
        const senderIdStr = normalizeId(senderId);
        const currentDeleting = state.groupDeletingUsers[groupIdStr] || state.groupDeletingUsers[groupId] || [];
        const exists = currentDeleting.some(id => normalizeId(id) === senderIdStr);
        
        if (!exists) {
          return {
            groupDeletingUsers: {
              ...state.groupDeletingUsers,
              [groupIdStr]: [...currentDeleting, senderId]
            }
          };
        }
        return state;
      });
    });

    socket.on("groupStopDeleting", ({ groupId, senderId }) => {
      set(state => {
        const groupIdStr = normalizeId(groupId);
        const senderIdStr = normalizeId(senderId);
        const currentDeleting = state.groupDeletingUsers[groupIdStr] || state.groupDeletingUsers[groupId] || [];
        return {
          groupDeletingUsers: {
            ...state.groupDeletingUsers,
            [groupIdStr]: currentDeleting.filter(id => normalizeId(id) !== senderIdStr)
          }
        };
      });
    });

    socket.on("groupUploadingPhoto", ({ groupId, senderId }) => {
      const authUserId = normalizeId(authUser._id);
      if (normalizeId(senderId) === authUserId) return; // Don't show own uploading
      
      set(state => {
        const groupIdStr = normalizeId(groupId);
        const senderIdStr = normalizeId(senderId);
        const currentUploading = state.groupUploadingPhotoUsers[groupIdStr] || state.groupUploadingPhotoUsers[groupId] || [];
        const exists = currentUploading.some(id => normalizeId(id) === senderIdStr);
        
        if (!exists) {
          return {
            groupUploadingPhotoUsers: {
              ...state.groupUploadingPhotoUsers,
              [groupIdStr]: [...currentUploading, senderId]
            }
          };
        }
        return state;
      });
    });

    socket.on("groupStopUploadingPhoto", ({ groupId, senderId }) => {
      set(state => {
        const groupIdStr = normalizeId(groupId);
        const senderIdStr = normalizeId(senderId);
        const currentUploading = state.groupUploadingPhotoUsers[groupIdStr] || state.groupUploadingPhotoUsers[groupId] || [];
        return {
          groupUploadingPhotoUsers: {
            ...state.groupUploadingPhotoUsers,
            [groupIdStr]: currentUploading.filter(id => normalizeId(id) !== senderIdStr)
          }
        };
      });
    });

    // Global listener for new group messages (updates group list for all groups)
    socket.on("newGroupMessage", ({ message, groupId, memberId }) => {
      const authUserId = normalizeId(authUser._id);
      const msgSenderId = normalizeId(message.senderId);
      const isIncomingMessage = msgSenderId !== authUserId;
      
      set(state => {
        const groupIdStr = normalizeId(groupId);
        const memberIdStr = normalizeId(memberId);
        const isViewingThisGroup = state.selectedGroup && normalizeId(state.selectedGroup._id) === groupIdStr;
        
        // Only process if this message is for the current user
        if (memberIdStr !== authUserId) return state;
        
        // Always update groupLastMessages for the group list (this is the global handler)
        const updatedGroupLastMessages = {
          ...state.groupLastMessages,
          [groupIdStr]: message
        };
        
        // Check if message already exists to prevent duplicates
        const messageExists = state.messages.some(msg => msg._id === message._id);
        
        // Update messages array if viewing this group
        let updatedMessages = state.messages;
        if (isViewingThisGroup && !messageExists) {
          updatedMessages = [...state.messages, message];
        }
        
        // Update unread count if message is from someone else and not currently viewing this group
        const updatedUnreadMessages = { ...state.unreadMessages };
        if (isIncomingMessage && !isViewingThisGroup) {
          updatedUnreadMessages[groupIdStr] = (updatedUnreadMessages[groupIdStr] || 0) + 1;
        } else if (isViewingThisGroup) {
          // Clear unread count when viewing this group
          updatedUnreadMessages[groupIdStr] = 0;
        }
        
        // Add push notification for incoming group messages (if not viewing or not from self)
        if (isIncomingMessage && !isViewingThisGroup) {
          setTimeout(() => {
            try {
              const { useNotificationStore } = require("../store/useNotificationStore");
              const senderName = message.senderId?.fullname || "Someone";
              const groupName = state.groups.find(g => normalizeId(g._id) === groupIdStr)?.name || "Group";
              
              useNotificationStore.getState().addNotification({
                type: 'group_message_received',
                message: `${senderName} in ${groupName}: ${message.text || (message.image ? 'sent a photo' : message.audio ? 'sent an audio' : 'sent a message')}`,
                data: { message, groupId, sender: message.senderId }
              });
            } catch (err) {
              console.error("Failed to add group notification:", err);
            }
          }, 0);
        }
        
        return {
          messages: updatedMessages,
          groupLastMessages: updatedGroupLastMessages,
          unreadMessages: updatedUnreadMessages
        };
      });
    });

    // Global listener for group message edits (updates group list for all groups)
    socket.on("groupMessageEdited", ({ message, groupId, memberId }) => {
      const authUserId = normalizeId(authUser._id);
      const memberIdStr = normalizeId(memberId);
      
      // Only process if this message is for the current user
      if (memberIdStr !== authUserId) return;
      
      set(state => {
        const groupIdStr = normalizeId(groupId);
        const isViewingThisGroup = state.selectedGroup && normalizeId(state.selectedGroup._id) === groupIdStr;
        
        // Update messages array if viewing this group
        let updatedMessages = state.messages;
        if (isViewingThisGroup) {
          updatedMessages = state.messages.map((msg) =>
            normalizeId(msg._id) === normalizeId(message._id) ? message : msg
          );
        }
        
        // Always check and update groupLastMessages if this is the last message (for group list)
        // Check both normalized and original format for compatibility
        const lastMessageNormalized = state.groupLastMessages[groupIdStr];
        const lastMessageOriginal = state.groupLastMessages[groupId];
        const lastMessage = lastMessageNormalized || lastMessageOriginal;
        
        const updatedGroupLastMessages = { ...state.groupLastMessages };
        
        // Check if the edited message is the last message (normalize IDs for comparison)
        if (lastMessage && normalizeId(lastMessage._id) === normalizeId(message._id)) {
          // Update with normalized key
          updatedGroupLastMessages[groupIdStr] = message;
          // Also update original format if it exists
          if (state.groupLastMessages[groupId]) {
            updatedGroupLastMessages[groupId] = message;
          }
        }
        
        return {
          messages: updatedMessages,
          groupLastMessages: updatedGroupLastMessages
        };
      });
    });

    // Global listener for group info updates
    socket.on("groupInfoUpdated", ({ group, memberId }) => {
      const authUserId = normalizeId(authUser._id);
      const memberIdStr = normalizeId(memberId);
      
      // Only process if this update is for the current user
      if (memberIdStr !== authUserId) return;
      
      set(state => {
        const groupIdStr = normalizeId(group._id);
        const updatedGroups = state.groups.map(g => {
          const gId = normalizeId(g._id);
          return gId === groupIdStr ? group : g;
        });
        
        // Update selectedGroup if it's the updated group
        const updatedSelectedGroup = state.selectedGroup && normalizeId(state.selectedGroup._id) === groupIdStr
          ? group
          : state.selectedGroup;
        
        return {
          groups: updatedGroups,
          selectedGroup: updatedSelectedGroup
        };
      });
    });

    socket.on("memberLeftGroup", ({ group, memberId, leftMemberId }) => {
      const authUserId = normalizeId(authUser._id);
      const memberIdStr = normalizeId(memberId);
      
      // Only process if this update is for the current user
      if (memberIdStr !== authUserId) return;
      
      set(state => {
        const groupIdStr = normalizeId(group._id);
        const updatedGroups = state.groups.map(g => {
          const gId = normalizeId(g._id);
          return gId === groupIdStr ? group : g;
        });
        
        // Update selectedGroup if it's the updated group
        const updatedSelectedGroup = state.selectedGroup && normalizeId(state.selectedGroup._id) === groupIdStr
          ? group
          : state.selectedGroup;
        
        return {
          groups: updatedGroups,
          selectedGroup: updatedSelectedGroup
        };
      });
    });

    socket.on("leftGroup", ({ groupId }) => {
      // User left this group - remove it from their list
      set(state => {
        const groupIdStr = normalizeId(groupId);
        
        // Remove group from groups array
        const updatedGroups = state.groups.filter((group) => {
          const gId = normalizeId(group._id);
          return gId !== groupIdStr;
        });
        
        // Remove from groupLastMessages
        const updatedGroupLastMessages = { ...state.groupLastMessages };
        delete updatedGroupLastMessages[groupIdStr];
        
        // Remove from unreadMessages
        const updatedUnreadMessages = { ...state.unreadMessages };
        delete updatedUnreadMessages[groupIdStr];
        
        // Clear selected group if it was the one we left
        const currentSelectedGroupId = state.selectedGroup?._id ? normalizeId(state.selectedGroup._id) : null;
        const shouldClearSelectedGroup = currentSelectedGroupId === groupIdStr;
        
        return {
          groups: updatedGroups,
          groupLastMessages: updatedGroupLastMessages,
          unreadMessages: updatedUnreadMessages,
          selectedGroup: shouldClearSelectedGroup ? null : state.selectedGroup,
          messages: shouldClearSelectedGroup ? [] : state.messages
        };
      });
    });

    socket.on("groupDeleted", ({ groupId, memberId }) => {
      // Remove group from list for all members
      // Check if this event is for the current user
      if (!authUser || !authUser._id) return;
      const authUserIdStr = typeof authUser._id === 'string' ? authUser._id.toString() : authUser._id.toString();
      if (memberId !== authUserIdStr) return;
      
      set(state => {
        const normalizeId = (id) => {
          if (!id) return null;
          if (typeof id === 'string') return id;
          if (typeof id === 'object' && id._id) return id._id.toString();
          return id.toString();
        };
        
        const groupIdStr = normalizeId(groupId);
        
        // Remove group from groups array
        const updatedGroups = state.groups.filter((group) => {
          const gId = normalizeId(group._id);
          return gId !== groupIdStr;
        });
        
        // Remove from groupLastMessages
        const updatedGroupLastMessages = { ...state.groupLastMessages };
        delete updatedGroupLastMessages[groupIdStr];
        // Also try deleting with any other format
        Object.keys(updatedGroupLastMessages).forEach((key) => {
          if (normalizeId(key) === groupIdStr) {
            delete updatedGroupLastMessages[key];
          }
        });
        
        // Remove from unreadMessages
        const updatedUnreadMessages = { ...state.unreadMessages };
        delete updatedUnreadMessages[groupIdStr];
        Object.keys(updatedUnreadMessages).forEach((key) => {
          if (normalizeId(key) === groupIdStr) {
            delete updatedUnreadMessages[key];
          }
        });
        
        // Clear selected group if it was deleted
        const currentSelectedGroupId = state.selectedGroup?._id ? normalizeId(state.selectedGroup._id) : null;
        const shouldClearSelectedGroup = currentSelectedGroupId === groupIdStr;
        
        // Clear messages if this group was selected
        const shouldClearMessages = shouldClearSelectedGroup;
        
        return {
          groups: updatedGroups,
          groupLastMessages: updatedGroupLastMessages,
          unreadMessages: updatedUnreadMessages,
          selectedGroup: shouldClearSelectedGroup ? null : state.selectedGroup,
          messages: shouldClearMessages ? [] : state.messages
        };
      });
      
      toast.success("Group deleted");
    });
  },

  unsubscribeFromGroups: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    
    socket.off("groupCreated");
    socket.off("addedToGroup");
    socket.off("removedFromGroup");
    socket.off("groupDeleted");
    socket.off("groupTyping");
    socket.off("groupStopTyping");
    socket.off("groupEditing");
    socket.off("groupStopEditing");
    socket.off("groupDeleting");
    socket.off("groupStopDeleting");
    socket.off("groupUploadingPhoto");
    socket.off("groupStopUploadingPhoto");
    socket.off("newGroupMessage");
    socket.off("groupMessageEdited");
    socket.off("groupInfoUpdated");
    socket.off("memberLeftGroup");
    socket.off("leftGroup");
  },

  createGroup: async (groupData) => {
    try {
      const res = await axiosInstance.post("/groups/create", groupData);
      set(state => ({
        groups: [res.data, ...state.groups]
      }));
      toast.success("Group created successfully");
      return res.data;
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to create group");
      throw error;
    }
  },

  addMembersToGroup: async (groupId, memberIds) => {
    try {
      const res = await axiosInstance.post(`/groups/${groupId}/members`, { memberIds });
      set(state => ({
        groups: state.groups.map(g => g._id === groupId ? res.data : g)
      }));
      toast.success("Members added successfully");
      return res.data;
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to add members");
      throw error;
    }
  },

  removeMemberFromGroup: async (groupId, memberId) => {
    try {
      const res = await axiosInstance.delete(`/groups/${groupId}/members/${memberId}`);
      set(state => ({
        groups: state.groups.map(g => {
          const normalizeId = (id) => {
            if (!id) return null;
            if (typeof id === 'string') return id;
            if (typeof id === 'object' && id._id) return id._id.toString();
            return id.toString();
          };
          const gId = normalizeId(g._id);
          const groupIdStr = normalizeId(groupId);
          return gId === groupIdStr ? res.data : g;
        }),
        selectedGroup: state.selectedGroup && (normalizeId(state.selectedGroup._id) === normalizeId(groupId))
          ? res.data
          : state.selectedGroup
      }));
      return res.data;
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to remove member");
      throw error;
    }
  },

  updateGroupInfo: async (groupId, groupData) => {
    try {
      const res = await axiosInstance.put(`/groups/${groupId}/info`, groupData);
      set(state => ({
        groups: state.groups.map(g => {
          const normalizeId = (id) => {
            if (!id) return null;
            if (typeof id === 'string') return id;
            if (typeof id === 'object' && id._id) return id._id.toString();
            return id.toString();
          };
          const gId = normalizeId(g._id);
          const groupIdStr = normalizeId(groupId);
          return gId === groupIdStr ? res.data : g;
        }),
        selectedGroup: state.selectedGroup && (normalizeId(state.selectedGroup._id) === normalizeId(groupId)) 
          ? res.data 
          : state.selectedGroup
      }));
      return res.data;
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to update group info");
      throw error;
    }
  },

  leaveGroup: async (groupId) => {
    try {
      await axiosInstance.post(`/groups/${groupId}/leave`);
      set(state => {
        const normalizeId = (id) => {
          if (!id) return null;
          if (typeof id === 'string') return id;
          if (typeof id === 'object' && id._id) return id._id.toString();
          return id.toString();
        };
        
        const groupIdStr = normalizeId(groupId);
        
        // Remove group from groups array
        const updatedGroups = state.groups.filter((group) => {
          const gId = normalizeId(group._id);
          return gId !== groupIdStr;
        });
        
        // Remove from groupLastMessages
        const updatedGroupLastMessages = { ...state.groupLastMessages };
        delete updatedGroupLastMessages[groupIdStr];
        Object.keys(updatedGroupLastMessages).forEach((key) => {
          if (normalizeId(key) === groupIdStr) {
            delete updatedGroupLastMessages[key];
          }
        });
        
        // Remove from unreadMessages
        const updatedUnreadMessages = { ...state.unreadMessages };
        delete updatedUnreadMessages[groupIdStr];
        Object.keys(updatedUnreadMessages).forEach((key) => {
          if (normalizeId(key) === groupIdStr) {
            delete updatedUnreadMessages[key];
          }
        });
        
        // Clear selected group if it was the one we left
        const currentSelectedGroupId = state.selectedGroup?._id ? normalizeId(state.selectedGroup._id) : null;
        const shouldClearSelectedGroup = currentSelectedGroupId === groupIdStr;
        
        return {
          groups: updatedGroups,
          groupLastMessages: updatedGroupLastMessages,
          unreadMessages: updatedUnreadMessages,
          selectedGroup: shouldClearSelectedGroup ? null : state.selectedGroup,
          messages: shouldClearSelectedGroup ? [] : state.messages
        };
      });
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to leave group");
      throw error;
    }
  },

  getGroupMessages: async (groupId) => {
    set({ isMessagesLoading: true });
    try {
      const res = await axiosInstance.get(`/groups/${groupId}/messages`);
      set({ messages: res.data });
      
      // Clear unread count for this group when viewing messages
      set((state) => ({
        unreadMessages: {
          ...state.unreadMessages,
          [groupId]: 0
        }
      }));
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to load group messages");
    } finally {
      set({ isMessagesLoading: false });
    }
  },

  sendGroupMessage: async (groupId, messageData) => {
    const { selectedGroup } = get();
    try {
      await axiosInstance.post(`/groups/${groupId}/send`, messageData);
      // Don't add message here - let socket handler add it to prevent duplicates
      // The socket event will handle adding the message in real-time
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to send message");
    }
  },

  deleteGroup: async (groupId) => {
    try {
      // Optimistically update UI for immediate feedback
      set((state) => {
        const normalizeId = (id) => {
          if (!id) return null;
          if (typeof id === 'string') return id;
          if (typeof id === 'object' && id._id) return id._id.toString();
          return id.toString();
        };
        
        const groupIdStr = normalizeId(groupId);
        
        // Remove group from groups array
        const updatedGroups = state.groups.filter((group) => {
          const gId = normalizeId(group._id);
          return gId !== groupIdStr;
        });
        
        // Remove from groupLastMessages
        const updatedGroupLastMessages = { ...state.groupLastMessages };
        delete updatedGroupLastMessages[groupIdStr];
        Object.keys(updatedGroupLastMessages).forEach((key) => {
          if (normalizeId(key) === groupIdStr) {
            delete updatedGroupLastMessages[key];
          }
        });
        
        // Remove from unreadMessages
          const updatedUnreadMessages = { ...state.unreadMessages };
        delete updatedUnreadMessages[groupIdStr];
        Object.keys(updatedUnreadMessages).forEach((key) => {
          if (normalizeId(key) === groupIdStr) {
            delete updatedUnreadMessages[key];
          }
        });
        
        // Clear selected group if it was deleted
        const currentSelectedGroupId = state.selectedGroup?._id ? normalizeId(state.selectedGroup._id) : null;
        const shouldClearSelectedGroup = currentSelectedGroupId === groupIdStr;
          
          return {
          groups: updatedGroups,
          groupLastMessages: updatedGroupLastMessages,
          unreadMessages: updatedUnreadMessages,
          selectedGroup: shouldClearSelectedGroup ? null : state.selectedGroup,
          messages: shouldClearSelectedGroup ? [] : state.messages
        };
      });

      // Fire API call in background
      axiosInstance.delete(`/groups/${groupId}`)
        .then((res) => {
          console.log(`✅ Group deleted: ${res.data.deletedMessagesCount} messages removed`);
          // Socket event will confirm and handle proper state updates
        })
        .catch((error) => {
          // Only handle errors - if delete fails, restore state
          console.error("Failed to delete group:", error);
          // Reload to restore state on error
          get().getGroups();
          throw error;
        });
    } catch (error) {
      console.error("Failed to delete group:", error);
      toast.error(error.response?.data?.error || "Failed to delete group");
      throw error;
      }
  },

  subscribeToGroupMessages: () => {
    const { selectedGroup } = get();
    if (!selectedGroup) return;
    const socket = useAuthStore.getState().socket;
    const authUser = useAuthStore.getState().authUser;
    if (!authUser || !authUser._id || !socket) return;

    // Clear group status indicators when switching groups
    const groupId = selectedGroup._id;
        set(state => ({
      groupTypingUsers: { ...state.groupTypingUsers, [groupId]: [] },
      groupEditingUsers: { ...state.groupEditingUsers, [groupId]: [] },
      groupDeletingUsers: { ...state.groupDeletingUsers, [groupId]: [] },
      groupUploadingPhotoUsers: { ...state.groupUploadingPhotoUsers, [groupId]: [] }
        }));

    // Remove existing listeners first to prevent duplicates
    // Note: We don't remove "newGroupMessage" or group status events here because they're handled globally in subscribeToGroups
    // We only remove listeners that are specific to the selected group view
    socket.off("groupCreated");
    socket.off("addedToGroup");
    socket.off("groupMessageEdited");
    socket.off("groupMessageDeleted");
    socket.off("groupMessageSeenUpdate");

    // Note: newGroupMessage and groupMessageEdited are handled globally in subscribeToGroups
    // Group status events (typing, editing, deleting, uploading) are also handled globally for the group list
    // Local handlers below update the state for the currently selected group

    socket.on("groupMessageDeleted", ({ messageId, groupId, memberId, deleteType = "forEveryone" }) => {
      // Update messages if viewing this group
      if (!authUser || !authUser._id || groupId !== selectedGroup._id || memberId !== authUser._id) return;
      if (groupId === selectedGroup._id && memberId === authUser._id) {
        set(state => {
          // Remove message from messages array
          const updatedMessages = state.messages.filter((msg) => msg._id !== messageId);

          // Update groupLastMessages if this was the last message
          const lastMessage = state.groupLastMessages[groupId];
          const updatedGroupLastMessages = { ...state.groupLastMessages };
          
          if (lastMessage && lastMessage._id === messageId) {
            const newLastMessage = updatedMessages
              .filter((msg) => msg.groupId && msg.groupId.toString() === groupId.toString())
              .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
            
            if (newLastMessage) {
              updatedGroupLastMessages[groupId] = newLastMessage;
            } else {
              delete updatedGroupLastMessages[groupId];
            }
          }

          return {
            messages: updatedMessages,
            groupLastMessages: updatedGroupLastMessages
          };
        });
      } else {
        // Update groupLastMessages even if not viewing (only for "forEveryone")
        if (deleteType === "forEveryone") {
          set(state => {
            const lastMessage = state.groupLastMessages[groupId];
            const updatedGroupLastMessages = { ...state.groupLastMessages };
            
            if (lastMessage && lastMessage._id === messageId) {
              const newLastMessage = state.messages
                .filter((msg) => msg.groupId && msg.groupId.toString() === groupId.toString() && msg._id !== messageId)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
              
              if (newLastMessage) {
                updatedGroupLastMessages[groupId] = newLastMessage;
              } else {
                delete updatedGroupLastMessages[groupId];
              }
            }

            return {
              groupLastMessages: updatedGroupLastMessages
            };
          });
        }
      }
    });

    // Group typing indicators
    socket.on("groupTyping", ({ groupId, senderId, senderName }) => {
      const normalizeId = (id) => {
        if (!id) return null;
        if (typeof id === 'string') return id;
        if (typeof id === 'object' && id._id) return id._id.toString();
        return id.toString();
      };
      
      if (groupId !== selectedGroup._id || normalizeId(senderId) === normalizeId(authUser._id)) return;
      
      set(state => {
        const currentTyping = state.groupTypingUsers[groupId] || [];
        const exists = currentTyping.some(u => normalizeId(u.userId) === normalizeId(senderId));
        
        if (!exists) {
          return {
            groupTypingUsers: {
              ...state.groupTypingUsers,
              [groupId]: [...currentTyping, { userId: senderId, senderName: senderName || "Someone" }]
            }
          };
        }
        return state;
      });
    });

    socket.on("groupStopTyping", ({ groupId, senderId }) => {
      const normalizeId = (id) => {
        if (!id) return null;
        if (typeof id === 'string') return id;
        if (typeof id === 'object' && id._id) return id._id.toString();
        return id.toString();
      };
      
      if (groupId !== selectedGroup._id) return;
      
      set(state => {
        const currentTyping = state.groupTypingUsers[groupId] || [];
        return {
          groupTypingUsers: {
            ...state.groupTypingUsers,
            [groupId]: currentTyping.filter(u => normalizeId(u.userId) !== normalizeId(senderId))
          }
        };
      });
    });

    // Group editing indicator
    socket.on("groupEditing", ({ groupId, senderId }) => {
      const normalizeId = (id) => {
        if (!id) return null;
        if (typeof id === 'string') return id;
        if (typeof id === 'object' && id._id) return id._id.toString();
        return id.toString();
      };
      
      if (groupId !== selectedGroup._id || normalizeId(senderId) === normalizeId(authUser._id)) return;
      
      set(state => {
        const currentEditing = state.groupEditingUsers[groupId] || [];
        if (!currentEditing.includes(senderId)) {
          return {
            groupEditingUsers: {
              ...state.groupEditingUsers,
              [groupId]: [...currentEditing, senderId]
            }
          };
        }
        return state;
      });
    });

    socket.on("groupStopEditing", ({ groupId, senderId }) => {
      if (groupId !== selectedGroup._id) return;
      
      set(state => {
        const currentEditing = state.groupEditingUsers[groupId] || [];
        return {
          groupEditingUsers: {
            ...state.groupEditingUsers,
            [groupId]: currentEditing.filter(id => id !== senderId)
          }
        };
      });
    });

    // Group deleting indicator
    socket.on("groupDeleting", ({ groupId, senderId }) => {
      const normalizeId = (id) => {
        if (!id) return null;
        if (typeof id === 'string') return id;
        if (typeof id === 'object' && id._id) return id._id.toString();
        return id.toString();
      };
      
      if (groupId !== selectedGroup._id || normalizeId(senderId) === normalizeId(authUser._id)) return;
      
      set(state => {
        const currentDeleting = state.groupDeletingUsers[groupId] || [];
        if (!currentDeleting.includes(senderId)) {
          return {
            groupDeletingUsers: {
              ...state.groupDeletingUsers,
              [groupId]: [...currentDeleting, senderId]
            }
          };
        }
        return state;
      });
    });

    socket.on("groupStopDeleting", ({ groupId, senderId }) => {
      if (groupId !== selectedGroup._id) return;
      
      set(state => {
        const currentDeleting = state.groupDeletingUsers[groupId] || [];
        return {
          groupDeletingUsers: {
            ...state.groupDeletingUsers,
            [groupId]: currentDeleting.filter(id => id !== senderId)
          }
        };
      });
    });

    // Group uploading photo indicator
    socket.on("groupUploadingPhoto", ({ groupId, senderId }) => {
      const normalizeId = (id) => {
        if (!id) return null;
        if (typeof id === 'string') return id;
        if (typeof id === 'object' && id._id) return id._id.toString();
        return id.toString();
      };
      
      if (groupId !== selectedGroup._id || normalizeId(senderId) === normalizeId(authUser._id)) return;
      
      set(state => {
        const currentUploading = state.groupUploadingPhotoUsers[groupId] || [];
        if (!currentUploading.includes(senderId)) {
          return {
            groupUploadingPhotoUsers: {
              ...state.groupUploadingPhotoUsers,
              [groupId]: [...currentUploading, senderId]
            }
          };
        }
        return state;
      });
    });

    socket.on("groupStopUploadingPhoto", ({ groupId, senderId }) => {
      if (groupId !== selectedGroup._id) return;
      
      set(state => {
        const currentUploading = state.groupUploadingPhotoUsers[groupId] || [];
        return {
          groupUploadingPhotoUsers: {
            ...state.groupUploadingPhotoUsers,
            [groupId]: currentUploading.filter(id => id !== senderId)
          }
        };
      });
    });

    // Group message seen status update
    socket.on("groupMessageSeenUpdate", ({ messageId, groupId, seenBy }) => {
      if (groupId !== selectedGroup._id) return;
      
      // Deduplicate seenBy array on frontend
      const normalizeId = (id) => {
        if (!id) return null;
        if (typeof id === 'string') return id;
        if (typeof id === 'object' && id._id) return id._id.toString();
        return id.toString();
      };
      
      const deduplicatedSeenBy = [];
      if (Array.isArray(seenBy)) {
        const seenMap = new Map();
        seenBy.forEach((seen) => {
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
        deduplicatedSeenBy.push(...Array.from(seenMap.values()));
      }
      
      set(state => ({
        messages: state.messages.map((msg) =>
          msg._id === messageId 
            ? { ...msg, seenBy: deduplicatedSeenBy } 
            : msg
        ),
      }));
    });

  },

  unsubscribeFromGroupMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    
    // Note: We don't remove "newGroupMessage" or group status events here because they're handled globally in subscribeToGroups
    // The global handlers always run to update groupLastMessages and status indicators for the group list
    // We only remove listeners that are specific to the local selected group view
    socket.off("groupMessageEdited");
    socket.off("groupMessageDeleted");
    socket.off("groupMessageSeenUpdate");
    
    // Group status events (typing, editing, deleting, uploading) are shared between global and local handlers
    // Don't remove them here - they're needed for both the group list and the chat view
  },

  setSelectedGroup: (selectedGroup) => {
    set({ selectedGroup, selectedUser: null });
  },

  // Contact Request Functions
  getContacts: async () => {
    const authUser = useAuthStore.getState().authUser;
    
    // Don't try to load contacts if not authenticated
    if (!authUser) {
      set({ contacts: [], isContactsLoading: false });
      return;
    }
    
    set({ isContactsLoading: true });
    try {
      const res = await axiosInstance.get("/contacts");
      set({ contacts: res.data });
    } catch (error) {
      if (error.response?.status !== 401) {
        console.error("Error loading contacts:", error);
        toast.error(error.response?.data?.message || "Failed to load contacts");
      }
    } finally {
      set({ isContactsLoading: false });
    }
  },

  getPendingRequests: async () => {
    set({ isRequestsLoading: true });
    try {
      const res = await axiosInstance.get("/contacts/requests");
      set({ pendingRequests: res.data });
    } catch (error) {
      if (error.response?.status !== 401) {
        console.error("Error loading pending requests:", error);
        toast.error(error.response?.data?.message || "Failed to load requests");
      }
    } finally {
      set({ isRequestsLoading: false });
    }
  },

  sendContactRequest: async (email) => {
    try {
      const res = await axiosInstance.post("/contacts/request", { email });
      toast.success("Contact request sent!");
      get().getPendingRequests(); // Refresh requests
      return res.data;
    } catch (error) {
      console.error("Error sending contact request:", error);
      toast.error(error.response?.data?.message || "Failed to send request");
      throw error;
    }
  },

  acceptContactRequest: async (requestId) => {
    try {
      await axiosInstance.post("/contacts/accept", { requestId });
      toast.success("Contact request accepted!");
      // Socket handler will update in real-time, but refresh as fallback
      setTimeout(() => {
        get().getContacts();
        get().getPendingRequests();
        get().getUsers();
      }, 100);
    } catch (error) {
      console.error("Error accepting contact request:", error);
      toast.error(error.response?.data?.message || "Failed to accept request");
      // Refresh on error to ensure UI is consistent
      get().getContacts();
      get().getPendingRequests();
      get().getUsers();
    }
  },

  rejectContactRequest: async (requestId) => {
    try {
      await axiosInstance.post("/contacts/reject", { requestId });
      toast.success("Contact request rejected");
      get().getPendingRequests(); // Refresh requests
    } catch (error) {
      console.error("Error rejecting contact request:", error);
      toast.error(error.response?.data?.message || "Failed to reject request");
    }
  },

  getContactStatus: async (userId) => {
    try {
      const res = await axiosInstance.get(`/contacts/status/${userId}`);
      return res.data;
    } catch (error) {
      if (error.response?.status !== 401) {
        console.error("Error getting contact status:", error);
      }
      return { status: "none" };
    }
  },

  // Subscribe to contact request socket events
  subscribeToContactRequests: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    // Remove existing listeners first to prevent duplicates
    socket.off("newContactRequest");
    socket.off("contactRequestAccepted");
    socket.off("contactRequestRejected");

    // Listen for new contact requests
    socket.on("newContactRequest", (data) => {
      set((state) => {
        // Add to pending requests if not already present
        const requestExists = state.pendingRequests.some(
          (req) => req._id === data.requestId || (req.senderId && req.senderId._id === data.senderId._id)
        );
        
        if (!requestExists) {
          return {
            pendingRequests: [
              {
                _id: data.requestId,
                senderId: data.senderId,
                createdAt: data.createdAt,
                status: "pending",
              },
              ...state.pendingRequests,
            ],
          };
        }
        return {};
      });
      
      // Refresh pending requests to ensure consistency
      get().getPendingRequests();
    });

    // Listen for accepted contact requests
    socket.on("contactRequestAccepted", (data) => {
      set((state) => {
        // Remove from pending requests
        const updatedPendingRequests = state.pendingRequests.filter(
          (req) => req._id !== data.requestId
        );
        
        // Add to contacts if not already present
        const contactExists = state.contacts.some(
          (contact) => contact._id === data.contact._id
        );
        
        const updatedContacts = contactExists
          ? state.contacts
          : [data.contact, ...state.contacts];
        
        return {
          pendingRequests: updatedPendingRequests,
          contacts: updatedContacts,
        };
      });
      
      // Refresh contacts, requests, and users to ensure consistency
      get().getContacts();
      get().getPendingRequests();
      get().getUsers(); // Refresh users list so new contact appears in conversations
    });

    // Listen for rejected contact requests
    socket.on("contactRequestRejected", (data) => {
      set((state) => {
        // Remove from pending requests
        const updatedPendingRequests = state.pendingRequests.filter(
          (req) => req._id !== data.requestId
        );
        
        return {
          pendingRequests: updatedPendingRequests,
        };
      });
      
      // Refresh pending requests to ensure consistency
      get().getPendingRequests();
    });
  },

  // Unsubscribe from contact request socket events
  unsubscribeFromContactRequests: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    
    socket.off("newContactRequest");
    socket.off("contactRequestAccepted");
    socket.off("contactRequestRejected");
  },

  // Delete conversation (all messages between two users)
  deleteConversation: async (otherUserId, deleteType = "forEveryone") => {
    // Optimistically update UI FIRST for instant feedback (like Telegram)
        const normalizeId = (id) => {
          if (!id) return null;
          if (typeof id === 'string') return id;
          if (typeof id === 'object' && id._id) return id._id.toString();
          return id.toString();
        };
        
        const userIdStr = normalizeId(otherUserId);
        
    set((state) => {
        // Remove from lastMessages - check all keys and remove matching ones
        const updatedLastMessages = { ...state.lastMessages };
        const keysToDelete = [];
        Object.keys(updatedLastMessages).forEach((key) => {
          const normalizedKey = normalizeId(key);
          if (normalizedKey === userIdStr) {
            keysToDelete.push(key);
          }
        });
        keysToDelete.forEach(key => {
          delete updatedLastMessages[key];
        });
        
        // Remove from unreadMessages - check all keys and remove matching ones
        const updatedUnreadMessages = { ...state.unreadMessages };
        const unreadKeysToDelete = [];
        Object.keys(updatedUnreadMessages).forEach((key) => {
          const normalizedKey = normalizeId(key);
          if (normalizedKey === userIdStr) {
            unreadKeysToDelete.push(key);
          }
        });
        unreadKeysToDelete.forEach(key => {
          delete updatedUnreadMessages[key];
        });
        
        // Clear messages if this conversation was selected
        const currentSelectedUserId = state.selectedUser?._id ? normalizeId(state.selectedUser._id) : null;
        const shouldClearMessages = currentSelectedUserId === userIdStr;
        
        return {
          lastMessages: updatedLastMessages,
          unreadMessages: updatedUnreadMessages,
          messages: shouldClearMessages ? [] : state.messages,
          selectedUser: shouldClearMessages ? null : state.selectedUser
        };
      });

    // Fire API call in background (don't block UI)
    // Socket events will handle real-time sync with other users
    axiosInstance.delete(`/messages/conversation/${otherUserId}`, {
      data: { deleteType }
    })
    .then((res) => {
      console.log(`✅ Conversation deleted: ${res.data.deletedCount} messages removed (${deleteType})`);
      // Socket event will confirm and handle proper state updates if needed
    })
    .catch((error) => {
      // Only handle errors - if delete fails, restore state
      console.error("Failed to delete conversation:", error);
      // Reload to restore state on error
      get().getUsers();
      throw error; // Re-throw so caller can handle if needed
    });
  },
}));
