import express from 'express';
import messageRoute from './routes/message.route.js';
import authRoutes from './routes/auth.route.js';
import groupRoute from './routes/group.route.js';
import contactRoute from './routes/contact.route.js';
import callRoute from './routes/call.route.js';
import folderRoute from './routes/folder.route.js';
import dotenv from 'dotenv';
import { connectDB } from './lib/db.js';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { app, server, io } from './lib/socket.js';  // Use the app instance from socket.js
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { validateEnv } from './lib/env.js';
import logger from './lib/logger.js';
import helmet from 'helmet';
import compression from 'compression';
import { requestIdMiddleware } from './middleware/requestId.js';
import { sanitizeMiddleware } from './middleware/sanitize.js';

dotenv.config();

// Validate environment variables on startup
validateEnv();

const PORT = process.env.PORT || 5002;  // Fallback to 5002 (match your dev port)
const KEEP_ALIVE_INTERVAL = parseInt(process.env.KEEP_ALIVE_INTERVAL) || 14 * 60 * 1000; // 14 minutes in milliseconds
const KEEP_ALIVE_ENABLED = process.env.KEEP_ALIVE_ENABLED !== 'false'; // Enabled by default, set to 'false' to disable
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT) || 30000; // 30 seconds default

// Request ID middleware (should be early in the middleware chain)
app.use(requestIdMiddleware);

// Compression middleware (should be early, before routes)
app.use(compression({
  filter: (req, res) => {
    // Don't compress if client doesn't support it
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Use compression for all other requests
    return compression.filter(req, res);
  },
  level: 6, // Compression level (0-9, 6 is a good balance)
  threshold: 1024, // Only compress responses > 1KB
}));

// Security headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"], // Allow WebSocket connections
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "https:"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow embedding for chat features
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin resources
}));

// Middleware setup
app.use(express.json({ limit: '500mb' })); // Increased for large video uploads
app.use(express.urlencoded({ limit: '500mb', extended: true }));
app.use(cookieParser());

// Input sanitization (after body parsing, before routes)
app.use(sanitizeMiddleware);

// Request timeout middleware
app.use((req, res, next) => {
  req.setTimeout(REQUEST_TIMEOUT, () => {
    logger.warn('Request timeout', {
      requestId: req.requestId,
      url: req.originalUrl,
      method: req.method,
      timeout: REQUEST_TIMEOUT,
    });
    if (!res.headersSent) {
      res.status(408).json({
        success: false,
        message: 'Request timeout',
      });
    }
  });
  next();
});
app.use(
  cors({
    origin: function (origin, callback) {
      try {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) {
          return callback(null, true);
        }
        
        // Build allowed origins list
        const allowedOrigins = [
          // Development origins
          "http://localhost:5173",
          "http://localhost:5174",
          "http://localhost:3000",
          "http://127.0.0.1:5173",
          "http://127.0.0.1:5174",
          // Production frontend URL from environment variable
          process.env.FRONTEND_URL,
          // Additional allowed origins (comma-separated, optional)
          ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(url => url.trim()) : [])
        ].filter(Boolean); // Remove undefined/null/empty values
        
        // Log for debugging (only in production if needed)
        // (console logging removed to keep server logs clean)
        
        // In production, allow the frontend origin
        if (process.env.NODE_ENV === 'production') {
          // Log the origin for debugging
          
          // Allow if matches FRONTEND_URL or if FRONTEND_URL not set, allow common patterns
          if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
            return callback(null, true);
          }
          // Fallback: allow if origin contains your domain
          if (origin && origin.includes('netlify.app') || origin.includes('your-domain.com')) {
            return callback(null, true);
          }
        }
        
        // Allow in development mode or if origin is in allowed list
        if (process.env.NODE_ENV === 'development') {
          return callback(null, true);
        }
        
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        
        // Origin not allowed
        callback(new Error(`Origin ${origin} is not allowed by CORS policy`));
      } catch (error) {
        logger.error('CORS error:', error);
        // On error, deny access for security
        callback(new Error('CORS configuration error'));
      }
    },
    credentials: true, // Required for cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Auth-Token'], // Allow custom auth header
    exposedHeaders: ['X-Auth-Token'], // Expose token header for Safari compatibility
  })
);

// Health check endpoint (before routes, so it's always accessible)
app.get('/health', async (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = dbState === 1 ? 'connected' : dbState === 2 ? 'connecting' : 'disconnected';
  
  const health = {
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    database: {
      status: dbStatus,
      readyState: dbState
    },
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB'
    }
  };
  
  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

// API documentation endpoint (optional)
app.get('/api', (req, res) => {
  res.json({
    message: 'Chat App API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      messages: '/api/messages',
      groups: '/api/groups',
      contacts: '/api/contacts',
      health: '/health'
    }
  });
});

