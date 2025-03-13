import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Icon } from 'leaflet';
import useMapStore from '../store/useMapStore';
import { motion } from 'framer-motion';
import { Plus, Edit, Trash, X, Check, MapPin } from 'lucide-react';

const defaultIcon = new Icon({
  iconUrl: '/avatar.png',
  shadowUrl: '',
  iconSize: [41, 41],
  iconAnchor: [12, 41]
});

const createCustomIcon = (profilePic) => new Icon({
  iconUrl: profilePic,
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  className: 'rounded-full border-2 border-white'
});

const AddMapPage = () => {
  const { 
    maps, currentMap, isLoading, fetchMaps, createMap, updateMap, deleteMap, setCurrentMap, clearCurrentMap
  } = useMapStore();

  const [formData, setFormData] = useState({ name: '', description: '', latitude: '', longitude: '' });
  const [mapCenter, setMapCenter] = useState([0, 0]);
  const [mapZoom, setMapZoom] = useState(2);
  const [isFormVisible, setIsFormVisible] = useState(false);

  useEffect(() => { fetchMaps(); }, [fetchMaps]);

  useEffect(() => {
    if (currentMap) {
      setFormData({
        name: currentMap.name || '',
        description: currentMap.description || '',
        latitude: currentMap.coordinates?.coordinates?.[1] ?? '',
        longitude: currentMap.coordinates?.coordinates?.[0] ?? ''
      });
      if (currentMap.coordinates?.coordinates) {
        setMapCenter([currentMap.coordinates.coordinates[1], currentMap.coordinates.coordinates[0]]);
        setMapZoom(10);
      }
      setIsFormVisible(true);
    } else {
      clearForm();
    }
  }, [currentMap]);

  const handleInputChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const mapData = {
      name: formData.name,
      description: formData.description,
      coordinates: [parseFloat(formData.longitude), parseFloat(formData.latitude)]
    };
    currentMap ? updateMap(currentMap._id, mapData) : createMap(mapData);
    clearForm();
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this location?')) {
      deleteMap(id);
      if (currentMap && currentMap._id === id) clearForm();
    }
  };

  const handleEdit = (mapId) => {
    const map = maps.find(m => m._id === mapId);
    if (map) {
      setCurrentMap(map);
      setFormData({
        name: map.name,
        description: map.description,
        latitude: map.coordinates.coordinates[1],
        longitude: map.coordinates.coordinates[0]
      });
      setMapCenter([map.coordinates.coordinates[1], map.coordinates.coordinates[0]]);
      setMapZoom(10);
    }
  };

  const clearForm = () => {
    clearCurrentMap();
    setFormData({ name: '', description: '', latitude: '', longitude: '' });
    setMapCenter([0, 0]);
    setMapZoom(2);
    setIsFormVisible(false);
  };

  const LocationMarker = () => {
    useMapEvents({
      click(e) {
        const { lat, lng } = e.latlng;
        setFormData(prev => ({ ...prev, latitude: lat.toFixed(6), longitude: lng.toFixed(6) }));
        setIsFormVisible(true);
      }
    });
    return null;
  };

  const formatCoordinate = (value) => value === undefined || value === null ? 'N/A' : typeof value === 'number' ? value.toFixed(4) : value;

  return (
    <div className="container mx-auto p-4 min-h-screen ">
      <h1 className="text-4xl font-bold mb-8 text-center text-primary">Location Manager</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
            <div className="h-[600px]">
              <MapContainer center={mapCenter} zoom={mapZoom} className="h-full w-full">
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                <LocationMarker />
                
                {maps.map((map) => {
                  if (!map.coordinates?.coordinates?.[1] || !map.coordinates?.coordinates?.[0]) return null;

                  const icon = map.createdBy?.profilePic ? createCustomIcon(map.createdBy.profilePic) : defaultIcon;

                  return (
                    <Marker 
                      key={map._id} 
                      position={[map.coordinates.coordinates[1], map.coordinates.coordinates[0]]}
                      icon={icon}
                    >
                      <Popup>
                        <div className="text-center">
                          <h3 className="font-bold text-lg">{map.name}</h3>
                          <p className="text-sm text-gray-600">{map.description}</p>
                          <p className="text-xs text-gray-500 mt-2">
                            Created by: <span className="font-semibold">{map.createdBy?.fullname}</span>
                          </p>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
                
                {formData.latitude && formData.longitude && (
                  <Marker 
                    position={[parseFloat(formData.latitude), parseFloat(formData.longitude)]}
                    icon={defaultIcon}
                  >
                    <Popup>New Location</Popup>
                  </Marker>
                )}
              </MapContainer>
            </div>
          </div>
        </div>
        
        <div className="lg:col-span-1 space-y-8">
          <motion.div 
            className="bg-white p-6 rounded-xl shadow-xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <h2 className="text-2xl font-semibold mb-6 flex items-center text-indigo-700">
              <MapPin className="mr-2" />
              {currentMap ? 'Update Location' : 'Add New Location'}
            </h2>
            
            {isFormVisible ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                  placeholder="Location Name"
                  required
                />
                
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                  rows="3"
                  placeholder="Description"
                />
                
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="text"
                    name="latitude"
                    value={formData.latitude}
                    onChange={handleInputChange}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                    placeholder="Latitude"
                    required
                  />
                  
                  <input
                    type="text"
                    name="longitude"
                    value={formData.longitude}
                    onChange={handleInputChange}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                    placeholder="Longitude"
                    required
                  />
                </div>
                
                <div className="flex space-x-4">
                  <button
                    type="submit"
                    className="flex-1 bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition duration-200 flex items-center justify-center"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <span className="loading loading-spinner loading-sm"></span>
                    ) : (
                      <>
                        <Check className="mr-2" />
                        {currentMap ? 'Update' : 'Add'}
                      </>
                    )}
                  </button>
                  
                  <button
                    type="button"
                    onClick={clearForm}
                    className="flex-1 bg-gray-200 text-gray-800 px-6 py-3 rounded-lg hover:bg-gray-300 transition duration-200 flex items-center justify-center"
                  >
                    <X className="mr-2" />
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setIsFormVisible(true)}
                className="w-full bg-green-500 text-white px-6 py-3 rounded-lg hover:bg-green-600 transition duration-200 flex items-center justify-center"
              >
                <Plus className="mr-2" />
                Add New Location
              </button>
            )}
          </motion.div>
          
          <motion.div 
            className="bg-white p-6 rounded-xl shadow-xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <h2 className="text-2xl font-semibold mb-6 text-indigo-700">Saved Locations</h2>
            
            {isLoading ? (
              <div className="flex justify-center">
                <span className="loading loading-spinner loading-lg text-indigo-600"></span>
              </div>
            ) : maps.length === 0 ? (
              <p className="text-center text-gray-500">No locations saved yet.</p>
            ) : (
              <div className="space-y-4">
                {maps.map((map) => (
                  <motion.div 
                    key={map._id} 
                    className="bg-gray-50 p-4 rounded-lg hover:shadow-md transition duration-200"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <h3 className="font-medium text-lg text-indigo-700">{map.name}</h3>
                    <p className="text-sm text-gray-600 mb-2">{map.description}</p>
                    <p className="text-xs text-gray-500 mb-3">
                      {map.coordinates && map.coordinates.coordinates ? (
                        <>
                          Lat: {formatCoordinate(map.coordinates.coordinates[1])}, 
                          Lon: {formatCoordinate(map.coordinates.coordinates[0])}
                        </>
                      ) : (
                        'No coordinates'
                      )}
                    </p>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEdit(map._id)}
                        className="text-blue-600 hover:text-blue-800 flex items-center"
                      >
                        <Edit className="w-4 h-4 mr-1" /> Edit
                      </button>
                      <button
                        onClick={() => handleDelete(map._id)}
                        className="text-red-600 hover:text-red-800 flex items-center"
                      >
                        <Trash className="w-4 h-4 mr-1" /> Delete
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default AddMapPage;
