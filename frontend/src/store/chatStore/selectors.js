// Simple selector/setter actions
export const createSelectors = (set) => ({
  setTypingUsers: (users) => set({ typingUsers: users }),
  
  setSelectedSavedMessages: (selected) => {
    set({ selectedSavedMessages: selected, selectedUser: null, selectedGroup: null });
  },

  setSelectedUser: (selectedUser) => {
    set({ selectedUser, selectedGroup: null });
  },

  setSelectedGroup: (selectedGroup) => {
    set({ selectedGroup, selectedUser: null, selectedSavedMessages: false });
  },
});

