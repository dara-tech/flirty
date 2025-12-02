import { useEffect, useState } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { FaSpinner } from "react-icons/fa";

const GoogleSignInButton = ({ text = "Continue with Google" }) => {
  const { googleAuth, isGoogleAuthLoading } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize Google One Tap (works in web views, no iframe)
  useEffect(() => {
    const initializeGoogle = () => {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "283732145047-tu9sdui7iasnf8ul0a0vr4lq3fj190d5.apps.googleusercontent.com";
        
        const handleCredentialResponse = async (response) => {
          setIsLoading(true);
          try {
            await googleAuth(response.credential);
          } catch (error) {
            console.error("Google sign-in error:", error);
            setError("Failed to sign in with Google. Please try again.");
          } finally {
            setIsLoading(false);
          }
        };

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredentialResponse,
        });

        setIsInitialized(true);
      } else {
        // Retry if Google library not loaded yet
        setTimeout(initializeGoogle, 100);
      }
    };

    initializeGoogle();
  }, [googleAuth]);

  // Use Google's One Tap prompt (no iframe, works in web views)
  const handleGoogleSignIn = () => {
    if (!isInitialized || !window.google?.accounts?.id) {
      setError("Google Sign-In is not ready. Please refresh the page.");
      return;
    }

    setIsLoading(true);
    setError(null);

    // Use One Tap prompt - this works in web views and doesn't use iframes
    window.google.accounts.id.prompt((notification) => {
      setIsLoading(false);
      
      if (notification.isNotDisplayed()) {
        // If One Tap can't be displayed, show error
        setError("Google Sign-In is not available. Please check your browser settings.");
      } else if (notification.isSkippedMoment()) {
        // User skipped, try again
        setError("Please try again or use email/password.");
      } else if (notification.isDismissedMoment()) {
        // User dismissed
        setError(null);
      }
    });
  };

  return (
    <div className="w-full">
      {error && (
        <p className="text-xs text-error mb-2">{error}</p>
      )}
      <button
        onClick={handleGoogleSignIn}
        disabled={isGoogleAuthLoading || isLoading || !isInitialized}
        className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-base-100 border-2 border-base-300 rounded-lg hover:bg-base-200 hover:border-base-400 active:scale-[0.98] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed group"
      >
        {(isGoogleAuthLoading || isLoading) ? (
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
