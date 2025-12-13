import { create } from 'zustand';
import * as FileSystem from 'expo-file-system/legacy';
import axiosInstance from '../lib/api';
import { useAuthStore } from './useAuthStore';

// Get base64 encoding constant - handle different expo-file-system versions
const getBase64Encoding = () => {
  try {
    // Try to access EncodingType.Base64
    if (FileSystem.EncodingType && FileSystem.EncodingType.Base64 !== undefined && FileSystem.EncodingType.Base64 !== null) {
      return FileSystem.EncodingType.Base64;
    }
  } catch (e) {
    // EncodingType might not exist
  }
  
  // Try alternative: FileSystem.EncodingType might be an object with Base64 property
  try {
    if (FileSystem.EncodingType?.Base64 !== undefined && FileSystem.EncodingType?.Base64 !== null) {
      return FileSystem.EncodingType.Base64;
    }
  } catch (e) {
    // Fall through
  }
  
  // Last resort: use string literal (works in most expo-file-system versions)
  if (__DEV__) {
    console.warn('FileSystem.EncodingType.Base64 not found, using string fallback');
  }
  return 'base64';
};

export const useChatStore = create((set, get) => ({
  messages: [],
  users: [],
  groups: [],
  contacts: [],
  pendingRequests: [],
  selectedUser: null,
  selectedGroup: null,
  lastMessages: {}, // { userId: message } - last message for each conversation
  lastGroupMessages: {}, // { groupId: message } - last message for each group
  isContactsLoading: false,
  isRequestsLoading: false,
  isUsersLoading: false,
  isGroupsLoading: false,
  isMessagesLoading: false,
  typingUsers: [],

  // Set messages
  setMessages: (messages) => set({ messages }),

  // Add message (only if it belongs to current conversation)
  addMessage: (message) => {
    const state = get();
    const authUser = useAuthStore.getState().authUser;
    
    if (!authUser) return;

    // Determine the other user in the conversation
    const senderId = message.sender?._id || message.senderId;
    const receiverId = message.receiver?._id || message.receiverId;
    const authUserId = authUser._id?.toString();
    
    const otherUserId = senderId?.toString() === authUserId 
      ? receiverId?.toString() 
      : senderId?.toString();

    // Check if message already exists to prevent duplicates
    const messageExists = state.messages.some(
      msg => msg._id?.toString() === message._id?.toString()
    );
    
    if (messageExists) {
      // Update existing message instead
      set((state) => ({
        messages: state.messages.map(msg => 
          msg._id?.toString() === message._id?.toString() ? message : msg
        ),
        lastMessages: {
          ...state.lastMessages,
          [otherUserId]: message,
        },
      }));
    } else {
      // Add new message
      set((state) => ({
        messages: [...state.messages, message],
        lastMessages: {
          ...state.lastMessages,
          [otherUserId]: message,
        },
      }));
    }
  },

  // Set users
  setUsers: (users) => set({ users }),

  // Set contacts
  setContacts: (contacts) => set({ contacts }),

  // Set selected user
  setSelectedUser: (user) => set({ selectedUser: user }),

  // Set selected group
  setSelectedGroup: (group) => set({ selectedGroup: group }),

  // Set groups
  setGroups: (groups) => set({ groups }),

  // Fetch groups
  getGroups: async () => {
    const authUser = useAuthStore.getState().authUser;
    
    if (!authUser) {
      set({ groups: [], lastGroupMessages: {}, isGroupsLoading: false });
      return;
    }
    
    // If we already have groups, show them immediately and refresh in background
    const currentState = get();
    if (currentState.groups && currentState.groups.length > 0) {
      // Don't show loading if we have cached data - refresh in background
      // Only update if not already false to prevent unnecessary re-renders
      if (currentState.isGroupsLoading) {
        set({ isGroupsLoading: false });
      }
    } else {
      // Only show loading if we have no data
      // Only update if not already true to prevent unnecessary re-renders
      if (!currentState.isGroupsLoading) {
        set({ isGroupsLoading: true });
      }
    }
    
    // Create a safety timeout that ALWAYS clears loading state after 12 seconds
    // This prevents stuck loading in production builds where errors might not be caught
    const safetyTimeout = setTimeout(() => {
      const currentState = get();
      if (currentState.isGroupsLoading) {
        console.warn('⚠️ getGroups safety timeout - force clearing loading state');
        set({ isGroupsLoading: false });
      }
    }, 12000);
    
    // Match frontend web: Call BOTH endpoints in parallel (like frontend web does)
    try {
      const [groupsRes, lastMessagesRes] = await Promise.all([
        axiosInstance.get('/groups/my-groups'),
        axiosInstance.get('/groups/last-messages')
      ]);
      clearTimeout(safetyTimeout); // Clear safety timeout on success
      
      // Handle 401 errors gracefully
      if (groupsRes.status === 401 || lastMessagesRes.status === 401) {
        if (__DEV__) {
          console.warn('⚠️ Authentication failed, clearing auth state');
        }
        useAuthStore.getState().logout();
        set({ groups: [], lastGroupMessages: {}, isGroupsLoading: false });
        return;
      }

      // Ensure data is an array
      const groupsData = Array.isArray(groupsRes.data) ? groupsRes.data : [];
      const lastMessagesData = Array.isArray(lastMessagesRes.data) ? lastMessagesRes.data : [];
      
      // Normalize ID function for consistency
      const normalizeId = (id) => {
        if (!id) return null;
        if (typeof id === 'string') return id;
        if (typeof id === 'object' && id._id) return id._id.toString();
        return id?.toString();
      };
      
      const lastGroupMessagesMap = {};
      lastMessagesData.forEach(lastMsg => {
        const groupId = normalizeId(lastMsg.groupId);
        if (groupId) {
          // Store with normalized key for consistency
          lastGroupMessagesMap[groupId] = lastMsg;
        }
      });

      set({ groups: groupsData, lastGroupMessages: lastGroupMessagesMap, isGroupsLoading: false });
      
      if (__DEV__) {
        console.log(`✅ Loaded ${groupsData.length} groups from parallel requests`);
      }
    } catch (error) {
      clearTimeout(safetyTimeout); // Clear safety timeout on error
      console.error('Error loading groups:', error);
      
      // Check if it's a timeout or network error - be more aggressive in detection
      const isTimeout = error.code === 'ECONNABORTED' || 
                       error.message?.includes('timeout') ||
                       error.message?.includes('TIMEOUT') ||
                       error.name === 'TimeoutError';
      const isNetworkError = !error.response && (error.request || error.code === 'NETWORK_ERROR' || error.message?.includes('Network'));
      const isConnectionError = error.code === 'ECONNREFUSED' || 
                                error.code === 'ENOTFOUND' ||
                                error.code === 'ERR_NETWORK' ||
                                error.message?.includes('Network request failed');
      
      // Always clear loading state, but show empty groups on network errors
      if (isTimeout || isNetworkError || isConnectionError) {
        console.warn('⚠️ Network timeout or connection issue loading groups. Check backend connection.');
        // Clear loading state immediately - don't wait
        set({ groups: [], lastGroupMessages: {}, isGroupsLoading: false });
      } else {
        // For other errors, clear loading state immediately
        set({ groups: [], lastGroupMessages: {}, isGroupsLoading: false });
      }
      
      if (error.response?.status === 401) {
        useAuthStore.getState().logout();
      }
    }
  },

  // Fetch contacts
  getContacts: async () => {
    const authUser = useAuthStore.getState().authUser;
    
    if (!authUser) {
      set({ contacts: [], isContactsLoading: false });
      return;
    }
    
    // If we already have contacts, show them immediately and refresh in background
    const currentState = get();
    if (currentState.contacts && currentState.contacts.length > 0) {
      // Don't show loading if we have cached data - refresh in background
      // Only update if not already false to prevent unnecessary re-renders
      if (currentState.isContactsLoading) {
        set({ isContactsLoading: false });
      }
    } else {
      // Only show loading if we have no data
      // Only update if not already true to prevent unnecessary re-renders
      if (!currentState.isContactsLoading) {
        set({ isContactsLoading: true });
      }
    }
    
    // Create a safety timeout that ALWAYS clears loading state after 12 seconds
    // This prevents stuck loading in production builds where errors might not be caught
    const safetyTimeout = setTimeout(() => {
      const currentState = get();
      if (currentState.isContactsLoading) {
        console.warn('⚠️ getContacts safety timeout - force clearing loading state');
        set({ isContactsLoading: false });
      }
    }, 12000);
    
    try {
      const res = await axiosInstance.get('/contacts');
      clearTimeout(safetyTimeout); // Clear safety timeout on success
      
      // Handle 401 errors gracefully
      if (res.status === 401) {
        if (__DEV__) {
          console.warn('⚠️ Authentication failed, clearing auth state');
        }
        useAuthStore.getState().logout();
        set({ contacts: [], isContactsLoading: false });
        return;
      }
      
      set({ contacts: res.data || [], isContactsLoading: false });
      
      if (__DEV__) {
        console.log(`✅ Loaded ${(res.data || []).length} contacts`);
      }
    } catch (error) {
      clearTimeout(safetyTimeout); // Clear safety timeout on error
      console.error('Error loading contacts:', error);
      
      // Check if it's a timeout or network error - be more aggressive in detection
      const isTimeout = error.code === 'ECONNABORTED' || 
                       error.message?.includes('timeout') ||
                       error.message?.includes('TIMEOUT') ||
                       error.name === 'TimeoutError';
      const isNetworkError = !error.response && (error.request || error.code === 'NETWORK_ERROR' || error.message?.includes('Network'));
      const isConnectionError = error.code === 'ECONNREFUSED' || 
                                error.code === 'ENOTFOUND' ||
                                error.code === 'ERR_NETWORK' ||
                                error.message?.includes('Network request failed');
      
      // Always clear loading state, but show empty contacts on network errors
      if (isTimeout || isNetworkError || isConnectionError) {
        console.warn('⚠️ Network timeout or connection issue loading contacts. Check backend connection.');
        // Clear loading state immediately - don't wait
        set({ contacts: [], isContactsLoading: false });
      } else {
        // For other errors, clear loading state immediately
        set({ contacts: [], isContactsLoading: false });
      }
      
      if (error.response?.status === 401) {
        useAuthStore.getState().logout();
      }
    }
  },

  // Fetch users (only people you've messaged with - from last-messages)
  getUsers: async () => {
    const authUser = useAuthStore.getState().authUser;
    
    if (!authUser) {
      set({ users: [], lastMessages: {}, isUsersLoading: false });
      return;
    }
    
    // If we already have users, show them immediately and refresh in background
    const currentState = get();
    if (currentState.users && currentState.users.length > 0) {
      // Don't show loading if we have cached data - refresh in background
      // Only update if not already false to prevent unnecessary re-renders
      if (currentState.isUsersLoading) {
        set({ isUsersLoading: false });
      }
    } else {
      // Only show loading if we have no data
      // Only update if not already true to prevent unnecessary re-renders
      if (!currentState.isUsersLoading) {
        set({ isUsersLoading: true });
      }
    }
    
    // Create a safety timeout that ALWAYS clears loading state after 12 seconds
    // This prevents stuck loading in production builds where errors might not be caught
    const safetyTimeout = setTimeout(() => {
      const currentState = get();
      if (currentState.isUsersLoading) {
        console.warn('⚠️ getUsers safety timeout - force clearing loading state');
        set({ isUsersLoading: false });
      }
    }, 12000);
    
    // Use axios timeout (10 seconds) - don't add additional timeout race
    // Match frontend web: Call BOTH endpoints in parallel (like frontend web does)
    try {
      const [usersRes, lastMessagesRes] = await Promise.all([
        axiosInstance.get('/messages/users'),
        axiosInstance.get('/messages/last-messages')
      ]);
      clearTimeout(safetyTimeout); // Clear safety timeout on success
      
      // Handle 401 errors gracefully
      if (usersRes.status === 401 || lastMessagesRes.status === 401) {
        if (__DEV__) {
          console.warn('⚠️ Authentication failed, clearing auth state');
        }
        useAuthStore.getState().logout();
        set({ users: [], lastMessages: {}, isUsersLoading: false });
        return;
      }

      // Backend returns array of last messages with populated senderId/receiverId
      const lastMessagesData = Array.isArray(lastMessagesRes.data) ? lastMessagesRes.data : [];
      // Ensure users data is an array
      const usersData = Array.isArray(usersRes.data) ? usersRes.data : (usersRes.data?.users || []);

      const authUserId = authUser._id?.toString();
      const lastMessagesMap = {};
      
      // Build last messages map from lastMessagesData
      lastMessagesData.forEach(lastMsg => {
        const senderId = lastMsg.senderId?._id?.toString() || lastMsg.senderId?.toString();
        const receiverId = lastMsg.receiverId?._id?.toString() || lastMsg.receiverId?.toString();
        
        if (!senderId || !receiverId) return;
        
        // Determine the other user (not the current user)
        const otherUserId = senderId === authUserId ? receiverId : senderId;
        if (otherUserId) {
          lastMessagesMap[otherUserId] = lastMsg;
        }
      });

      // Remove duplicate users based on _id (like frontend web does)
      const uniqueUsers = [];
      const seenIds = new Set();
      
      // Add users from /messages/users endpoint (primary source)
      usersData.forEach(user => {
        const userId = typeof user._id === 'string' ? user._id : user._id?.toString();
        if (userId && !seenIds.has(userId)) {
          seenIds.add(userId);
          uniqueUsers.push(user);
        }
      });
      
      // Also add users from lastMessages (in case they're not in users list)
      lastMessagesData.forEach(lastMsg => {
        const senderId = lastMsg.senderId?._id?.toString() || lastMsg.senderId?.toString();
        const receiverId = lastMsg.receiverId?._id?.toString() || lastMsg.receiverId?.toString();
        
        if (!senderId || !receiverId) return;
        
        const otherUserId = senderId === authUserId ? receiverId : senderId;
        if (otherUserId) {
          // Extract user object from populated data
          const otherUser = senderId === authUserId 
            ? (lastMsg.receiverId && typeof lastMsg.receiverId === 'object' ? lastMsg.receiverId : null)
            : (lastMsg.senderId && typeof lastMsg.senderId === 'object' ? lastMsg.senderId : null);
          
          if (otherUser && otherUser._id) {
            const userId = typeof otherUser._id === 'string' ? otherUser._id : otherUser._id?.toString();
            if (userId && !seenIds.has(userId)) {
              seenIds.add(userId);
              uniqueUsers.push(otherUser);
            }
          }
        }
      });

      set({ users: uniqueUsers, lastMessages: lastMessagesMap, isUsersLoading: false });
      
      if (__DEV__) {
        console.log(`✅ Loaded ${usersList.length} users from last messages`);
      }
    } catch (error) {
      clearTimeout(safetyTimeout); // Clear safety timeout on error
      console.error('Error loading users:', error);
      
      // Check if it's a timeout or network error - be more aggressive in detection
      const isTimeout = error.code === 'ECONNABORTED' || 
                       error.message?.includes('timeout') ||
                       error.message?.includes('TIMEOUT') ||
                       error.name === 'TimeoutError';
      const isNetworkError = !error.response && (error.request || error.code === 'NETWORK_ERROR' || error.message?.includes('Network'));
      const isConnectionError = error.code === 'ECONNREFUSED' || 
                                error.code === 'ENOTFOUND' ||
                                error.code === 'ERR_NETWORK' ||
                                error.message?.includes('Network request failed');
      
      // Always clear loading state, but show empty users on network errors
      if (isTimeout || isNetworkError || isConnectionError) {
        console.warn('⚠️ Network timeout or connection issue loading users. Check backend connection.');
        // Clear loading state immediately - don't wait
        set({ users: [], lastMessages: {}, isUsersLoading: false });
      } else {
        // For other errors, clear loading state immediately
        set({ users: [], lastMessages: {}, isUsersLoading: false });
      }
      
      if (error.response?.status === 401) {
        useAuthStore.getState().logout();
      }
    }
  },

  // Fetch pending contact requests
  getPendingRequests: async () => {
    const authUser = useAuthStore.getState().authUser;
    
    if (!authUser) {
      set({ pendingRequests: [], isRequestsLoading: false });
      return;
    }
    
    set({ isRequestsLoading: true });
    try {
      const res = await axiosInstance.get('/contacts/requests');
      set({ pendingRequests: res.data || [] });
    } catch (error) {
      console.error('Error loading pending requests:', error);
      if (error.response?.status !== 401) {
        set({ pendingRequests: [] });
      }
    } finally {
      set({ isRequestsLoading: false });
    }
  },

  // Send contact request by email
  sendContactRequest: async (email) => {
    try {
      const res = await axiosInstance.post('/contacts/request', { email });
      // Refresh pending requests
      get().getPendingRequests();
      return res.data;
    } catch (error) {
      console.error('Error sending contact request:', error);
      throw error;
    }
  },

  // Accept contact request
  acceptContactRequest: async (requestId) => {
    try {
      const res = await axiosInstance.post('/contacts/accept', { requestId });
      // Refresh contacts and pending requests
      get().getContacts();
      get().getPendingRequests();
      return res.data;
    } catch (error) {
      console.error('Error accepting contact request:', error);
      throw error;
    }
  },

  // Reject contact request
  rejectContactRequest: async (requestId) => {
    try {
      const res = await axiosInstance.post('/contacts/reject', { requestId });
      // Refresh pending requests
      get().getPendingRequests();
      return res.data;
    } catch (error) {
      console.error('Error rejecting contact request:', error);
      throw error;
    }
  },

  // Fetch messages for a conversation
  getMessages: async (userId) => {
    const authUser = useAuthStore.getState().authUser;
    
    if (!authUser || !userId) {
      set({ messages: [], isMessagesLoading: false });
      return;
    }
    
    // Always set loading state and clear messages when fetching a new conversation
    // This ensures we don't show stale messages from previous conversations
    set({ isMessagesLoading: true, messages: [] });
    
    // Create a safety timeout that ALWAYS clears loading state after 12 seconds
    // This prevents stuck loading in production builds where errors might not be caught
    const safetyTimeout = setTimeout(() => {
      const currentState = get();
      if (currentState.isMessagesLoading) {
        console.warn('⚠️ getMessages safety timeout - force clearing loading state');
        set({ isMessagesLoading: false });
      }
    }, 12000);
    
    // Use axios timeout (10 seconds) - don't add additional timeout race
    // This prevents premature timeouts on slow networks
    try {
      const res = await axiosInstance.get(`/messages/${userId}`);
      clearTimeout(safetyTimeout); // Clear safety timeout on success
      
      const messagesData = Array.isArray(res.data) ? res.data : (res.data?.messages || []);
      set({ messages: messagesData, isMessagesLoading: false });
      
      if (__DEV__) {
        console.log(`✅ Loaded ${messagesData.length} messages for user ${userId}`);
      }
    } catch (error) {
      clearTimeout(safetyTimeout); // Clear safety timeout on error
      console.error('Error loading messages:', error);
      
      // Check if it's a timeout or network error - be more aggressive in detection
      const isTimeout = error.code === 'ECONNABORTED' || 
                       error.message?.includes('timeout') ||
                       error.message?.includes('TIMEOUT') ||
                       error.name === 'TimeoutError';
      const isNetworkError = !error.response && (error.request || error.code === 'NETWORK_ERROR' || error.message?.includes('Network'));
      const isConnectionError = error.code === 'ECONNREFUSED' || 
                                error.code === 'ENOTFOUND' ||
                                error.code === 'ERR_NETWORK' ||
                                error.message?.includes('Network request failed');
      
      // Always clear loading state, but show empty messages on network errors
      if (isTimeout || isNetworkError || isConnectionError) {
        console.warn('⚠️ Network timeout or connection issue. Check backend connection.');
        // Clear loading state immediately - don't wait
        set({ messages: [], isMessagesLoading: false });
      } else {
        // For other errors, clear loading state immediately
        set({ messages: [], isMessagesLoading: false });
      }
      
      if (error.response?.status === 401) {
        useAuthStore.getState().logout();
      }
    }
  },

  // Fetch messages for a group
  getGroupMessages: async (groupId) => {
    const authUser = useAuthStore.getState().authUser;
    
    if (!authUser || !groupId) {
      set({ messages: [], isMessagesLoading: false });
      return;
    }
    
    // Always set loading state and clear messages when fetching a new conversation
    // This ensures we don't show stale messages from previous conversations
    set({ isMessagesLoading: true, messages: [] });
    
    // Create a safety timeout that ALWAYS clears loading state after 12 seconds
    // This prevents stuck loading in production builds where errors might not be caught
    const safetyTimeout = setTimeout(() => {
      const currentState = get();
      if (currentState.isMessagesLoading) {
        console.warn('⚠️ getGroupMessages safety timeout - force clearing loading state');
        set({ isMessagesLoading: false });
      }
    }, 12000);
    
    // Use axios timeout (10 seconds) - don't add additional timeout race
    // This prevents premature timeouts on slow networks
    try {
      const res = await axiosInstance.get(`/groups/${groupId}/messages`);
      clearTimeout(safetyTimeout); // Clear safety timeout on success
      
      const messagesData = Array.isArray(res.data) 
        ? res.data 
        : (res.data?.messages || []);
      set({ messages: messagesData, isMessagesLoading: false });
      
      if (__DEV__) {
        console.log(`✅ Loaded ${messagesData.length} messages for group ${groupId}`);
      }
    } catch (error) {
      clearTimeout(safetyTimeout); // Clear safety timeout on error
      console.error('Error loading group messages:', error);
      
      // Check if it's a timeout or network error - be more aggressive in detection
      const isTimeout = error.code === 'ECONNABORTED' || 
                       error.message?.includes('timeout') ||
                       error.message?.includes('TIMEOUT') ||
                       error.name === 'TimeoutError';
      const isNetworkError = !error.response && (error.request || error.code === 'NETWORK_ERROR' || error.message?.includes('Network'));
      const isConnectionError = error.code === 'ECONNREFUSED' || 
                                error.code === 'ENOTFOUND' ||
                                error.code === 'ERR_NETWORK' ||
                                error.message?.includes('Network request failed');
      
      // Always clear loading state, but show empty messages on network errors
      if (isTimeout || isNetworkError || isConnectionError) {
        console.warn('⚠️ Network timeout or connection issue. Check backend connection.');
        // Clear loading state immediately - don't wait
        set({ messages: [], isMessagesLoading: false });
      } else {
        // For other errors, clear loading state immediately
        set({ messages: [], isMessagesLoading: false });
      }
      
      if (error.response?.status === 401) {
        useAuthStore.getState().logout();
      }
    }
  },

  // Send message
  sendMessage: async (receiverId, text, imageUri = null, fileUri = null, audioUri = null) => {
    const authUser = useAuthStore.getState().authUser;
    const socket = useAuthStore.getState().socket;
    
    if (!authUser || !receiverId || (!text?.trim() && !imageUri && !fileUri && !audioUri)) {
      throw new Error('Invalid message data');
    }

    try {
      // Backend expects text, image, file, audio as strings (base64 or URLs)
      // For React Native, we need to convert local URIs to base64
      const messageData = {};
      
      // Only include text if it has content
      if (text?.trim()) {
        messageData.text = text.trim();
      }

      // Convert image to base64 if provided
      if (imageUri) {
        try {
          const base64 = await FileSystem.readAsStringAsync(imageUri, {
            encoding: getBase64Encoding(),
          });
          // Create data URI for backend
          const filename = imageUri.split('/').pop();
          const match = /\.(\w+)$/.exec(filename);
          const mimeType = match ? `image/${match[1]}` : 'image/jpeg';
          messageData.image = `data:${mimeType};base64,${base64}`;
        } catch (imageError) {
          console.error('Error converting image to base64:', imageError);
          throw new Error('Failed to process image');
        }
      }

      // Convert file to base64 if provided
      if (fileUri) {
        try {
          const base64 = await FileSystem.readAsStringAsync(fileUri.uri, {
            encoding: getBase64Encoding(),
          });
          // Create data URI for backend
          const mimeType = fileUri.mimeType || 'application/octet-stream';
          messageData.file = `data:${mimeType};base64,${base64}`;
          messageData.fileName = fileUri.name || fileUri.uri.split('/').pop();
          messageData.fileSize = fileUri.size || null;
          messageData.fileType = mimeType;
        } catch (fileError) {
          console.error('Error converting file to base64:', fileError);
          throw new Error('Failed to process file');
        }
      }

      // Convert audio to base64 if provided
      if (audioUri) {
        try {
          if (__DEV__) {
            console.log('🎤 Converting audio to base64, URI:', audioUri);
          }
          
          // Validate URI
          if (!audioUri || typeof audioUri !== 'string') {
            throw new Error('Invalid audio URI');
          }
          
          // Check if file exists using legacy API with error handling
          let fileInfo;
          try {
            fileInfo = await FileSystem.getInfoAsync(audioUri);
          } catch (fsError) {
            // If getInfoAsync fails, try to read directly (file might still exist)
            console.warn('⚠️ FileSystem.getInfoAsync failed, attempting direct read:', fsError.message);
            fileInfo = { exists: true }; // Assume exists and try to read
          }
          
          if (fileInfo && !fileInfo.exists) {
            throw new Error(`Audio file does not exist at: ${audioUri}`);
          }
          
          if (fileInfo && fileInfo.size === 0) {
            throw new Error('Audio file is empty (0 bytes)');
          }
          
          if (__DEV__ && fileInfo) {
            console.log('✅ File exists, size:', fileInfo.size, 'bytes');
          }
          
          // Get encoding constant
          const encoding = getBase64Encoding();
          if (__DEV__) {
            console.log('📝 Using encoding:', encoding, typeof encoding);
          }
          
          // Use the same encoding approach as images/files
          let base64;
          try {
            base64 = await FileSystem.readAsStringAsync(audioUri, {
              encoding: encoding,
            });
          } catch (readError) {
            console.error('❌ Error reading audio file:', readError);
            throw new Error(`Failed to read audio file: ${readError.message}`);
          }
          
          if (!base64 || base64.length === 0) {
            throw new Error('Audio file read as empty string');
          }
          
          if (__DEV__) {
            console.log('✅ Audio converted successfully, base64 length:', base64.length);
          }
          
          // Determine audio format from URI (expo-av uses .m4a on Android, .webm on some platforms)
          let audioFormat = 'webm';
          let codecs = 'opus';
          const uriLower = audioUri.toLowerCase();
          
          if (uriLower.endsWith('.m4a') || uriLower.includes('.m4a')) {
            audioFormat = 'm4a';
            codecs = 'mp4a.40.2'; // AAC codec for m4a
          } else if (uriLower.endsWith('.webm') || uriLower.includes('.webm')) {
            audioFormat = 'webm';
            codecs = 'opus';
          } else if (uriLower.endsWith('.mp3') || uriLower.includes('.mp3')) {
            audioFormat = 'mp3';
            codecs = 'mp3';
          } else if (uriLower.endsWith('.aac') || uriLower.includes('.aac')) {
            audioFormat = 'aac';
            codecs = 'mp4a.40.2';
          }
          
          // Create data URI for backend
          messageData.audio = `data:audio/${audioFormat};codecs=${codecs};base64,${base64}`;
          
          if (__DEV__) {
            console.log('Audio format:', audioFormat, 'codecs:', codecs, 'data URI length:', messageData.audio.length);
          }
        } catch (audioError) {
          console.error('Error converting audio to base64:', audioError);
          console.error('Audio URI:', audioUri);
          console.error('Error message:', audioError.message);
          if (audioError.stack) {
            console.error('Stack trace:', audioError.stack);
          }
          throw new Error(`Failed to process audio: ${audioError.message || 'Unknown error'}`);
        }
      }

      // Backend expects: POST /api/messages/send/:id
      const res = await axiosInstance.post(`/messages/send/${receiverId}`, messageData);

      const message = res.data;
      
      // Add message to local state immediately
      get().addMessage(message);
      
      // Emit via socket for real-time delivery
      if (socket && socket.connected) {
        socket.emit('sendMessage', {
          receiverId,
          text: messageData.text,
          image: messageData.image,
          file: messageData.file,
          audio: messageData.audio,
        });
      }

      return message;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  },

  // Send group message
  sendGroupMessage: async (groupId, text, imageUri = null, fileUri = null, audioUri = null) => {
    const authUser = useAuthStore.getState().authUser;
    const socket = useAuthStore.getState().socket;
    
    if (!authUser || !groupId || (!text?.trim() && !imageUri && !fileUri && !audioUri)) {
      throw new Error('Invalid message data');
    }

    try {
      // Backend expects text, image, file, audio as strings (base64 or URLs)
      const messageData = {};
      
      // Only include text if it has content
      if (text?.trim()) {
        messageData.text = text.trim();
      }

      // Convert image to base64 if provided
      if (imageUri) {
        try {
          const base64 = await FileSystem.readAsStringAsync(imageUri, {
            encoding: getBase64Encoding(),
          });
          const filename = imageUri.split('/').pop();
          const match = /\.(\w+)$/.exec(filename);
          const mimeType = match ? `image/${match[1]}` : 'image/jpeg';
          messageData.image = `data:${mimeType};base64,${base64}`;
        } catch (imageError) {
          console.error('Error converting image to base64:', imageError);
          throw new Error('Failed to process image');
        }
      }

      // Convert file to base64 if provided
      if (fileUri) {
        try {
          const base64 = await FileSystem.readAsStringAsync(fileUri.uri, {
            encoding: getBase64Encoding(),
          });
          const mimeType = fileUri.mimeType || 'application/octet-stream';
          messageData.file = `data:${mimeType};base64,${base64}`;
          messageData.fileName = fileUri.name || fileUri.uri.split('/').pop();
          messageData.fileSize = fileUri.size || null;
          messageData.fileType = mimeType;
        } catch (fileError) {
          console.error('Error converting file to base64:', fileError);
          throw new Error('Failed to process file');
        }
      }

      // Convert audio to base64 if provided
      if (audioUri) {
        try {
          if (__DEV__) {
            console.log('🎤 Converting audio to base64, URI:', audioUri);
          }
          
          // Validate URI
          if (!audioUri || typeof audioUri !== 'string') {
            throw new Error('Invalid audio URI');
          }
          
          // Check if file exists using legacy API with error handling
          let fileInfo;
          try {
            fileInfo = await FileSystem.getInfoAsync(audioUri);
          } catch (fsError) {
            // If getInfoAsync fails, try to read directly (file might still exist)
            console.warn('⚠️ FileSystem.getInfoAsync failed, attempting direct read:', fsError.message);
            fileInfo = { exists: true }; // Assume exists and try to read
          }
          
          if (fileInfo && !fileInfo.exists) {
            throw new Error(`Audio file does not exist at: ${audioUri}`);
          }
          
          if (fileInfo && fileInfo.size === 0) {
            throw new Error('Audio file is empty (0 bytes)');
          }
          
          if (__DEV__ && fileInfo) {
            console.log('✅ File exists, size:', fileInfo.size, 'bytes');
          }
          
          // Get encoding constant
          const encoding = getBase64Encoding();
          if (__DEV__) {
            console.log('📝 Using encoding:', encoding, typeof encoding);
          }
          
          // Use the same encoding approach as images/files
          let base64;
          try {
            base64 = await FileSystem.readAsStringAsync(audioUri, {
              encoding: encoding,
            });
          } catch (readError) {
            console.error('❌ Error reading audio file:', readError);
            throw new Error(`Failed to read audio file: ${readError.message}`);
          }
          
          if (!base64 || base64.length === 0) {
            throw new Error('Audio file read as empty string');
          }
          
          if (__DEV__) {
            console.log('✅ Audio converted successfully, base64 length:', base64.length);
          }
          
          // Determine audio format from URI (expo-av uses .m4a on Android, .webm on some platforms)
          let audioFormat = 'webm';
          let codecs = 'opus';
          const uriLower = audioUri.toLowerCase();
          
          if (uriLower.endsWith('.m4a') || uriLower.includes('.m4a')) {
            audioFormat = 'm4a';
            codecs = 'mp4a.40.2'; // AAC codec for m4a
          } else if (uriLower.endsWith('.webm') || uriLower.includes('.webm')) {
            audioFormat = 'webm';
            codecs = 'opus';
          } else if (uriLower.endsWith('.mp3') || uriLower.includes('.mp3')) {
            audioFormat = 'mp3';
            codecs = 'mp3';
          } else if (uriLower.endsWith('.aac') || uriLower.includes('.aac')) {
            audioFormat = 'aac';
            codecs = 'mp4a.40.2';
          }
          
          // Create data URI for backend
          messageData.audio = `data:audio/${audioFormat};codecs=${codecs};base64,${base64}`;
          
          if (__DEV__) {
            console.log('Audio format:', audioFormat, 'codecs:', codecs, 'data URI length:', messageData.audio.length);
          }
        } catch (audioError) {
          console.error('Error converting audio to base64:', audioError);
          console.error('Audio URI:', audioUri);
          console.error('Error message:', audioError.message);
          if (audioError.stack) {
            console.error('Stack trace:', audioError.stack);
          }
          throw new Error(`Failed to process audio: ${audioError.message || 'Unknown error'}`);
        }
      }

      // Backend expects: POST /api/groups/:id/send
      const res = await axiosInstance.post(`/groups/${groupId}/send`, messageData);

      const message = res.data;
      
      // Add message to local state immediately
      get().addMessage(message);
      
      // Emit via socket for real-time delivery
      if (socket && socket.connected) {
        socket.emit('sendGroupMessage', {
          groupId,
          text: messageData.text,
          image: messageData.image,
          file: messageData.file,
          audio: messageData.audio,
        });
      }

      return message;
    } catch (error) {
      console.error('Error sending group message:', error);
      throw error;
    }
  },

  // Edit message
  editMessage: async (messageId, text) => {
    const authUser = useAuthStore.getState().authUser;
    const socket = useAuthStore.getState().socket;
    
    if (!authUser || !messageId || !text?.trim()) {
      throw new Error('Invalid message data');
    }

    try {
      const res = await axiosInstance.put(`/messages/${messageId}`, {
        text: text.trim(),
      });

      const updatedMessage = res.data;
      
      // Update message in local state
      set((state) => ({
        messages: state.messages.map(msg => 
          msg._id?.toString() === messageId ? updatedMessage : msg
        ),
      }));

      // Emit via socket
      if (socket && socket.connected) {
        socket.emit('editMessage', {
          messageId,
          text: text.trim(),
        });
      }

      return updatedMessage;
    } catch (error) {
      console.error('Error editing message:', error);
      throw error;
    }
  },

  // Delete message
  deleteMessage: async (messageId) => {
    const authUser = useAuthStore.getState().authUser;
    const socket = useAuthStore.getState().socket;
    
    if (!authUser || !messageId) {
      throw new Error('Invalid message data');
    }

    try {
      await axiosInstance.delete(`/messages/${messageId}`);
      
      // Remove message from local state
      set((state) => ({
        messages: state.messages.filter(msg => msg._id?.toString() !== messageId),
      }));

      // Emit via socket
      if (socket && socket.connected) {
        socket.emit('deleteMessage', { messageId });
      }
    } catch (error) {
      console.error('Error deleting message:', error);
      throw error;
    }
  },

  // Subscribe to socket events for real-time updates (like web)
  subscribeToMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) {
      if (__DEV__) {
        console.log('⚠️ subscribeToMessages: No socket available');
      }
      return () => {}; // Return empty cleanup function
    }

    if (__DEV__) {
      console.log('✅ Setting up socket listeners for real-time messages');
    }

    // Remove existing listeners first to prevent duplicates (like web)
    socket.off('newMessage');
    socket.off('messageSeenUpdate');
    socket.off('messageEdited');
    socket.off('messageDeleted');
    socket.off('conversationDeleted');
    socket.off('messageReactionAdded');
    socket.off('messageReactionRemoved');
    socket.off('reaction-update');

    // Normalize ID helper
    const normalizeId = (id) => {
      if (!id) return null;
      if (typeof id === 'string') return id;
      if (typeof id === 'object' && id._id) return id._id.toString();
      return id?.toString();
    };

    const handleNewMessage = (message) => {
      // Always log in production too (for debugging real-time issues)
      console.log('📨 New message received (global):', {
        messageId: message._id,
        senderId: message.senderId || message.sender?._id,
        receiverId: message.receiverId || message.receiver?._id,
        text: message.text?.substring(0, 50),
        hasSocket: !!socket,
        socketConnected: socket?.connected,
      });
      
      const authUser = useAuthStore.getState().authUser;
      if (!authUser || !authUser._id) {
        console.warn('⚠️ No authUser in handleNewMessage');
        return;
      }
      
      const authUserId = normalizeId(authUser._id);
      const senderId = normalizeId(message.senderId || message.sender?._id);
      const receiverId = normalizeId(message.receiverId || message.receiver?._id);
      
      if (!senderId || !receiverId) return;
      
      // Determine the other user (not the current user)
      const otherUserId = senderId === authUserId ? receiverId : senderId;
      
      // IMPORTANT: Always update lastMessages for chat list
      // Also add to messages array if it matches current conversation
      // ConversationScreen will also handle adding, but this ensures it works even if ConversationScreen handler fails
      set((state) => {
        // Update lastMessages always (for chat list)
        const updatedLastMessages = {
          ...state.lastMessages,
          [otherUserId]: message,
        };
        
        // Check if this message should be added to messages array
        // This happens if:
        // 1. It's for the currently selected user/group, OR
        // 2. It's a direct message and matches the conversation pattern
        const currentSelectedUser = state.selectedUser;
        const currentSelectedGroup = state.selectedGroup;
        let shouldAddToMessages = false;
        
        // Check if it's a group message for selected group
        if (currentSelectedGroup && message.groupId) {
          const msgGroupId = normalizeId(message.groupId);
          const selectedGroupId = normalizeId(currentSelectedGroup._id);
          if (msgGroupId === selectedGroupId) {
            shouldAddToMessages = true;
          }
        }
        // Check if it's a direct message for selected user
        else if (currentSelectedUser) {
          const selectedUserId = normalizeId(currentSelectedUser._id);
          if (selectedUserId === otherUserId) {
            shouldAddToMessages = true;
          }
        }
        // Also check if message matches any conversation in messages array
        // This handles case where selectedUser might not be set but we're viewing a conversation
        else if (state.messages.length > 0) {
          // Check if any existing message in array is from/to this user
          const hasConversationWithUser = state.messages.some(msg => {
            const msgSenderId = normalizeId(msg.senderId || msg.sender?._id);
            const msgReceiverId = normalizeId(msg.receiverId || msg.receiver?._id);
            return (msgSenderId === otherUserId || msgReceiverId === otherUserId) &&
                   (msgSenderId === authUserId || msgReceiverId === authUserId);
          });
          if (hasConversationWithUser) {
            shouldAddToMessages = true;
          }
        }
        
        // Only add to messages array if it's for the current conversation
        let updatedMessages = state.messages;
        if (shouldAddToMessages) {
          const messageExists = state.messages.some(
            msg => normalizeId(msg._id) === normalizeId(message._id)
          );
          if (!messageExists) {
            updatedMessages = [...state.messages, message];
            if (__DEV__) {
              console.log('✅ Added message to array (global handler):', message._id);
            }
          } else {
            // Update existing message
            updatedMessages = state.messages.map(msg => 
              normalizeId(msg._id) === normalizeId(message._id) ? message : msg
            );
          }
        }
        
        return {
          messages: updatedMessages,
          lastMessages: updatedLastMessages,
        };
      });
    };

    const handleMessageSeenUpdate = ({ messageId, seenAt }) => {
      if (__DEV__) {
        console.log('👁️ Message seen update:', { messageId, seenAt });
      }
      get().updateMessageSeen(messageId, seenAt);
    };

    const handleMessageEdited = (editedMessage) => {
      if (__DEV__) {
        console.log('📝 Message edited:', editedMessage);
      }
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg._id?.toString() === editedMessage._id?.toString()
            ? { ...msg, text: editedMessage.text, edited: true, editedAt: editedMessage.editedAt }
            : msg
        ),
        // Also update last message if it's the edited one
        lastMessages: Object.fromEntries(
          Object.entries(state.lastMessages).map(([userId, lastMsg]) => [
            userId,
            lastMsg._id?.toString() === editedMessage._id?.toString()
              ? { ...lastMsg, text: editedMessage.text, edited: true, editedAt: editedMessage.editedAt }
              : lastMsg
          ])
        ),
      }));
    };

    const handleMessageDeleted = ({ messageId }) => {
      if (__DEV__) {
        console.log('🗑️ Message deleted:', messageId);
      }
      set((state) => ({
        messages: state.messages.filter((msg) => msg._id?.toString() !== messageId?.toString()),
        // Also remove from last messages if it's the deleted one
        lastMessages: Object.fromEntries(
          Object.entries(state.lastMessages).map(([userId, lastMsg]) => [
            userId,
            lastMsg._id?.toString() === messageId?.toString() ? null : lastMsg
          ]).filter(([_, msg]) => msg !== null)
        ),
      }));
    };

    const handleConversationDeleted = ({ userId }) => {
      if (__DEV__) {
        console.log('🗑️ Conversation deleted:', userId);
      }
      const normalizedUserId = normalizeId(userId);
      set((state) => ({
        lastMessages: Object.fromEntries(
          Object.entries(state.lastMessages).filter(([key]) => normalizeId(key) !== normalizedUserId)
        ),
      }));
    };

    const handleMessageReactionAdded = ({ messageId, reaction, userId }) => {
      if (__DEV__) {
        console.log('👍 Reaction added:', { messageId, reaction, userId });
      }
      set((state) => ({
        messages: state.messages.map((msg) => {
          if (msg._id?.toString() === messageId?.toString()) {
            const reactions = msg.reactions || [];
            const existingReactionIndex = reactions.findIndex(
              (r) => r.userId?.toString() === userId?.toString()
            );
            
            if (existingReactionIndex >= 0) {
              // Update existing reaction
              const updatedReactions = [...reactions];
              updatedReactions[existingReactionIndex] = { userId, reaction };
              return { ...msg, reactions: updatedReactions };
            } else {
              // Add new reaction
              return { ...msg, reactions: [...reactions, { userId, reaction }] };
            }
          }
          return msg;
        }),
      }));
    };

    const handleMessageReactionRemoved = ({ messageId, userId }) => {
      if (__DEV__) {
        console.log('👎 Reaction removed:', { messageId, userId });
      }
      set((state) => ({
        messages: state.messages.map((msg) => {
          if (msg._id?.toString() === messageId?.toString()) {
            const reactions = (msg.reactions || []).filter(
              (r) => r.userId?.toString() !== userId?.toString()
            );
            return { ...msg, reactions };
          }
          return msg;
        }),
      }));
    };

    // Register all event listeners
    socket.on('newMessage', handleNewMessage);
    socket.on('messageSeenUpdate', handleMessageSeenUpdate);
    socket.on('messageEdited', handleMessageEdited);
    socket.on('messageDeleted', handleMessageDeleted);
    socket.on('conversationDeleted', handleConversationDeleted);
    socket.on('messageReactionAdded', handleMessageReactionAdded);
    socket.on('messageReactionRemoved', handleMessageReactionRemoved);
    socket.on('reaction-update', (data) => {
      // Handle reaction-update event (might be used for group reactions)
      if (data.type === 'add') {
        handleMessageReactionAdded(data);
      } else if (data.type === 'remove') {
        handleMessageReactionRemoved(data);
      }
    });
    
    // Debug: Verify socket connection and listeners
    console.log('🔌 Socket connection status:', {
      connected: socket.connected,
      id: socket.id,
      disconnected: socket.disconnected,
    });
    
    // Verify socket is actually connected
    if (!socket.connected) {
      console.warn('⚠️ Socket is not connected! Real-time messages will not work.');
      console.warn('   Attempting to reconnect...');
      socket.connect();
    }

    // Return cleanup function
    return () => {
      socket.off('newMessage', handleNewMessage);
      socket.off('messageSeenUpdate', handleMessageSeenUpdate);
      socket.off('messageEdited', handleMessageEdited);
      socket.off('messageDeleted', handleMessageDeleted);
      socket.off('conversationDeleted', handleConversationDeleted);
      socket.off('messageReactionAdded', handleMessageReactionAdded);
      socket.off('messageReactionRemoved', handleMessageReactionRemoved);
      socket.off('reaction-update');
      if (__DEV__) {
        console.log('🧹 Cleaned up socket listeners for messages');
      }
    };
  },

  // Update message seen status
  updateMessageSeen: (messageId, seenAt) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg._id?.toString() === messageId?.toString()
          ? { ...msg, seen: true, seenAt: seenAt || new Date().toISOString() }
          : msg
      ),
    }));
  },

  // Update group message seenBy
  updateGroupMessageSeenBy: (messageId, seenBy) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg._id?.toString() === messageId?.toString()
          ? { ...msg, seenBy: seenBy || [] }
          : msg
      ),
    }));
  },

  // Unsubscribe from socket events
  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    
    // Remove all message-related listeners
    socket.off('newMessage');
    socket.off('messageSeenUpdate');
    socket.off('messageEdited');
    socket.off('messageDeleted');
    socket.off('conversationDeleted');
    socket.off('messageReactionAdded');
    socket.off('messageReactionRemoved');
    socket.off('reaction-update');
    
    if (__DEV__) {
      console.log('🧹 Unsubscribed from all message socket events');
    }
  },

  // Update group info
  updateGroupInfo: async (groupId, groupData) => {
    try {
      const res = await axiosInstance.put(`/groups/${groupId}/info`, groupData);
      const normalizeId = (id) => {
        if (!id) return null;
        if (typeof id === 'string') return id;
        if (typeof id === 'object' && id._id) return id._id.toString();
        return id.toString();
      };
      
      set((state) => ({
        groups: state.groups.map((g) => {
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
      console.error('Error updating group info:', error);
      throw error;
    }
  },

  // Leave group
  leaveGroup: async (groupId) => {
    try {
      await axiosInstance.post(`/groups/${groupId}/leave`);
      
      const normalizeId = (id) => {
        if (!id) return null;
        if (typeof id === 'string') return id;
        if (typeof id === 'object' && id._id) return id._id.toString();
        return id.toString();
      };

      const groupIdStr = normalizeId(groupId);

      // Remove group from groups array
      set((state) => {
        const updatedGroups = state.groups.filter((group) => {
          const gId = normalizeId(group._id);
          return gId !== groupIdStr;
        });

        // Remove from lastGroupMessages
        const updatedLastGroupMessages = { ...state.lastGroupMessages };
        delete updatedLastGroupMessages[groupIdStr];

        return {
          groups: updatedGroups,
          lastGroupMessages: updatedLastGroupMessages,
          selectedGroup: state.selectedGroup && (normalizeId(state.selectedGroup._id) === groupIdStr)
            ? null
            : state.selectedGroup
        };
      });
    } catch (error) {
      console.error('Error leaving group:', error);
      throw error;
    }
  },
}));
