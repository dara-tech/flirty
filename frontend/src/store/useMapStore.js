import { create } from 'zustand';
import { axiosInstance } from '../lib/axois';
import toast from 'react-hot-toast';
import { useAuthStore } from './useAuthStore';

const useMapStore = create((set, get) => ({
  maps: [],
  currentMap: null,
  isLoading: false,
  error: null,

  fetchMaps: async () => {
    const { authUser } = useAuthStore.getState();
    if (!authUser) {
      toast.error('Authentication required');
      return;
    }
    set({ isLoading: true });
    try {
      const response = await axiosInstance.get('/maps/get');
      set({ maps: response.data, isLoading: false });
    } catch (error) {
      set({ error: error.message, isLoading: false });
      toast.error('Failed to fetch maps');
    }
  },
  getMap: async () => {
    set({ isLoading: true });
    try {
      const response = await axiosInstance.get('/maps/get-all');
      set({ maps: response.data, isLoading: false });
    } catch (error) {
      set({ error: error.message, isLoading: false });
      toast.error('Failed to fetch public maps');
    }
  },

  createMap: async (mapData) => {
    const { authUser } = useAuthStore.getState();
    if (!authUser) {
      toast.error('Authentication required');
      return;
    }
    set({ isLoading: true });
    try {
      const response = await axiosInstance.post('/maps/create', mapData);
      set((state) => ({ maps: [...state.maps, response.data], isLoading: false }));
      toast.success('Map created successfully');
    } catch (error) {
      set({ error: error.message, isLoading: false });
      toast.error('Failed to create map');
    }
  },

  updateMap: async (id, mapData) => {
    const { authUser } = useAuthStore.getState();
    if (!authUser) {
      toast.error('Authentication required');
      return;
    }
    set({ isLoading: true });
    try {
      const response = await axiosInstance.put(`/maps/update/${id}`, mapData);
      set((state) => ({
        maps: state.maps.map((map) => map._id === id ? response.data : map),
        isLoading: false
      }));
      toast.success('Map updated successfully');
    } catch (error) {
      set({ error: error.message, isLoading: false });
      toast.error('Failed to update map');
    }
  },

  deleteMap: async (id) => {
    const { authUser } = useAuthStore.getState();
    if (!authUser) {
      toast.error('Authentication required');
      return;
    }
    set({ isLoading: true });
    try {
      await axiosInstance.delete(`/maps/delete/${id}`);
      set((state) => ({
        maps: state.maps.filter((map) => map._id !== id),
        isLoading: false
      }));
      toast.success('Map deleted successfully');
    } catch (error) {
      set({ error: error.message, isLoading: false });
      toast.error('Failed to delete map');
    }
  },

  setCurrentMap: (map) => set({ currentMap: map }),
  clearCurrentMap: () => set({ currentMap: null }),
}));

export default useMapStore;
