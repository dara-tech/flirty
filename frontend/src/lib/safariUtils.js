/**
 * Safari-specific utilities and compatibility fixes
 * Handles Safari cookie, storage, and CORS issues
 */

/**
 * Check if storage (localStorage/sessionStorage) is available
 * Safari Private Mode disables storage, so we need to check
 */
export function storageAvailable(type) {
  try {
    const storage = window[type];
    const key = '__storage_test__';
    storage.setItem(key, key);
    storage.removeItem(key);
    return true;
  } catch (e) {
    // Storage is disabled (Safari Private Mode) or quota exceeded
    return false;
  }
}

/**
 * Detect if running on Safari (including iOS Safari)
 */
export function isSafari() {
  if (typeof navigator === 'undefined') return false;
  
  const ua = navigator.userAgent.toLowerCase();
  const isSafariUA = ua.includes('safari') && !ua.includes('chrome') && !ua.includes('chromium');
  const isIOS = /iphone|ipad|ipod/.test(ua);
  
  return isSafariUA || isIOS;
}

/**
 * Detect if running in Safari Private Mode
 * Note: This is a best-effort detection, not 100% reliable
 */
export function isPrivateMode() {
  return !storageAvailable('localStorage') && !storageAvailable('sessionStorage');
}

/**
 * Safe storage wrapper that falls back to in-memory storage
 * if localStorage/sessionStorage is unavailable (Safari Private Mode)
 */
class SafeStorage {
  constructor(type = 'sessionStorage') {
    this.type = type;
    this.memoryStorage = new Map();
    this.isAvailable = storageAvailable(type);
  }

  getItem(key) {
    if (this.isAvailable) {
      try {
        return window[this.type].getItem(key);
      } catch (e) {
        // Fallback to memory if storage fails
        this.isAvailable = false;
        return this.memoryStorage.get(key) || null;
      }
    }
    return this.memoryStorage.get(key) || null;
  }

  setItem(key, value) {
    if (this.isAvailable) {
      try {
        window[this.type].setItem(key, value);
        return;
      } catch (e) {
        // Fallback to memory if storage fails (quota exceeded, etc.)
        this.isAvailable = false;
      }
    }
    this.memoryStorage.set(key, value);
  }

  removeItem(key) {
    if (this.isAvailable) {
      try {
        window[this.type].removeItem(key);
        return;
      } catch (e) {
        this.isAvailable = false;
      }
    }
    this.memoryStorage.delete(key);
  }

  clear() {
    if (this.isAvailable) {
      try {
        window[this.type].clear();
        return;
      } catch (e) {
        this.isAvailable = false;
      }
    }
    this.memoryStorage.clear();
  }
}

// Export safe storage instances
export const safeSessionStorage = new SafeStorage('sessionStorage');
export const safeLocalStorage = new SafeStorage('localStorage');

/**
 * Check if cookies are available
 * Safari may block third-party cookies or cookies with SameSite=None
 */
export function cookiesAvailable() {
  try {
    // Try to set a test cookie
    document.cookie = 'safari_test=1; SameSite=Lax; Path=/';
    const hasCookie = document.cookie.includes('safari_test');
    // Clean up test cookie
    document.cookie = 'safari_test=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    return hasCookie;
  } catch (e) {
    return false;
  }
}

/**
 * Get authentication token from cookie or storage
 */
export function getAuthToken() {
  // Try cookie first (preferred method)
  const cookies = document.cookie.split(';');
  const jwtCookie = cookies.find(c => c.trim().startsWith('jwt='));
  if (jwtCookie) {
    return jwtCookie.split('=')[1];
  }
  
  // Fallback to sessionStorage (for Safari cookie issues)
  return safeSessionStorage.getItem('auth_token');
}

/**
 * Store authentication token in storage as fallback
 * This helps when cookies are blocked in Safari
 */
export function setAuthToken(token) {
  // Store in sessionStorage as fallback for Safari
  if (token) {
    safeSessionStorage.setItem('auth_token', token);
  } else {
    safeSessionStorage.removeItem('auth_token');
  }
}

/**
 * Clear authentication token from storage
 */
export function clearAuthToken() {
  safeSessionStorage.removeItem('auth_token');
  safeLocalStorage.removeItem('auth_token');
}

/**
 * Check if we're likely experiencing Safari cookie issues
 */
export function detectSafariCookieIssue() {
  if (!isSafari()) return false;
  
  // Check if cookies are available
  if (!cookiesAvailable()) {
    return true;
  }
  
  // Check if we have a token in storage but not in cookies
  const storageToken = safeSessionStorage.getItem('auth_token');
  const cookieToken = getAuthToken();
  
  if (storageToken && !cookieToken) {
    return true; // Likely cookie issue
  }
  
  return false;
}

