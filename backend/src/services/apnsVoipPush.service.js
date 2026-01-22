/**
 * APNs VoIP Push Service
 *
 * This service sends VoIP push notifications directly to Apple Push Notification Service (APNs)
 * using HTTP/2 for reliable CallKit delivery when the app is terminated.
 *
 * VoIP pushes are processed with highest priority by iOS and will wake the app
 * even when terminated, unlike regular push notifications.
 *
 * SETUP REQUIRED:
 * 1. Create VoIP Services Certificate in Apple Developer Portal
 * 2. Export as .p12 and convert to .pem files:
 *    - openssl pkcs12 -in voip.p12 -out voip_cert.pem -clcerts -nokeys
 *    - openssl pkcs12 -in voip.p12 -out voip_key.pem -nocerts -nodes
 * 3. Place files in config/ directory
 *
 * OR (Recommended):
 * 1. Create APNs Key (.p8) in Apple Developer Portal
 * 2. Download the .p8 file and place in config/
 * 3. Set environment variables: APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID
 *
 * @module apnsVoipPush
 */

import dotenv from "dotenv";
dotenv.config(); // Load .env before reading environment variables

import http2 from "http2";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import logger from "../lib/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// APNs configuration
const APNS_HOST_PRODUCTION = "api.push.apple.com";
const APNS_HOST_DEVELOPMENT = "api.sandbox.push.apple.com";
const APNS_PORT = 443;

// Configuration from environment
const config = {
  // APNs Key-based auth (.p8) - RECOMMENDED
  keyId: process.env.APNS_KEY_ID,
  teamId: process.env.APNS_TEAM_ID,
  bundleId: process.env.APNS_BUNDLE_ID || "com.sre999.garage",

  // Development or production
  isProduction: process.env.NODE_ENV === "production",

  // Connection pool settings
  maxConnections: 1,
  connectionTimeout: 30000,
};

// APNs key (loaded once)
let apnsKey = null;
let apnsKeyPath = null;
let jwtToken = null;
let jwtIssuedAt = 0;

// Connection pool
let apnsClient = null;
let connectionPromise = null;

/**
 * Initialize APNs service by loading credentials
 */
const initialize = () => {
  // Try to load .p8 key (recommended)
  const p8Paths = [
    path.join(__dirname, "../../config/AuthKey.p8"),
    path.join(__dirname, "../../config/apns_key.p8"),
    path.join(__dirname, "../../config/apns.p8"),
  ];

  for (const p8Path of p8Paths) {
    if (fs.existsSync(p8Path)) {
      try {
        apnsKey = fs.readFileSync(p8Path, "utf8");
        apnsKeyPath = p8Path;
        logger.info(`✅ [APNs] Loaded key from: ${p8Path}`);
        break;
      } catch (e) {
        logger.warn(`⚠️ [APNs] Failed to read ${p8Path}:`, e.message);
      }
    }
  }

  if (!apnsKey) {
    logger.warn("⚠️ [APNs VoIP] No APNs key found. VoIP push disabled.");
    logger.warn("   Expected locations:");
    p8Paths.forEach((p) => logger.warn(`   - ${p}`));
    logger.warn("   See config/APNS_SETUP.md for setup instructions.");
    return false;
  }

  if (!config.keyId || !config.teamId) {
    logger.warn(
      "⚠️ [APNs VoIP] Missing APNS_KEY_ID or APNS_TEAM_ID environment variables.",
    );
    logger.warn("   Required environment variables:");
    logger.warn("   - APNS_KEY_ID: Key ID from Apple Developer Portal");
    logger.warn("   - APNS_TEAM_ID: Your Apple Developer Team ID");
    logger.warn(
      "   - APNS_BUNDLE_ID: App bundle identifier (optional, defaults to com.sre999.garage)",
    );
    return false;
  }

  logger.info("✅ [APNs VoIP] Service initialized successfully");
  logger.info(`   ├─ Key ID: ${config.keyId}`);
  logger.info(`   ├─ Team ID: ${config.teamId}`);
  logger.info(`   ├─ Bundle ID: ${config.bundleId}`);
  logger.info(
    `   └─ Environment: ${config.isProduction ? "production" : "sandbox"}`,
  );

  return true;
};

/**
 * Check if APNs VoIP service is available
 */
