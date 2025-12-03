import { useEffect, useRef, useState, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useLocationStore } from "../store/useLocationStore";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { FaMapMarkerAlt, FaLock,  FaComment } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

// Fix Leaflet default icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

/**
 * Component to smoothly animate marker movement
 */
const AnimatedMarker = ({ position, user, speed, heading, lastUpdate, userId }) => {
  const map = useMap();
  const markerRef = useRef(null);
  const previousPositionRef = useRef(position);
  const animationRef = useRef(null);
  const navigate = useNavigate();
  const { setSelectedUser } = useChatStore();
  
  useEffect(() => {
    if (!markerRef.current) return;
    
    const marker = markerRef.current;
    const prevPos = previousPositionRef.current;
    const newPos = position;
    
    // Only animate if position actually changed
    if (prevPos.lat === newPos.lat && prevPos.lng === newPos.lng) return;
    
    // Linear interpolation for smooth movement
    const startTime = Date.now();
    const duration = 2000; // 2 seconds animation
    const startLat = prevPos.lat;
    const startLng = prevPos.lng;
    const endLat = newPos.lat;
    const endLng = newPos.lng;
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth animation
      const ease = (t) => t * (2 - t);
      const easedProgress = ease(progress);
      
      const currentLat = startLat + (endLat - startLat) * easedProgress;
      const currentLng = startLng + (endLng - startLng) * easedProgress;
      
      marker.setLatLng([currentLat, currentLng]);
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        previousPositionRef.current = newPos;
      }
    };
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    animate();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [position]);
  
  // Create custom icon with user profile image
  const createIcon = (heading, speed, profilePic, fullname) => {
    const speedStatus = speed < 3 ? 'walking' : speed > 15 ? 'driving' : 'moving';
    const borderColor = speedStatus === 'walking' ? '#22c55e' : speedStatus === 'driving' ? '#3b82f6' : '#f59e0b';
    const profileImageUrl = profilePic || '';
    const initials = fullname ? fullname.charAt(0).toUpperCase() : '?';
    const hasImage = profileImageUrl && profileImageUrl !== '/avatar.png';
    
    return L.divIcon({
      className: 'custom-marker',
      html: `
        <div style="
          position: relative;
          width: 48px;
          height: 48px;
        ">
          <div style="
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: 3px solid ${borderColor};
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            overflow: hidden;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
          ">
            ${hasImage ? `
              <img 
                src="${profileImageUrl}" 
                alt="${fullname || 'User'}"
                style="
                  width: 100%;
                  height: 100%;
                  object-fit: cover;
                  border-radius: 50%;
                "
                onerror="this.onerror=null; this.style.display='none'; this.parentElement.querySelector('.marker-initials').style.display='flex';"
              />
            ` : ''}
            <div class="marker-initials" style="
              display: ${hasImage ? 'none' : 'flex'};
              width: 100%;
              height: 100%;
              align-items: center;
              justify-content: center;
              color: white;
              font-weight: bold;
              font-size: 18px;
            ">${initials}</div>
          </div>
          ${heading !== null && heading !== undefined ? `
            <div style="
              position: absolute;
              bottom: -2px;
              right: -2px;
              width: 16px;
              height: 16px;
              background: ${borderColor};
              border: 2px solid white;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              transform: rotate(${heading}deg);
              box-shadow: 0 1px 3px rgba(0,0,0,0.2);
            ">
              <div style="
                width: 0;
                height: 0;
                border-left: 3px solid transparent;
                border-right: 3px solid transparent;
                border-bottom: 5px solid white;
                margin-top: -1px;
              "></div>
            </div>
          ` : ''}
        </div>
      `,
      iconSize: [48, 48],
      iconAnchor: [24, 24],
    });
  };
  
  const handleMessageClick = () => {
    if (userId && user) {
      // Find the full user object from users array
      const fullUser = useChatStore.getState().users.find(u => {
        const uId = typeof u._id === 'string' ? u._id : u._id?.toString();
        return uId === userId;
      }) || user;
      
      setSelectedUser(fullUser);
      navigate('/?view=chats');
    }
  };
  
  return (
    <Marker
      position={position}
      icon={createIcon(heading, speed, user?.profilePic, user?.fullname)}
      ref={markerRef}
    >
      <Popup className="custom-popup">
        <div className=" min-w-[120px]">
          <div >
            <p className="font-semibold text-sm text-base-content">{user?.fullname || "Unknown"}</p>
          </div>
          <button
            onClick={handleMessageClick}
            className="w-full btn btn-primary btn-sm text-xs flex items-center justify-center "
          >
            <FaComment className="size-3" />
            Message
          </button>
        </div>
      </Popup>
    </Marker>
  );
};

