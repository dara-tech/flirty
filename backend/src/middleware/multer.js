import multer from 'multer';

// Configure multer to use memory storage
const storage = multer.memoryStorage();
// Middleware for handling multiple file uploads
export const uploadFields = multer({ storage }).fields([
    { name: 'profilePic', maxCount: 1 },
  ]);
