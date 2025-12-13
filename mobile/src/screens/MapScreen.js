import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
  Image,
  Animated,
} from 'react-native';
import { WebView } from 'react-native-webview';
// Native Maps - Conditionally imported (works in development builds with native code)
let MapView, Marker, PROVIDER_GOOGLE;
let useNativeMaps = false;

try {
  // Try to require react-native-maps
  const maps = require('react-native-maps');
  MapView = maps.default || maps;
  Marker = maps.Marker;
  PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
  
  // Verify native module is actually available (not just the JS package)
  // Use a more robust check that works in both dev and production
  try {
    const { TurboModuleRegistry } = require('react-native');
    const RNMapsModule = TurboModuleRegistry.get('RNMapsAirModule');
    
    if (RNMapsModule) {
      useNativeMaps = true;
      if (__DEV__) {
        const mapProvider = Platform.OS === 'ios' ? 'Apple Maps (native)' : 'Default Maps';
        console.log(`✅ Native maps available - using ${mapProvider} on ${Platform.OS}`);
      }
    } else {
      // Fallback: check if MapView is actually a function/component
      if (typeof MapView === 'function' || (MapView && MapView.prototype)) {
        useNativeMaps = true;
        if (__DEV__) {
          console.log('✅ Native maps available (fallback check)');
        }
      } else {
        throw new Error('RNMapsAirModule not registered in native binary');
      }
    }
  } catch (moduleError) {
    // If TurboModuleRegistry fails, try fallback check
    if (typeof MapView === 'function' || (MapView && MapView.prototype)) {
      useNativeMaps = true;
      if (__DEV__) {
        console.log('✅ Native maps available (fallback check after module error)');
      }
    } else {
      throw moduleError;
    }
  }
} catch (error) {
  // Always fallback to WebView if native maps fail (common in Expo Go)
  if (__DEV__) {
    console.warn('⚠️ Native maps not available, using WebView fallback:', error.message);
    console.warn('   This is normal in Expo Go. For native maps, create a development build.');
    console.warn(`   Platform: ${Platform.OS}`);
  }
  useNativeMaps = false;
  MapView = undefined;
  Marker = undefined;
  PROVIDER_GOOGLE = undefined;
}
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import { useLocationStore } from '../store/useLocationStore';
import { getBackendBaseURL } from '../lib/api';

// Default location (Phnom Penh, Cambodia)
const DEFAULT_LOCATION = {
  latitude: 11.5564,
  longitude: 104.9282,
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

// WebView-based map component (works in Expo Go without native build)
function WebViewMap({ mapRegion, currentLocation, authUser, locationArray, onRegionChange, colors, commonStyles }) {
  const webViewRef = useRef(null);

  // Use platform-appropriate map URL in WebView
  const getMapUrl = useCallback(() => {
    const centerLat = mapRegion.latitude;
    const centerLng = mapRegion.longitude;

    // Build markers
    const markers = [];
    
    // Add current user marker
    if (currentLocation && authUser) {
      markers.push(`${currentLocation.lat},${currentLocation.lng}`);
    }

    // Add other users' markers
    locationArray.forEach(({ lat, lng }) => {
      markers.push(`${lat},${lng}`);
    });

    // Use Apple Maps for both iOS and Android (WebView fallback)
    // Apple Maps web works on both platforms
    const markersParam = markers.length > 0 ? `&q=${markers.join('|')}` : '';
    // Use standard map type - Apple Maps web supports both iOS and Android
    const url = `https://maps.apple.com/?ll=${centerLat},${centerLng}&t=m${markersParam}`;
    if (__DEV__) {
      console.log(`🗺️ Using Apple Maps (WebView) on ${Platform.OS} - minimal style`);
    }
    return url;
  }, [mapRegion, currentLocation, authUser, locationArray]);

  const backgroundColor = commonStyles?.backgroundPrimary || '#ffffff';
  const primaryColor = colors?.primary || '#667eea';

  return (
    <View style={{ flex: 1 }}>
      <WebView
        ref={webViewRef}
        source={{ uri: getMapUrl() }}
        style={{ flex: 1, backgroundColor: backgroundColor }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        // Performance optimizations
        cacheEnabled={true}
        cacheMode="LOAD_CACHE_ELSE_NETWORK"
        androidHardwareAccelerationDisabled={false}
        androidLayerType="hardware"
        // No CSS injection - show full map with all features
        // Removed aggressive hiding that was making map blank
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.warn('WebView error: ', nativeEvent);
          setMapError(`WebView error: ${nativeEvent?.description || 'Unknown error'}`);
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.warn('WebView HTTP error: ', nativeEvent);
          // HTTP errors are usually non-critical for maps
        }}
        // Removed onLoadEnd injection - show full map functionality
        renderLoading={() => (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor }}>
            <ActivityIndicator size="large" color={primaryColor} />
          </View>
        )}
      />
    </View>
  );
}