/**
 * Component to handle map view updates
 */
const MapController = ({ center, zoom }) => {
  const map = useMap();
  
  useEffect(() => {
    if (center) {
      map.setView(center, zoom || map.getZoom());
    }
  }, [center, zoom, map]);
  
  return null;
};

/**
 * Real-Time Map Component
 * Shows live location of users with smooth animations
 */
const RealTimeMap = () => {
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
  } = useLocationStore();
  
  const { socket, authUser } = useAuthStore();
  const { users, contacts, setSelectedUser } = useChatStore();
  const [mapCenter, setMapCenter] = useState([11.5564, 104.9282]); // Phnom Penh default
  const [mapZoom, setMapZoom] = useState(13);
  const locationWatchId = useRef(null);
  const locationIntervalRef = useRef(null);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  
  // Request location permission and start sharing
  const startLocationSharing = useCallback(async () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }
    
    setIsRequestingPermission(true);
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationPermission(true);
        setIsRequestingPermission(false);
        
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          speed: position.coords.speed || null,
          heading: position.coords.heading || null,
          accuracy: position.coords.accuracy || null,
          timestamp: Date.now(),
        };
        
        setCurrentLocation(location);
        setMapCenter([location.lat, location.lng]);
        setSharingLocation(true);
        
        // Send initial location
        if (socket && authUser) {
          socket.emit("location:update", {
            lat: location.lat,
            lng: location.lng,
            speed: location.speed,
            heading: location.heading,
            accuracy: location.accuracy,
          });
          setLastSentLocation(location);
        }
        
        toast.success("Location sharing started");
      },
      (error) => {
        setIsRequestingPermission(false);
        setLocationPermission(false);
        console.error("Geolocation error:", error);
        
        let errorMessage = "Failed to get location";
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = "Location permission denied. Please enable it in your browser settings.";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = "Location information unavailable.";
            break;
          case error.TIMEOUT:
            errorMessage = "Location request timed out.";
            break;
        }
        toast.error(errorMessage);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }, [socket, authUser, setLocationPermission, setCurrentLocation, setSharingLocation, setLastSentLocation]);
  
  // Watch position for continuous updates
  useEffect(() => {
    if (!isSharingLocation || !socket || !authUser) return;
    
    // Watch position with optimized settings
    locationWatchId.current = navigator.geolocation.watchPosition(
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
        const { lastSentLocation, updateInterval, minDistanceToUpdate } = useLocationStore.getState();
        const shouldUpdate = !lastSentLocation || 
          shouldUpdateLocation(newLocation) ||
          (Date.now() - (lastSentLocation.timestamp || 0)) >= updateInterval;
        
        if (shouldUpdate) {
          setCurrentLocation(newLocation);
          
          // Send location update via socket
          socket.emit("location:update", {
            lat: newLocation.lat,
            lng: newLocation.lng,
            speed: newLocation.speed,
            heading: newLocation.heading,
            accuracy: newLocation.accuracy,
          });
          
          setLastSentLocation(newLocation);
        }
      },
      (error) => {
        console.error("Geolocation watch error:", error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000, // Accept cached position up to 5 seconds old
      }
    );
    
    return () => {
      if (locationWatchId.current !== null) {
        navigator.geolocation.clearWatch(locationWatchId.current);
        locationWatchId.current = null;
      }
    };
  }, [isSharingLocation, socket, authUser, setCurrentLocation, setLastSentLocation, shouldUpdateLocation]);
  
  // Listen for location updates from other users
  useEffect(() => {
    if (!socket) return;
    
    const handleLocationPeer = (data) => {
      // Filter by privacy mode
      if (privacyMode === 'off') return;
      
      // Check if user is a contact/friend (for friends-only mode)
      if (privacyMode === 'friends') {
        const isContact = contacts.some(c => {
          const contactId = typeof c._id === 'string' ? c._id : c._id?.toString();
          const dataUserId = data.userId?.toString();
          return contactId === dataUserId;
        });
        if (!isContact) return;
      }
      
      // Check if within visible radius
      if (currentLocation) {
        const distance = useLocationStore.getState().calculateDistance(
          currentLocation.lat,
          currentLocation.lng,
          data.lat,
          data.lng
        );
        if (distance > visibleRadius) return;
      }
      
      updateUserLocation(data.userId, {
        lat: data.lat,
        lng: data.lng,
        speed: data.speed,
        heading: data.heading,
        accuracy: data.accuracy,
      }, data.user);
    };
    
    const handleLocationOffline = ({ userId }) => {
      removeUserLocation(userId);
    };
    
    const handleLocationConfirmed = (data) => {
      // Confirmation that our location was received
      console.log("Location confirmed:", data);
    };
    
    socket.on("location:peer", handleLocationPeer);
    socket.on("location:offline", handleLocationOffline);
    socket.on("location:confirmed", handleLocationConfirmed);
    
    return () => {
      socket.off("location:peer", handleLocationPeer);
      socket.off("location:offline", handleLocationOffline);
      socket.off("location:confirmed", handleLocationConfirmed);
    };
  }, [socket, privacyMode, visibleRadius, currentLocation, contacts, updateUserLocation, removeUserLocation]);
  
  // Stop location sharing
  const stopLocationSharing = useCallback(() => {
    if (locationWatchId.current !== null) {
      navigator.geolocation.clearWatch(locationWatchId.current);
      locationWatchId.current = null;
    }
    
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }
    
    setSharingLocation(false);
    setCurrentLocation(null);
    toast.success("Location sharing stopped");
  }, [setSharingLocation, setCurrentLocation]);
  
  // Get user info for markers
  const getUserInfo = (userId) => {
    const user = users.find(u => {
      const uId = typeof u._id === 'string' ? u._id : u._id?.toString();
      return uId === userId;
    });
    return user || { fullname: "Unknown", profilePic: null };
  };
  
  // Convert userLocations Map to array
  const locationArray = Array.from(userLocations.entries()).map(([userId, location]) => ({
    userId,
    ...location,
    user: location.user || getUserInfo(userId),
  }));
  
  return (
    <div className="flex flex-col h-full bg-base-100">
      {/* Header Controls */}
      <div className="flex items-center justify-between p-4 border-b border-base-300/50 bg-base-200/50">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-base-content">Live Map</h2>
          {isSharingLocation && (
            <span className="px-2 py-1 bg-primary/20 text-primary text-xs rounded-full flex items-center gap-1">
              <div className="size-2 bg-primary rounded-full animate-pulse"></div>
              Sharing
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Privacy Mode Toggle */}
          <select
            value={privacyMode}
            onChange={(e) => useLocationStore.getState().setPrivacyMode(e.target.value)}
            className="select select-sm select-bordered"
          >
            <option value="public">Public</option>
            <option value="friends">Friends Only</option>
            <option value="off">Off</option>
          </select>
          
          {/* Start/Stop Location Sharing */}
          {!isSharingLocation ? (
            <button
              onClick={startLocationSharing}
              disabled={isRequestingPermission}
              className="btn btn-primary btn-sm"
            >
              {isRequestingPermission ? (
                <>
                  <span className="loading loading-spinner loading-xs"></span>
                  Requesting...
                </>
              ) : (
                <>
                  <FaMapMarkerAlt className="size-4" />
                  Share Location
                </>
              )}
            </button>
          ) : (
            <button
              onClick={stopLocationSharing}
              className="btn btn-error btn-sm"
            >
              <FaLock className="size-4" />
              Stop Sharing
            </button>
          )}
        </div>
      </div>
      
      {/* Map Container */}
      <div className="flex-1 relative">
        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          style={{ height: "100%", width: "100%" }}
          className="z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          <MapController center={mapCenter} zoom={mapZoom} />
          
          {/* Current User Marker */}
          {currentLocation && authUser && (() => {
            const userProfilePic = authUser.profilePic || '';
            const hasUserImage = userProfilePic && userProfilePic !== '/avatar.png';
            const userInitials = authUser.fullname ? authUser.fullname.charAt(0).toUpperCase() : 'Y';
            
            return (
              <Marker
                position={[currentLocation.lat, currentLocation.lng]}
                icon={L.divIcon({
                  className: 'custom-marker-current',
                  html: `
                    <div style="
                      position: relative;
                      width: 56px;
                      height: 56px;
                    ">
                      <div style="
                        width: 56px;
                        height: 56px;
                        border-radius: 50%;
                        border: 4px solid #10b981;
                        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
                        overflow: hidden;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        animation: pulse 2s infinite;
                        position: relative;
                      ">
                        ${hasUserImage ? `
                          <img 
                            src="${userProfilePic}" 
                            alt="${authUser.fullname || 'You'}"
                            style="
                              width: 100%;
                              height: 100%;
                              object-fit: cover;
                              border-radius: 50%;
                            "
                            onerror="this.onerror=null; this.style.display='none'; this.parentElement.querySelector('.current-marker-initials').style.display='flex';"
                          />
                        ` : ''}
                        <div class="current-marker-initials" style="
                          display: ${hasUserImage ? 'none' : 'flex'};
                          width: 100%;
                          height: 100%;
                          align-items: center;
                          justify-content: center;
                          color: white;
                          font-weight: bold;
                          font-size: 20px;
                        ">${userInitials}</div>
                      </div>
                      ${currentLocation.heading !== null && currentLocation.heading !== undefined ? `
                        <div style="
                          position: absolute;
                          bottom: -2px;
                          right: -2px;
                          width: 18px;
                          height: 18px;
                          background: #10b981;
                          border: 2px solid white;
                          border-radius: 50%;
                          display: flex;
                          align-items: center;
                          justify-content: center;
                          transform: rotate(${currentLocation.heading}deg);
                          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                        ">
                          <div style="
                            width: 0;
                            height: 0;
                            border-left: 4px solid transparent;
                            border-right: 4px solid transparent;
                            border-bottom: 7px solid white;
                            margin-top: -2px;
                          "></div>
                        </div>
                      ` : ''}
                    </div>
                  `,
                  iconSize: [56, 56],
                  iconAnchor: [28, 28],
                })}
              >
                <Popup className="custom-popup">
                  <div className="px-3 py-1.5 min-w-[100px]">
                    <p className="font-semibold text-sm text-base-content">You</p>
                  </div>
                </Popup>
              </Marker>
            );
          })()}
          
          {/* Other Users' Markers */}
          {locationArray.map(({ userId, lat, lng, speed, heading, lastUpdate, user }) => (
            <AnimatedMarker
              key={userId}
              position={[lat, lng]}
              user={user}
              speed={speed}
              heading={heading}
              lastUpdate={lastUpdate}
              userId={userId}
            />
          ))}
        </MapContainer>
        
        {/* User Count Badge */}
        {locationArray.length > 0 && (
          <div className="absolute top-4 left-4 bg-base-100/90 backdrop-blur-sm px-3 py-2 rounded-lg shadow-lg border border-base-300/50 z-[1000]">
            <p className="text-sm font-medium text-base-content">
              {locationArray.length} {locationArray.length === 1 ? 'person' : 'people'} nearby
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RealTimeMap;

