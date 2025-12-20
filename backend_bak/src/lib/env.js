// Environment variable validation
const requiredEnvVars = [
  'MONGODB_URI',
  'JWT_SECRET',
];

const optionalEnvVars = [
  'FRONTEND_URL',
  'BACKEND_URL',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'PORT',
  'NODE_ENV',
];

import logger from './logger.js';

export const validateEnv = () => {
  const missing = requiredEnvVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    logger.error('Missing required environment variables:', { missing });
    missing.forEach(key => {
      logger.error(`   - ${key}`);
    });
    logger.error('Please set these variables in your .env file or environment.');
    process.exit(1);
  }
  
  // Warn about missing optional but recommended variables
  const missingOptional = optionalEnvVars.filter(key => !process.env[key]);
  if (missingOptional.length > 0 && process.env.NODE_ENV === 'production') {
    logger.warn('Missing optional environment variables (may cause issues in production):', { missing: missingOptional });
    missingOptional.forEach(key => {
      logger.warn(`   - ${key}`);
    });
  }
  
  logger.info('All required environment variables are set');
  
  // Validate specific formats
  if (process.env.MONGODB_URI && !process.env.MONGODB_URI.startsWith('mongodb')) {
    logger.warn('MONGODB_URI should start with "mongodb://" or "mongodb+srv://"');
  }
  
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    logger.warn('JWT_SECRET should be at least 32 characters long for security');
  }
  
  return true;
};

