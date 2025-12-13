import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io } from 'socket.io-client';
import axiosInstance, { setLogoutCallback, getBackendBaseURL } from '../lib/api';
import { setAuthToken, getAuthToken, clearAuthToken } from '../lib/storage';

// Store creator function
const createAuthStore = (set, get) => {
  // Set up logout callback for API interceptor
  setLogoutCallback(async () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
    }
    set({ authUser: null, socket: null });
  });

  return {
    authUser: null,
    socket: null,
    isCheckingAuth: false,
    isGoogleAuthLoading: false,
    onlineUsers: [],

    // Login
    login: async (email, password) => {
      try {
        console.log('Login attempt started for:', email);
        const response = await axiosInstance.post('/auth/login', {
          email,
          password,
        });

        // Backend returns: { success: true, data: user, token }
        const user = response.data?.data || response.data?.user;
        const token = response.data?.token;
        console.log('Login response received:', { 
          hasUser: !!user, 
          hasToken: !!token,
          responseStructure: Object.keys(response.data || {})
        });

        // Store token
        if (token) {
          await setAuthToken(token);
        }

        // Connect socket
        const socketURL = getBackendBaseURL();
        console.log('Connecting socket to:', socketURL);
        const socket = io(socketURL, {
          query: { userId: user._id.toString() }, // Include userId so backend can map socket to user
          auth: { token },
          transports: ['websocket'],
        });

        socket.on('connect', () => {
          console.log('✅ Socket connected successfully');
          console.log('   Socket ID:', socket.id);
          console.log('   User ID:', user._id.toString());
          console.log('   Backend URL:', socketURL);
          console.log('   Socket connected:', socket.connected);
          
          // Verify socket is properly mapped on backend
          // The backend should log: "Socket {socket.id} mapped to user {userId}"
        });

        socket.on('connect_error', (error) => {
          console.error('❌ Socket connection error:', error.message);
          console.error('   Backend URL:', socketURL);
          console.error('   Check: Is backend running? Is URL correct?');
        });
        
        socket.on('disconnect', (reason) => {
          console.warn('⚠️ Socket disconnected:', reason);
        });

        // Listen for online users
        socket.on('getOnlineUsers', (userIds) => {
          console.log('👥 Online users updated (login):', userIds?.length || 0, 'users');
          console.log('   User IDs:', userIds);
          set({ onlineUsers: userIds || [] });
        });

        set({ authUser: user, socket });
        console.log('Login successful, authUser set:', user?.email || user?.fullname);
        
        // Zustand persist middleware will automatically save authUser
        // Give it a moment to persist, but don't fail login if persist has issues
        try {
          await new Promise(resolve => setTimeout(resolve, 200));
          // Verify it was saved
          const savedUser = await AsyncStorage.getItem('auth-storage');
          console.log('User persisted to AsyncStorage:', savedUser ? 'Yes' : 'No');
        } catch (persistError) {
          // Don't fail login if persistence has issues
          console.warn('Warning: Could not verify persistence, but login succeeded:', persistError);
        }
        
        return { user, token };
      } catch (error) {
        console.error('Login error details:', {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status,
        });
        // Extract validation errors if available
        const errorData = error.response?.data;
        if (errorData?.errors && Array.isArray(errorData.errors)) {
          const errorMessages = errorData.errors.map(err => err.message || `${err.field}: ${err.message}`).join('\n');
          throw new Error(errorMessages || errorData.message || 'Login failed');
        }
        // Provide more helpful error messages
        if (error.message?.includes('Network') || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
          throw new Error('Cannot connect to server. Make sure your backend is running and accessible from this device.');
        }
        throw new Error(errorData?.message || error.message || 'Login failed');
      }
    },

    // Signup
    signup: async (fullname, email, password) => {
      try {
        const response = await axiosInstance.post('/auth/signup', {
          fullname,
          email,
          password,
        });

        // Backend returns: { success: true, data: user, token }
        const user = response.data?.data || response.data?.user;
        const token = response.data?.token;

        if (token) {
          await setAuthToken(token);
        }

        const socketURL = getBackendBaseURL();
        const socket = io(socketURL, {
          query: { userId: user._id.toString() }, // Include userId so backend can map socket to user
          auth: { token },
          transports: ['websocket'],
        });

        set({ authUser: user, socket });
        // Give persist middleware time to save
        await new Promise(resolve => setTimeout(resolve, 200));
        console.log('Signup successful, user persisted');
        return { user, token };
      } catch (error) {
        // Extract validation errors if available
        const errorData = error.response?.data;
        if (errorData?.errors && Array.isArray(errorData.errors)) {
          const errorMessages = errorData.errors.map(err => err.message || `${err.field}: ${err.message}`).join('\n');
          throw new Error(errorMessages || errorData.message || 'Signup failed');
        }
        throw new Error(errorData?.message || error.message || 'Signup failed');
      }
    },

    // Check auth
    checkAuth: async () => {
      // Prevent multiple simultaneous auth checks
      const currentState = get();
      if (currentState.isCheckingAuth) {
        return;
      }
      
      set({ isCheckingAuth: true });
      try {
        // Get current persisted user FIRST (from rehydration)
        const { authUser: persistedUser } = get();
        if (__DEV__) {
          console.log('checkAuth: persistedUser from store:', persistedUser ? (persistedUser.email || persistedUser.fullname) : 'none');
        }
        
        // If we have a persisted user, prioritize keeping it
        if (persistedUser && persistedUser._id) {
          // Just verify token exists, don't clear user
          const token = await getAuthToken().catch(() => null);
          if (!token) {
            // No token but have user - keep user (offline mode)
            set({ isCheckingAuth: false });
            return;
          }
          
          // Try to verify with backend, but keep user on failure
          try {
            const response = await axiosInstance.get('/auth/me').catch(() => null);
            if (response?.data) {
              const user = response.data?.data?.user || response.data?.user || response.data;
              if (user && user._id) {
                // Backend verified - update user
                const { socket } = get();
                if (!socket || !socket.connected) {
                  const socketURL = getBackendBaseURL();
                  const newSocket = io(socketURL, {
                    query: { userId: user._id.toString() },
                    auth: { token },
                    transports: ['websocket'],
                  });
                  
                  newSocket.on('getOnlineUsers', (userIds) => {
                    console.log('👥 Online users updated (checkAuth):', userIds?.length || 0, 'users');
                    console.log('   User IDs:', userIds);
                    set({ onlineUsers: userIds || [] });
                  });
                  
                  set({ authUser: user, socket: newSocket, isCheckingAuth: false });
                } else {
                  set({ authUser: user, isCheckingAuth: false });
                }
                return;
              }
            }
          } catch (apiError) {
            // Only clear if token is invalid (401/403)
            if (apiError.response?.status === 401 || apiError.response?.status === 403) {
              console.log('Token invalid (401/403), clearing auth');
              await clearAuthToken();
              set({ authUser: null, isCheckingAuth: false });
              return;
            }
            // Other errors - keep persisted user
            set({ isCheckingAuth: false });
            return;
          }
          
          // Backend check completed, keep user
          set({ isCheckingAuth: false });
          return;
        }
        
        // Add a timeout to prevent hanging (reduced timeout for faster failure)
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Auth check timeout')), 3000)
        );

        const tokenPromise = getAuthToken();
        const token = await Promise.race([tokenPromise, timeoutPromise]).catch(() => null);
        if (__DEV__) {
          console.log('checkAuth: token found:', !!token);
        }

        if (!token) {
          // No token - clear user only if no persisted user
          if (!persistedUser) {
            console.log('checkAuth: No token and no persisted user, clearing auth');
            set({ authUser: null, isCheckingAuth: false });
          } else {
            console.log('checkAuth: No token but have persisted user, keeping user');
            set({ isCheckingAuth: false });
          }
          return;
        }

        // Try to check auth with backend
        try {
          const response = await Promise.race([
            axiosInstance.get('/auth/me'),
            timeoutPromise
          ]);
          
          // Handle different response formats
          const user = response.data?.data?.user || response.data?.user || response.data;

          if (user && user._id) {
            // Backend verified - use fresh user data
            // Reconnect socket if needed
            const { socket } = get();
            if (!socket || !socket.connected) {
              const socketURL = getBackendBaseURL();
              const newSocket = io(socketURL, {
                query: { userId: user._id.toString() }, // Include userId so backend can map socket to user
                auth: { token },
                transports: ['websocket'],
              });
              
              newSocket.on('getOnlineUsers', (userIds) => {
                console.log('👥 Online users updated (reconnect):', userIds?.length || 0, 'users');
                console.log('   User IDs:', userIds);
                set({ onlineUsers: userIds || [] });
              });
              
              set({ authUser: user, socket: newSocket });
            } else {
              set({ authUser: user });
            }
          } else {
            // Backend returned invalid user - keep persisted user if available
            if (persistedUser && persistedUser._id && token) {
              console.log('Backend returned invalid user data, keeping persisted user:', persistedUser.email || persistedUser.fullname);
              // Keep the persisted user and try to reconnect socket
              const { socket } = get();
              if (!socket || !socket.connected) {
                try {
                  const socketURL = getBackendBaseURL();
                  const newSocket = io(socketURL, {
                    query: { userId: persistedUser._id.toString() }, // Include userId so backend can map socket to user
                    auth: { token },
                    transports: ['websocket'],
                  });
                  
                  newSocket.on('getOnlineUsers', (userIds) => {
                    console.log('👥 Online users updated (checkAuth reconnect):', userIds?.length || 0, 'users');
                    console.log('   User IDs:', userIds);
                    set({ onlineUsers: userIds || [] });
                  });
                  
                  set({ socket: newSocket });
                } catch (socketError) {
                  console.log('Socket connection failed, continuing offline:', socketError.message);
                }
              }
              // Don't clear auth - keep persisted user
            } else {
              // No persisted user or token - clear auth
              console.log('Backend returned invalid user and no persisted user, clearing auth');
              set({ authUser: null });
            }
          }
        } catch (apiError) {
          // Backend might not be running or network error
          // If we have a persisted user and token, keep the user (offline mode)
          if (persistedUser && persistedUser._id && token) {
            console.log('Backend unavailable, keeping persisted user:', persistedUser.email || persistedUser.fullname);
            // Try to reconnect socket if needed
            const { socket } = get();
            if (!socket || !socket.connected) {
              try {
                const socketURL = getBackendBaseURL();
                const newSocket = io(socketURL, {
                  query: { userId: persistedUser._id.toString() }, // Include userId so backend can map socket to user
                  auth: { token },
                  transports: ['websocket'],
                });
                
                newSocket.on('getOnlineUsers', (userIds) => {
                  console.log('👥 Online users updated (checkAuth socket):', userIds?.length || 0, 'users');
                  console.log('   User IDs:', userIds);
                  set({ onlineUsers: userIds || [] });
                });
                
                set({ socket: newSocket });
              } catch (socketError) {
                console.log('Socket connection failed, continuing offline:', socketError.message);
              }
            }
            // Keep the persisted user - don't clear it
          } else if (apiError.response?.status === 401 || apiError.response?.status === 403) {
            // Token is invalid - clear auth
            console.log('Token invalid (401/403), clearing auth');
            await clearAuthToken();
            set({ authUser: null });
          } else {
            // Network error or backend down - if no persisted user, clear auth
            if (!persistedUser) {
              console.log('No persisted user and backend unavailable, clearing auth');
              set({ authUser: null });
            } else {
              console.log('Backend unavailable but have persisted user, keeping user');
            }
          }
        }
      } catch (error) {
        // Not logged in or timeout - only clear if no persisted user
        const { authUser: persistedUser } = get();
        if (!persistedUser) {
          console.log('Auth check failed, no persisted user:', error.message);
          set({ authUser: null });
        } else {
          console.log('Auth check failed but have persisted user, keeping user');
        }
      } finally {
        set({ isCheckingAuth: false });
      }
    },

    // Logout
    logout: async () => {
      console.log('🔄 Logout called');
      const { socket } = get();
      if (socket) {
        socket.disconnect();
        console.log('🔌 Socket disconnected');
      }
      await clearAuthToken();
      console.log('🗑️ Auth token cleared');
      // Clear auth state - navigation will be handled by App.js useEffect
      set({ authUser: null, socket: null, onlineUsers: [] });
      console.log('✅ Auth state cleared - authUser set to null');
    },

    // Update auth user (for profile updates)
    setAuthUser: (user) => {
      set({ authUser: user });
    },

    // Disconnect socket
    disconnectSocket: () => {
      const { socket } = get();
      if (socket) {
        socket.disconnect();
        set({ socket: null });
      }
    },

    // Google Authentication
    googleAuth: async (token) => {
      set({ isGoogleAuthLoading: true });
      try {
        const response = await axiosInstance.post('/auth/google', { token });

        // Backend returns: { success: true, data: user, token }
        const user = response.data?.data || response.data?.user;
        const authToken = response.data?.token;

        // Store token
        if (authToken) {
          await setAuthToken(authToken);
        }

        // Connect socket
        const socketURL = getBackendBaseURL();
        const socket = io(socketURL, {
          query: { userId: user._id.toString() }, // Include userId so backend can map socket to user
          auth: { token: authToken },
          transports: ['websocket'],
        });

        socket.on('connect', () => {
          console.log('✅ Socket connected successfully (Google auth)');
          console.log('   Socket ID:', socket.id);
          console.log('   Backend URL:', socketURL);
        });

        socket.on('connect_error', (error) => {
          console.error('❌ Socket connection error (Google auth):', error.message);
          console.error('   Backend URL:', socketURL);
        });
        
        socket.on('disconnect', (reason) => {
          console.warn('⚠️ Socket disconnected (Google auth):', reason);
        });

        // Listen for online users
        socket.on('getOnlineUsers', (userIds) => {
          console.log('👥 Online users updated (login):', userIds?.length || 0, 'users');
          console.log('   User IDs:', userIds);
          set({ onlineUsers: userIds || [] });
        });

        set({ authUser: user, socket, isGoogleAuthLoading: false });
        console.log('Google auth successful, authUser set');
        return { user, token: authToken };
      } catch (error) {
        // Extract validation errors if available
        const errorData = error.response?.data;
        if (errorData?.errors && Array.isArray(errorData.errors)) {
          const errorMessages = errorData.errors.map(err => err.message || `${err.field}: ${err.message}`).join('\n');
          throw new Error(errorMessages || errorData.message || 'Google sign-in failed');
        }
        throw new Error(errorData?.message || error.message || 'Google sign-in failed');
      } finally {
        set({ isGoogleAuthLoading: false });
      }
    },
  };
};

