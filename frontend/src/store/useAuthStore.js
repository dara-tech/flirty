import { create } from "zustand";
import { axiosInstance } from "../lib/axois";
import toast from "react-hot-toast";
import { io } from "socket.io-client";

// Get Socket.IO server URL from environment variable
// For separate hosting: use VITE_API_URL (without /api suffix)
// For same-domain: use relative path "/"
const getSocketURL = () => {
  if (import.meta.env.MODE === 'development') {
    return "http://localhost:5002";
  }
  
  // In production, if VITE_API_URL is set, use it (for separate hosting)
  // Remove /api suffix if present since Socket.IO connects to root
  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl) {
    return apiUrl.replace('/api', '');
  }
  
  // Fallback to relative path (same-domain hosting)
  return "/";
};

const BASE_URL = getSocketURL();


export const useAuthStore = create((set, get) => ({
  authUser: null,
  isSigningUp: false,
  isLoggingIn: false,
  isUpdatingProfile: false,
  isChangingPassword: false,
  isCheckingAuth: true,
  isGoogleAuthLoading: false,
  onlineUsers: [],
  socket: null,
  typingTimeout: null, // To handle typing timeout

  // ✅ Check Authentication Status
  checkAuth: async () => {
    set({ isCheckingAuth: true });
    try {
      const res = await axiosInstance.get("/auth/check");
      set({ authUser: res.data });
      get().connectSocket(); // ✅ Connect to socket after authentication
    } catch (error) {
      // Silently handle 401 errors (expected when not logged in)
      // Only log unexpected errors
      if (error.response?.status !== 401 && error.response?.status !== 403) {
        console.error("Error in checking authentication:", error);
      }
      set({ authUser: null });
    } finally {
      set({ isCheckingAuth: false });
    }
  },

  // ✅ Sign Up Function
  signup: async (data) => {
    set({ isSigningUp: true });
    try {
      const res = await axiosInstance.post("/auth/signup", data);
      set({ authUser: res.data });
      toast.success("Account created successfully");
      get().connectSocket(); // ✅ Connect socket after signup
    } catch (error) {
      console.error("Error:", error.response?.data || error.message);
      toast.error(error.response?.data?.message || "An error occurred. Please try again.");
    } finally {
      set({ isSigningUp: false });
    }
  },

  // ✅ Login Function
  login: async (data) => {
    set({ isLoggingIn: true });
    try {
      const res = await axiosInstance.post("/auth/login", data);
      
      // Check if cookie was set (in production, verify cookie is available)
      if (import.meta.env.MODE === 'production') {
        console.log('✅ Login successful, checking cookie...');
        // Small delay to ensure cookie is set by browser
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      set({ authUser: res.data });
      toast.success("Logged in successfully");
      
      // Verify auth immediately after login
      try {
        await get().checkAuth();
      } catch (checkError) {
        console.warn('⚠️ Auth check after login failed:', checkError);
        // If check fails, the cookie might not be set - but continue anyway
        // The user might need to refresh or the cookie will be set on next request
      }
      
      get().connectSocket(); // ✅ Connect socket after login
    } catch (error) {
      console.error('Login error:', error);
      const errorMessage = error.response?.data?.message || error.message || "Login failed";
      toast.error(errorMessage);
      throw error; // Re-throw to allow component to handle
    } finally {
      set({ isLoggingIn: false });
    }
  },

  // ✅ Google Authentication Function
  googleAuth: async (token) => {
    set({ isGoogleAuthLoading: true });
    try {
      const res = await axiosInstance.post("/auth/google", { token });
      set({ authUser: res.data });
      toast.success("Signed in with Google successfully");
      get().connectSocket(); // ✅ Connect socket after Google auth
    } catch (error) {
      console.error("Error:", error.response?.data || error.message);
      toast.error(error.response?.data?.message || "Failed to sign in with Google");
    } finally {
      set({ isGoogleAuthLoading: false });
    }
  },

  // ✅ Logout Function
  logout: async () => {
    try {
      await axiosInstance.post("/auth/logout");
      set({ authUser: null, onlineUsers: [] });
      toast.success("Logged out successfully");
      get().disconnectSocket(); // ✅ Disconnect socket on logout
    } catch (error) {
      toast.error(error.response?.data?.message || "Logout failed");
    }
  },

  // ✅ Update Profile
  updateProfile: async (data) => {
    set({ isUpdatingProfile: true });
    try {
      const res = await axiosInstance.put("/auth/update-profile", data);
      set({ authUser: res.data });
      toast.success("Profile updated successfully");
    } catch (error) {
      console.log("Error updating profile:", error);
      toast.error(error.response?.data?.message || "Update failed");
    } finally {
      set({ isUpdatingProfile: false });
    }
  },

  // ✅ Change Password
  changePassword: async (data) => {
    set({ isChangingPassword: true });
    try {
      await axiosInstance.put("/auth/change-password", data);
      toast.success("Password changed successfully");
      return true;
    } catch (error) {
      console.log("Error changing password:", error);
      toast.error(error.response?.data?.message || "Password change failed");
      return false;
    } finally {
      set({ isChangingPassword: false });
    }
  },

  // ✅ Connect to Socket.IO
  connectSocket: () => {
    const { authUser, socket } = get();
    if (!authUser || socket?.connected) return;

    const newSocket = io(BASE_URL, {
      query: { userId: authUser._id.toString() }, // Ensure userId is string
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    newSocket.on("connect", () => console.log("Socket connected:", newSocket.id));
    newSocket.on("getOnlineUsers", (userIds) => set({ onlineUsers: userIds }));
    newSocket.on("disconnect", (reason) => {
      if (reason === "io server disconnect") {
        // Server disconnected, manually reconnect
        newSocket.connect();
      }
      console.log("Socket disconnected:", reason);
    });
    
    // Suppress connection error logs (Socket.IO handles reconnection automatically)
    newSocket.on("connect_error", (error) => {
      // Only log if not a connection refused error (which is expected when backend is down)
      if (error.message && !error.message.includes("ECONNREFUSED") && !error.message.includes("Network")) {
        console.warn("Socket connection error:", error.message);
      }
    });

    set({ socket: newSocket });
  },

  // ✅ Disconnect from Socket.IO
  disconnectSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, onlineUsers: [] });
    }
  },

  // ✅ Start Typing
  startTyping: (receiverId) => {
    const { socket, typingTimeout } = get();
    if (!socket || !receiverId) return;

    // Emit the typing event
    socket.emit("typing", { receiverId });

    // Clear previous timeout (to reset the timer when typing continues)
    if (typingTimeout) clearTimeout(typingTimeout);

    // Set a new timeout to send stopTyping after a delay
    const timeout = setTimeout(() => {
      socket.emit("stopTyping", { receiverId });
    }, 2000); // Stop typing after 2 seconds of inactivity

    set({ typingTimeout: timeout });
  },

  // ✅ Stop Typing
  stopTyping: (receiverId) => {
    const { socket } = get();
    if (socket) {
      socket.emit("stopTyping", { receiverId });
    }
  },
}));
