import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { useAuthStore } from '../store/useAuthStore';
import GoogleSignInButton from '../component/GoogleSignInButton';
import { useTheme } from '../theme';

export default function SignUpScreen({ navigation }) {
  const { colors, spacing, typography, commonStyles } = useTheme();
  const styles = getStyles(colors, spacing, typography, commonStyles);
  const [fullname, setFullname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const store = useAuthStore();
  const signup = store?.signup;

  const handleSignup = async () => {
    setError(''); // Clear previous errors
    
    if (!fullname || !email || !password) {
      setError('Please fill in all fields');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (!signup) {
      setError('Signup function not available');
      return;
    }

    setLoading(true);
    try {
      await signup(fullname, email, password);
      // Navigation will happen automatically via App.js when authUser is set
      setError(''); // Clear error on success
    } catch (error) {
      setError(error.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.scrollView}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Sign up to get started</Text>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={[styles.input, error && fullname && styles.inputError]}
            placeholder="Enter your full name"
            placeholderTextColor={commonStyles.textTertiary}
            value={fullname}
            onChangeText={(text) => {
              setFullname(text);
              if (error) setError(''); // Clear error when user types
            }}
            autoCapitalize="words"
          />
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
          <Text style={styles.hintText}>
            Must contain: uppercase, lowercase, and number
          </Text>
        </View>

        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.button}
          onPress={handleSignup}
          disabled={Boolean(loading)}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign Up</Text>
          )}
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        <GoogleSignInButton text="Sign up with Google" />

        <TouchableOpacity
          onPress={() => navigation?.navigate('Login')}
          style={styles.linkContainer}
        >
          <Text style={styles.linkText}>
            Already have an account? <Text style={styles.linkBold}>Sign In</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const getStyles = (colors, spacing, typography, commonStyles) => StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: commonStyles.backgroundPrimary,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
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
  hintText: {
    fontSize: typography.xs,
    color: commonStyles.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 18,
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