// Create store with persist middleware to save user data
const storeCreator = (set, get) => ({
  _hasHydrated: false,
  ...createAuthStore(set, get),
});

export const useAuthStore = create(
  persist(
    storeCreator,
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist authUser - exclude socket and other non-serializable state
      partialize: (state) => ({
        authUser: state?.authUser || null,
      }),
      onRehydrateStorage: () => {
        return async (state, error) => {
          if (error) {
            console.error('Error rehydrating auth store:', error);
            // Set hasHydrated even on error so app can continue
            setTimeout(() => {
              useAuthStore.setState({ _hasHydrated: true, isCheckingAuth: false });
            }, 0);
            return;
          }
          
          // Ensure isCheckingAuth is always a boolean after rehydration
          setTimeout(() => {
            if (state) {
              useAuthStore.setState({ 
                _hasHydrated: true,
                isCheckingAuth: false,
                isGoogleAuthLoading: false,
                // Reset non-persisted state
                socket: null,
                onlineUsers: [],
              });
              if (__DEV__) {
                console.log('Auth store rehydrated, user:', state.authUser ? (state.authUser.email || state.authUser.fullname || 'logged in') : 'not logged in');
                if (state.authUser) {
                  console.log('Rehydrated user details:', { 
                    id: state.authUser._id, 
                    email: state.authUser.email, 
                    fullname: state.authUser.fullname 
                  });
                }
              }
            } else {
              useAuthStore.setState({ 
                _hasHydrated: true, 
                isCheckingAuth: false,
                socket: null,
                onlineUsers: [],
              });
            }
          }, 0);
        };
      },
    }
  )
);

// Ensure _hasHydrated is set immediately if store already exists
// Use a more reliable approach for React Native
const ensureHydration = () => {
  const state = useAuthStore.getState();
  if (!state._hasHydrated) {
    // Force hydration if it hasn't happened after a delay
    useAuthStore.setState({ _hasHydrated: true, isCheckingAuth: false });
    if (__DEV__) {
      console.log('Force set _hasHydrated to true (fallback)');
    }
  }
};

// Immediate check (synchronous if possible)
try {
  const initialState = useAuthStore.getState();
  if (!initialState._hasHydrated) {
    // Set immediately
    useAuthStore.setState({ _hasHydrated: true, isCheckingAuth: false });
    if (__DEV__) {
      console.log('Immediate hydration set');
    }
  }
} catch (e) {
  // Store might not be ready yet
}

// Check hydration status multiple times to ensure it's set
setTimeout(ensureHydration, 50);
setTimeout(ensureHydration, 100);
setTimeout(ensureHydration, 300);
setTimeout(ensureHydration, 500);
setTimeout(ensureHydration, 1000);
setTimeout(ensureHydration, 1500); // Additional check
setTimeout(ensureHydration, 2000); // Final fallback after 2 seconds
