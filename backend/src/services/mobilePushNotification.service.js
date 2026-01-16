import admin from "firebase-admin";
import User from "../model/user.model.js";
import logger from "../lib/logger.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin SDK
let firebaseInitialized = false;

// Circuit breaker for Firebase messaging
const circuitBreaker = {
  failureCount: 0,
  lastFailureTime: null,
  threshold: 5, // Open circuit after 5 consecutive failures
  timeout: 60000, // Reset after 60 seconds
  isOpen() {
    if (this.failureCount < this.threshold) return false;
    if (!this.lastFailureTime) return false;

    const timeSinceLastFailure = Date.now() - this.lastFailureTime;
    if (timeSinceLastFailure > this.timeout) {
      // Reset circuit breaker
      this.failureCount = 0;
      this.lastFailureTime = null;
      return false;
    }
    return true;
  },
  recordSuccess() {
    this.failureCount = 0;
    this.lastFailureTime = null;
  },
  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
  },
};

try {
  // Try to load Firebase service account key
  const serviceAccountPath = path.join(
    __dirname,
    "../../config/firebase-service-account.json"
  );

  logger.info(
    `🔍 [Firebase] Checking for service account at: ${serviceAccountPath}`
  );

  if (fs.existsSync(serviceAccountPath)) {
    logger.info("📄 [Firebase] Service account file found, loading...");
    const serviceAccount = JSON.parse(
      fs.readFileSync(serviceAccountPath, "utf8")
    );

    // Validate service account structure
    if (
      !serviceAccount.project_id ||
      !serviceAccount.private_key ||
      !serviceAccount.client_email
    ) {
      throw new Error("Invalid service account file: missing required fields");
    }

    logger.info(`🔑 [Firebase] Project ID: ${serviceAccount.project_id}`);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    firebaseInitialized = true;
    logger.info("✅ [Firebase] Firebase Admin SDK initialized successfully");
  } else {
    logger.warn(
      "⚠️ [Firebase] Service account not found. Mobile push notifications will be disabled."
    );
    logger.warn(`   Expected path: ${serviceAccountPath}`);
  }
} catch (error) {
  logger.error("❌ [Firebase] Failed to initialize Firebase Admin SDK:", {
    error: error.message,
    stack: error.stack,
  });
}

/**
 * Validate FCM token format
 * @param {string} token - FCM token to validate
 * @returns {boolean} True if token is valid
 */
const isValidFCMToken = (token) => {
  if (!token || typeof token !== "string") return false;

  // Basic validation: non-empty string with reasonable length
  // Firebase will reject truly invalid tokens, so we keep this minimal
  // to avoid filtering out legitimate tokens with varying formats
  const minLength = 50;
  const maxLength = 500;

  return token.length >= minLength && token.length <= maxLength;
};

/**
 * Retry mechanism with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {Promise} Result of the function
 */
