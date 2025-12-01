import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { FaSpinner } from "react-icons/fa";

const GoogleSignInButton = ({ text = "Continue with Google" }) => {
  const { googleAuth, isGoogleAuthLoading } = useAuthStore();
  const hiddenButtonRef = useRef(null);
  const initializedRef = useRef(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState(null);

  useEffect(() => {
    if (initializedRef.current) return;

    const handleCredentialResponse = async (response) => {
      try {
        await googleAuth(response.credential);
      } catch (error) {
        console.error("Google sign-in error:", error);
      }
    };

    // Wait for Google Identity Services to load
    const initializeGoogleSignIn = () => {
      if (window.google && window.google.accounts && hiddenButtonRef.current && !initializedRef.current) {
        try {
          const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "283732145047-tu9sdui7iasnf8ul0a0vr4lq3fj190d5.apps.googleusercontent.com";
          
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleCredentialResponse,
            // Add error handling for origin issues
            auto_select: false,
          });

          // Render a hidden button to trigger the popup
          window.google.accounts.id.renderButton(hiddenButtonRef.current, {
            theme: "outline",
            size: "large",
            width: "100%",
            text: "signin_with",
            locale: "en",
          });

          initializedRef.current = true;
          setIsInitializing(false);
        } catch (error) {
          // Handle Google Sign-In errors gracefully
          const errorMessage = error.message || String(error);
          console.warn("Google Sign-In initialization error:", errorMessage);
          
          // Set error state to show helpful message or disable button
          if (errorMessage?.includes("origin") || errorMessage?.includes("client ID") || errorMessage?.includes("not allowed")) {
            setInitError("Google Sign-In is not configured for this domain. Please contact support.");
          } else {
            setInitError("Google Sign-In failed to initialize. Please try again.");
          }
          setIsInitializing(false);
        }
      } else if (!initializedRef.current) {
        // Retry after a short delay if Google Identity Services hasn't loaded yet
        setTimeout(initializeGoogleSignIn, 100);
      }
    };

    // Check if Google Identity Services is already loaded
    if (window.google && window.google.accounts) {
      initializeGoogleSignIn();
    } else {
      // Wait for the script to load
      const checkInterval = setInterval(() => {
        if (window.google && window.google.accounts) {
          clearInterval(checkInterval);
          initializeGoogleSignIn();
        }
      }, 100);

      return () => {
        clearInterval(checkInterval);
      };
    }
  }, [googleAuth]);

  const handleClick = () => {
    if (hiddenButtonRef.current) {
      const googleButton = hiddenButtonRef.current.querySelector('div[role="button"]');
      if (googleButton) {
        googleButton.click();
      }
    }
  };

  return (
    <div className="w-full">
      {/* Hidden Google button for actual authentication */}
      <div ref={hiddenButtonRef} className="hidden" />
      
      {/* Custom styled button */}
      {initError && (
        <p className="text-xs text-warning mb-2">{initError}</p>
      )}
      <button
        onClick={handleClick}
        disabled={isGoogleAuthLoading || isInitializing || !!initError}
        className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-base-100 border-2 border-base-300 rounded-lg hover:bg-base-200 hover:border-base-400 active:scale-[0.98] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed group"
        title={initError || undefined}
      >
        {isGoogleAuthLoading ? (
          <>
            <FaSpinner className="size-5 animate-spin text-base-content/60" />
            <span className="text-sm font-medium text-base-content/60">Signing in...</span>
          </>
        ) : (
          <>
            <svg className="size-5 flex-shrink-0" viewBox="0 0 24 24">
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

