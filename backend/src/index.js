import express from 'express';
import authRoutes from './routes/auth.route.js';
import messageRoute from './routes/message.route.js';
import dotenv from 'dotenv';
import { connectDB } from './lib/db.js';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from "path";
import { app, server } from './lib/socket.js'; // Use the app instance from socket.js

dotenv.config();

const PORT = process.env.PORT;
const __dirname = path.resolve();

app.use(express.json({
  limit: '50mb'
}));
app.use(cookieParser());
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoute);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../frontend/dist")));

  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend", "dist", "index.html"));
  });
}


server.listen(PORT, () => {
  console.log(`🌐 Server is running on port ${PORT} ✅`);
  connectDB();
});
const startServer = async () => {
  try {
    await connectDB(); // Connect to the database before starting the server
    server.listen(PORT, () => {
      console.log(`🌐 Server is running on port ${PORT} ✅`);
    });

    // Auto-reload mechanism (with an external service or heartbeat)
    setInterval(() => {
      https.get('https://flirty-bnzf.onrender.com', (res) => {
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