const retryWithBackoff = async (fn, maxRetries = 3, baseDelay = 100) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      // Don't retry on invalid token errors
      if (
        error.code === "messaging/invalid-registration-token" ||
        error.code === "messaging/registration-token-not-registered" ||
        error.code === "messaging/invalid-argument"
      ) {
        throw error;
      }

      if (attempt === maxRetries - 1) {
        throw error; // Last attempt failed
      }

      // Exponential backoff: 100ms, 200ms, 400ms, etc.
      const delay = baseDelay * Math.pow(2, attempt);
      logger.debug(
        `⏱️ [Retry] Attempt ${attempt + 1} failed, retrying in ${delay}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

/**
 * Send mobile push notification using FCM/APNs
 * @param {string} userId - User ID to send notification to
 * @param {object} payload - Notification payload
 * @param {string} payload.title - Notification title
 * @param {string} payload.body - Notification body
 * @param {object} payload.data - Custom data
 * @returns {Promise<object>} Result with success status and statistics
 */
export const sendMobilePushNotification = async (userId, payload) => {
  const startTime = Date.now();

  try {
    logger.debug(
      `📱 [Mobile Push] Called for user ${userId}, Firebase initialized: ${firebaseInitialized}`
    );

    if (!firebaseInitialized) {
      logger.warn(
        "⚠️ [Mobile Push] Firebase not initialized, skipping mobile push notification"
      );
      return {
        success: false,
        error: "Firebase not initialized",
        sent: 0,
        failed: 0,
        total: 0,
      };
    }

    // Check circuit breaker
    if (circuitBreaker.isOpen()) {
      logger.warn(
        `⚠️ [Mobile Push] Circuit breaker is open, skipping push notification (failures: ${circuitBreaker.failureCount})`
      );
      return {
        success: false,
        error: "Circuit breaker open - too many failures",
        sent: 0,
        failed: 0,
        total: 0,
      };
    }

    // Input validation
    if (!userId) {
      logger.warn("⚠️ [Mobile Push] userId is required");
      return {
        success: false,
        error: "userId is required",
        sent: 0,
        failed: 0,
        total: 0,
      };
    }

    if (!payload || !payload.title) {
      logger.warn("⚠️ [Mobile Push] payload.title is required");
      return {
        success: false,
        error: "payload.title is required",
        sent: 0,
        failed: 0,
        total: 0,
      };
    }

    // Get user's push tokens with timeout
    const user = await Promise.race([
      User.findById(userId).select("pushTokens"),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Database query timeout")), 5000)
      ),
    ]);

    if (!user || !user.pushTokens || user.pushTokens.length === 0) {
      logger.debug(`⚠️ [Mobile Push] No push tokens found for user ${userId}`);
      return {
        success: false,
        error: "No push tokens",
        sent: 0,
        failed: 0,
        total: 0,
      };
    }

    // Filter valid tokens
    const validTokens = user.pushTokens.filter((tokenData) =>
      isValidFCMToken(tokenData.token)
    );

    if (validTokens.length === 0) {
      logger.warn(`⚠️ [Mobile Push] No valid FCM tokens for user ${userId}`);
      return {
        success: false,
        error: "No valid push tokens",
        sent: 0,
        failed: 0,
        total: 0,
      };
    }

    if (validTokens.length < user.pushTokens.length) {
      logger.warn(
        `⚠️ [Mobile Push] Filtered out ${
          user.pushTokens.length - validTokens.length
        } invalid tokens`
      );
    }

    logger.info(`📱 [Mobile Push] Sending to user ${userId}`, {
      totalTokens: user.pushTokens.length,
      validTokens: validTokens.length,
      title: payload.title,
      body: payload.body?.substring(0, 50),
    });

    const results = [];
    let sent = 0;
    let failed = 0;
    const invalidTokens = [];

    // Send to each token with retry mechanism
    for (const tokenData of validTokens) {
      try {
        const message = {
          token: tokenData.token,
          notification: {
            title: payload.title || "New Message",
            body: payload.body || "",
          },
          data: payload.data
            ? Object.fromEntries(
                Object.entries(payload.data).map(([key, value]) => [
                  key,
                  String(value),
                ])
              )
            : {},
          // Platform-specific config
          android: {
            priority: "high",
            notification: {
              sound: "default",
              clickAction: "FLUTTER_NOTIFICATION_CLICK",
              channelId: "chat_messages",
            },
          },
          apns: {
            payload: {
              aps: {
                sound: "default",
                badge: 1,
                contentAvailable: true,
                category: "MESSAGE",
              },
            },
            headers: {
              "apns-priority": "10",
            },
          },
        };

        // Send with retry and timeout
        const response = await Promise.race([
          retryWithBackoff(
            () => admin.messaging().send(message),
            3, // Max 3 retries
            100 // Base delay 100ms
          ),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("FCM request timeout")), 10000)
          ),
        ]);

        logger.debug(`✅ Push sent to ${tokenData.platform}:`, {
          token: tokenData.token.substring(0, 20) + "...",
          messageId: response,
        });

        sent++;
        results.push({
          success: true,
          platform: tokenData.platform,
          messageId: response,
        });

        // Record success for circuit breaker
        circuitBreaker.recordSuccess();

        // Update last used timestamp
        tokenData.lastUsed = new Date();
      } catch (error) {
        logger.error(`❌ Failed to send push to ${tokenData.platform}:`, {
          token: tokenData.token.substring(0, 20) + "...",
          error: error.message,
          code: error.code,
        });

        failed++;
        results.push({
          success: false,
          platform: tokenData.platform,
          error: error.message,
        });

        // Track invalid tokens for batch removal
        if (
          error.code === "messaging/invalid-registration-token" ||
          error.code === "messaging/registration-token-not-registered" ||
          error.code === "messaging/invalid-argument"
        ) {
          logger.info(
            `🗑️  Marking invalid token for removal (user ${userId}):`,
            tokenData.token.substring(0, 20) + "..."
          );
          invalidTokens.push(tokenData.token);
        } else {
          // Record failure for circuit breaker (only for non-token errors)
          circuitBreaker.recordFailure();
        }
      }
    }

    // Batch remove invalid tokens (more efficient than filter in loop)
    if (invalidTokens.length > 0) {
      user.pushTokens = user.pushTokens.filter(
        (t) => !invalidTokens.includes(t.token)
      );

      try {
        await user.save();
        logger.info(
          `🗑️ Removed ${invalidTokens.length} invalid token(s) for user ${userId}`
        );
      } catch (saveError) {
        logger.error(`❌ Failed to save user after removing tokens:`, {
          userId,
          error: saveError.message,
        });
      }
    } else if (sent > 0) {
      // Update last used timestamps if any messages were sent
      try {
        await user.save();
      } catch (saveError) {
        logger.warn(`⚠️ Failed to update token timestamps:`, {
          userId,
          error: saveError.message,
        });
      }
    }

    const duration = Date.now() - startTime;

    logger.info(`📊 Push notification results (${duration}ms):`, {
      userId,
      sent,
      failed,
      total: validTokens.length,
      invalidRemoved: invalidTokens.length,
      duration,
    });

    return {
      success: sent > 0,
      sent,
      failed,
      total: validTokens.length,
      invalidRemoved: invalidTokens.length,
      duration,
      results,
    };
  } catch (error) {
    logger.error("Error sending mobile push notification:", {
      error: error.message,
      stack: error.stack,
    });
    return {
      success: false,
      error: error.message,
      sent: 0,
      failed: 0,
      total: 0,
    };
  }
};

/**
 * Send message notification to mobile devices
 * @param {string} receiverId - User ID to send notification to
 * @param {object} messageData - Message data
 * @returns {Promise<object>} Result with success status
 */
export const sendMobileMessageNotification = async (
  receiverId,
  messageData
) => {
  try {
    // Input validation
    if (!receiverId) {
      logger.warn("⚠️ [Mobile Message] receiverId is required");
      return { success: false, error: "receiverId is required" };
    }

    if (!messageData) {
      logger.warn("⚠️ [Mobile Message] messageData is required");
      return { success: false, error: "messageData is required" };
    }

    const sender = await User.findById(messageData.senderId).select(
      "fullname profilePic"
    );
    if (!sender) {
      logger.warn(
        `⚠️ [Mobile Message] Sender not found: ${messageData.senderId}`
      );
      return { success: false, error: "Sender not found" };
    }

    const senderName = sender.fullname || "Someone";
    let title = `New message from ${senderName}`;
    let body = "";

    // Determine body based on message type
    if (messageData.text) {
      body =
        messageData.text.length > 200
          ? messageData.text.substring(0, 200) + "..."
          : messageData.text;
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

    // Extract senderId - handle both populated object and plain ID
    const senderId =
      typeof messageData.senderId === "object" && messageData.senderId._id
        ? String(messageData.senderId._id)
        : String(messageData.senderId);

    return await sendMobilePushNotification(receiverId, {
      title,
      body,
      data: {
        type: "message",
        messageId: String(messageData._id || messageData.id),
        senderId: senderId,
        senderName: senderName,
        receiverId: String(receiverId),
        groupId: messageData.groupId ? String(messageData.groupId) : "",
        click_action: "FLUTTER_NOTIFICATION_CLICK",
      },
    });
  } catch (error) {
    logger.error("Error sending mobile message notification:", {
      error: error.message,
      receiverId,
      messageId: messageData?._id || messageData?.id,
    });
    return { success: false, error: error.message };
  }
};

/**
 * Send group message notification to mobile devices
 * @param {string} receiverId - User ID to send notification to
 * @param {object} messageData - Message data
 * @param {object} groupData - Group data
 * @returns {Promise<object>} Result with success status
 */
export const sendMobileGroupMessageNotification = async (
  receiverId,
  messageData,
  groupData
) => {
  try {
    // Input validation
    if (!receiverId) {
      logger.warn("⚠️ [Mobile Group] receiverId is required");
      return { success: false, error: "receiverId is required" };
    }

    if (!messageData) {
      logger.warn("⚠️ [Mobile Group] messageData is required");
      return { success: false, error: "messageData is required" };
    }

    if (!groupData) {
      logger.warn("⚠️ [Mobile Group] groupData is required");
      return { success: false, error: "groupData is required" };
    }

    // Extract sender info - handle both populated object and plain ID
    let senderId, senderName;

    if (typeof messageData.senderId === "object" && messageData.senderId._id) {
      senderId = String(messageData.senderId._id);
      senderName = messageData.senderId.fullname || "Someone";
    } else {
      senderId = String(messageData.senderId);
      const sender = await User.findById(senderId).select("fullname");
      senderName = sender?.fullname || "Someone";
    }

    // Extract group info - handle both populated object and plain ID
    const groupId =
      typeof groupData._id === "object"
        ? String(groupData._id)
        : String(groupData._id || groupData.id);
    const groupName = groupData.name || "Group";

    // Build notification
    let title = `${groupName}`;
    let body = `${senderName}: `;

    // Determine body based on message type
    if (messageData.text) {
      body +=
        messageData.text.length > 150
          ? messageData.text.substring(0, 150) + "..."
          : messageData.text;
    } else if (messageData.image && messageData.image.length > 0) {
      body += "📷 Sent a photo";
    } else if (messageData.audio && messageData.audio.length > 0) {
      body += "🎵 Sent an audio message";
    } else if (messageData.video && messageData.video.length > 0) {
      body += "🎥 Sent a video";
    } else if (messageData.file && messageData.file.length > 0) {
      body += "📎 Sent a file";
    } else {
      body += "Sent a message";
    }

    return await sendMobilePushNotification(receiverId, {
      title,
      body,
      data: {
        type: "group_message",
        messageId: String(messageData._id || messageData.id),
        senderId: senderId,
        senderName: senderName,
        receiverId: String(receiverId),
        groupId: groupId,
        groupName: groupName,
        click_action: "FLUTTER_NOTIFICATION_CLICK",
      },
    });
  } catch (error) {
    logger.error("Error sending mobile group message notification:", {
      error: error.message,
      groupId: groupData?._id,
      receiverId,
      messageId: messageData?._id || messageData?.id,
    });
    return { success: false, error: error.message };
  }
};

/**
 * Send incoming call notification to mobile devices
 * Uses high-priority FCM data message for CallKit/Android incoming call UI
 *
 * @param {string} receiverId - User ID to send notification to
 * @param {object} callData - Call data including callId, callerId, callType
 * @returns {Promise<object>} Result with success status
 */
export const sendMobileCallNotification = async (receiverId, callData) => {
  const startTime = Date.now();

  try {
    logger.info(
      `📞 [Mobile Call] Sending call notification to user ${receiverId}`
    );

    if (!firebaseInitialized) {
      logger.warn("⚠️ [Mobile Call] Firebase not initialized");
      return { success: false, error: "Firebase not initialized" };
    }

    // Validate input
    if (!receiverId || !callData?.callId || !callData?.callerId) {
      logger.warn("⚠️ [Mobile Call] Missing required call data");
      return { success: false, error: "Missing required call data" };
    }

    // Get caller info
    const caller = await User.findById(callData.callerId).select(
      "fullname profilePic"
    );
    if (!caller) {
      logger.warn(`⚠️ [Mobile Call] Caller not found: ${callData.callerId}`);
      return { success: false, error: "Caller not found" };
    }

    const callerName = caller.fullname || "Unknown";
    const callerAvatar = caller.profilePic || "";
    const callType = callData.callType || "voice";
    const isVideo = callType === "video";

    // Get user's push tokens
    const user = await Promise.race([
      User.findById(receiverId).select("pushTokens"),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Database query timeout")), 5000)
      ),
    ]);

    if (!user || !user.pushTokens || user.pushTokens.length === 0) {
      logger.debug(
        `⚠️ [Mobile Call] No push tokens found for user ${receiverId}`
      );
      return { success: false, error: "No push tokens" };
    }

    // Filter valid tokens
    const validTokens = user.pushTokens.filter((tokenData) =>
      isValidFCMToken(tokenData.token)
    );

    if (validTokens.length === 0) {
      logger.warn(
        `⚠️ [Mobile Call] No valid FCM tokens for user ${receiverId}`
      );
      return { success: false, error: "No valid push tokens" };
    }

    logger.info(`📞 [Mobile Call] Sending to ${validTokens.length} devices`, {
      callId: callData.callId,
      callerId: callData.callerId,
      callerName,
      callType,
    });

    const results = [];
    let sent = 0;
    let failed = 0;

    // Send to each token with call-specific configuration
    for (const tokenData of validTokens) {
      try {
        const isIOS = tokenData.platform === "ios";

        // Build platform-specific message for CallKit
        // Following flutter_callkit_incoming documentation format exactly
        const message = {
          token: tokenData.token,
        };

        if (isIOS) {
          // iOS: Use data-only push with flutter_callkit_incoming format
          // This allows the app to show CallKit even in background/killed state
          // 🔥 CRITICAL: Include ALL data fields for CallKit UI and WebRTC connection
          message.data = {
            // flutter_callkit_incoming required fields (as strings)
            id: String(callData.callId),
            nameCaller: callerName,
            handle: callerName,
            type: isVideo ? "1" : "0", // String: "0" = audio, "1" = video
            avatar: callerAvatar || "",
            duration: "60000",
            // 🔥 Additional data needed for WebRTC connection after acceptance
            // These fields are used by CallKitHandler to navigate to call screen
            callerId: String(callData.callerId),
            callerName: callerName, // Duplicate for Flutter compatibility
            callerAvatar: callerAvatar || "", // Duplicate for Flutter compatibility
            callType: callType,
            receiverId: String(receiverId),
            timestamp: String(Date.now()),
          };

          // 🔥 LOG FULL PAYLOAD for iOS VoIP debugging
          logger.debug("📤 [iOS VoIP] Push payload:");
          logger.debug(`   ├─ id: ${message.data.id}`);
          logger.debug(`   ├─ nameCaller: ${message.data.nameCaller}`);
          logger.debug(`   ├─ handle: ${message.data.handle}`);
          logger.debug(`   ├─ type: ${message.data.type}`);
          logger.debug(`   ├─ callerId: ${message.data.callerId}`);
          logger.debug(`   ├─ receiverId: ${message.data.receiverId}`);
          logger.debug(`   ├─ callType: ${message.data.callType}`);
          logger.debug(
            `   └─ avatar: ${message.data.avatar ? "present" : "none"}`
          );

          // ✅ CRITICAL: Use high-priority background notification for iOS
          // This wakes the app and allows Flutter to show CallKit
          // Note: True VoIP push requires VoIP certificate (not FCM)
          message.apns = {
            headers: {
              "apns-priority": "10", // High priority
              "apns-push-type": "background", // Background content-available
            },
            payload: {
              aps: {
                "content-available": 1, // Wake app in background
                // NO alert/sound here - CallKit will provide UI
              },
            },
          };
        } else {
          // Android: Include notification + data for CallKit
          // 🔥 CRITICAL: Include ALL data fields for flutter_callkit_incoming
          message.data = {
            type: "call",
            // flutter_callkit_incoming format fields
            id: String(callData.callId),
            nameCaller: callerName,
            handle: callerName,
            // App-specific fields
            callId: String(callData.callId),
            callerId: String(callData.callerId),
            callerName: callerName,
            callerAvatar: callerAvatar || "",
            callType: callType,
            receiverId: String(receiverId),
            timestamp: String(Date.now()),
          };

          message.android = {
            priority: "high",
            ttl: 60000,
            notification: {
              sound: "default",
              clickAction: "FLUTTER_NOTIFICATION_CLICK",
              channelId: "incoming_calls",
              priority: "max",
              visibility: "public",
              defaultSound: true,
              defaultVibrateTimings: true,
            },
            directBootOk: true,
          };

          message.notification = {
            title: `Incoming ${isVideo ? "video" : "voice"} call`,
            body: `${callerName} is calling you`,
          };
        }

        const response = await Promise.race([
          retryWithBackoff(
            () => admin.messaging().send(message),
            2, // Max 2 retries for calls (time-sensitive)
            50 // Shorter base delay
          ),
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    `FCM ${
                      tokenData.platform
                    } push timeout after 12s (token: ${tokenData.token.substring(
                      0,
                      20
                    )}...)`
                  )
                ),
              12000 // Increased to 12s for iOS VoIP background push
            )
          ),
        ]);

        logger.debug(`✅ [Mobile Call] Push sent to ${tokenData.platform}:`, {
          token: tokenData.token.substring(0, 20) + "...",
          messageId: response,
        });

        sent++;
        results.push({
          success: true,
          platform: tokenData.platform,
          messageId: response,
        });

        circuitBreaker.recordSuccess();
      } catch (error) {
        // 🔥 Enhanced error logging with full details
        logger.error(
          `❌ [Mobile Call] Failed to send push to ${tokenData.platform}:`,
          {
            error: error.message,
            code: error.code,
            stack: error.stack,
            token: tokenData.token.substring(0, 20) + "...",
            platform: tokenData.platform,
          }
        );

        // Log readable error message
        console.error(`\n💥 [Push Error] ${error.message}`);
        console.error(`   ├─ Code: ${error.code || "unknown"}`);
        console.error(`   ├─ Platform: ${tokenData.platform}`);
        console.error(`   ├─ Token: ${tokenData.token.substring(0, 20)}...`);
        console.error(`   └─ Stack: ${error.stack}\n`);

        failed++;
        results.push({
          success: false,
          platform: tokenData.platform,
          error: error.message,
        });

        // 🔥 Auto-cleanup invalid tokens
        if (
          error.code === "messaging/invalid-registration-token" ||
          error.code === "messaging/registration-token-not-registered"
        ) {
          logger.warn(
            `🗑️ [Mobile Call] Removing invalid token for user ${receiverId}`,
            {
              token: tokenData.token.substring(0, 20) + "...",
              errorCode: error.code,
            }
          );

          // Remove invalid token from database
          try {
            await User.updateOne(
              { _id: receiverId },
              {
                $pull: {
                  pushTokens: { token: tokenData.token },
                },
              }
            );
            logger.info(`✅ [Mobile Call] Invalid token removed successfully`);
          } catch (cleanupError) {
            logger.error(
              `❌ [Mobile Call] Failed to cleanup token:`,
              cleanupError
            );
          }
        } else {
          circuitBreaker.recordFailure();
        }
      }
    }

    const duration = Date.now() - startTime;

    logger.info(`📊 [Mobile Call] Notification results (${duration}ms):`, {
      receiverId,
      callId: callData.callId,
      sent,
      failed,
      total: validTokens.length,
      duration,
    });

    return {
      success: sent > 0,
      sent,
      failed,
      total: validTokens.length,
      duration,
      results,
    };
  } catch (error) {
    logger.error("Error sending mobile call notification:", {
      error: error.message,
      receiverId,
      callId: callData?.callId,
    });
    return { success: false, error: error.message };
  }
};

/**
 * Send missed call notification to mobile devices
 *
 * @param {string} receiverId - User ID to send notification to
 * @param {object} callData - Call data including callId, callerId, callType
 * @returns {Promise<object>} Result with success status
 */
export const sendMobileMissedCallNotification = async (
  receiverId,
  callData
) => {
  try {
    logger.info(
      `📞 [Mobile Missed Call] Sending notification to user ${receiverId}`
    );

    // Get caller info
    const caller = await User.findById(callData.callerId).select(
      "fullname profilePic"
    );
    if (!caller) {
      logger.warn(
        `⚠️ [Mobile Missed Call] Caller not found: ${callData.callerId}`
      );
      return { success: false, error: "Caller not found" };
    }

    const callerName = caller.fullname || "Unknown";
    const callType = callData.callType || "voice";
    const isVideo = callType === "video";

    return await sendMobilePushNotification(receiverId, {
      title: "Missed call",
      body: `You missed a ${
        isVideo ? "video" : "voice"
      } call from ${callerName}`,
      data: {
        type: "missed_call",
        callId: String(callData.callId),
        callerId: String(callData.callerId),
        callerName: callerName,
        callType: callType,
        click_action: "FLUTTER_NOTIFICATION_CLICK",
      },
    });
  } catch (error) {
    logger.error("Error sending mobile missed call notification:", {
      error: error.message,
      receiverId,
      callId: callData?.callId,
    });
    return { success: false, error: error.message };
  }
};