// Route setup
app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoute);
app.use('/api/groups', groupRoute);
app.use('/api/contacts', contactRoute);
app.use('/api/calls', callRoute);
app.use('/api/folders', folderRoute);

// Error handling middleware (must be after routes)
app.use(notFoundHandler); // 404 handler
app.use(errorHandler); // Global error handler

// Note: Static file serving removed for separate hosting
// Frontend is hosted on Netlify, backend only serves API endpoints

// Graceful shutdown function
const gracefulShutdown = async (signal) => {
  
  // Clear keep-alive timer if it exists
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
  
  try {
    // Close Socket.IO connections first (notify clients)
    if (io) {
      io.emit('server:shutting_down', { message: 'Server is shutting down...' });
      io.close(() => {
      });
    }
    
    // Close HTTP server (stop accepting new connections)
    if (server) {
      server.close(() => {
      });
    }
    
    // Wait a bit for connections to close gracefully
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Close database connection
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Keep-alive mechanism (ping server every 14 minutes to prevent sleep)
let keepAliveTimer = null;

const setupKeepAlive = () => {
  if (!KEEP_ALIVE_ENABLED) {
    logger.info('Keep-alive mechanism is disabled');
    return;
  }
  
  const intervalMinutes = KEEP_ALIVE_INTERVAL / (60 * 1000);
  logger.info(`Keep-alive enabled: pinging every ${intervalMinutes} minutes`);
  
  // Ping the health endpoint to keep the server awake
  const pingServer = async () => {
    try {
      // Use https for production URLs, http for localhost
      let http, url;
      
      // Determine the URL to ping
      let pingUrl;
      if (process.env.KEEP_ALIVE_URL) {
        // Explicit URL from environment variable
        pingUrl = process.env.KEEP_ALIVE_URL;
      } else if (process.env.BACKEND_URL) {
        // Use backend URL from environment
        pingUrl = `${process.env.BACKEND_URL}/health`;
      } else if (process.env.NODE_ENV === 'production') {
        // In production, try to construct URL from common environment variables
        // Render provides RENDER_EXTERNAL_URL, Heroku provides different vars
        const externalUrl = process.env.RENDER_EXTERNAL_URL || 
                           process.env.HEROKU_APP_NAME ? `https://${process.env.HEROKU_APP_NAME}.herokuapp.com` : null;
        if (externalUrl) {
          pingUrl = `${externalUrl}/health`;
        } else {
          // Fallback: use localhost (might work in some containerized environments)
          pingUrl = `http://localhost:${PORT}/health`;
        }
      } else {
        // Development: use localhost
        pingUrl = `http://localhost:${PORT}/health`;
      }
      
      // Determine if we should use http or https
      const useHttps = pingUrl.startsWith('https://');
      http = useHttps ? await import('https') : await import('http');
      
      // Parse the URL
      const urlObj = new URL(pingUrl);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (useHttps ? 443 : 80),
        path: urlObj.pathname,
        method: 'GET',
        timeout: 10000, // Increased timeout to 10 seconds
        headers: {
          'User-Agent': 'Keep-Alive-Ping/1.0'
        }
      };
      
      logger.debug(`Keep-alive ping: ${pingUrl}`);
      
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          const timestamp = new Date().toISOString();
          if (res.statusCode === 200) {
            logger.debug(`Keep-alive ping successful (${res.statusCode}) at ${timestamp}`);
          } else {
            logger.warn(`Keep-alive ping returned status ${res.statusCode} at ${timestamp}`);
          }
        });
      });
      
      req.on('error', (error) => {
        logger.error(`Keep-alive ping failed: ${error.message}`, { url: pingUrl });
      });
      
      req.on('timeout', () => {
        req.destroy();
        logger.error(`Keep-alive ping timeout after 10s`, { url: pingUrl });
      });
      
      req.end();
    } catch (error) {
      logger.error(`Keep-alive ping error: ${error.message}`, { stack: error.stack });
    }
  };
  
  // Wait a bit for server to be fully ready, then ping
  setTimeout(() => {
    pingServer();
  }, 2000);
  
  // Then ping at regular intervals
  keepAliveTimer = setInterval(() => {
    pingServer();
  }, KEEP_ALIVE_INTERVAL);
};

// Start the server
const startServer = async () => {
  try {
    await connectDB(); // Connect to the database before starting the server

    // Start the socket server
    server.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      
      // Setup keep-alive ping after server starts
      setupKeepAlive();
    });

  } catch (error) {
    logger.error('Failed to connect to the database', error);
    process.exit(1); // Exit the process with failure
  }
};

// Call the startServer function to initialize everything
startServer();
