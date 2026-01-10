/**
 * Push Notification Service
 * Minimal implementation for browser notifications
 */

class PushNotificationService {
  /**
   * Show browser notification directly (when user is online)
   * This uses the Notification API, not push notifications
   */
  async showBrowserNotification(title, options = {}) {
    // Check if notifications are supported
    if (!('Notification' in window)) {
      console.warn('Browser notifications not supported');
      return false;
    }

    // Check permission
    if (Notification.permission === 'denied') {
      console.warn('Notification permission denied');
      return false;
    }

    // Request permission if not granted
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('Notification permission not granted');
        return false;
      }
    }

    try {
      // Show notification
      const notification = new Notification(title, {
        icon: options.icon || '/favicon.ico',
        badge: options.badge || '/favicon.ico',
        body: options.body || '',
        tag: options.tag || 'default',
        requireInteraction: options.requireInteraction || false,
        silent: options.silent || false,
        data: options.data || {},
      });

      // Handle notification click
      notification.onclick = (event) => {
        event.preventDefault();
        window.focus();
        notification.close();

        // Handle navigation based on notification data
        if (options.data) {
          if (options.data.type === 'message' && options.data.senderId) {
            // Navigate to chat with sender
            if (window.location.pathname !== '/') {
              window.location.href = `/?userId=${options.data.senderId}`;
            } else {
              // Trigger navigation in the app
              window.dispatchEvent(new CustomEvent('notification-clicked', {
                detail: options.data
              }));
            }
          } else if (options.data.type === 'group_message' && options.data.groupId) {
            // Navigate to group chat
            if (window.location.pathname !== '/') {
              window.location.href = `/?groupId=${options.data.groupId}`;
            } else {
              window.dispatchEvent(new CustomEvent('notification-clicked', {
                detail: options.data
              }));
            }
          }
        }
      };

      // Auto close after 5 seconds (unless requireInteraction is true)
      if (!options.requireInteraction) {
        setTimeout(() => {
          notification.close();
        }, 5000);
      }

      return true;
    } catch (error) {
      console.error('Error showing browser notification:', error);
      return false;
    }
  }
}

// Export singleton instance
export default new PushNotificationService();
