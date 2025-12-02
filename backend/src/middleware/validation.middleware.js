// Validation middleware for auth routes
import { body, validationResult } from 'express-validator';

// Handle validation errors
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

// Signup validation
export const validateSignup = [
  body('fullname')
    .trim()
    .notEmpty().withMessage('Fullname is required')
    .isLength({ min: 2, max: 50 }).withMessage('Fullname must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/).withMessage('Fullname can only contain letters and spaces'),
  
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  
  handleValidationErrors
];

// Login validation
export const validateLogin = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('password')
    .notEmpty().withMessage('Password is required'),
  
  handleValidationErrors
];

// Update profile validation
export const validateUpdateProfile = [
  body('fullname')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('Fullname must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/).withMessage('Fullname can only contain letters and spaces'),
  
  body('profilePic')
    .optional()
    .isString().withMessage('Profile picture must be a valid string'),
  
  body()
    .custom((value) => {
      if (!value.fullname && !value.profilePic) {
        throw new Error('At least one field (fullname or profilePic) is required');
      }
      return true;
    }),
  
  handleValidationErrors
];

// Change password validation
export const validateChangePassword = [
  body('currentPassword')
    .notEmpty().withMessage('Current password is required'),
  
  body('newPassword')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('New password must contain at least one uppercase letter, one lowercase letter, and one number')
    .custom((value, { req }) => {
      if (value === req.body.currentPassword) {
        throw new Error('New password must be different from current password');
      }
      return true;
    }),
  
  handleValidationErrors
];

// Google auth validation
export const validateGoogleAuth = [
  body('token')
    .notEmpty().withMessage('Google token is required')
    .isString().withMessage('Google token must be a string'),
  
  handleValidationErrors
];

