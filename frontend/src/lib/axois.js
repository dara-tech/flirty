import axios from "axios";
import { useAuthStore } from "../store/useAuthStore";
import { getAuthToken, setAuthToken, clearAuthToken, isSafari, detectSafariCookieIssue } from "./safariUtils";

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
  // Suppress default axios error logging for cleaner console
  validateStatus: function (status) {
    // Don't throw errors for 401/403 on /auth/me (handled silently)
    return status >= 200 && status < 500; // Accept all status codes < 500
  },
});

// Response interceptor to handle errors and authentication
axiosInstance.interceptors.response.use(
  (response) => {
    // Safari compatibility: Extract token from response headers or body if available
    // Some backends send token in response for Safari compatibility
    const token = response.headers['x-auth-token'] || response.data?.token;
    if (token) {
      setAuthToken(token);
    }
    return response;
  },
  (error) => {
    const isMeEndpoint = error.config?.url?.includes('/auth/me');
    const is401 = error.response?.status === 401;
    const is403 = error.response?.status === 403;
    
    // Completely suppress logging for /auth/me 401/403 errors (expected when not logged in)
    if (isMeEndpoint && (is401 || is403)) {
      // Silently reject without any logging
      // This prevents console noise for expected authentication checks
      return Promise.reject(error);
    }
    
    // Handle 401 errors for other endpoints
    if (is401) {
      // For other endpoints, user needs to log in
      // Clear auth state if session expired
      const authStore = useAuthStore.getState();
      
      // Only clear if we have an auth user (session expired/invalid)
      if (authStore.authUser) {
        console.warn('⚠️ Session expired or invalid. Clearing auth state.');
        // Clear auth state using Zustand's setState method
        useAuthStore.setState({ authUser: null });
        // Disconnect socket if connected
        if (authStore.socket) {
          authStore.disconnectSocket();
        }
      }
      
      return Promise.reject(error);
    }
    
    // Log other errors (but not 401s for /auth/me which are already handled above)
    if (error.response && error.response.status !== 401) {
      const errorData = error.response.data;
      // Log validation errors with more detail
      if (errorData?.errors && Array.isArray(errorData.errors)) {
        console.error("API Validation Error:", error.response.status, errorData.errors);
      } else {
        console.error("API Error:", error.response.status, errorData);
      }
    } else if (error.request && !is401) {
      console.error("Network Error:", error.request);
    } else if (!is401) {
      console.error("Error:", error.message);
    }
    return Promise.reject(error);
  }
);

// Request interceptor to add Bearer token for Safari compatibility
axiosInstance.interceptors.request.use(
  (config) => {
    // Safari compatibility: Add Bearer token if cookies might not work
    // Check if we're on Safari and cookies might be blocked
    if (isSafari() || detectSafariCookieIssue()) {
      const token = getAuthToken();
      if (token && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } else {
      // For other browsers, try to get token from storage as fallback
      const token = getAuthToken();
      if (token && !config.headers.Authorization) {
        // Only add if cookie is not present (fallback)
        const hasCookie = document.cookie.includes('jwt=');
        if (!hasCookie) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
    }
    
    // Log in production for debugging
    if (import.meta.env.MODE === 'production') {
      // Check if cookies are available (for debugging)
      const hasCookies = document.cookie.includes('jwt');
      const hasBearerToken = !!config.headers.Authorization;
      console.log('📤 Request:', {
        url: config.url,
        method: config.method,
        hasCredentials: config.withCredentials,
        baseURL: config.baseURL,
        cookiesAvailable: hasCookies,
        bearerTokenUsed: hasBearerToken,
        isSafari: isSafari(),
      });
    }
    return config;
  },
  (error) => {
    // Don't log request errors for auth me endpoint
    if (!error.config?.url?.includes('/auth/me')) {
      console.error("Request Error:", error.message);
    }
    return Promise.reject(error);
  }
);
