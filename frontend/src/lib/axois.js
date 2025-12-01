import axios from "axios";
import { useAuthStore } from "../store/useAuthStore";

// Get backend URL from environment variable or use relative path
const getBackendURL = () => {
  // In development, use relative path (Vite proxy handles it)
  if (import.meta.env.MODE === 'development') {
    return '/api';
  }
  
  // In production, use environment variable if set (for separate hosting)
  // VITE_API_URL should be the full backend URL (e.g., https://backend.onrender.com/api)
  // If it doesn't end with /api, append it
  const apiUrl = import.meta.env.VITE_API_URL;
  
  if (apiUrl) {
    // Remove trailing slash if present
    const cleanUrl = apiUrl.replace(/\/$/, '');
    
    // Ensure the URL ends with /api for API routes
    const finalUrl = cleanUrl.endsWith('/api') ? cleanUrl : `${cleanUrl}/api`;
    
    // Log in production for debugging (can be removed later)
    console.log('🌐 Backend API URL configured:', finalUrl);
    
    return finalUrl;
  }
  
  // Fallback to relative path (for same-domain hosting)
  console.warn('⚠️ VITE_API_URL not set, using relative path /api');
  return '/api';
};

const backendBaseURL = getBackendURL();

export const axiosInstance = axios.create({
  baseURL: backendBaseURL,
  withCredentials: true,
});

// Response interceptor to handle errors and authentication
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    const isCheckEndpoint = error.config?.url?.includes('/check');
    const is401 = error.response?.status === 401;
    
    // Handle 401 errors (authentication required)
    if (is401) {
      // For /check endpoint, silently handle (expected when not logged in)
      if (isCheckEndpoint) {
        return Promise.reject(error);
      }
      
      // For other endpoints, user needs to log in
      // Clear auth state if session expired
      const authStore = useAuthStore.getState();
      
      // Only clear if we have an auth user (session expired/invalid)
      if (authStore.authUser) {
        console.warn('⚠️ Session expired or invalid. Clearing auth state.');
        // Clear auth state without calling logout endpoint (to avoid circular 401)
        authStore.set({ authUser: null });
        authStore.disconnectSocket();
        
        // Optionally redirect to login (if using React Router)
        // This will be handled by the app's routing logic
      }
      
      return Promise.reject(error);
    }
    
    // Log other errors
    if (error.response) {
      console.error("API Error:", error.response.status, error.response.data);
    } else if (error.request) {
      console.error("Network Error:", error.request);
    } else {
      console.error("Error:", error.message);
    }
    return Promise.reject(error);
  }
);

// Request interceptor to suppress console errors for expected 401s
axiosInstance.interceptors.request.use(
  (config) => config,
  (error) => {
    // Don't log request errors for auth check endpoint
    if (!error.config?.url?.includes('/check')) {
      console.error("Request Error:", error.message);
    }
    return Promise.reject(error);
  }
);
