import { useEffect, useState, useRef } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { FaSpinner } from "react-icons/fa";

// Detect if we're in a webview environment
const isWebView = () => {
  // Check for common webview indicators
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  
  // Check for webview patterns
  const webviewPatterns = [
    /wv/i,                    // Android WebView
    /WebView/i,               // iOS WebView
    /(iPhone|iPod|iPad)(?!.*Safari\/)/i, // iOS without Safari
    /Android.*(wv|\.0\.0\.0)/i, // Android WebView
  ];
  
  return webviewPatterns.some(pattern => pattern.test(userAgent));
};

const GoogleSignInButton = ({ text = "Continue with Google" }) => {
  const { googleAuth, isGoogleAuthLoading } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isWebViewEnv, setIsWebViewEnv] = useState(false);
  const clientIdRef = useRef(null);
  const retryCountRef = useRef(0);
  const maxRetries = 50; // 5 seconds max wait time

  // Detect webview environment on mount
  useEffect(() => {
    setIsWebViewEnv(isWebView());
  }, []);

  // Initialize Google Sign-In
  useEffect(() => {
    const initializeGoogle = () => {
      // Check if Google library is loaded
      if (window.google && window.google.accounts && window.google.accounts.id) {
        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "283732145047-tu9sdui7iasnf8ul0a0vr4lq3fj190d5.apps.googleusercontent.com";
        clientIdRef.current = clientId;
        
        const handleCredentialResponse = async (response) => {
          setIsLoading(true);
          setError(null);
          try {
            await googleAuth(response.credential);
          } catch (error) {
            console.error("Google sign-in error:", error);
            setError(error.response?.data?.message || "Failed to sign in with Google. Please try again.");
          } finally {
            setIsLoading(false);
          }
        };

        try {
          // Initialize Google Identity Services
          // Always use popup mode (redirect doesn't work well with current backend setup)
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleCredentialResponse,
            ux_mode: 'popup', // Use popup mode for better UX
          });

          setIsInitialized(true);
          retryCountRef.current = 0;
          console.log(`✅ Google Sign-In initialized successfully (mode: ${isWebViewEnv ? 'redirect' : 'popup'})`);
        } catch (err) {
          console.error("Error initializing Google:", err);
          if (retryCountRef.current < maxRetries) {
            retryCountRef.current++;
            setTimeout(initializeGoogle, 100);
          } else {
            setError("Failed to initialize Google Sign-In. Please refresh the page.");
          }
        }
      } else {
        // Retry if Google library not loaded yet
        if (retryCountRef.current < maxRetries) {
          retryCountRef.current++;
          setTimeout(initializeGoogle, 100);
        } else {
          setError("Google Sign-In library failed to load. Please check your internet connection, allow third-party scripts, and refresh the page.");
        }
      }
    };

    // Start initialization
    initializeGoogle();
  }, [googleAuth, isWebViewEnv]);

  // Handle button click - trigger Google Sign-In
  const handleGoogleSignIn = async () => {
    setError(null);

    // For webviews, show helpful message
    if (isWebViewEnv) {
      setError("Google Sign-In doesn't work in webviews. Please open this page in a regular browser (Chrome, Safari, Firefox) or use email/password to sign in.");
      return;
    }

    // For regular browsers, use the standard flow
    // Check if Google library is available
    if (!window.google?.accounts?.id) {
      setError("Google Sign-In is not loaded. Please refresh the page.");
      return;
    }

    if (!isInitialized || !clientIdRef.current) {
      setError("Google Sign-In is not ready. Please wait a moment and try again.");
      return;
    }

    setIsLoading(true);

    try {
      // Create a temporary hidden container for Google's button
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.top = '-9999px';
      container.style.left = '-9999px';
      container.style.opacity = '0';
      container.style.pointerEvents = 'none';
      document.body.appendChild(container);

      // Try to render Google Sign-In button into hidden container
      try {
        window.google.accounts.id.renderButton(container, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          width: 250,
        });

        // Wait for button to render, then trigger click
        setTimeout(() => {
          const googleButton = container.querySelector('div[role="button"]');
          
          if (googleButton) {
            // Trigger click on Google's button - this opens the popup
            googleButton.click();
            
            // Clean up after a delay
            setTimeout(() => {
              if (container.parentNode) {
                document.body.removeChild(container);
              }
              // Reset loading state after popup should have opened
              setTimeout(() => setIsLoading(false), 500);
            }, 500);
          } else {
            // Button didn't render - might be webview issue
            if (container.parentNode) {
              document.body.removeChild(container);
            }
            setIsLoading(false);
            setError("Google Sign-In button couldn't be rendered. This might be due to webview restrictions. Please use email/password or open in a regular browser.");
          }
        }, 500); // Increased timeout for webview detection
      } catch (renderErr) {
        // Catch renderButton errors (like webview restrictions)
        if (container.parentNode) {
          document.body.removeChild(container);
        }
        setIsLoading(false);
        
        const errorMsg = renderErr.message || renderErr.toString();
        if (errorMsg.includes('webview') || errorMsg.includes('web view') || errorMsg.includes('403')) {
          setError("Google Sign-In doesn't support webviews. Please open this page in a regular browser (Chrome, Safari, Firefox) or use email/password to sign in.");
        } else {
          setError("Google Sign-In is not available. Please enable cookies, allow popups, or use email/password to sign in.");
        }
      }
    } catch (err) {
      console.error("Error initiating Google Sign-In:", err);
      setIsLoading(false);
      
      // Provide helpful error message based on error type
      if (err.message?.includes('webview') || err.message?.includes('web view')) {
        setError("Google Sign-In doesn't support webviews. Please open this page in a regular browser or use email/password.");
      } else {
        setError("Google Sign-In encountered an error. Please try again or use email/password.");
      }
    }
  };

  return (
    <div className="w-full">
      {error && (
        <p className="text-xs text-error mb-2">{error}</p>
      )}
      <button
        onClick={handleGoogleSignIn}
        disabled={isGoogleAuthLoading || isLoading || !isInitialized || isWebViewEnv}
        className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-base-100 border-2 border-base-300 rounded-lg hover:bg-base-200 hover:border-base-400 active:scale-[0.98] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed group"
        aria-label={text}
        title={isWebViewEnv ? "Google Sign-In doesn't work in webviews. Please use email/password or open in a regular browser." : text}
      >
        {(isGoogleAuthLoading || isLoading) ? (
          <>
            <FaSpinner className="size-5 animate-spin text-base-content/60" />
            <span className="text-sm font-medium text-base-content/60">Signing in...</span>
          </>
        ) : (
          <>
            <svg className="size-5 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span className="text-sm font-medium text-base-content">{text}</span>
          </>
        )}
      </button>
    </div>
  );
};

export default GoogleSignInButton;
