import { axiosInstance } from './axois';

// Prevent duplicate setup calls
let setupInProgress = false;
let setupPromise = null;
let lastSetupUserId = null;

/**
 * Register service worker and subscribe to push notifications
 */
export async function setupPushNotifications(userId) {
  // Prevent duplicate calls for the same user
  if (setupInProgress && lastSetupUserId === userId) {
    console.log('⏳ Push notification setup already in progress for user:', userId);
    return setupPromise;
  }

  // If already set up for this user, skip
  if (lastSetupUserId === userId && !setupInProgress) {
    console.log('✅ Push notifications already set up for user:', userId);
    return { success: true, message: 'Already set up' };
  }

  setupInProgress = true;
  lastSetupUserId = userId;
  
  setupPromise = (async () => {
    try {
      return await _setupPushNotifications(userId);
    } finally {
      setupInProgress = false;
    }
  })();

  return setupPromise;
}

/**
 * Internal function to setup push notifications
 */
async function _setupPushNotifications(userId) {
  // Check if push notifications are supported
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('⚠️ Push notifications not supported in this browser');
    return { success: false, error: 'Not supported' };
  }

  try {
    // Request notification permission
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('⚠️ Notification permission denied');
        return { success: false, error: 'Permission denied', permission };
      }
    } else if (Notification.permission === 'denied') {
      console.warn('⚠️ Notification permission was previously denied');
      return { success: false, error: 'Permission denied', permission: 'denied' };
    }

    // Get VAPID public key from backend
    const vapidResponse = await axiosInstance.get('/push/vapid-public-key');
    if (!vapidResponse.data.success || !vapidResponse.data.data.publicKey) {
      console.error('❌ VAPID public key not available');
      return { success: false, error: 'VAPID key not available' };
    }

    const vapidPublicKey = vapidResponse.data.data.publicKey;

    // Register service worker (only if not already registered)
    let registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration) {
      registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });
      console.log('✅ Service worker registered');
    } else {
      console.log('✅ Service worker already registered');
    }

    // Wait for service worker to be ready
    registration = await navigator.serviceWorker.ready;

    // Get existing subscription or create new one
    let subscription = await registration.pushManager.getSubscription();
    let isNewSubscription = false;
    
    if (!subscription) {
      // Convert VAPID key to Uint8Array
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
      
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey,
      });
      isNewSubscription = true;
      console.log('✅ New push subscription created');
    } else {
      console.log('✅ Existing push subscription found');
      
      // Verify subscription is still valid by checking with backend
      try {
        const verifyResponse = await axiosInstance.get('/push/subscriptions');
        if (verifyResponse.data.success && verifyResponse.data.data) {
          const backendSubscriptions = verifyResponse.data.data.subscriptions || [];
          const isInBackend = backendSubscriptions.some(
            sub => sub.endpoint === subscription.endpoint
          );
          if (isInBackend) {
            console.log('✅ Subscription already exists in backend, skipping update');
            return { success: true, subscription, message: 'Already subscribed' };
          }
        }
      } catch (verifyError) {
        console.warn('⚠️ Could not verify subscription with backend:', verifyError.message);
        // Continue to update subscription anyway
      }
    }

    // Send subscription to backend (update or create)
    const subscriptionData = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: arrayBufferToBase64(subscription.getKey('p256dh')),
        auth: arrayBufferToBase64(subscription.getKey('auth')),
      },
      userAgent: navigator.userAgent,
      deviceInfo: JSON.stringify({
        platform: navigator.platform,
        language: navigator.language,
      }),
    };

    const response = await axiosInstance.post('/push/subscribe', subscriptionData);
    
    if (response.data.success) {
      console.log(`✅ Successfully ${isNewSubscription ? 'subscribed' : 'updated'} push notifications`);
      return { success: true, subscription };
    } else {
      console.error('❌ Backend rejected subscription:', response.data);
      return { success: false, error: response.data.error || 'Unknown error' };
    }
  } catch (error) {
    console.error('❌ Failed to setup push notifications:', error);
    return { success: false, error: error.message || 'Setup failed' };
  }
}

/**
 * Convert VAPID public key to Uint8Array
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