export default function MapScreen() {
  const { colors, spacing, typography, commonStyles } = useTheme();
  const styles = getStyles(colors, spacing, typography, commonStyles);
  const mapRef = useRef(null);
  const locationSubscriptionRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [mapRegion, setMapRegion] = useState(DEFAULT_LOCATION);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [mapError, setMapError] = useState(null);
  // Prefer native maps when available (development builds)
  // In Expo Go, will fallback to WebView
  // On Android, force WebView to use Apple Maps (no native Apple Maps SDK on Android)
  const [forceWebView, setForceWebView] = useState(!useNativeMaps || Platform.OS === 'android');
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const [selectedMarkerUser, setSelectedMarkerUser] = useState(null);

  const {
    isSharingLocation,
    locationPermissionGranted,
    currentLocation,
    userLocations,
    setSharingLocation,
    setLocationPermission,
    setCurrentLocation,
    updateUserLocation,
    removeUserLocation,
    privacyMode,
    visibleRadius,
    shouldUpdateLocation,
    setLastSentLocation,
    lastSentLocation,
    updateInterval,
  } = useLocationStore();

  const { socket, authUser } = useAuthStore();
  const { users, contacts, setSelectedUser } = useChatStore();

  // Pulsing animation for current user marker
  useEffect(() => {
    if (isSharingLocation && currentLocation) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [isSharingLocation, currentLocation, pulseAnim]);

  // Request location permission and start sharing
  const startLocationSharing = useCallback(async () => {
    try {
      setIsRequestingPermission(true);

      // Request permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Location permission is required to share your location. Please enable it in your device settings.',
          [{ text: 'OK' }]
        );
        setIsRequestingPermission(false);
        setLocationPermission(false);
        return;
      }

      setLocationPermission(true);

      // Get initial location with timeout (reduced for faster response)
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced, // Use Balanced instead of High for faster response
        timeout: 5000, // Reduced to 5 seconds
      });

      const locationData = {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        speed: location.coords.speed || null,
        heading: location.coords.heading || null,
        accuracy: location.coords.accuracy || null,
        timestamp: Date.now(),
      };

      // Determine location source more accurately
      const hasAltitude = location.coords.altitude !== null && location.coords.altitude !== undefined;
      const hasSpeed = location.coords.speed !== null && location.coords.speed !== undefined;
      const hasHeading = location.coords.heading !== null && location.coords.heading !== undefined;
      const isHighAccuracy = locationData.accuracy && locationData.accuracy < 100;
      
      // GPS typically provides altitude, speed, heading, and high accuracy
      const likelySource = (hasAltitude || hasSpeed || hasHeading || isHighAccuracy) ? 'GPS' : 'Network/IP';
      
      // Log location for debugging with more details
      const locationInfo = {
        coordinates: `${locationData.lat.toFixed(6)}, ${locationData.lng.toFixed(6)}`,
        accuracy: locationData.accuracy ? `${locationData.accuracy.toFixed(0)}m` : 'unknown',
        source: likelySource,
        altitude: hasAltitude ? `${location.coords.altitude.toFixed(1)}m` : 'N/A',
        speed: hasSpeed ? `${(location.coords.speed * 3.6).toFixed(1)} km/h` : 'N/A',
        heading: hasHeading ? `${location.coords.heading.toFixed(0)}°` : 'N/A',
      };
      
      console.log('📍 Location detected:', locationInfo);
      
      // Show approximate location name (reverse geocoding would require additional API)
      if (likelySource === 'Network/IP' || (locationData.accuracy && locationData.accuracy > 100)) {
        console.warn('⚠️ Using approximate location (Network/IP). For accurate GPS location, ensure GPS is enabled.');
      }

      // Warn if accuracy is poor (likely IP-based or cached location)
      if (locationData.accuracy && locationData.accuracy > 1000) {
        console.warn('⚠️ Low location accuracy detected. This might be an approximate location.');
        Alert.alert(
          'Location Accuracy',
          `Your location accuracy is ${Math.round(locationData.accuracy)}m. This might be approximate. For better accuracy, ensure GPS is enabled and you're outdoors.`,
          [{ text: 'OK' }]
        );
      }

      setCurrentLocation(locationData);
      setMapRegion({
        latitude: locationData.lat,
        longitude: locationData.lng,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      });

      // Center map on user location
      if (mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: locationData.lat,
          longitude: locationData.lng,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        });
      }

      setSharingLocation(true);

      // Send initial location - wait for socket connection if needed (like web)
      const sendLocationUpdate = () => {
        if (socket && authUser) {
          if (socket.connected) {
            if (__DEV__) {
              console.log('📤 Sending initial location update to server:', {
                lat: locationData.lat,
                lng: locationData.lng,
                socketConnected: socket.connected,
              });
            }
            socket.emit('location:update', {
              lat: locationData.lat,
              lng: locationData.lng,
              speed: locationData.speed,
              heading: locationData.heading,
              accuracy: locationData.accuracy,
            });
            setLastSentLocation(locationData);
          } else {
            // Wait for socket connection (like web does)
            if (__DEV__) {
              console.log('⏳ Socket not connected, waiting for connection...');
            }
            const connectHandler = () => {
              if (socket.connected) {
                socket.emit('location:update', {
                  lat: locationData.lat,
                  lng: locationData.lng,
                  speed: locationData.speed,
                  heading: locationData.heading,
                  accuracy: locationData.accuracy,
                });
                setLastSentLocation(locationData);
                socket.off('connect', connectHandler);
              }
            };
            socket.on('connect', connectHandler);
            // Timeout after 5 seconds
            setTimeout(() => {
              socket.off('connect', connectHandler);
              if (__DEV__) {
                console.warn('⚠️ Socket connection timeout - location update not sent');
              }
            }, 5000);
          }
        } else {
          if (__DEV__) {
            console.warn('⚠️ Cannot send location update:', {
              hasSocket: !!socket,
              hasAuthUser: !!authUser,
              socketConnected: socket?.connected,
            });
          }
        }
      };
      
      sendLocationUpdate();

      // Watch position for continuous updates (use Balanced accuracy for better performance)
      locationSubscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced, // Use Balanced for better performance
          timeInterval: updateInterval,
          distanceInterval: 20, // Update every 20 meters (reduced frequency)
        },
        (position) => {
          const newLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            speed: position.coords.speed || null,
            heading: position.coords.heading || null,
            accuracy: position.coords.accuracy || null,
            timestamp: Date.now(),
          };

          // Only update if moved enough distance or enough time passed
          const shouldUpdate =
            !lastSentLocation ||
            shouldUpdateLocation(newLocation) ||
            Date.now() - (lastSentLocation.timestamp || 0) >= updateInterval;

          if (shouldUpdate) {
            setCurrentLocation(newLocation);

            // Send location update via socket (like web - try even if not connected)
            if (socket && authUser) {
              if (socket.connected) {
                socket.emit('location:update', {
                  lat: newLocation.lat,
                  lng: newLocation.lng,
                  speed: newLocation.speed,
                  heading: newLocation.heading,
                  accuracy: newLocation.accuracy,
                });
                setLastSentLocation(newLocation);
              } else if (__DEV__) {
                // Socket not connected - will retry on next update when connected
                // This matches web behavior - web doesn't check connection status
                console.log('⏳ Socket not connected, skipping location update (will retry when connected)');
              }
            }

            // Update map region smoothly
            if (mapRef.current) {
              mapRef.current.animateToRegion({
                latitude: newLocation.lat,
                longitude: newLocation.lng,
                latitudeDelta: mapRegion.latitudeDelta,
                longitudeDelta: mapRegion.longitudeDelta,
              });
            }
          }
        }
      );

      setIsRequestingPermission(false);
    } catch (error) {
      console.error('Error starting location sharing:', error);
      setIsRequestingPermission(false);
      Alert.alert('Error', 'Failed to start location sharing. Please try again.');
    }
  }, [
    socket,
    authUser,
    setLocationPermission,
    setCurrentLocation,
    setSharingLocation,
    setLastSentLocation,
    shouldUpdateLocation,
    lastSentLocation,
    updateInterval,
    mapRegion,
  ]);

  // Stop location sharing
  const stopLocationSharing = useCallback(() => {
    if (locationSubscriptionRef.current) {
      locationSubscriptionRef.current.remove();
      locationSubscriptionRef.current = null;
    }

    setSharingLocation(false);
    setCurrentLocation(null);
    setLastSentLocation(null);
  }, [setSharingLocation, setCurrentLocation, setLastSentLocation]);

  // Listen for location updates from other users
  useEffect(() => {
    if (!socket) {
      // Socket might not be initialized yet - this is normal during app startup
      // The effect will re-run when socket becomes available
      return;
    }
    
    if (!socket.connected) {
      // Socket exists but not connected yet - wait for connection
      // The effect will re-run when socket connects (socket dependency will trigger re-run)
      return;
    }

    if (__DEV__) {
      console.log('🔌 Setting up location:peer listener');
    }

    const handleLocationPeer = (data) => {
      // Filter by privacy mode
      if (privacyMode === 'off') {
        return;
      }

      // Check if user is a contact/friend (for friends-only mode)
      if (privacyMode === 'friends') {
        const isContact = contacts.some((c) => {
          const contactId =
            typeof c._id === 'string' ? c._id : c._id?.toString();
          const dataUserId = data.userId?.toString();
          return contactId === dataUserId;
        });
        if (!isContact) {
          return;
        }
      }

      // Check if within visible radius (only if current user has shared location)
      if (currentLocation) {
        const distance = useLocationStore.getState().calculateDistance(
          currentLocation.lat,
          currentLocation.lng,
          data.lat,
          data.lng
        );
        if (distance > visibleRadius) {
          return;
        }
      }

      // Get user info - prioritize backend data (has profilePic) like web does
      let user = null;
      
      // First try data.user (from backend - has profilePic) - like web does
      if (data.user) {
        user = {
          _id: data.userId || data.user._id,
          fullname: data.user.fullname || data.fullname || 'Unknown User',
          profilePic: data.user.profilePic || data.profilePic || null,
          email: data.user.email || null,
        };
      }
      
      // If not found, try to find in users array and merge with backend data
      if (!user || !user.profilePic) {
        const userFromArray = users.find((u) => {
          const uId = typeof u._id === 'string' ? u._id : u._id?.toString();
          return uId === data.userId?.toString();
        });
        
        if (userFromArray) {
          // Merge: use backend data but fill in missing fields from users array
          user = {
            _id: data.userId || userFromArray._id,
            fullname: user?.fullname || userFromArray.fullname || data.fullname || 'Unknown User',
            profilePic: user?.profilePic || userFromArray.profilePic || data.profilePic || null,
            email: user?.email || userFromArray.email || null,
          };
        }
      }
      
      // If still not found, create a minimal user object
      if (!user) {
        user = {
          _id: data.userId,
          fullname: data.fullname || data.user?.fullname || 'Unknown User',
          profilePic: data.profilePic || data.user?.profilePic || null,
        };
      }

      updateUserLocation(
        data.userId,
        {
          lat: data.lat,
          lng: data.lng,
          speed: data.speed,
          heading: data.heading,
          accuracy: data.accuracy,
        },
        user
      );
    };

    const handleLocationOffline = ({ userId }) => {
      removeUserLocation(userId);
    };
    
    const handleLocationConfirmed = (data) => {
      // Confirmation that our location was received
      if (__DEV__) {
        console.log('✅ Location confirmed:', data);
      }
    };

    socket.on('location:peer', handleLocationPeer);
    socket.on('location:offline', handleLocationOffline);
    socket.on('location:confirmed', handleLocationConfirmed);
    
    // Also listen for any socket connection events
    socket.on('connect', () => {
      if (__DEV__) {
        console.log('✅ Socket connected for location updates');
      }
    });
    
    socket.on('disconnect', () => {
      if (__DEV__) {
        console.warn('⚠️ Socket disconnected - location updates will not be received');
      }
    });

    return () => {
      socket.off('location:peer', handleLocationPeer);
      socket.off('location:offline', handleLocationOffline);
      socket.off('location:confirmed', handleLocationConfirmed);
      socket.off('connect');
      socket.off('disconnect');
    };
  }, [
    socket,
    privacyMode,
    visibleRadius,
    currentLocation,
    contacts,
    users,
    updateUserLocation,
    removeUserLocation,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (locationSubscriptionRef.current) {
        locationSubscriptionRef.current.remove();
      }
    };
  }, []);

  // Convert userLocations Map to array
  const locationArray = Array.from(userLocations.entries()).map(
    ([userId, location]) => {
      // Prioritize user from location data (from backend - has profilePic) like web
      let user = location.user;
      
      // If user from location doesn't have profilePic, try to find in users array
      if (!user || !user.profilePic) {
        const userFromArray = users.find((u) => {
          const uId = typeof u._id === 'string' ? u._id : u._id?.toString();
          return uId === userId?.toString();
        });
        
        if (userFromArray) {
          // Merge: use location.user but fill in missing profilePic from users array
          user = {
            _id: userId,
            fullname: user?.fullname || userFromArray.fullname || 'Unknown User',
            profilePic: user?.profilePic || userFromArray.profilePic || null,
            email: user?.email || userFromArray.email || null,
          };
        }
      }
      
      // Fallback to minimal user object
      if (!user) {
        user = { 
          _id: userId, 
          fullname: 'Unknown User', 
          profilePic: null 
        };
      }
      
      return {
        userId,
        ...location,
        user,
      };
    }
  );
  
  // Debug: Log location array and userLocations state (throttled to prevent performance issues)
  useEffect(() => {
    // Throttle logging to prevent performance issues
    const timeoutId = setTimeout(() => {
      const currentLocations = useLocationStore.getState().userLocations;
      if (__DEV__) {
        console.log('📊 Location state check:', {
          userLocationsSize: currentLocations.size,
          locationArrayLength: locationArray.length,
          hasCurrentLocation: !!currentLocation,
          isSharingLocation,
        });
      }
    }, 1000); // Only log every second
    
    return () => clearTimeout(timeoutId);
  }, [locationArray.length, currentLocation, isSharingLocation]);

  // Get user initials
  const getUserInitials = (user) => {
    if (user?.fullname) {
      return user.fullname.charAt(0).toUpperCase();
    }
    return '?';
  };

  // Construct full profile picture URL
  const getProfilePicUrl = (profilePic) => {
    if (!profilePic || profilePic === '/avatar.png') return null;
    
    // If already a full URL, return as is
    if (profilePic.startsWith('http://') || profilePic.startsWith('https://')) {
      return profilePic;
    }
    
    // If relative path, construct full URL
    const baseURL = getBackendBaseURL();
    return `${baseURL}${profilePic.startsWith('/') ? '' : '/'}${profilePic}`;
  };

  // Get border color based on speed
  const getSpeedColor = (speed) => {
    if (!speed) return '#22c55e'; // green for stationary
    if (speed < 3) return '#22c55e'; // green for walking
    if (speed > 15) return '#3b82f6'; // blue for driving
    return '#f59e0b'; // orange for moving
  };

  // Handle marker press - show user info card
  const handleMarkerPress = (userId, user) => {
    if (userId && user) {
      const fullUser = users.find((u) => {
        const uId = typeof u._id === 'string' ? u._id : u._id?.toString();
        return uId === userId?.toString();
      }) || user;
      setSelectedMarkerUser(fullUser);
      // Center map on selected marker
      const location = locationArray.find(loc => loc.userId?.toString() === userId?.toString());
      if (location && mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: location.lat,
          longitude: location.lng,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }, 500);
      }
    }
  };

  const centerOnUser = () => {
    if (currentLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: currentLocation.lat,
        longitude: currentLocation.lng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 500);
    }
  };

  const getUserLocation = (userId) => {
    return locationArray.find(loc => loc.userId?.toString() === userId?.toString());
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerText}>Map</Text>
        {forceWebView && Platform.OS === 'android' && (
          <View style={styles.nativeMapBanner}>
            <Ionicons name="information-circle" size={16} color={colors.primary} />
            <Text style={styles.nativeMapBannerText}>Using Apple Maps (WebView)</Text>
          </View>
        )}
        {forceWebView && Platform.OS === 'ios' && !useNativeMaps && (
          <View style={styles.nativeMapBanner}>
            <Ionicons name="information-circle" size={16} color={colors.primary} />
            <Text style={styles.nativeMapBannerText}>Use dev build for native maps</Text>
          </View>
        )}
        <View style={styles.headerControls}>
          {isSharingLocation && (
            <View style={styles.sharingBadge}>
              <View style={styles.sharingDot} />
              <Text style={styles.sharingText}>Sharing</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.privacyButton}
            onPress={() => setShowPrivacyModal(true)}
          >
            <Ionicons
              name={
                privacyMode === 'public'
                  ? 'globe-outline'
                  : privacyMode === 'friends'
                  ? 'people-outline'
                  : 'lock-closed-outline'
              }
              size={20}
              color={commonStyles.textPrimary}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Map - Use native maps if available, otherwise WebView fallback */}
      {mapError && !forceWebView ? (
        <View style={[styles.map, { justifyContent: 'center', alignItems: 'center', padding: spacing.lg }]}>
          <Text style={styles.errorText}>Map Error: {mapError}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setMapError(null);
              setForceWebView(true);
            }}
          >
            <Text style={styles.retryButtonText}>Use Web Map</Text>
          </TouchableOpacity>
        </View>
      ) : !forceWebView && useNativeMaps && MapView && Marker && Platform.OS === 'ios' ? (
        <View style={styles.mapContainer}>
        <MapView
              ref={mapRef}
                provider={undefined} // undefined = Apple Maps on iOS (native)
              style={styles.map}
              initialRegion={mapRegion}
              showsUserLocation={false} // We'll use custom markers
              showsMyLocationButton={false}
                showsCompass={false} // Hide compass
                toolbarEnabled={false} // Hide toolbar
                showsTraffic={false}
                showsBuildings={false}
                showsIndoors={false}
                showsPointsOfInterest={false} // Hide POIs on iOS
                mapPadding={{
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                }}
              onRegionChangeComplete={setMapRegion}
              mapType="standard" // standard, satellite, hybrid, terrain
              pitchEnabled={false} // Disable 3D pitch to reduce VectorKit warnings
              rotateEnabled={true}
              scrollEnabled={true}
              zoomEnabled={true}
                // Remove customMapStyle - Apple Maps doesn't support it the same way as Google Maps
                // Keep default Apple Maps styling for full functionality
              onMapReady={() => {
                // Map is ready - VectorKit warnings are non-critical and can be ignored
                if (__DEV__) {
                  console.log(`✅ Map ready - using Apple Maps on ${Platform.OS}`);
                }
                setMapError(null);
              }}
              onError={(error) => {
                console.error('❌ Map error:', error);
                const errorMessage = error?.message || error?.nativeEvent?.message || 'Map initialization failed';
                setMapError(errorMessage);
                setForceWebView(true);
                // Clear error after a delay to allow retry
                setTimeout(() => setMapError(null), 3000);
              }}
            >
        {/* Current User Marker */}
        {currentLocation && authUser && (() => {
          const currentUserProfilePicUrl = getProfilePicUrl(authUser.profilePic);
          if (__DEV__) {
            console.log('📍 Current user map marker:', {
              hasProfilePic: !!authUser.profilePic,
              profilePic: authUser.profilePic,
              profilePicUrl: currentUserProfilePicUrl,
            });
          }
          return (
            <Marker
              coordinate={{
                latitude: currentLocation.lat,
                longitude: currentLocation.lng,
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              title={authUser.fullname || 'You'}
              description="Your current location"
              tracksViewChanges={false}
              zIndex={1000}
            >
            <View style={styles.currentUserMarker}>
              {/* Pulsing ring animation for active user */}
              <Animated.View 
                style={[
                  styles.pulseRing,
                  {
                    transform: [{ scale: pulseAnim }],
                    opacity: pulseAnim.interpolate({
                      inputRange: [1, 1.3],
                      outputRange: [0.6, 0],
                    }),
                  },
                ]} 
              />
              <View
                style={[
                  styles.markerCircle,
                  styles.currentUserMarkerCircle,
                  {
                    borderColor: '#10b981',
                    width: 64,
                    height: 64,
                    borderWidth: 4,
                  },
                ]}
              >
                {currentUserProfilePicUrl ? (
                  <Image
                    source={{ 
                      uri: currentUserProfilePicUrl,
                      cache: Platform.OS === 'android' ? 'force-cache' : 'default',
                    }}
                    style={styles.markerImage}
                    defaultSource={require('../../assets/icon.png')}
                    resizeMode="cover"
                    fadeDuration={0}
                    onError={(error) => {
                      if (__DEV__) {
                        console.warn('❌ Failed to load current user profile pic:', {
                          url: currentUserProfilePicUrl,
                          originalPic: authUser.profilePic,
                          error: error?.message || error,
                        });
                      }
                    }}
                    onLoad={() => {
                      if (__DEV__) {
                        console.log('✅ Current user profile pic loaded');
                      }
                    }}
                  />
                ) : (
                  <View style={styles.markerInitials}>
                    <Text style={styles.markerInitialsText}>
                      {getUserInitials(authUser)}
                    </Text>
                  </View>
                )}
              </View>
              {currentLocation.heading !== null &&
                currentLocation.heading !== undefined && (
                  <View
                    style={[
                      styles.headingIndicator,
                      {
                        transform: [{ rotate: `${currentLocation.heading}deg` }],
                      },
                    ]}
                  >
                    <View style={styles.headingArrow} />
                  </View>
                )}
            </View>
          </Marker>
          );
        })()}

        {/* Other Users' Markers */}
        {locationArray.map(({ userId, lat, lng, speed, heading, user }) => {
          const profilePicUrl = getProfilePicUrl(user?.profilePic);
          if (__DEV__ && user?.fullname) {
            console.log(`📍 Map marker for ${user.fullname}:`, {
              hasProfilePic: !!user?.profilePic,
              profilePic: user?.profilePic,
              profilePicUrl,
            });
          }
          return (
            <Marker
              key={userId}
              coordinate={{ latitude: lat, longitude: lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              title={user?.fullname || 'Unknown User'}
              description={user?.fullname ? `${user.fullname}'s location` : 'User location'}
              onPress={() => handleMarkerPress(userId, user)}
              tracksViewChanges={false}
              zIndex={999}
            >
              <View style={styles.userMarker}>
                {/* Status indicator ring */}
                <View style={[styles.statusRing, { borderColor: getSpeedColor(speed) }]} />
                <View
                  style={[
                    styles.markerCircle,
                    styles.userMarkerCircle,
                    {
                      borderColor: getSpeedColor(speed),
                      width: 56,
                      height: 56,
                      borderWidth: 3,
                    },
                  ]}
                >
                  {(() => {
                    const profilePicUrl = getProfilePicUrl(user?.profilePic);
                    if (__DEV__ && user?.fullname) {
                      console.log(`📍 Map marker for ${user.fullname}:`, {
                        hasProfilePic: !!user?.profilePic,
                        profilePicUrl,
                        profilePic: user?.profilePic,
                      });
                    }
                    return profilePicUrl ? (
                      <Image
                        source={{ 
                          uri: profilePicUrl,
                          cache: Platform.OS === 'android' ? 'force-cache' : 'default',
                        }}
                        style={styles.markerImage}
                        defaultSource={require('../../assets/icon.png')}
                        resizeMode="cover"
                        fadeDuration={0}
                        onError={(error) => {
                          if (__DEV__) {
                            console.warn(`❌ Failed to load profile pic for ${user?.fullname}:`, {
                              url: profilePicUrl,
                              error: error?.message || error,
                            });
                          }
                        }}
                        onLoad={() => {
                          if (__DEV__) {
                            console.log(`✅ Profile pic loaded for ${user?.fullname}`);
                          }
                        }}
                      />
                    ) : (
                      <View style={styles.markerInitials}>
                        <Text style={styles.markerInitialsText}>
                          {getUserInitials(user)}
                        </Text>
                      </View>
                    );
                  })()}
                </View>
                {heading !== null && heading !== undefined && (
                  <View
                    style={[
                      styles.headingIndicator,
                      {
                        transform: [{ rotate: `${heading}deg` }],
                        width: 16,
                        height: 16,
                      },
                    ]}
                  >
                    <View style={styles.headingArrow} />
                  </View>
                )}
            </View>
          </Marker>
          );
        })}
      </MapView>
        </View>
      ) : (
        <WebViewMap
          mapRegion={mapRegion}
          currentLocation={currentLocation}
          authUser={authUser}
          locationArray={locationArray}
          onRegionChange={setMapRegion}
          colors={colors}
          commonStyles={commonStyles}
        />
      )}

      {/* User Count Badge - Now clickable to show bottom sheet */}
      {locationArray.length > 0 && (
        <TouchableOpacity 
          style={styles.userCountBadge}
          onPress={() => setShowBottomSheet(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="people" size={16} color={colors.primary} />
          <Text style={styles.userCountText}>
            {locationArray.length} {locationArray.length === 1 ? 'person' : 'people'} sharing
          </Text>
        </TouchableOpacity>
      )}

      {/* Floating Action Buttons */}
      <View style={styles.fabContainer}>
        {isSharingLocation && (
          <TouchableOpacity
            style={styles.fab}
            onPress={centerOnUser}
            activeOpacity={0.8}
          >
            <Ionicons name="locate" size={24} color={colors.textWhite} />
          </TouchableOpacity>
      )}
        <TouchableOpacity
          style={[styles.fab, styles.fabPrimary]}
          onPress={() => setShowBottomSheet(!showBottomSheet)}
          activeOpacity={0.8}
        >
          <Ionicons name="people" size={24} color={colors.textWhite} />
        </TouchableOpacity>
      </View>

      {/* Main Control Button */}
      <View style={styles.controls}>
        {!isSharingLocation ? (
          <TouchableOpacity
            style={styles.shareButton}
            onPress={startLocationSharing}
            disabled={isRequestingPermission}
            activeOpacity={0.8}
          >
            {isRequestingPermission ? (
              <ActivityIndicator color={colors.textWhite} size="small" />
            ) : (
              <>
                <Ionicons name="location" size={22} color={colors.textWhite} />
                <Text style={styles.shareButtonText}>Share My Location</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.stopButton}
            onPress={stopLocationSharing}
            activeOpacity={0.8}
          >
            <Ionicons name="lock-closed" size={22} color={colors.textWhite} />
            <Text style={styles.stopButtonText}>Stop Sharing</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* User Info Card - Shows when marker is tapped */}
      {selectedMarkerUser && (
        <View style={styles.userInfoCard}>
          <TouchableOpacity
            style={styles.userInfoClose}
            onPress={() => setSelectedMarkerUser(null)}
          >
            <Ionicons name="close" size={20} color={commonStyles.textSecondary} />
          </TouchableOpacity>
          <View style={styles.userInfoContent}>
            <Image
              source={{ uri: getProfilePicUrl(selectedMarkerUser.profilePic) || '' }}
              style={styles.userInfoAvatar}
              defaultSource={require('../../assets/icon.png')}
            />
            <View style={styles.userInfoText}>
              <Text style={styles.userInfoName}>{selectedMarkerUser.fullname || 'Unknown'}</Text>
              <Text style={styles.userInfoSubtext}>
                {getUserLocation(selectedMarkerUser._id)?.speed 
                  ? `Moving at ${(getUserLocation(selectedMarkerUser._id).speed * 3.6).toFixed(1)} km/h`
                  : 'Stationary'}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Bottom Sheet - User List */}
      <Modal
        visible={showBottomSheet}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowBottomSheet(false)}
      >
        <TouchableOpacity
          style={styles.bottomSheetOverlay}
          activeOpacity={1}
          onPress={() => setShowBottomSheet(false)}
        >
          <View style={styles.bottomSheet}>
            <View style={styles.bottomSheetHandle} />
            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>
                {locationArray.length} {locationArray.length === 1 ? 'Person' : 'People'} Sharing Location
              </Text>
              <TouchableOpacity onPress={() => setShowBottomSheet(false)}>
                <Ionicons name="close" size={24} color={commonStyles.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.bottomSheetContent} showsVerticalScrollIndicator={false}>
              {/* Current User */}
              {isSharingLocation && currentLocation && authUser && (
                <View style={styles.userListItem}>
                  <View style={styles.userListAvatar}>
                    <Image
                      source={{ uri: getProfilePicUrl(authUser.profilePic) || '' }}
                      style={styles.userListAvatarImage}
                      defaultSource={require('../../assets/icon.png')}
                    />
                    <View style={[styles.userListStatus, { backgroundColor: '#10b981' }]} />
                  </View>
                  <View style={styles.userListInfo}>
                    <Text style={styles.userListName}>You</Text>
                    <Text style={styles.userListSubtext}>Sharing your location</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={commonStyles.textSecondary} />
                </View>
              )}
              {/* Other Users */}
              {locationArray.map(({ userId, lat, lng, speed, user }) => {
                const userLocation = getUserLocation(userId);
                return (
                  <TouchableOpacity
                    key={userId}
                    style={styles.userListItem}
                    onPress={() => {
                      setSelectedMarkerUser(user);
                      setShowBottomSheet(false);
                      if (mapRef.current) {
                        mapRef.current.animateToRegion({
                          latitude: lat,
                          longitude: lng,
                          latitudeDelta: 0.01,
                          longitudeDelta: 0.01,
                        }, 500);
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.userListAvatar}>
                      <Image
                        source={{ uri: getProfilePicUrl(user?.profilePic) || '' }}
                        style={styles.userListAvatarImage}
                        defaultSource={require('../../assets/icon.png')}
                      />
                      <View style={[styles.userListStatus, { backgroundColor: getSpeedColor(speed) }]} />
                    </View>
                    <View style={styles.userListInfo}>
                      <Text style={styles.userListName}>{user?.fullname || 'Unknown'}</Text>
                      <Text style={styles.userListSubtext}>
                        {speed ? `Moving at ${(speed * 3.6).toFixed(1)} km/h` : 'Stationary'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={commonStyles.textSecondary} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Privacy Settings Modal */}
      <Modal
        visible={showPrivacyModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPrivacyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Privacy Settings</Text>
              <TouchableOpacity
                onPress={() => setShowPrivacyModal(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons
                  name="close"
                  size={24}
                  color={commonStyles.textPrimary}
                />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.modalSectionTitle}>Who can see your location?</Text>
              {['public', 'friends', 'off'].map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.privacyOption,
                    privacyMode === mode && styles.privacyOptionActive,
                  ]}
                  onPress={() => {
                    useLocationStore.getState().setPrivacyMode(mode);
                  }}
                >
                  <Ionicons
                    name={
                      mode === 'public'
                        ? 'globe'
                        : mode === 'friends'
                        ? 'people'
                        : 'lock-closed'
                    }
                    size={20}
                    color={
                      privacyMode === mode
                        ? colors.primary
                        : commonStyles.textSecondary
                    }
                  />
                  <Text
                    style={[
                      styles.privacyOptionText,
                      privacyMode === mode && styles.privacyOptionTextActive,
                    ]}
                  >
                    {mode === 'public'
                      ? 'Public'
                      : mode === 'friends'
                      ? 'Friends Only'
                      : 'Off'}
                  </Text>
                  {privacyMode === mode && (
                    <Ionicons
                      name="checkmark"
                      size={20}
                      color={colors.primary}
                      style={styles.checkmark}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (colors, spacing, typography, commonStyles) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: commonStyles.backgroundPrimary,
  },
  header: {
    ...commonStyles.header,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
    flexWrap: 'wrap',
  },
  headerText: {
    ...commonStyles.headerText,
  },
  nativeMapBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '15',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 12,
    gap: spacing.xs,
    marginRight: spacing.sm,
  },
  nativeMapBannerText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '600',
  },
  headerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sharingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '20',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 12,
    gap: spacing.xs,
  },
  sharingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  sharingText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  privacyButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: commonStyles.backgroundSecondary,
  },
  mapContainer: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  map: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  currentUserMarker: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    overflow: 'visible',
    width: Platform.OS === 'android' ? 64 : undefined,
    height: Platform.OS === 'android' ? 64 : undefined,
    position: 'relative',
  },
  pulseRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#10b981',
    opacity: 0.6,
    ...(Platform.OS === 'android' && {
      elevation: 0,
    }),
  },
  userMarker: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    overflow: 'visible',
    width: Platform.OS === 'android' ? 56 : undefined,
    height: Platform.OS === 'android' ? 56 : undefined,
    position: 'relative',
  },
  statusRing: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    opacity: 0.5,
    ...(Platform.OS === 'android' && {
      elevation: 0,
    }),
  },
  markerCircle: {
    borderRadius: 9999,
    backgroundColor: '#667eea',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden',
    ...(Platform.OS === 'android' && {
      backgroundColor: '#667eea',
      borderWidth: 0,
      transform: [{ scale: 1 }],
      opacity: 1,
    }),
  },
  currentUserMarkerCircle: {
    shadowColor: '#10b981',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 12,
  },
  userMarkerCircle: {
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  markerImage: {
    width: '100%',
    height: '100%',
    borderRadius: 9999,
    backgroundColor: 'transparent',
    borderWidth: 0,
    ...(Platform.OS === 'android' && {
      backgroundColor: 'transparent',
      overflow: 'hidden',
      backfaceVisibility: 'hidden',
      // Ensure crisp rendering
      resizeMode: 'cover',
    }),
  },
  markerInitials: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  markerInitialsText: {
    color: colors.textWhite,
    fontWeight: 'bold',
    fontSize: 18,
    textAlign: 'center',
    ...(Platform.OS === 'android' && {
      includeFontPadding: false,
      textAlignVertical: 'center',
    }),
  },
  headingIndicator: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#10b981',
    borderWidth: 2,
    borderColor: colors.textWhite,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  headingArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.textWhite,
    marginTop: -2,
  },
  userCountBadge: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 120 : 100,
    left: spacing.md,
    backgroundColor: commonStyles.backgroundPrimary + 'F5',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1,
    borderColor: commonStyles.borderColor + '40',
  },
  userCountText: {
    color: commonStyles.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  fabContainer: {
    position: 'absolute',
    right: spacing.md,
    top: Platform.OS === 'ios' ? 120 : 100,
    gap: spacing.sm,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: commonStyles.backgroundPrimary + 'F5',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: commonStyles.borderColor + '40',
  },
  fabPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  userInfoCard: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 200 : 180,
    left: spacing.md,
    right: spacing.md,
    backgroundColor: commonStyles.backgroundPrimary + 'F8',
    borderRadius: 16,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
    borderWidth: 1,
    borderColor: commonStyles.borderColor + '40',
  },
  userInfoClose: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  userInfoContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  userInfoAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  userInfoText: {
    flex: 1,
  },
  userInfoName: {
    fontSize: 18,
    fontWeight: '700',
    color: commonStyles.textPrimary,
    marginBottom: 4,
  },
  userInfoSubtext: {
    fontSize: 14,
    color: commonStyles.textSecondary,
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: commonStyles.backgroundPrimary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 12,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: commonStyles.borderColor,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: commonStyles.borderColor,
  },
  bottomSheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: commonStyles.textPrimary,
  },
  bottomSheetContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  userListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: 12,
    marginBottom: spacing.xs,
    backgroundColor: commonStyles.backgroundSecondary + '80',
  },
  userListAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: spacing.md,
    position: 'relative',
  },
  userListAvatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: commonStyles.backgroundPrimary,
  },
  userListStatus: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: commonStyles.backgroundPrimary,
  },
  userListInfo: {
    flex: 1,
  },
  userListName: {
    fontSize: 16,
    fontWeight: '600',
    color: commonStyles.textPrimary,
    marginBottom: 2,
  },
  userListSubtext: {
    fontSize: 14,
    color: commonStyles.textSecondary,
  },
  controls: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 80,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md + 4,
    borderRadius: 28,
    gap: spacing.sm,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    minWidth: 200,
    justifyContent: 'center',
  },
  shareButtonText: {
    color: colors.textWhite,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ef4444',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md + 4,
    borderRadius: 28,
    gap: spacing.sm,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    minWidth: 200,
    justifyContent: 'center',
  },
  stopButtonText: {
    color: colors.textWhite,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: commonStyles.backgroundPrimary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: commonStyles.borderColor,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: commonStyles.textPrimary,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBody: {
    padding: spacing.lg,
  },
  modalSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: commonStyles.textPrimary,
    marginBottom: spacing.md,
  },
  privacyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: commonStyles.backgroundSecondary,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  privacyOptionActive: {
    backgroundColor: colors.primary + '20',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  privacyOptionText: {
    flex: 1,
    fontSize: 16,
    color: commonStyles.textSecondary,
  },
  privacyOptionTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  checkmark: {
    marginLeft: 'auto',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 8,
    marginTop: spacing.md,
  },
  retryButtonText: {
    color: colors.textWhite,
    fontSize: 16,
    fontWeight: '600',
  },
});
