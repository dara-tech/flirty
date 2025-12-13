// Centralized theme exports
export { lightColors, darkColors, colors } from './colors';
export { spacing } from './spacing';
export { typography } from './typography';
export { useTheme } from './useTheme';

// Legacy commonStyles for backward compatibility (light mode only)
// New code should use useTheme() hook instead
export const commonStyles = {
  borderRadius: 8,
  borderRadiusLarge: 12,
  borderRadiusFull: 9999,
  
  // Shadows
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  
  // Header styles - consistent across all screens (white in light mode)
  header: {
    backgroundColor: '#ffffff', // White background in light mode
    paddingHorizontal: 20, // spacing.lg
    paddingTop: 60, // Platform.OS === 'ios' ? spacing.xxl + 12 : spacing.xl + 8
    paddingBottom: 16, // spacing.md + 6
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e0e0e0',
  },
  
  headerText: {
    color: '#1a1a1a', // Dark text on white background
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  
  // Avatar sizes - consistent
  avatarSize: 60,
  avatarSizeSmall: 56,
  
  // Background colors - consistent
  backgroundPrimary: '#ffffff',
  backgroundSecondary: '#f5f5f5',
  backgroundTertiary: '#f0f0f0',
  
  // Text colors - consistent
  textPrimary: '#1a1a1a',
  textSecondary: '#8e8e93',
  textTertiary: '#c7c7cc',
  
  // Border colors
  borderColor: '#e0e0e0',
  borderColorLight: '#e8e8e8',
};
