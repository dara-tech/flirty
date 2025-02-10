import { create } from "zustand";
import { axiosInstance } from "../lib/axois";
import toast from "react-hot-toast";
import { io } from "socket.io-client";

const BASE_URL = import.meta.env.VITE_BASE_URL || "http://localhost:5001";

export const useAuthStore = create((set, get) => ({
  authUser: null,
  isSigningUp: false,
  isLoggingIn: false,
  isUpdatingProfile: false,
  isCheckingAuth: true,
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
      console.error("Error in checking authentication:", error);
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
      set({ authUser: res.data });
      toast.success("Logged in successfully");
      get().connectSocket(); // ✅ Connect socket after login
    } catch (error) {
      toast.error(error.response?.data?.message || "Login failed");
    } finally {
      set({ isLoggingIn: false });
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

  // ✅ Connect to Socket.IO
  connectSocket: () => {
    const { authUser, socket } = get();
    if (!authUser || socket?.connected) return;

    const newSocket = io(BASE_URL, {
      query: { userId: authUser._id },
      transports: ["websocket"],
    });

    newSocket.on("connect", () => console.log("Socket connected:", newSocket.id));
    newSocket.on("getOnlineUsers", (userIds) => set({ onlineUsers: userIds }));
    newSocket.on("disconnect", () => console.log("Socket disconnected"));

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