export const isAvailable = () => {
  return !!(apnsKey && config.keyId && config.teamId);
};

/**
 * Generate JWT token for APNs authentication
 * Token is valid for 1 hour, we refresh every 50 minutes
 */
const getJwtToken = () => {
  const now = Math.floor(Date.now() / 1000);

  // Refresh token if older than 50 minutes
  if (jwtToken && now - jwtIssuedAt < 50 * 60) {
    return jwtToken;
  }

  try {
    jwtToken = jwt.sign(
      {
        iss: config.teamId,
        iat: now,
      },
      apnsKey,
      {
        algorithm: "ES256",
        header: {
          alg: "ES256",
          kid: config.keyId,
        },
      },
    );
    jwtIssuedAt = now;
    logger.debug("🔑 [APNs] Generated new JWT token");
    return jwtToken;
  } catch (error) {
    logger.error("❌ [APNs] Failed to generate JWT:", error.message);
    throw error;
  }
};

/**
 * Get or create HTTP/2 connection to APNs
 */
const getConnection = async () => {
  if (apnsClient && !apnsClient.destroyed) {
    return apnsClient;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = new Promise((resolve, reject) => {
    const host = config.isProduction
      ? APNS_HOST_PRODUCTION
      : APNS_HOST_DEVELOPMENT;

    logger.debug(`🔌 [APNs] Connecting to ${host}...`);

    const client = http2.connect(`https://${host}:${APNS_PORT}`, {
      timeout: config.connectionTimeout,
    });

    client.on("connect", () => {
      logger.info(`✅ [APNs] Connected to ${host}`);
      apnsClient = client;
      connectionPromise = null;
      resolve(client);
    });

    client.on("error", (err) => {
      logger.error(`❌ [APNs] Connection error:`, err.message);
      connectionPromise = null;
      reject(err);
    });

    client.on("close", () => {
      logger.debug("🔌 [APNs] Connection closed");
      apnsClient = null;
    });

    // Timeout fallback
    setTimeout(() => {
      if (connectionPromise) {
        connectionPromise = null;
        client.destroy();
        reject(new Error("APNs connection timeout"));
      }
    }, config.connectionTimeout);
  });

  return connectionPromise;
};

/**
 * Send VoIP push notification to iOS device
 *
 * @param {string} voipToken - Device VoIP token (hex string from PushKit)
 * @param {object} payload - Notification payload
 * @param {string} payload.id - Call ID (will be used as CallKit UUID)
 * @param {string} payload.nameCaller - Caller display name
 * @param {string} payload.handle - Caller handle (phone/name)
 * @param {number|string} payload.type - Call type (0=audio, 1=video)
 * @param {string} [payload.avatar] - Caller avatar URL
 * @param {number|string} [payload.duration] - Ring duration in ms
 * @param {object} [payload.extra] - Additional data for Flutter
 * @returns {Promise<object>} Result with success status and message ID
 */
export const sendVoipPush = async (voipToken, payload) => {
  if (!isAvailable()) {
    logger.warn("⚠️ [APNs VoIP] Service not available, skipping push");
    return { success: false, error: "APNs VoIP not configured" };
  }

  if (!voipToken || typeof voipToken !== "string" || voipToken.length < 64) {
    logger.warn(
      "⚠️ [APNs VoIP] Invalid VoIP token:",
      voipToken?.substring?.(0, 20),
    );
    return { success: false, error: "Invalid VoIP token" };
  }

  try {
    const client = await getConnection();
    const token = getJwtToken();

    // Build APNs VoIP payload following flutter_callkit_incoming format
    const apnsPayload = {
      aps: {
        // VoIP pushes don't need traditional aps content
        // The data is in the root level for CallKit
      },
      // flutter_callkit_incoming expected fields
      id: String(payload.id),
      nameCaller: payload.nameCaller || "Unknown",
      handle: payload.handle || payload.nameCaller || "Unknown",
      type: String(payload.type || 0), // "0" = audio, "1" = video
      avatar: payload.avatar || "",
      duration: String(payload.duration || 60000),
      // Additional data for WebRTC connection
      callerId: String(payload.callerId || ""),
      callerName: payload.callerName || payload.nameCaller || "Unknown",
      callerAvatar: payload.callerAvatar || payload.avatar || "",
      callType:
        payload.callType ||
        (payload.type === 1 || payload.type === "1" ? "video" : "voice"),
      receiverId: String(payload.receiverId || ""),
      timestamp: String(Date.now()),
      fromVoIP: "true",
    };

    // Merge any extra data
    if (payload.extra && typeof payload.extra === "object") {
      Object.assign(apnsPayload, payload.extra);
    }

    const payloadJson = JSON.stringify(apnsPayload);
    const payloadBytes = Buffer.byteLength(payloadJson, "utf8");

    // Check payload size (APNs limit is 5KB for VoIP)
    if (payloadBytes > 5120) {
      logger.warn(
        `⚠️ [APNs VoIP] Payload too large: ${payloadBytes} bytes (max 5120)`,
      );
      // Remove avatar to reduce size
      delete apnsPayload.avatar;
      delete apnsPayload.callerAvatar;
    }

    const requestPath = `/3/device/${voipToken}`;

    logger.debug(`📤 [APNs VoIP] Sending push to device:`, {
      token: voipToken.substring(0, 20) + "...",
      callId: payload.id,
      caller: payload.nameCaller,
      payloadSize: payloadBytes,
    });

    return new Promise((resolve) => {
      const req = client.request({
        ":method": "POST",
        ":path": requestPath,
        authorization: `bearer ${token}`,
        "apns-topic": `${config.bundleId}.voip`, // VoIP topic
        "apns-push-type": "voip",
        "apns-priority": "10", // Immediate priority
        "apns-expiration": "0", // Immediate delivery only
      });

      let responseData = "";

      req.on("response", (headers) => {
        const status = headers[":status"];

        if (status === 200) {
          const apnsId = headers["apns-id"];
          logger.info(`✅ [APNs VoIP] Push sent successfully:`, {
            apnsId,
            token: voipToken.substring(0, 20) + "...",
          });
          resolve({ success: true, apnsId });
        } else {
          // Error response - collect body for details
          req.on("data", (chunk) => {
            responseData += chunk.toString();
          });
        }
      });

      req.on("end", () => {
        if (responseData) {
          try {
            const error = JSON.parse(responseData);
            logger.error(`❌ [APNs VoIP] Push failed:`, {
              reason: error.reason,
              timestamp: error.timestamp,
              token: voipToken.substring(0, 20) + "...",
            });
            resolve({
              success: false,
              error: error.reason,
              details: error,
            });
          } catch (e) {
            resolve({ success: false, error: responseData });
          }
        }
      });

      req.on("error", (err) => {
        logger.error(`❌ [APNs VoIP] Request error:`, err.message);
        resolve({ success: false, error: err.message });
      });

      // Set timeout
      req.setTimeout(10000, () => {
        req.destroy();
        logger.error(`❌ [APNs VoIP] Request timeout`);
        resolve({ success: false, error: "Request timeout" });
      });

      // Send payload
      req.write(payloadJson);
      req.end();
    });
  } catch (error) {
    logger.error(`❌ [APNs VoIP] Send error:`, error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send incoming call notification with VoIP push
 *
 * @param {object} tokenData - Device token data including voipToken
 * @param {object} callData - Call information
 * @returns {Promise<object>} Result
 */
export const sendCallNotification = async (tokenData, callData) => {
  if (!tokenData.voipToken) {
    logger.debug("⚠️ [APNs VoIP] No VoIP token, skipping");
    return { success: false, error: "No VoIP token" };
  }

  const payload = {
    id: callData.callId,
    nameCaller: callData.callerName,
    handle: callData.callerName,
    type: callData.callType === "video" ? 1 : 0,
    avatar: callData.callerAvatar,
    duration: 60000,
    callerId: callData.callerId,
    callerName: callData.callerName,
    callerAvatar: callData.callerAvatar,
    callType: callData.callType,
    receiverId: callData.receiverId,
  };

  return sendVoipPush(tokenData.voipToken, payload);
};

/**
 * Close APNs connection (call on shutdown)
 */
export const closeConnection = () => {
  if (apnsClient) {
    apnsClient.close();
    apnsClient = null;
    logger.info("🔌 [APNs] Connection closed");
  }
};

// Initialize on module load
initialize();

export default {
  isAvailable,
  sendVoipPush,
  sendCallNotification,
  closeConnection,
};
