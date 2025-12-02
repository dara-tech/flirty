import express from 'express';
import messageRoute from './routes/message.route.js';
import authRoutes from './routes/auth.route.js';
import groupRoute from './routes/group.route.js';
import contactRoute from './routes/contact.route.js';
import dotenv from 'dotenv';
import { connectDB } from './lib/db.js';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { app, server, io } from './lib/socket.js';  // Use the app instance from socket.js
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';

dotenv.config();

const PORT = process.env.PORT || 5002;  // Fallback to 5002 (match your dev port)
const AUTO_RELOAD_INTERVAL = parseInt(process.env.AUTO_RELOAD_INTERVAL) || 14 * 60 * 1000; // 14 minutes in milliseconds
const AUTO_RELOAD_ENABLED = process.env.AUTO_RELOAD_ENABLED !== 'false'; // Enabled by default, set to 'false' to disable

// Middleware setup
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());
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
        if (process.env.NODE_ENV === 'production') {
          console.log('CORS check:', {
            origin,
            allowedOrigins,
            isAllowed: allowedOrigins.includes(origin),
            frontendUrl: process.env.FRONTEND_URL
          });
        }
        
        // In production, allow the frontend origin
        if (process.env.NODE_ENV === 'production') {
          // Log the origin for debugging
          console.log('CORS Origin:', origin);
          console.log('FRONTEND_URL:', process.env.FRONTEND_URL);
          
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
        console.warn(`CORS blocked origin: ${origin}. Allowed origins:`, allowedOrigins);
        callback(new Error(`Origin ${origin} is not allowed by CORS policy`));
      } catch (error) {
        console.error('CORS error:', error);
        // On error, deny access for security
        callback(new Error('CORS configuration error'));
      }
    },
    credentials: true, // Required for cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Route setup
app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoute);
app.use('/api/groups', groupRoute);
app.use('/api/contacts', contactRoute);

// Error handling middleware (must be after routes)
app.use(notFoundHandler); // 404 handler
app.use(errorHandler); // Global error handler

// Health check endpoint for Render/monitoring
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
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

// Note: Static file serving removed for separate hosting
// Frontend is hosted on Netlify, backend only serves API endpoints

// Graceful shutdown function
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  
  // Clear auto-reload timer if it exists
  if (autoReloadTimer) {
    clearTimeout(autoReloadTimer);
    autoReloadTimer = null;
  }
  
  try {
    // Close Socket.IO connections first (notify clients)
    if (io) {
      io.emit('server:restarting', { message: 'Server is restarting, please reconnect...' });
      io.close(() => {
        console.log('✅ Socket.IO server closed');
      });
    }
    
    // Close HTTP server (stop accepting new connections)
    if (server) {
      server.close(() => {
        console.log('✅ HTTP server closed');
      });
    }
    
    // Wait a bit for connections to close gracefully
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Close database connection
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('✅ Database connection closed');
    }
    
    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Auto-reload mechanism (restart every 14 minutes by default)
let autoReloadTimer = null;

const setupAutoReload = () => {
  if (!AUTO_RELOAD_ENABLED) {
    console.log('⏸️  Auto-reload is disabled');
    return;
  }
  
  const intervalMinutes = AUTO_RELOAD_INTERVAL / (60 * 1000);
  console.log(`⏰ Auto-reload enabled: Server will restart every ${intervalMinutes} minutes`);
  
  autoReloadTimer = setTimeout(async () => {
    console.log(`\n🔄 Auto-reload triggered after ${intervalMinutes} minutes`);
    console.log('🔄 Restarting server...');
    await gracefulShutdown('AUTO_RELOAD');
  }, AUTO_RELOAD_INTERVAL);
};

// Start the server
const startServer = async () => {
  try {
    await connectDB(); // Connect to the database before starting the server

    // Start the socket server
    server.listen(PORT, () => {
      console.log(`🌐 Server is running on port ${PORT} ✅`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
      
      // Setup auto-reload after server starts
      setupAutoReload();
    });

  } catch (error) {
    console.error('Failed to connect to the database', error);
    process.exit(1); // Exit the process with failure
  }
};

// Call the startServer function to initialize everything
startServer();
