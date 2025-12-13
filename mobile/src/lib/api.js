import axios from 'axios';
import { Platform } from 'react-native';
import { getAuthToken, setAuthToken, clearAuthToken } from './storage';

// Callback function to handle logout - will be set by useAuthStore
let onLogoutCallback = null;

export const setLogoutCallback = (callback) => {
  onLogoutCallback = callback;
};

// Get backend base URL (without /api) for socket connections
export const getBackendBaseURL = () => {
  if (__DEV__) {
    // Your computer's local IP address (update this if your IP changes)
    const LOCAL_IP = process.env.EXPO_PUBLIC_LOCAL_IP || '192.168.0.116';
    
    // Set to 'emulator' to use 10.0.2.2, or 'device' to use your computer's IP
    const DEVICE_TYPE = process.env.EXPO_PUBLIC_DEVICE_TYPE || 'device';
    
    if (Platform.OS === 'android') {
      if (DEVICE_TYPE === 'emulator') {
      // Android emulator uses 10.0.2.2 to access host machine's localhost
      return 'http://10.0.2.2:5002';
      } else {
        // Physical Android device needs your computer's local IP address
        return `http://${LOCAL_IP}:5002`;
      }
    } else if (Platform.OS === 'ios') {
      if (DEVICE_TYPE === 'emulator' || DEVICE_TYPE === 'simulator') {
      // iOS Simulator can use localhost
      return 'http://localhost:5002';
      } else {
        // Physical iOS device needs your computer's local IP address
        return `http://${LOCAL_IP}:5002`;
      }
    } else {
      // For other platforms, use local IP
      return `http://${LOCAL_IP}:5002`;
    }
  }
  
  // Production URL - set this to your deployed backend
  const prodURL = process.env.EXPO_PUBLIC_API_URL || 'https://flirty-aspk.onrender.com';
  return prodURL.replace('/api', ''); // Remove /api for socket URL
};

// Get backend URL - adjust this to your backend URL
const getBackendURL = () => {
  const baseURL = getBackendBaseURL();
  return `${baseURL}/api`;
};

const backendBaseURL = getBackendURL();

export const axiosInstance = axios.create({
  baseURL: backendBaseURL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add Bearer token
axiosInstance.interceptors.request.use(
  async (config) => {
    const token = await getAuthToken();
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors and token storage
axiosInstance.interceptors.response.use(
  (response) => {
    // Extract token from response headers or body
    const token = response.headers['x-auth-token'] || response.data?.token;
    if (token) {
      setAuthToken(token);
    }
    return response;
  },
  async (error) => {
    const isMeEndpoint = error.config?.url?.includes('/auth/me');
    const is401 = error.response?.status === 401;
    const is403 = error.response?.status === 403;

    // Handle 401 errors - call logout callback if available
    if (is401 && !isMeEndpoint && onLogoutCallback) {
      await clearAuthToken();
      onLogoutCallback();
    }

    // Log errors (except expected 401s for /auth/me)
    if (!(isMeEndpoint && (is401 || is403))) {
      if (error.response) {
        console.error('API Error:', error.response.status, error.response.data);
      } else if (error.request) {
        console.error('Network Error:', error.request);
      } else {
        console.error('Error:', error.message);
      }
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;

