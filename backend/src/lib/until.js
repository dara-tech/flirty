import jwt from 'jsonwebtoken';
export const generateToken = (userId, res) => {
    const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
        expiresIn: '7d'
    });
    
    // Cookie settings - optimized for cross-origin development
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
        // Don't set domain - let browser handle localhost automatically
    } else {
        // Production settings
        cookieOptions.sameSite = 'strict';
        cookieOptions.secure = true; // Requires HTTPS
    }
    
    res.cookie("jwt", token, cookieOptions);
    
    return token;
}