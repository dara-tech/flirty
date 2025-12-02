import { useState, useEffect } from "react";

/**
 * ProfileImage component with error handling for Google profile pictures
 * Handles 429 rate limiting errors and other image loading failures
 */
const ProfileImage = ({ 
  src, 
  alt = "Profile", 
  fallback = "/avatar.png",
  className = "",
  ...props 
}) => {
  const [imgSrc, setImgSrc] = useState(src || fallback);
  const [hasError, setHasError] = useState(false);

  // Update src when prop changes (reset error state)
  useEffect(() => {
    if (src && src !== imgSrc) {
      setImgSrc(src);
      setHasError(false);
    } else if (!src) {
      setImgSrc(fallback);
      setHasError(false);
    }
  }, [src, fallback]);

  const handleError = (e) => {
    // If image fails to load and we haven't already switched to fallback
    if (!hasError && imgSrc !== fallback) {
      setHasError(true);
      setImgSrc(fallback);
      // Prevent infinite loop if fallback also fails
      e.target.onerror = null;
    }
  };

  return (
    <img
      src={imgSrc}
      alt={alt}
      className={className}
      onError={handleError}
      loading="lazy"
      {...props}
    />
  );
};

export default ProfileImage;

