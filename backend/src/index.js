import express from 'express';
import messageRoute from './routes/message.route.js';
import authRoutes from './routes/auth.route.js';
import groupRoute from './routes/group.route.js';
import contactRoute from './routes/contact.route.js';
import dotenv from 'dotenv';
import { connectDB } from './lib/db.js';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import https from 'https';  // Import the https module for auto-reload
import { app, server } from './lib/socket.js';  // Use the app instance from socket.js

dotenv.config();

const PORT = process.env.PORT || 5000;  // Fallback to 5000 if no PORT is provided
const __dirname = path.resolve();

// Middleware setup
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);
      
      const allowedOrigins = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        // Production URLs - add your Netlify URL here
        process.env.FRONTEND_URL, // e.g., https://your-app.netlify.app
        // Keep your Render URL if needed
        "https://flirty-ffpq.onrender.com"
      ].filter(Boolean); // Remove undefined values
      
      // Allow in development mode or if origin is in allowed list
      if (process.env.NODE_ENV === 'development' || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
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

// Serve static assets in production

  app.use(express.static(path.join(__dirname, "../frontend/dist")));

  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend", "dist", "index.html"));
  });


// Start the server
const startServer = async () => {
  try {
    await connectDB(); // Connect to the database before starting the server

    // Start the socket server
    server.listen(PORT, () => {
      console.log(`🌐 Server is running on port ${PORT} ✅`);
    });

    // Auto-reload mechanism (with an external service or heartbeat)
    setInterval(() => {
      https.get('https://flirty-ffpq.onrender.com', (res) => {
        console.log('Auto-reload request sent. Status:', res.statusCode);
      }).on('error', (err) => {
        console.error('Error during auto-reload request:', err.message);
      });
    }, 60000); // 60000 ms = 1 minute

  } catch (error) {
    console.error('Failed to connect to the database', error);
    process.exit(1); // Exit the process with failure
  }
};

// Call the startServer function to initialize everything
startServer();
