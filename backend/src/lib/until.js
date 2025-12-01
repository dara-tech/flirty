import jwt from 'jsonwebtoken';

export const generateToken = (userId, res) => {
    const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
        expiresIn: '7d'
    });
    
    // Cookie settings - optimized for cross-origin
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    const cookieOptions = {
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        httpOnly: true, // Prevents JavaScript access for security
        path: '/', // Ensure cookie is available for all paths
    };
    
    if (isDevelopment) {
        // Development settings - for localhost with different ports
        // 'lax' works for same-domain different ports (localhost:5173 -> localhost:5002)
        cookieOptions.sameSite = 'lax';
        cookieOptions.secure = false; // HTTP is fine for localhost
    } else {
        // Production settings - for cross-origin (separate frontend/backend hosting)
        // Use 'none' for cross-origin cookies (frontend on Netlify, backend on Render)
        cookieOptions.sameSite = 'none';
        cookieOptions.secure = true; // Required when sameSite is 'none'
        // Explicitly set domain to null to allow cross-origin cookies
        // Don't set domain property - let browser handle it automatically
    }
    
    // Set cookie with explicit options
    res.cookie("jwt", token, cookieOptions);
    
    // Log in production for debugging (can be removed later)
    if (!isDevelopment) {
        console.log('🍪 Cookie set:', {
            httpOnly: cookieOptions.httpOnly,
            secure: cookieOptions.secure,
            sameSite: cookieOptions.sameSite,
            path: cookieOptions.path,
            maxAge: cookieOptions.maxAge,
        });
    }
    
    return token;
}

// Helper to get cookie options (for logout and other operations)
export const getCookieOptions = () => {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    return {
        httpOnly: true,
        path: '/',
        sameSite: isDevelopment ? 'lax' : 'none',
        secure: !isDevelopment,
    };
}