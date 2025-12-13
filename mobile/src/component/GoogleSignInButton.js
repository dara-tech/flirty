import React, { useState } from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, View, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useAuthStore } from '../store/useAuthStore';
import { useTheme } from '../theme';

// Complete the auth session when browser closes
WebBrowser.maybeCompleteAuthSession();

// Google OAuth configuration
const GOOGLE_CLIENT_ID = '283732145047-tu9sdui7iasnf8ul0a0vr4lq3fj190d5.apps.googleusercontent.com';
const GOOGLE_ISSUER = 'https://accounts.google.com';

export default function GoogleSignInButton({ text = 'Continue with Google' }) {
  const { colors, spacing, typography, commonStyles } = useTheme();
  const styles = getStyles(colors, spacing, typography, commonStyles);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const store = useAuthStore();
  const googleAuth = store?.googleAuth;
  const isGoogleAuthLoading = store?.isGoogleAuthLoading ?? false;

  // Configure the auth request
  const discovery = {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
  };

  // Generate redirect URI - use package name for Android compatibility
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: Platform.OS === 'android' ? 'com.anonymous.mobile' : 'mobile',
    path: 'oauthredirect', // Add path for better compatibility
  });

  // Log redirect URI for debugging (only in dev)
  React.useEffect(() => {
    if (__DEV__) {
      console.log('🔐 Google OAuth Redirect URI:', redirectUri);
      console.log('🔐 Google Client ID:', GOOGLE_CLIENT_ID);
    }
  }, [redirectUri]);

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      scopes: ['openid', 'profile', 'email'],
      responseType: AuthSession.ResponseType.IdToken,
      redirectUri: redirectUri,
    },
    discovery
  );

  // Handle the response
  React.useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      if (id_token && googleAuth) {
        handleGoogleAuth(id_token);
      } else {
        console.warn('⚠️ No id_token in response:', response);
        setError('Google sign-in failed: No token received');
        setIsLoading(false);
      }
    } else if (response?.type === 'error') {
      const errorCode = response.errorCode;
      const errorDescription = response.params?.error_description || response.params?.error || 'Unknown error';
      
      console.error('❌ Google OAuth Error:', {
        type: response.type,
        errorCode,
        errorDescription,
        params: response.params,
      });

      // Provide more specific error messages
      let errorMessage = 'Google sign-in failed';
      if (errorDescription.includes('access_denied') || errorDescription.includes('block')) {
        errorMessage = 'Access blocked. Please check:\n\n1. OAuth consent screen is configured\n2. Your email is added to test users (if app is in testing)\n3. Redirect URI is whitelisted in Google Cloud Console';
      } else if (errorDescription.includes('invalid_client')) {
        errorMessage = 'Invalid client configuration. Please check Google Client ID.';
      } else if (errorDescription.includes('redirect_uri_mismatch')) {
        errorMessage = `Redirect URI mismatch. Add this to Google Cloud Console:\n${redirectUri}`;
      } else {
        errorMessage = `Google sign-in error: ${errorDescription}`;
      }
      
      setError(errorMessage);
      setIsLoading(false);
    } else if (response?.type === 'cancel') {
      setError('');
      setIsLoading(false);
    }
  }, [response, googleAuth, redirectUri]);

  const handleGoogleAuth = async (idToken) => {
    if (!googleAuth) {
      setError('Google authentication is not available');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await googleAuth(idToken);
      // Navigation will happen automatically via App.js when authUser is set
    } catch (error) {
      setError(error.message || 'Failed to sign in with Google');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePress = async () => {
    setError('');
    setIsLoading(true);

    if (!request) {
      setError('Google sign-in is not ready. Please try again.');
      setIsLoading(false);
      return;
    }

    try {
      const result = await promptAsync();
      if (__DEV__) {
        console.log('🔐 Google OAuth prompt result:', result);
      }
    } catch (err) {
      console.error('❌ Error opening Google sign-in:', err);
      setError(`Failed to open Google sign-in: ${err.message || 'Unknown error'}`);
      setIsLoading(false);
    }
  };

  const loading = isLoading || isGoogleAuthLoading;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handlePress}
        disabled={loading || !request}
        activeOpacity={0.8}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.google} size="small" />
            <Text style={[styles.loadingText, { marginLeft: spacing.sm }]}>Connecting...</Text>
          </View>
        ) : (
          <View style={styles.buttonContent}>
            <View style={styles.iconWrapper}>
              <GoogleLogo size={24} />
            </View>
            <Text style={styles.buttonText}>{text}</Text>
          </View>
        )}
      </TouchableOpacity>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          {__DEV__ && redirectUri ? (
            <Text style={styles.debugText}>
              {'\n'}Debug: Redirect URI: {redirectUri}
              {'\n'}Add this to Google Cloud Console → OAuth Client → Authorized redirect URIs
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const getStyles = (colors, spacing, typography, commonStyles) => StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: spacing.md,
  },
  button: {
    backgroundColor: colors.background,
    borderRadius: commonStyles.borderRadius,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapper: {
    marginRight: spacing.md,
  },
  buttonText: {
    color: colors.textPrimary,
    fontWeight: typography.medium,
    fontSize: typography.base,
    letterSpacing: 0.1,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.textPrimary,
    fontSize: typography.base,
    fontWeight: typography.medium,
  },
  errorContainer: {
    backgroundColor: colors.errorBackground,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    borderRadius: commonStyles.borderRadius,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.sm,
    textAlign: 'center',
  },
  debugText: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    textAlign: 'center',
    marginTop: spacing.xs,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});

// Official Google logo - exact match with frontend web version
const GoogleLogo = ({ size = 24 }) => {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ flexShrink: 0 }}
    >
      <Path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <Path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <Path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <Path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </Svg>
  );
};

