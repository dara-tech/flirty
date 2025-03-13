import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import useMapStore from '../store/useMapStore';
import L from 'leaflet';
import { Search, Info, X, List, MapPin, Layers, Compass, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function ChangeView({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

const MapPage = () => {
  const { maps, getMap, isLoading, error } = useMapStore();
  const [selectedMap, setSelectedMap] = useState(null);
  const [mapCenter, setMapCenter] = useState([0, 0]);
  const [mapZoom, setMapZoom] = useState(2);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPopup, setShowPopup] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [filterOption, setFilterOption] = useState('all');

  useEffect(() => {
    getMap();
  }, [getMap]);

  useEffect(() => {
    if (selectedMap) {
      setMapCenter([selectedMap.coordinates.coordinates[1], selectedMap.coordinates.coordinates[0]]);
      setMapZoom(12);
      setShowPopup(true);
    }
  }, [selectedMap]);

  const filteredMaps = useMemo(() => 
    maps?.filter(map =>
      map.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
      (filterOption === 'all' || (filterOption === 'favorite' && map.isFavorite))
    ),
    [maps, searchTerm, filterOption]
  );

  if (isLoading) return <div className="flex justify-center items-center h-screen"><div className="loading loading-spinner loading-lg"></div></div>;
  if (error) return <div className="flex justify-center items-center h-screen text-error">Error: {error}</div>;

  return (
    <div className="relative h-screen bg-gradient-to-br from-base-200 to-base-300 overflow-hidden">
      <div className="absolute inset-0 z-0 opacity-30">
        <div className="absolute inset-0 bg-repeat bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1IiBoZWlnaHQ9IjUiPgo8cmVjdCB3aWR0aD0iNSIgaGVpZ2h0PSI1IiBmaWxsPSIjZmZmIj48L3JlY3Q+CjxwYXRoIGQ9Ik0wIDVMNSAwWk02IDRMNCA2Wk0tMSAxTDEgLTFaIiBzdHJva2U9IiNjY2MiIHN0cm9rZS13aWR0aD0iMSI+PC9wYXRoPgo8L3N2Zz4=')]"></div>
      </div>
      <div className="relative z-10 h-full flex flex-col">
        <header className="bg-base-100/80 backdrop-blur-sm shadow-md p-4">
          <h1 className="text-3xl font-bold text-center text-primary">Interactive Map Explorer</h1>
        </header>
        <div className="flex-grow flex ">
          <motion.aside 
            className={`bg-base-100/90 backdrop-blur-md shadow-xl z-20 ${sidebarOpen ? 'w-80' : 'w-16'}`}
            animate={{ width: sidebarOpen ? 320 : 64 }}
            transition={{ duration: 0.3 }}
          >
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)} 
              className="btn btn-circle btn-sm absolute top-2 mx-2 right-2 z-30 ht-2 bg-primary text-primary-content hover:bg-primary-focus"
            >
              {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
            </button>
            <AnimatePresence>
              {sidebarOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="p-4 py-14"
                >
                  <div className="relative mb-4">
                    <input
                      type="text"
                      placeholder="Search maps..."
                      className="input input-bordered w-full pr-10 bg-base-200/50"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-base-content/50" />
                  </div>
                  <div className="mb-4">
                    <select 
                      className="select select-bordered w-full bg-base-200/50"
                      value={filterOption}
                      onChange={(e) => setFilterOption(e.target.value)}
                    >
                      <option value="all">All Maps</option>
                      <option value="favorite">Favorites</option>
                    </select>
                  </div>
                  <div className="max-h-[calc(100vh-280px)] overflow-y-auto pr-2 space-y-3">
                    {filteredMaps && filteredMaps.map((map) => (
                      <motion.div
                        key={map._id}
                        className={`cursor-pointer p-4 rounded-lg transition-all ${
                          selectedMap && selectedMap._id === map._id
                            ? 'bg-primary text-primary-content shadow-lg'
                            : 'bg-base-200/50 hover:bg-base-300/50'
                        }`}
                        onClick={() => setSelectedMap(map)}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold">{map.name}</h3>
                          {map.isFavorite && <MapPin size={16} className="text-warning" />}
                        </div>
                        <p className="text-sm opacity-70 truncate">{map.description}</p>
                        <div className="flex items-center mt-2 text-xs opacity-50">
                          <Compass size={12} className="mr-1" />
                          <span>{map.coordinates.coordinates[1].toFixed(2)}, {map.coordinates.coordinates[0].toFixed(2)}</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.aside>
          
          <main className="flex-grow relative">
            <MapContainer center={mapCenter} zoom={mapZoom} className="h-full w-full" zoomControl={false}>
              <ChangeView center={mapCenter} zoom={mapZoom} />
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <ZoomControl position="bottomright" />
              {maps && maps.map((map) => {
                const mapIcon = new L.Icon({
                  iconUrl: map?.createdBy?.profilePic || '/avatar.png',
                  iconSize: [40, 40],
                  iconAnchor: [20, 40],
                  popupAnchor: [0, -40],
                  className: 'rounded-full border-2 border-primary shadow-md'
                });

                return (
                  <Marker 
                    key={map._id} 
                    position={[map.coordinates.coordinates[1], map.coordinates.coordinates[0]]}
                    icon={mapIcon} 
                    eventHandlers={{
                      click: () => {
                        setSelectedMap(map);
                        setShowPopup(true);
                      },
                    }}
                  >
                    <Popup className="rounded-lg shadow-xl">
                      <h3 className="font-semibold text-lg">{map.name}</h3>
                      <p className="text-sm">{map.description}</p>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>

            <div className="absolute top-4 right-4 bg-base-100/80 backdrop-blur-sm p-2 rounded-full shadow-lg">
              <button className="btn btn-circle btn-sm bg-primary text-primary-content hover:bg-primary-focus">
                <Layers size={20} />
              </button>
            </div>

            <AnimatePresence>
              {showPopup && selectedMap && selectedMap.createdBy && (
                <motion.div 
                  className="absolute bottom-4 left-4 right-4 bg-base-100/90 backdrop-blur-md p-6 rounded-xl shadow-2xl max-w-2xl mx-auto"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <button onClick={() => setShowPopup(false)} className="btn btn-sm btn-circle absolute top-2 right-2 bg-base-200 hover:bg-base-300">
                    <X size={16} />
                  </button>
                  <div className="flex items-center gap-4 mb-4">
                    {selectedMap.createdBy.profilePic ? (
                      <img 
                        src={selectedMap.createdBy.profilePic}
                        alt={selectedMap.createdBy.fullname || "User"}
                        className="w-16 h-16 rounded-full border-4 border-primary shadow-md object-cover"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center text-primary-content">
                        <span className="text-xl font-bold">{(selectedMap.createdBy.fullname || "U")[0]}</span>
                      </div>
                    )}
                    <div>
                      <h3 className="text-2xl font-bold text-primary">{selectedMap.name}</h3>
                      <p className="text-sm text-base-content/70">Created by {selectedMap.createdBy.fullname || "Unknown"}</p>
                    </div>
                  </div>
                  <p className="mb-4 text-base-content/80 text-lg">{selectedMap.description}</p>
                  <div className="flex items-center gap-3 text-sm bg-base-200/50 p-3 rounded-lg">
                    <Compass size={20} className="text-info" />
                    <span>Latitude: {selectedMap.coordinates.coordinates[1].toFixed(6)}</span>
                    <span>Longitude: {selectedMap.coordinates.coordinates[0].toFixed(6)}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </div>
      </div>
    </div>
  );
};

export default MapPage;
