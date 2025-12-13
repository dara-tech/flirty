import React, { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, ActivityIndicator, StyleSheet, Text, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './src/theme';

// Import screens
import LoginScreen from './src/screens/LoginScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import ChatScreen from './src/screens/ChatScreen';
import ContactsScreen from './src/screens/ContactsScreen';
import ConversationScreen from './src/screens/ConversationScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import UserDetailScreen from './src/screens/UserDetailScreen';
import GroupDetailScreen from './src/screens/GroupDetailScreen';

// Import MapScreen (uses WebView fallback in Expo Go)
import MapScreen from './src/screens/MapScreen';

// Import stores
import { useAuthStore } from './src/store/useAuthStore';
import { useChatStore } from './src/store/useChatStore';
import CallProvider from './src/components/CallProvider';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Main tabs navigator (shown when logged in)
function MainTabs() {
  const { colors, spacing, typography, commonStyles, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Chats') {
            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
          } else if (route.name === 'Contacts') {
            iconName = focused ? 'people' : 'people-outline';
          } else if (route.name === 'Map') {
            iconName = focused ? 'map' : 'map-outline';
          } else if (route.name === 'Settings') {
            iconName = focused ? 'settings' : 'settings-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: commonStyles.textSecondary,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: commonStyles.backgroundPrimary,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: commonStyles.borderColor,
          paddingTop: spacing.xs,
          paddingBottom: Platform.OS === 'ios' 
            ? spacing.md + 8 
            : Math.max(spacing.md, insets.bottom),
          height: Platform.OS === 'ios' 
            ? 89
            : 89 + Math.max(0, insets.bottom - spacing.md),
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: isDark ? 0.3 : 0.1,
              shadowRadius: 8,
            },
            android: {
              elevation: 8,
            },
          }),
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginTop: spacing.xs / 2,
        },
      })}
    >
      <Tab.Screen name="Chats" component={ChatScreen} />
      <Tab.Screen name="Contacts" component={ContactsScreen} />
      <Tab.Screen name="Map" component={MapScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

// Global navigation ref for logout
export const navigationRef = React.createRef();

export default function App() {
  const { colors, spacing, typography, isDark } = useTheme();
  const styles = getStyles(colors, spacing, typography);
  
  // Use individual selectors to prevent unnecessary re-renders
  // Get authUser ID separately for stable comparison
  const authUserId = useAuthStore((state) => state.authUser?._id?.toString());
  const authUser = useAuthStore((state) => state.authUser);
  const isCheckingAuth = useAuthStore((state) => state.isCheckingAuth);
  const hasHydrated = useAuthStore((state) => state._hasHydrated);
  const socket = useAuthStore((state) => state.socket);
  const prevAuthUserRef = useRef(authUser);
  const authCheckDoneRef = useRef(false);
  
  // Force app to proceed after maximum wait time (2 seconds)
  useEffect(() => {
    if (hasHydrated) return; // Don't set timeout if already hydrated
    
    const maxTimeout = setTimeout(() => {
      if (!hasHydrated) {
        console.warn('Maximum wait time reached - forcing app to proceed');
        useAuthStore.setState({ _hasHydrated: true, isCheckingAuth: false });
      }
    }, 2000);

    return () => clearTimeout(maxTimeout);
  }, [hasHydrated]);

  // Check auth on mount, but wait for rehydration first - only once
  useEffect(() => {
    if (!hasHydrated || authCheckDoneRef.current) return;
    
    authCheckDoneRef.current = true;
    
    // Add timeout to auth check
    const authCheckTimeout = setTimeout(() => {
      const currentState = useAuthStore.getState();
      if (currentState.isCheckingAuth) {
        console.warn('Auth check timeout - stopping check');
        useAuthStore.setState({ isCheckingAuth: false });
      }
    }, 8000); // 8 second timeout for auth check
    
    if (__DEV__) {
      console.log('App mounted, checking auth... (rehydration complete)');
    }
    
    // Get checkAuth from store inside the effect to avoid dependency issues
    const currentCheckAuth = useAuthStore.getState().checkAuth;
    if (!currentCheckAuth) {
      clearTimeout(authCheckTimeout);
      return;
    }
    
    try {
      currentCheckAuth().then(() => {
        if (__DEV__) {
          console.log('Auth check complete');
        }
        clearTimeout(authCheckTimeout);
      }).catch((error) => {
        console.error('Error in auth check promise:', error);
        clearTimeout(authCheckTimeout);
        useAuthStore.setState({ isCheckingAuth: false });
      });
    } catch (error) {
      console.error('Error checking auth:', error);
      clearTimeout(authCheckTimeout);
      useAuthStore.setState({ isCheckingAuth: false });
    }
    
    return () => clearTimeout(authCheckTimeout);
  }, [hasHydrated]); // Only depend on hasHydrated

  // Subscribe to messages globally when authenticated (for real-time updates)
  const socketRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const subscribedUserIdRef = useRef(null);
  
  useEffect(() => {
    // Only subscribe if we have authUser ID and socket
    if (!authUserId || !socket) {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      socketRef.current = null;
      subscribedUserIdRef.current = null;
      return;
    }
    
    // Skip if already subscribed to the same socket instance and same user
    if (socketRef.current === socket && unsubscribeRef.current && subscribedUserIdRef.current === authUserId) {
      return;
    }
    
    // Clean up previous subscription
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    
    socketRef.current = socket;
    subscribedUserIdRef.current = authUserId;
    
    // Get subscribeToMessages from store inside effect to avoid dependency
    const chatStore = useChatStore.getState();
    const subscribeToMessages = chatStore?.subscribeToMessages;
    if (subscribeToMessages) {
      unsubscribeRef.current = subscribeToMessages();
      if (__DEV__) {
        console.log('✅ Global message subscription enabled for real-time updates');
      }
    }
    
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      socketRef.current = null;
      subscribedUserIdRef.current = null;
    };
  }, [authUserId, socket]); // Use stable authUserId string and socket

  // Navigate when auth state changes - using a more reliable approach
  useEffect(() => {
    // Don't navigate during initial hydration or auth check
    if (!hasHydrated || isCheckingAuth) {
      return;
    }
    
    // Wait for navigation ref to be ready
    if (!navigationRef.current) {
      return;
    }
    
    const prevAuthUser = prevAuthUserRef.current;
    const currentAuthUser = authUser;
    
    // Use stable IDs for comparison
    const prevId = prevAuthUser?._id?.toString();
    const currentId = currentAuthUser?._id?.toString();
    const prevExists = !!prevAuthUser;
    const currentExists = !!currentAuthUser;
    
    // Only navigate if auth state actually changed
    const authChanged = prevExists !== currentExists || prevId !== currentId;
    
    if (!authChanged) {
      // Update ref if no change
      prevAuthUserRef.current = currentAuthUser;
      return;
    }
    
    console.log('🔄 Auth state changed detected:', { 
      prev: prevExists, 
      current: currentExists,
      prevId,
      currentId
    });
    
    // Navigate immediately but in next tick to avoid render conflicts
    const navigationId = setTimeout(() => {
      const nav = navigationRef.current;
      if (!nav) {
        console.warn('⚠️ Navigation ref not ready');
        return;
      }
      
      try {
        if (currentAuthUser) {
          // User logged in - navigate to Main
          console.log('✅ Navigating to Main screen');
          nav.reset({
            index: 0,
            routes: [{ name: 'Main' }],
          });
        } else if (prevAuthUser && !currentAuthUser) {
          // User logged out - navigate to Login
          console.log('✅ Navigating to Login screen (logout)');
          try {
            // Use reset to clear navigation stack completely
            nav.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
            console.log('✅ Navigation reset successful');
          } catch (resetError) {
            console.error('Reset navigation error, trying replace:', resetError);
            try {
              nav.replace('Login');
              console.log('✅ Navigation replace successful');
            } catch (replaceError) {
              console.error('Replace navigation error:', replaceError);
              // Last resort: try navigate
              try {
                nav.navigate('Login');
                console.log('✅ Navigation navigate successful');
              } catch (navigateError) {
                console.error('Navigate error:', navigateError);
              }
            }
          }
        }
        
        // Update ref after navigation
        prevAuthUserRef.current = currentAuthUser;
      } catch (error) {
        console.error('❌ Navigation error:', error);
        // Fallback: try direct navigation
        try {
          if (!currentAuthUser) {
            console.log('🔄 Fallback: Trying direct navigation to Login');
            nav.replace('Login');
          }
        } catch (fallbackError) {
          console.error('❌ Fallback navigation error:', fallbackError);
        }
      }
    }, 50); // Reduced delay for faster navigation
    
    return () => clearTimeout(navigationId);
  }, [authUserId, hasHydrated, isCheckingAuth, authUser]); // Add authUser to dependencies

  if (__DEV__) {
    console.log('App render - authUser:', !!authUser, 'isCheckingAuth:', isCheckingAuth, 'hasHydrated:', hasHydrated);
  }

  // Show loading while rehydrating or checking auth
  const shouldShowLoading = !hasHydrated || isCheckingAuth;
  
  if (shouldShowLoading) {
    if (__DEV__) {
      console.log('Showing loading screen');
    }
    return (
      <SafeAreaProvider>
        <View style={styles.container}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  if (__DEV__) {
    console.log('Rendering main app - authUser:', !!authUser);
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <Stack.Navigator 
          initialRouteName={authUser ? "Main" : "Login"}
          screenOptions={{ headerShown: false }}
          onReady={() => {
            // Ensure navigation ref is set
            if (navigationRef.current) {
              console.log('✅ Navigation container ready');
            }
          }}
        >
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="SignUp" component={SignUpScreen} />
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen 
            name="Conversation" 
            component={ConversationScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen 
            name="UserDetail" 
            component={UserDetailScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen 
            name="GroupDetail" 
            component={GroupDetailScreen}
            options={{ headerShown: false }}
          />
        </Stack.Navigator>
        <CallProvider />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const getStyles = (colors, spacing, typography) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontSize: typography.base,
  },
});
