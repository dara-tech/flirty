import axios from "axios";

// Get backend URL from environment variable or use relative path
const getBackendURL = () => {
  // In development, use relative path (Vite proxy handles it)
  if (import.meta.env.MODE === 'development') {
    return '/api';
  }
  
  // In production, use environment variable if set (for separate hosting)
  // Otherwise fallback to relative path (for same-domain hosting)
  return import.meta.env.VITE_API_URL || '/api';
};

export const axiosInstance = axios.create({
  baseURL: getBackendURL(),
  withCredentials: true,
});

// Response interceptor to handle errors silently
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    const isCheckEndpoint = error.config?.url?.includes('/check');
    const is401 = error.response?.status === 401;
    
    // Completely suppress 401 errors from /check endpoint (expected when not logged in)
    if (isCheckEndpoint && is401) {
      // Silently reject - don't log, don't show errors
      return Promise.reject(error);
    }
    
    // Don't log other 401 errors either (expected auth failures)
    if (is401) {
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
