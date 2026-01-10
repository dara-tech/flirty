// Service Worker for Push Notifications
self.addEventListener('push', (event) => {
  console.log('🔔 Push event received!', event);
  
  // Ensure we wait for the notification to be shown
  const promiseChain = (async () => {
    let notificationData = {
      title: 'New Notification',
      body: 'You have a new notification',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'default',
      requireInteraction: false,
      data: {},
    };

    if (event.data) {
      try {
        const payload = event.data.json();
        console.log('📦 Parsed notification payload:', payload);
        notificationData = {
          title: payload.title || notificationData.title,
          body: payload.body || notificationData.body,
          icon: payload.icon || notificationData.icon,
          badge: payload.badge || notificationData.badge,
          image: payload.image || null, // Rich notification image
          tag: payload.tag || notificationData.tag,
          requireInteraction: payload.requireInteraction || false,
          data: payload.data || {},
        };
      } catch (e) {
        console.error('❌ Error parsing push payload:', e);
        // If parsing fails, try text
        try {
          const text = event.data.text();
          if (text) {
            notificationData.body = text;
          }
        } catch (textError) {
          console.error('❌ Error reading push data as text:', textError);
        }
      }
    } else {
      console.warn('⚠️ Push event has no data');
    }
    
    console.log('📋 Final notification data:', notificationData);

    // Format notification to match mobile style
    const options = {
      body: notificationData.body,
      icon: notificationData.icon || '/favicon.ico',
      badge: notificationData.badge || '/favicon.ico',
      image: notificationData.image || null, // Large image for rich notifications (optional)
      tag: notificationData.tag,
      requireInteraction: notificationData.requireInteraction,
      data: notificationData.data,
      actions: [],
      timestamp: Date.now(),
      vibrate: [200, 100, 200], // Vibration pattern for mobile
      silent: false,
      dir: 'auto', // Support RTL languages
      lang: 'en',
      // Mobile-specific options
      renotify: false, // Don't renotify for same tag
      sticky: false, // Don't require user interaction to dismiss
    };

    // Add action buttons based on notification type
    if (notificationData.data.type === 'call') {
      // For calls, make it more prominent
      options.requireInteraction = true;
      options.actions = [
        {
          action: 'answer',
          title: 'Answer',
          icon: '/favicon.ico'
        },
        {
          action: 'decline',
          title: 'Decline',
          icon: '/favicon.ico'
        }
      ];
    } else if (notificationData.data.type === 'message' || notificationData.data.type === 'group_message') {
      // Add Reply and Mark as read buttons for messages
      options.actions = [
        {
          action: 'reply',
          title: 'Reply',
          icon: '/favicon.ico'
        },
        {
          action: 'mark-read',
          title: 'Mark as read',
          icon: '/favicon.ico'
        }
      ];
    }

    console.log('🎯 Showing notification with options:', options);
    
    try {
      await self.registration.showNotification(notificationData.title, options);
      console.log('✅ Notification displayed successfully!');
    } catch (error) {
      console.error('❌ Error showing notification:', error);
      // Try showing a simpler notification if the rich one fails
      try {
        await self.registration.showNotification(notificationData.title, {
          body: notificationData.body,
          icon: '/favicon.ico',
          tag: notificationData.tag,
          data: notificationData.data,
        });
        console.log('✅ Fallback notification displayed successfully!');
      } catch (fallbackError) {
        console.error('❌ Fallback notification also failed:', fallbackError);
      }
    }
  })();
  
  event.waitUntil(promiseChain);
});

// Handle notification click and action buttons
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notificationData = event.notification.data || {};
  const action = event.action;

  // Handle action button clicks
  if (action === 'reply') {
    // Open chat and focus on message input
    const url = notificationData.type === 'group_message' 
      ? `/chat?groupId=${notificationData.groupId}&focus=input`
      : `/chat?userId=${notificationData.senderId}&focus=input`;
    
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes('/chat') && 'focus' in client) {
            return client.focus().then(() => {
              if (client.postMessage) {
                client.postMessage({
                  type: 'notification-action',
                  action: 'reply',
                  data: notificationData,
                });
              }
            });
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
    );
    return;
  }

  if (action === 'mark-read') {
    // Mark message as read without opening chat
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if (client.postMessage) {
            client.postMessage({
              type: 'notification-action',
              action: 'mark-read',
              data: notificationData,
            });
          }
        }
      })
    );
    return;
  }

  // Default: Open chat when notification body is clicked
  let url = '/chat';
  
  if (notificationData.type === 'message' && notificationData.senderId) {
    url = `/chat?userId=${notificationData.senderId}`;
  } else if (notificationData.type === 'group_message' && notificationData.groupId) {
    url = `/chat?groupId=${notificationData.groupId}`;
  } else if (notificationData.type === 'call' || notificationData.type === 'missed_call') {
    url = '/calls';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window open
      for (const client of clientList) {
        if (client.url.includes('/chat') && 'focus' in client) {
          return client.focus().then(() => {
            // Send a message to the client to handle the notification data
            if (client.postMessage) {
              client.postMessage({
                type: 'notification-clicked',
                data: notificationData,
              });
            }
          });
        }
      }

      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(url).then((windowClient) => {
          // Send a message to the new window after it loads
          if (windowClient && windowClient.postMessage) {
            windowClient.addEventListener('load', () => {
              windowClient.postMessage({
                type: 'notification-clicked',
                data: notificationData,
              });
            });
          }
        });
      }
    })
  );
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  // Optional: Track notification dismissal
  // Could send analytics or mark as read
  console.log('Notification closed:', event.notification.tag);
});

// Service worker activation
self.addEventListener('activate', (event) => {
  console.log('✅ Service worker activated');
  event.waitUntil(
    clients.claim().then(() => {
      console.log('✅ Service worker claimed clients');
    })
  );
});

// Service worker installation
self.addEventListener('install', (event) => {
  console.log('✅ Service worker installed');
  // Force activation of new service worker
  self.skipWaiting();
});
