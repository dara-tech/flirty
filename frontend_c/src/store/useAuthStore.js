import { create } from "zustand";
import { axiosInstance } from "../lib/axois";
import toast from "react-hot-toast";
import { io } from "socket.io-client";
import { setAuthToken, clearAuthToken, isSafari, detectSafariCookieIssue, safeSessionStorage } from "../lib/safariUtils";

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
  _checkAuthPromise: null, // Prevent duplicate simultaneous calls

  // ✅ Check Authentication Status
  checkAuth: async () => {
    // If already checking, return the existing promise
    if (get()._checkAuthPromise) {
      return get()._checkAuthPromise;
    }

    // Create a new promise for this auth check
    const authCheckPromise = (async () => {
      set({ isCheckingAuth: true });
      try {
        const res = await axiosInstance.get("/auth/me");
        // Handle new response format: { success: true, data: {...} }
        const userData = res.data?.data || res.data;
        if (userData && userData._id) {
          set({ authUser: userData });
          get().connectSocket(); // ✅ Connect to socket after authentication
        } else {
          set({ authUser: null });
        }
      } catch (error) {
        // Silently handle 401/403 errors (expected when not logged in)
        // These are completely normal and should never be logged
        // The browser console will still show the HTTP error, but we don't log it ourselves
        const status = error.response?.status;
        if (status !== 401 && status !== 403) {
          // Only log unexpected errors (network issues, server errors, etc.)
          // 401/403 are expected and handled silently
          console.error("Error in checking authentication:", error);
        }
        // Always set authUser to null on any error (user is not authenticated)
        set({ authUser: null });
      } finally {
        set({ isCheckingAuth: false, _checkAuthPromise: null });
      }
    })();

    // Store the promise to prevent duplicate calls
    set({ _checkAuthPromise: authCheckPromise });
    return authCheckPromise;
  },

  // ✅ Sign Up Function
  signup: async (data) => {
    set({ isSigningUp: true });
    try {
      const res = await axiosInstance.post("/auth/signup", data);
      
      // Safari compatibility: Store token from response
      const token = res.headers['x-auth-token'] || res.data?.token;
      if (token) {
        setAuthToken(token);
      }
      
      // Handle new response format: { success: true, data: {...} }
      const userData = res.data?.data || res.data;
      if (userData && userData._id) {
        set({ authUser: userData });
        toast.success("Account created successfully");
        
        // Safari-specific: Store token if cookies might be blocked
        if (isSafari() || detectSafariCookieIssue()) {
          const cookies = document.cookie.split(';');
          const jwtCookie = cookies.find(c => c.trim().startsWith('jwt='));
          if (jwtCookie) {
            const cookieToken = jwtCookie.split('=')[1];
            setAuthToken(cookieToken);
          } else if (token) {
            setAuthToken(token);
          }
        }
        
        get().connectSocket(); // ✅ Connect socket after signup
      } else {
        throw new Error("Invalid user data received");
      }
    } catch (error) {
      console.error("Error:", error.response?.data || error.message);
      // Handle validation errors with field-specific messages
      const errorData = error.response?.data;
      if (errorData?.errors && Array.isArray(errorData.errors)) {
        const errorMessages = errorData.errors.map(e => e.message).join(', ');
        toast.error(errorMessages || errorData.message || "Validation failed");
      } else {
        toast.error(errorData?.message || "An error occurred. Please try again.");
      }
    } finally {
      set({ isSigningUp: false });
    }
  },

  // ✅ Login Function
  login: async (data) => {
    set({ isLoggingIn: true });
    try {
      const res = await axiosInstance.post("/auth/login", data);
      
      // Safari compatibility: Check for token in response body or headers
      // Some backends send token explicitly for Safari cookie issues
      const token = res.headers['x-auth-token'] || res.data?.token;
      if (token) {
        setAuthToken(token);
      }
      
      // Check if cookie was set (in production, verify cookie is available)
      if (import.meta.env.MODE === 'production') {
        // Small delay to ensure cookie is set by browser
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Safari-specific: If cookies might be blocked, ensure token is stored
      if (isSafari() || detectSafariCookieIssue()) {
        // Try to extract token from cookie if available
        const cookies = document.cookie.split(';');
        const jwtCookie = cookies.find(c => c.trim().startsWith('jwt='));
        if (jwtCookie) {
          const cookieToken = jwtCookie.split('=')[1];
          setAuthToken(cookieToken);
        } else if (token) {
          // Use token from response if cookie not available
          setAuthToken(token);
        }
      }
      
      // Handle new response format: { success: true, data: {...} }
      const userData = res.data?.data || res.data;
      if (userData && userData._id) {
        set({ authUser: userData });
        toast.success("Logged in successfully");
        
        // Safari-specific warning if cookie issues detected
        if (isSafari() && detectSafariCookieIssue()) {
        }
        
        // Verify auth immediately after login
        try {
          await get().checkAuth();
        } catch (checkError) {
          // If check fails, the cookie might not be set - but continue anyway
          // The user might need to refresh or the cookie will be set on next request
        }
        
        get().connectSocket(); // ✅ Connect socket after login
      } else {
        throw new Error("Invalid user data received from server");
      }
    } catch (error) {
      console.error('Login error:', error);
      const errorData = error.response?.data;
      
      // Safari-specific error handling
      if (isSafari() && error.response?.status === 401) {
        const safariErrorMsg = "Login failed. Please check Safari settings:\n" +
          "1. Allow cookies in Safari Settings\n" +
          "2. Disable 'Prevent Cross-Site Tracking'\n" +
          "3. Try disabling Private Mode";
        toast.error(safariErrorMsg, { duration: 6000 });
      } else {
      // Handle validation errors
      if (errorData?.errors && Array.isArray(errorData.errors)) {
        const errorMessages = errorData.errors.map(e => e.message).join(', ');
        toast.error(errorMessages || errorData.message || "Login failed");
      } else {
        const errorMessage = errorData?.message || error.message || "Login failed";
        toast.error(errorMessage);
        }
      }
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
      
      // Safari compatibility: Store token from response
      const authToken = res.headers['x-auth-token'] || res.data?.token;
      if (authToken) {
        setAuthToken(authToken);
      }
      
      // Handle new response format: { success: true, data: {...} }
      const userData = res.data?.data || res.data;
      if (userData && userData._id) {
        set({ authUser: userData });
        toast.success("Signed in with Google successfully");
        
        // Safari-specific: Store token if cookies might be blocked
        if (isSafari() || detectSafariCookieIssue()) {
          const cookies = document.cookie.split(';');
          const jwtCookie = cookies.find(c => c.trim().startsWith('jwt='));
          if (jwtCookie) {
            const cookieToken = jwtCookie.split('=')[1];
            setAuthToken(cookieToken);
          } else if (authToken) {
            setAuthToken(authToken);
          }
        }
        
        // Refresh user data to ensure we have the latest profile picture
        // Wait a moment for the cookie to be set, then check auth again
        setTimeout(async () => {
          try {
            await get().checkAuth();
          } catch (checkError) {
          }
        }, 200);
        
        get().connectSocket(); // ✅ Connect socket after Google auth
      } else {
        throw new Error("Invalid user data received from server");
      }
    } catch (error) {
      console.error("Error:", error.response?.data || error.message);
      const errorData = error.response?.data;
      
      // Safari-specific error handling
      if (isSafari() && error.response?.status === 401) {
        toast.error("Google sign-in failed. Please check Safari settings:\n" +
          "1. Allow cookies in Safari Settings\n" +
          "2. Disable 'Prevent Cross-Site Tracking'", { duration: 6000 });
      } else {
      // Handle validation errors
      if (errorData?.errors && Array.isArray(errorData.errors)) {
        const errorMessages = errorData.errors.map(e => e.message).join(', ');
        toast.error(errorMessages || errorData.message || "Failed to sign in with Google");
      } else {
        toast.error(errorData?.message || "Failed to sign in with Google");
        }
      }
    } finally {
      set({ isGoogleAuthLoading: false });
    }
  },

  // ✅ Logout Function
  logout: async () => {
    try {
      await axiosInstance.post("/auth/logout");
      set({ authUser: null, onlineUsers: [] });
      clearAuthToken(); // Clear token from storage
      toast.success("Logged out successfully");
      get().disconnectSocket(); // ✅ Disconnect socket on logout
    } catch (error) {
      const errorData = error.response?.data;
      // Clear token even if logout request fails
      clearAuthToken();
      toast.error(errorData?.message || "Logout failed");
    }
  },

  // ✅ Update Profile
  updateProfile: async (data) => {
    set({ isUpdatingProfile: true });
    let errorShown = false; // Track if we've already shown the error toast
    try {
      const res = await axiosInstance.put("/auth/update-profile", data);
      
      // Check response status - axios validateStatus allows 400, so we need to check manually
      if (res.status >= 400 || res.data?.success === false) {
        const errorData = res.data;
        // Handle validation errors
        if (errorData?.errors && Array.isArray(errorData.errors)) {
          const errorMessages = errorData.errors.map(e => e.message).join(', ');
          toast.error(errorMessages || errorData.message || "Update failed");
        } else {
          toast.error(errorData?.message || "Update failed");
        }
        errorShown = true; // Mark that we've shown the error
        throw new Error(errorData?.message || "Update failed");
      }
      
      // Handle successful response: { success: true, data: {...} }
      const userData = res.data?.data || res.data;
      if (userData && userData._id) {
        set({ authUser: userData });
        toast.success("Profile updated successfully");
      } else {
        toast.error("Invalid response from server");
        errorShown = true; // Mark that we've shown the error
        throw new Error("Invalid response from server");
      }
    } catch (error) {
      // Only show error if we haven't already shown it above
      if (!errorShown) {
        const errorData = error.response?.data;
        // Handle validation errors
        if (errorData?.errors && Array.isArray(errorData.errors)) {
          const errorMessages = errorData.errors.map(e => e.message).join(', ');
          toast.error(errorMessages || errorData.message || "Update failed");
        } else {
          toast.error(errorData?.message || error.message || "Update failed");
        }
      }
      throw error;
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
      const errorData = error.response?.data;
      // Handle validation errors
      if (errorData?.errors && Array.isArray(errorData.errors)) {
        const errorMessages = errorData.errors.map(e => e.message).join(', ');
        toast.error(errorMessages || errorData.message || "Password change failed");
      } else {
        toast.error(errorData?.message || "Password change failed");
      }
      return false;
    } finally {
      set({ isChangingPassword: false });
    }
  },

  // ✅ Connect to Socket.IO
  connectSocket: () => {
    const { authUser, socket } = get();
    // Only connect if we have a valid authUser with an _id
    if (!authUser || !authUser._id || socket?.connected) return;

    const newSocket = io(BASE_URL, {
      query: { userId: authUser._id.toString() }, // Ensure userId is string
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    newSocket.on("connect", () => {
      // Socket connected
    });
    newSocket.on("getOnlineUsers", (userIds) => set({ onlineUsers: userIds }));
    newSocket.on("disconnect", (reason) => {
      if (reason === "io server disconnect") {
        // Server disconnected, manually reconnect
        newSocket.connect();
      }
    });
    
    // Suppress connection error logs (Socket.IO handles reconnection automatically)
    newSocket.on("connect_error", (error) => {
      // Only log if not a connection refused error (which is expected when backend is down)
      if (error.message && !error.message.includes("ECONNREFUSED") && !error.message.includes("Network")) {
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
