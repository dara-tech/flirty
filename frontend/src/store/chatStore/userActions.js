import { axiosInstance } from "../../lib/axois";
import { useAuthStore } from "../useAuthStore";
import { normalizeId } from "../../lib/utils";
import toast from "react-hot-toast";

export const createUserActions = (set, get) => ({
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
    
    // Create a safety timeout that ALWAYS clears loading state after 12 seconds
    // This prevents stuck loading in production builds where errors might not be caught
    const safetyTimeout = setTimeout(() => {
      const currentState = get();
      if (currentState.isUsersLoading) {
        set({ isUsersLoading: false });
      }
    }, 12000);
    
    try {
      // Load first page of conversations and users (Telegram-style: page=1&limit=50)
      // Reduced limits for better performance: 20 conversations, 30 users initially
      // Further reduced for faster initial load - user can load more via pagination
      const [usersRes, lastMessagesRes] = await Promise.all([
        axiosInstance.get("/messages/users?page=1&limit=30"), // Reduced from 50 to 30 for faster load
        axiosInstance.get("/messages/last-messages?page=1&limit=20") // Reduced from 30 to 20 for faster load
      ]);

      // Handle 401 errors gracefully
      if (usersRes.status === 401 || lastMessagesRes.status === 401) {
        useAuthStore.getState().logout();
        set({ users: [], lastMessages: {}, isUsersLoading: false });
        return;
      }

      // Handle standardized response format: { success: true, data: [...], pagination: {...} }
      // Also supports old formats for backward compatibility
      let usersData = [];
      if (usersRes.data) {
        // New standardized format: { success: true, data: [...] }
        if (usersRes.data.data && Array.isArray(usersRes.data.data)) {
          usersData = usersRes.data.data;
        }
        // Old format: { users: [...] }
        else if (usersRes.data.users && Array.isArray(usersRes.data.users)) {
          usersData = usersRes.data.users;
        }
        // Direct array format
        else if (Array.isArray(usersRes.data)) {
          usersData = usersRes.data;
        }
      }
      
      // Handle standardized response format for last messages
      let lastMessagesData = [];
      let pagination = { skip: 0, limit: 50, total: 0, totalPages: 0, hasMore: false };
      
      if (lastMessagesRes.data && typeof lastMessagesRes.data === 'object') {
        // New standardized format: { success: true, data: [...], pagination: {...} }
        if (lastMessagesRes.data.data && Array.isArray(lastMessagesRes.data.data)) {
          lastMessagesData = lastMessagesRes.data.data;
          pagination = {
            ...pagination,
            ...(lastMessagesRes.data.pagination || {}),
            page: lastMessagesRes.data.pagination?.page || 1,
            limit: lastMessagesRes.data.pagination?.limit || 50,
            total: lastMessagesRes.data.pagination?.total || 0,
            totalPages: lastMessagesRes.data.pagination?.totalPages || 0,
            hasMore: lastMessagesRes.data.pagination?.hasMore || false,
            skip: lastMessagesRes.data.pagination?.skip || 0,
          };
        }
        // Old format: { lastMessages: [...], pagination: {...} }
        else if (lastMessagesRes.data.lastMessages && Array.isArray(lastMessagesRes.data.lastMessages)) {
          lastMessagesData = lastMessagesRes.data.lastMessages;
          pagination = {
            ...pagination,
            ...(lastMessagesRes.data.pagination || {}),
            page: lastMessagesRes.data.pagination?.page || 1,
            limit: lastMessagesRes.data.pagination?.limit || 50,
            total: lastMessagesRes.data.pagination?.total || 0,
            totalPages: lastMessagesRes.data.pagination?.totalPages || 0,
            hasMore: lastMessagesRes.data.pagination?.hasMore || false,
            skip: lastMessagesRes.data.pagination?.skip || 0,
          };
        }
        // Direct array format
        else if (Array.isArray(lastMessagesRes.data)) {
          lastMessagesData = lastMessagesRes.data;
        }
      }

      const lastMessagesMap = {};
      if (!authUser || !authUser._id) {
        set({ users: [], lastMessages: {}, isUsersLoading: false, conversationPagination: pagination });
        return;
      }
      
      const authUserIdNormalized = normalizeId(authUser._id);
      
      if (lastMessagesData && Array.isArray(lastMessagesData)) {
        lastMessagesData.forEach(msg => {
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
      
      // Add users from users endpoint
      usersData.forEach(user => {
        const userId = typeof user._id === 'string' ? user._id : user._id?.toString();
        if (userId && !seenIds.has(userId)) {
          seenIds.add(userId);
          uniqueUsers.push(user);
        }
      });

      // Also extract users from lastMessages if they're populated (as fallback)
      if (lastMessagesData && Array.isArray(lastMessagesData)) {
        lastMessagesData.forEach(msg => {
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
        lastMessages: lastMessagesMap,
        conversationPagination: pagination
      });
    } catch (error) {
      // Only log non-401 errors (401 is expected when not authenticated)
      if (error.response?.status !== 401) {
        console.error("Error loading users:", error);
        toast.error(error.response?.data?.message || error.response?.data?.error || "Failed to load users");
      }
      // Clear users on error (except 401)
      if (error.response?.status !== 401) {
        set({ users: [], lastMessages: {}, isUsersLoading: false });
      } else {
        // Even for 401, clear loading state
        set({ isUsersLoading: false });
      }
    } finally {
      clearTimeout(safetyTimeout);
      set({ isUsersLoading: false });
    }
  },

  // Get all users (for contacts page - not just users with conversations)
  getAllUsers: async () => {
    const authUser = useAuthStore.getState().authUser;
    
    // Don't try to load users if not authenticated
    if (!authUser) {
      set({ allUsers: [], isAllUsersLoading: false });
      return;
    }
    
    set({ isAllUsersLoading: true });
    
    try {
      // Load all users with pagination - reduced limit for better performance
      const usersRes = await axiosInstance.get("/messages/users/all?page=1&limit=100"); // Reduced from 200 to 100
      
      // Handle 401 errors gracefully
      if (usersRes.status === 401) {
        useAuthStore.getState().logout();
        set({ allUsers: [], isAllUsersLoading: false });
        return;
      }

      // Handle standardized response format: { success: true, data: [...], pagination: {...} }
      let usersData = [];
      if (usersRes.data) {
        if (usersRes.data.data && Array.isArray(usersRes.data.data)) {
          usersData = usersRes.data.data;
        } else if (Array.isArray(usersRes.data)) {
          usersData = usersRes.data;
        }
      }
      
      set({ allUsers: usersData, isAllUsersLoading: false });
    } catch (error) {
      console.error("Error loading all users:", error);
      if (error.response?.status !== 401) {
        toast.error(error.response?.data?.message || "Failed to load users");
      }
      set({ allUsers: [], isAllUsersLoading: false });
    }
  },

  // Load more conversations (pagination - Telegram-style: page-based)
  loadMoreConversations: async () => {
    const state = get();
    const authUser = useAuthStore.getState().authUser;
    
    // Don't load if already loading or no more to load
    if (state.isLoadingMoreConversations || !state.conversationPagination.hasMore || !authUser) {
      return;
    }
    
    set({ isLoadingMoreConversations: true });
    
    try {
      const { page, limit } = state.conversationPagination;
      const nextPage = page + 1; // Load next page
      
      const lastMessagesRes = await axiosInstance.get(`/messages/last-messages?page=${nextPage}&limit=${limit}`);
      
      // Handle 401 errors gracefully
      if (lastMessagesRes.status === 401) {
        useAuthStore.getState().logout();
        set({ isLoadingMoreConversations: false });
        return;
      }
      
      // Handle standardized response format: { success: true, data: [...], pagination: {...} }
      // Also supports old formats for backward compatibility
      let lastMessagesData = [];
      let pagination = state.conversationPagination;
      
      if (lastMessagesRes.data && typeof lastMessagesRes.data === 'object') {
        // New standardized format: { success: true, data: [...], pagination: {...} }
        if (lastMessagesRes.data.data && Array.isArray(lastMessagesRes.data.data)) {
          lastMessagesData = lastMessagesRes.data.data;
          pagination = {
            ...pagination,
            ...(lastMessagesRes.data.pagination || {}),
            page: lastMessagesRes.data.pagination?.page || nextPage,
            limit: lastMessagesRes.data.pagination?.limit || limit,
            total: lastMessagesRes.data.pagination?.total || 0,
            totalPages: lastMessagesRes.data.pagination?.totalPages || 0,
            hasMore: lastMessagesRes.data.pagination?.hasMore || false,
            skip: lastMessagesRes.data.pagination?.skip || 0,
          };
        }
        // Old format: { lastMessages: [...], pagination: {...} }
        else if (lastMessagesRes.data.lastMessages && Array.isArray(lastMessagesRes.data.lastMessages)) {
          lastMessagesData = lastMessagesRes.data.lastMessages;
          pagination = {
            ...pagination,
            ...(lastMessagesRes.data.pagination || {}),
            page: lastMessagesRes.data.pagination?.page || nextPage,
            limit: lastMessagesRes.data.pagination?.limit || limit,
            total: lastMessagesRes.data.pagination?.total || 0,
            totalPages: lastMessagesRes.data.pagination?.totalPages || 0,
            hasMore: lastMessagesRes.data.pagination?.hasMore || false,
            skip: lastMessagesRes.data.pagination?.skip || 0,
          };
        }
        // Direct array format
        else if (Array.isArray(lastMessagesRes.data)) {
          lastMessagesData = lastMessagesRes.data;
        }
      }
      
      if (!authUser || !authUser._id) {
        set({ isLoadingMoreConversations: false });
        return;
      }
      
      const authUserIdNormalized = normalizeId(authUser._id);
      const newLastMessagesMap = { ...state.lastMessages };
      
      // Merge new messages into existing map
      if (lastMessagesData && Array.isArray(lastMessagesData)) {
        lastMessagesData.forEach(msg => {
          const senderIdRaw = msg.senderId;
          const receiverIdRaw = msg.receiverId;
          const senderId = normalizeId(senderIdRaw);
          const receiverId = normalizeId(receiverIdRaw);
          
          if (!senderId || !receiverId) return;
          
          const targetIdRaw = senderId === authUserIdNormalized ? receiverIdRaw : senderIdRaw;
          const targetIdStr = normalizeId(targetIdRaw);
          
          if (!targetIdStr) return;
          
          // Only add if not already present (to avoid duplicates)
          if (!newLastMessagesMap[targetIdStr]) {
            newLastMessagesMap[targetIdStr] = msg;
            if (targetIdRaw && typeof targetIdRaw !== 'string') {
              newLastMessagesMap[targetIdRaw] = msg;
            }
          }
        });
      }
      
      // Also update users array with any new users from messages
      const uniqueUsers = [...state.users];
      const seenIds = new Set(state.users.map(u => normalizeId(u._id)));
      
      if (lastMessagesData && Array.isArray(lastMessagesData)) {
        lastMessagesData.forEach(msg => {
          const senderIdRaw = msg.senderId;
          const receiverIdRaw = msg.receiverId;
          
          [senderIdRaw, receiverIdRaw].forEach(userData => {
            if (userData && typeof userData === 'object' && userData._id && userData.fullname) {
              const userId = normalizeId(userData._id);
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
      
      set({
        users: uniqueUsers,
        lastMessages: newLastMessagesMap,
        conversationPagination: pagination,
        isLoadingMoreConversations: false
      });
    } catch (error) {
      if (error.response?.status !== 401) {
        console.error("Error loading more conversations:", error);
        toast.error(error.response?.data?.message || error.response?.data?.error || "Failed to load more conversations");
      }
      set({ isLoadingMoreConversations: false });
    }
  },
});

