import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const useSettingsStore = create(
  persist(
    (set) => ({
      // Notifications settings
      notifications: {
        messages: true,
        calls: true,
        groups: true,
        location: false,
      },
      
      // Privacy settings
      privacy: {
        profileVisibility: 'public', // 'public' | 'friends' | 'private'
        readReceipts: true,
        lastSeen: true,
        onlineStatus: true,
      },
      
      // Language
      language: 'en', // 'en' | 'km' | etc.
      
      // Actions
      updateNotifications: (key, value) => {
        set((state) => ({
          notifications: {
            ...state.notifications,
            [key]: value,
          },
        }));
      },
      
      updatePrivacy: (key, value) => {
        set((state) => ({
          privacy: {
            ...state.privacy,
            [key]: value,
          },
        }));
      },
      
      setLanguage: (language) => {
        set({ language });
      },
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
