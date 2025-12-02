import express from 'express';
import messageRoute from './routes/message.route.js';
import authRoutes from './routes/auth.route.js';
import groupRoute from './routes/group.route.js';
import contactRoute from './routes/contact.route.js';
import dotenv from 'dotenv';
import { connectDB } from './lib/db.js';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { app, server } from './lib/socket.js';  // Use the app instance from socket.js
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';

dotenv.config();

const PORT = process.env.PORT || 5002;  // Fallback to 5002 (match your dev port)

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

// Start the server
const startServer = async () => {
  try {
    await connectDB(); // Connect to the database before starting the server

    // Start the socket server
    server.listen(PORT, () => {
      console.log(`🌐 Server is running on port ${PORT} ✅`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });

  } catch (error) {
    console.error('Failed to connect to the database', error);
    process.exit(1); // Exit the process with failure
  }
};

// Call the startServer function to initialize everything
startServer();
