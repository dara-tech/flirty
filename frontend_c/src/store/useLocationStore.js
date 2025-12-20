import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Location Store
 * Manages real-time location sharing and tracking
 */
export const useLocationStore = create(
  persist(
    (set, get) => ({
      // Location sharing state
      isSharingLocation: false,
      locationPermissionGranted: false,
      currentLocation: null, // { lat, lng, speed, heading, accuracy, timestamp }
      
      // Other users' locations
      userLocations: new Map(), // { userId: { lat, lng, speed, heading, lastUpdate, user } }
      
      // Privacy settings
      privacyMode: 'friends', // 'public' | 'friends' | 'off'
      visibleRadius: 5000, // meters (5km default)
      
      // Location tracking settings
      updateInterval: 3000, // Send location every 3 seconds
      minDistanceToUpdate: 10, // Only update if moved > 10 meters
      lastSentLocation: null,
      
      // Actions
      setSharingLocation: (sharing) => set({ isSharingLocation: sharing }),
      setLocationPermission: (granted) => set({ locationPermissionGranted: granted }),
      setCurrentLocation: (location) => set({ currentLocation: location }),
      
      updateUserLocation: (userId, location, user) => {
        set((state) => {
          const newUserLocations = new Map(state.userLocations);
          newUserLocations.set(userId, {
            ...location,
            lastUpdate: Date.now(),
            user: user || newUserLocations.get(userId)?.user,
          });
          return { userLocations: newUserLocations };
        });
      },
      
      removeUserLocation: (userId) => {
        set((state) => {
          const newUserLocations = new Map(state.userLocations);
          newUserLocations.delete(userId);
          return { userLocations: newUserLocations };
        });
      },
      
      clearAllLocations: () => set({ userLocations: new Map() }),
      
      setPrivacyMode: (mode) => set({ privacyMode: mode }),
      setVisibleRadius: (radius) => set({ visibleRadius: radius }),
      
      setUpdateInterval: (interval) => set({ updateInterval: interval }),
      setMinDistanceToUpdate: (distance) => set({ minDistanceToUpdate: distance }),
      setLastSentLocation: (location) => set({ lastSentLocation: location }),
      
      // Calculate distance between two coordinates (Haversine formula)
      calculateDistance: (lat1, lng1, lat2, lng2) => {
        const R = 6371e3; // Earth's radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lng2 - lng1) * Math.PI / 180;
        
        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        
        return R * c; // Distance in meters
      },
      
      // Get nearby users within radius
      getNearbyUsers: (centerLat, centerLng, radius) => {
        const { userLocations, calculateDistance } = get();
        const nearby = [];
        
        userLocations.forEach((location, userId) => {
          if (location.lat && location.lng) {
            const distance = calculateDistance(
              centerLat,
              centerLng,
              location.lat,
              location.lng
            );
            if (distance <= radius) {
              nearby.push({
                userId,
                ...location,
                distance,
              });
            }
          }
        });
        
        return nearby.sort((a, b) => a.distance - b.distance);
      },
      
      // Check if user should update location (moved enough distance)
      shouldUpdateLocation: (newLocation) => {
        const { lastSentLocation, minDistanceToUpdate } = get();
        if (!lastSentLocation) return true;
        
        const distance = get().calculateDistance(
          lastSentLocation.lat,
          lastSentLocation.lng,
          newLocation.lat,
          newLocation.lng
        );
        
        return distance >= minDistanceToUpdate;
      },
    }),
    {
      name: 'location-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        privacyMode: state.privacyMode,
        visibleRadius: state.visibleRadius,
        updateInterval: state.updateInterval,
        minDistanceToUpdate: state.minDistanceToUpdate,
      }),
    }
  )
);

