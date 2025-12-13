import { useThemeStore } from '../store/useThemeStore';
import { lightColors, darkColors } from './colors';
import { spacing } from './spacing';
import { typography } from './typography';

export const useTheme = () => {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  
  const colors = isDark ? darkColors : lightColors;
  
  const commonStyles = {
    borderRadius: 8,
    borderRadiusLarge: 12,
    borderRadiusFull: 9999,
    
    // Shadows
    shadow: {
      shadowColor: isDark ? '#000' : '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    
    // Header styles - theme-aware
    header: {
      backgroundColor: colors.background,
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.05,
      shadowRadius: 4,
      elevation: 2,
      borderBottomWidth: 0.5,
      borderBottomColor: colors.border,
    },
    
    headerText: {
      color: colors.textPrimary,
      fontSize: 28,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    
    // Avatar sizes - consistent
    avatarSize: 60,
    avatarSizeSmall: 56,
    
    // Background colors - theme-aware
    backgroundPrimary: colors.background,
    backgroundSecondary: colors.backgroundSecondary,
    backgroundTertiary: colors.backgroundTertiary,
    
    // Text colors - theme-aware
    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    textTertiary: colors.textTertiary,
    
    // Border colors - theme-aware
    borderColor: colors.border,
    borderColorLight: colors.borderLight,
  };
  
  return {
    colors,
    spacing,
    typography,
    commonStyles,
    isDark,
    theme,
  };
};
