import webpush from "web-push";
import PushSubscription from "../model/pushSubscription.model.js";
import User from "../model/user.model.js";
import logger from "../lib/logger.js";

// Initialize web-push with VAPID keys from environment variables
// These keys should be generated once and stored in .env file
// To generate: npx web-push generate-vapid-keys
// IMPORTANT: For Apple/Safari push notifications, VAPID_SUBJECT must be a valid mailto: URL
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:your-email@example.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  logger.info("VAPID keys configured for push notifications", {
    subject: VAPID_SUBJECT,
    publicKeyPrefix: VAPID_PUBLIC_KEY.substring(0, 20) + "...",
  });
} else {
  logger.warn("VAPID keys not configured - push notifications will be disabled");
}

/**
 * Send push notification to a user
 * @param {string} userId - User ID to send notification to
 * @param {object} payload - Notification payload
 * @param {string} payload.title - Notification title
 * @param {string} payload.body - Notification body
 * @param {string} payload.icon - Notification icon URL (optional)
 * @param {string} payload.badge - Notification badge URL (optional)
 * @param {object} payload.data - Custom data (optional)
 */
export const sendPushNotification = async (userId, payload) => {
  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      logger.warn("VAPID keys not configured. Push notifications disabled.");
      return { success: false, error: "VAPID keys not configured" };
    }

    // Get all active push subscriptions for this user
    const subscriptions = await PushSubscription.getActiveSubscriptions(userId);

    if (!subscriptions || subscriptions.length === 0) {
      logger.debug(`No active push subscriptions found for user ${userId}`);
      return { success: false, error: "No active subscriptions", sent: 0, failed: 0, total: 0 };
    }

    logger.info(`📤 Attempting to send push notification to user ${userId}`, {
      subscriptionCount: subscriptions.length,
      title: payload.title,
      body: payload.body,
      subscriptions: subscriptions.map(s => ({
        id: s._id,
        endpoint: s.endpoint.substring(0, 50) + '...',
        isActive: s.isActive,
      })),
    });

    // Ensure icon URL is absolute for better compatibility
    let iconUrl = payload.icon || "/favicon.ico";
    if (iconUrl && !iconUrl.startsWith('http') && !iconUrl.startsWith('/')) {
      iconUrl = `/${iconUrl}`;
    }
    
    // Use a default icon if none provided
    if (!iconUrl || iconUrl === '/favicon.ico') {
      // Try to use a proper app icon (192x192 recommended for notifications)
      iconUrl = "/favicon.ico";
    }

    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: iconUrl,
      badge: payload.badge || iconUrl,
      image: payload.image || null, // Large image for rich notifications
      data: payload.data || {},
      tag: payload.tag || "default",
      requireInteraction: payload.requireInteraction || false,
      silent: payload.silent || false,
      dir: 'auto', // Support RTL languages
      lang: 'en',
    });

    const results = await Promise.allSettled(
      subscriptions.map(async (subscription) => {
        try {
          const pushSubscription = {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.keys.p256dh,
              auth: subscription.keys.auth,
            },
          };

          // Check if this is an Apple Push endpoint (Safari)
          const isAppleEndpoint = subscription.endpoint && subscription.endpoint.includes('web.push.apple.com');
          const isGoogleEndpoint = subscription.endpoint && subscription.endpoint.includes('google.com');
          
          // Actually send the notification
          // webpush.sendNotification either resolves (success) or rejects (error)
          await webpush.sendNotification(pushSubscription, notificationPayload);
          
          // Log success with endpoint type (if we get here, it succeeded)
          const endpointType = isAppleEndpoint ? 'Apple/Safari' : (isGoogleEndpoint ? 'Google/Chrome' : 'Other');
          logger.info(`✅ Push notification sent successfully to user ${userId}`, {
            subscriptionId: subscription._id,
            endpoint: subscription.endpoint.substring(0, 60) + '...',
            endpointType,
          });
          
          return { success: true, subscriptionId: subscription._id };
        } catch (error) {
          const isAppleEndpoint = subscription.endpoint && subscription.endpoint.includes('web.push.apple.com');
          const isGoogleEndpoint = subscription.endpoint && subscription.endpoint.includes('google.com');
          const endpointType = isAppleEndpoint ? 'Apple/Safari' : (isGoogleEndpoint ? 'Google/Chrome' : 'Other');
          
          const errorDetails = {
            subscriptionId: subscription._id,
            endpoint: subscription.endpoint.substring(0, 60) + '...',
            endpointType,
            statusCode: error.statusCode,
            status: error.status,
            code: error.code,
            message: error.message,
            body: error.body,
            stack: error.stack?.substring(0, 200), // First 200 chars of stack
          };
          
          logger.error(`❌ Failed to send push notification to subscription ${subscription._id}:`, errorDetails);

          // Handle different error status codes
          if (error.statusCode === 410 || error.statusCode === 404) {
            // Subscription expired or not found - remove it
            await PushSubscription.findByIdAndDelete(subscription._id);
            logger.info(`Removed invalid push subscription ${subscription._id} (${error.statusCode})`);
          } else if (error.statusCode === 403) {
            // Forbidden - might be Apple endpoint issue or VAPID key problem
            logger.warn(`Push notification forbidden (403) for subscription ${subscription._id}${isAppleEndpoint ? ' - Apple endpoint may require different VAPID configuration' : ''}`);
            // Don't remove subscription on 403 - might be temporary
          } else if (error.statusCode === 413) {
            // Payload too large
            logger.warn(`Push notification payload too large for subscription ${subscription._id}`);
          } else if (error.statusCode === 400) {
            // Bad request - might be invalid keys or endpoint format
            logger.warn(`Bad request (400) for subscription ${subscription._id}${isAppleEndpoint ? ' - Check VAPID keys compatibility with Apple' : ''}`);
          } else {
            // Other errors - log full details
            logger.error(`Unexpected error (${error.statusCode || 'unknown'}) for subscription ${subscription._id}:`, errorDetails);
          }

          return { 
            success: false, 
            error: error.message, 
            statusCode: error.statusCode,
            subscriptionId: subscription._id,
            isAppleEndpoint 
          };
        }
      })
    );

    const successful = results.filter((r) => r.status === "fulfilled" && r.value.success).length;
    const failed = results.length - successful;
    
    // Log detailed results
    logger.info(`📊 Push notification results for user ${userId}:`, {
      total: results.length,
      successful,
      failed,
      details: results.map((r, idx) => ({
        index: idx,
        status: r.status,
        success: r.status === 'fulfilled' ? r.value.success : false,
        error: r.status === 'rejected' ? r.reason?.message : (r.status === 'fulfilled' ? r.value.error : null),
        statusCode: r.status === 'fulfilled' ? r.value.statusCode : (r.reason?.statusCode || null),
      })),
    });

    return {
      success: successful > 0,
      sent: successful,
      failed,
      total: results.length,
    };
  } catch (error) {
    logger.error("Error sending push notification:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Send push notification for new message
 */
export const sendMessageNotification = async (receiverId, messageData) => {
  try {
    const sender = await User.findById(messageData.senderId).select("fullname profilePic");
    if (!sender) {
      return { success: false, error: "Sender not found" };
    }

    const senderName = sender.fullname || "Someone";
    // Format title like mobile notifications: "New message from [Name]"
    let title = `New message from ${senderName}`;
    let body = "";
    let icon = sender.profilePic || "";
    let image = null; // For rich notifications with image preview

    // Determine body based on message type (support multi-line text)
    if (messageData.text) {
      // Keep full text for multi-line support, but limit length
      body = messageData.text.length > 200 ? messageData.text.substring(0, 200) + "..." : messageData.text;
    } else if (messageData.image && messageData.image.length > 0) {
      body = "📷 Sent a photo";
      // Use first image as notification image for rich preview
      image = Array.isArray(messageData.image) ? messageData.image[0] : messageData.image;
    } else if (messageData.audio && messageData.audio.length > 0) {
      body = "🎵 Sent an audio message";
    } else if (messageData.video && messageData.video.length > 0) {
      body = "🎥 Sent a video";
      // Use first video thumbnail if available
      image = Array.isArray(messageData.video) ? messageData.video[0] : messageData.video;
    } else if (messageData.file && messageData.file.length > 0) {
      body = "📎 Sent a file";
    } else {
      body = "Sent a message";
    }

    return await sendPushNotification(receiverId, {
      title,
      body,
      icon: icon || undefined, // Use sender's profile pic as icon
      image: image || undefined, // Rich notification image if available
      tag: `message-${messageData._id || messageData.id}`,
      data: {
        type: "message",
        messageId: messageData._id || messageData.id,
        senderId: messageData.senderId,
        senderName: senderName,
        receiverId,
        groupId: messageData.groupId || null,
      },
    });
  } catch (error) {
    logger.error("Error sending message notification:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Send push notification for group message
 */
export const sendGroupMessageNotification = async (receiverId, messageData, groupData) => {
  try {
    const sender = await User.findById(messageData.senderId).select("fullname profilePic");
    if (!sender) {
      return { success: false, error: "Sender not found" };
    }

    const groupName = groupData?.name || "Group";
    const senderName = sender.fullname || "Someone";

    let body = "";
    if (messageData.text) {
      body = messageData.text.length > 100 ? messageData.text.substring(0, 100) + "..." : messageData.text;
    } else if (messageData.image && messageData.image.length > 0) {
      body = "📷 Sent a photo";
    } else if (messageData.audio && messageData.audio.length > 0) {
      body = "🎵 Sent an audio message";
    } else if (messageData.video && messageData.video.length > 0) {
      body = "🎥 Sent a video";
    } else if (messageData.file && messageData.file.length > 0) {
      body = "📎 Sent a file";
    } else {
      body = "Sent a message";
    }

    // Format title like mobile notifications: "New message from [Name] in [Group]"
    const title = `New message from ${senderName} in ${groupName}`;
    const icon = sender.profilePic || "";
    let image = null; // For rich notifications with image preview

    // Add image preview for media messages
    if (messageData.image && messageData.image.length > 0) {
      image = Array.isArray(messageData.image) ? messageData.image[0] : messageData.image;
    } else if (messageData.video && messageData.video.length > 0) {
      image = Array.isArray(messageData.video) ? messageData.video[0] : messageData.video;
    }

    return await sendPushNotification(receiverId, {
      title,
      body,
      icon: icon || undefined, // Use sender's profile pic as icon
      image: image || undefined, // Rich notification image if available
      tag: `group-message-${messageData._id || messageData.id}`,
      data: {
        type: "group_message",
        messageId: messageData._id || messageData.id,
        senderId: messageData.senderId,
        senderName: senderName,
        groupId: messageData.groupId,
        groupName: groupName,
        receiverId,
      },
    });
  } catch (error) {
    logger.error("Error sending group message notification:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Send push notification for incoming call
 */
export const sendCallNotification = async (receiverId, callData) => {
  try {
    const caller = await User.findById(callData.callerId).select("fullname profilePic");
    if (!caller) {
      return { success: false, error: "Caller not found" };
    }

    const callerName = caller.fullname || "Someone";
    const callType = callData.callType === "video" ? "video call" : "voice call";
    const icon = caller.profilePic || "";

    return await sendPushNotification(receiverId, {
      title: `Incoming ${callType}`,
      body: `${callerName} is calling you`,
      icon,
      tag: `call-${callData.callId}`,
      requireInteraction: true, // Calls require user interaction
      data: {
        type: "call",
        callId: callData.callId,
        callerId: callData.callerId,
        callType: callData.callType,
        groupId: callData.groupId || null,
      },
    });
  } catch (error) {
    logger.error("Error sending call notification:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Send push notification for missed call
 */
export const sendMissedCallNotification = async (receiverId, callData) => {
  try {
    const caller = await User.findById(callData.callerId).select("fullname profilePic");
    if (!caller) {
      return { success: false, error: "Caller not found" };
    }

    const callerName = caller.fullname || "Someone";
    const callType = callData.callType === "video" ? "video call" : "voice call";
    const icon = caller.profilePic || "";

    return await sendPushNotification(receiverId, {
      title: "Missed call",
      body: `You missed a ${callType} from ${callerName}`,
      icon,
      tag: `missed-call-${callData.callId}`,
      data: {
        type: "missed_call",
        callId: callData.callId,
        callerId: callData.callerId,
        callType: callData.callType,
        groupId: callData.groupId || null,
      },
    });
  } catch (error) {
    logger.error("Error sending missed call notification:", error);
    return { success: false, error: error.message };
  }
};



