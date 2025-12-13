import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuthStore } from '../store/useAuthStore';
import GoogleSignInButton from '../component/GoogleSignInButton';
import { useTheme } from '../theme';

export default function LoginScreen({ navigation }) {
  const { colors, spacing, typography, commonStyles } = useTheme();
  const styles = getStyles(colors, spacing, typography, commonStyles);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const authUser = useAuthStore((state) => state.authUser);
  const login = useAuthStore((state) => state.login);

  // Note: Navigation is handled globally by App.js based on auth state changes
  // We don't navigate here to avoid conflicts and loops

  // Debug: Log when component renders
  React.useEffect(() => {
    console.log('LoginScreen rendered', { hasLogin: !!login, hasNavigation: !!navigation, hasAuthUser: !!authUser });
  }, [login, navigation, authUser]);

  const handleLogin = async () => {
    setError(''); // Clear previous errors
    
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    if (!login) {
      setError('Login function not available');
      console.error('Login function is not available in store');
      return;
    }

    setLoading(true);
    console.log('Attempting login for:', email);
    try {
      const result = await login(email, password);
      console.log('Login successful:', result);
      setError(''); // Clear error on success
      
      // Navigation will be handled automatically by App.js when authUser state updates
      // No need to navigate here - this prevents navigation conflicts and loops
    } catch (error) {
      console.error('Login error:', error);
      const errorMessage = error.message || 'Login failed';
      setError(errorMessage);
      // Show more detailed error for network issues
      if (error.message?.includes('Network') || error.message?.includes('timeout') || error.message?.includes('ECONNREFUSED')) {
        setError('Cannot connect to server. Make sure your backend is running and accessible.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={[styles.input, error && email && styles.inputError]}
          placeholder="Enter your email"
          placeholderTextColor={commonStyles.textTertiary}
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            if (error) setError(''); // Clear error when user types
          }}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={[styles.input, error && styles.inputError]}
          placeholder="Enter your password"
          placeholderTextColor={commonStyles.textTertiary}
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            if (error) setError(''); // Clear error when user types
          }}
          secureTextEntry={true}
        />
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.button}
        onPress={handleLogin}
        disabled={Boolean(loading)}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign In</Text>
        )}
      </TouchableOpacity>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>OR</Text>
        <View style={styles.dividerLine} />
      </View>

      <GoogleSignInButton text="Sign in with Google" />

      <TouchableOpacity
        onPress={() => navigation?.navigate('SignUp')}
        style={styles.linkContainer}
      >
        <Text style={styles.linkText}>
          Don't have an account? <Text style={styles.linkBold}>Sign Up</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const getStyles = (colors, spacing, typography, commonStyles) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: commonStyles.backgroundPrimary,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  header: {
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: typography['3xl'],
    fontWeight: typography.bold,
    color: commonStyles.textPrimary,
    marginBottom: spacing.sm,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: typography.base,
    color: commonStyles.textSecondary,
    lineHeight: 22,
  },
  inputContainer: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.sm,
    fontWeight: typography.medium,
    color: commonStyles.textPrimary,
    marginBottom: spacing.sm,
    letterSpacing: 0.1,
  },
  input: {
    backgroundColor: commonStyles.backgroundSecondary,
    borderWidth: 1,
    borderColor: commonStyles.borderColor,
    borderRadius: commonStyles.borderRadius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typography.base,
    color: commonStyles.textPrimary,
    minHeight: 48,
  },
  inputError: {
    borderColor: colors.borderError,
    borderWidth: 1.5,
  },
  errorContainer: {
    backgroundColor: colors.errorBackground,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    borderRadius: commonStyles.borderRadius,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.sm,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: commonStyles.borderRadius,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    minHeight: 50,
  },
  buttonText: {
    color: colors.textWhite,
    fontWeight: typography.semibold,
    fontSize: typography.lg,
  },
  linkContainer: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  linkText: {
    color: colors.primary,
    fontSize: typography.base,
  },
  linkBold: {
    fontWeight: typography.semibold,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: commonStyles.borderColor,
  },
  dividerText: {
    marginHorizontal: spacing.md,
    color: commonStyles.textSecondary,
    fontSize: typography.sm,
    fontWeight: '500',
  },
});

