# Chat Store Refactoring Guide

## Current Status

The original `useChatStore.js` file is **3727 lines** - too large to maintain effectively.

## Refactoring Strategy

The store has been split into modular action creators that take `(set, get)` as parameters (Zustand pattern).

### Completed Modules

1. ✅ `utils.js` - Utility functions (`isDuplicateMessage`)
2. ✅ `state.js` - Initial state definition
3. ✅ `selectors.js` - Simple selector/setter actions
4. ✅ `typingActions.js` - Typing and status indicator actions

### Remaining Work

The following sections from the original file still need to be extracted:

1. **User Actions** (`userActions.js`):
   - `getUsers`
   - `getAllUsers`
   - `loadMoreConversations`

2. **Message Actions** (`messageActions.js`):
   - `getMessages`
   - `loadMoreMessages`
   - `sendMessage`
   - `sendMessageToUser`
   - `editMessage`
   - `deleteMessage`
   - `pinMessage`
   - `unpinMessage`
   - `addReaction`
   - `removeReaction`
   - `updateMessageImage`
   - `deleteMessageMedia`
   - `markVoiceAsListened`
   - `saveMessage`
   - `unsaveMessage`
   - `getSavedMessages`
   - `deleteConversation`

3. **Group Actions** (`groupActions.js`):
   - `getGroups`
   - `createGroup`
   - `addMembersToGroup`
   - `removeMemberFromGroup`
   - `updateGroupInfo`
   - `leaveGroup`
   - `deleteGroup`
   - `getGroupMessages`
   - `loadMoreGroupMessages`
   - `sendGroupMessage`

4. **Contact Actions** (`contactActions.js`):
   - `getContacts`
   - `getPendingRequests`
   - `sendContactRequest`
   - `acceptContactRequest`
   - `rejectContactRequest`
   - `getContactStatus`

5. **Socket Subscriptions** (`socketSubscriptions.js`):
   - `subscribeToMessages`
   - `unsubscribeFromMessages`
   - `subscribeToTyping`
   - `unsubscribeFromTyping`
   - `subscribeToGroups`
   - `unsubscribeFromGroups`
   - `subscribeToGroupMessages`
   - `unsubscribeFromGroupMessages`
   - `subscribeToContactRequests`
   - `unsubscribeFromContactRequests`

## Pattern to Follow

Each action module should export a function that takes `(set, get)` and returns an object with actions:

```javascript
// Example: userActions.js
import { axiosInstance } from "../../lib/axois";
import { useAuthStore } from "../useAuthStore";
import { normalizeId } from "../../lib/utils";
import toast from "react-hot-toast";

export const createUserActions = (set, get) => ({
  getUsers: async () => {
    // ... implementation
  },
  // ... other actions
});
```

Then in the main store:

```javascript
import { createUserActions } from "./chatStore/userActions";

export const useChatStore = create((set, get) => ({
  ...initialState,
  ...createSelectors(set),
  ...createTypingActions(set),
  ...createUserActions(set, get),
  // ... etc
}));
```

## Next Steps

1. Extract user actions (lines 67-441)
2. Extract message actions (lines 443-1103)
3. Extract socket subscriptions (lines 1105-1870, 1888-1962, 2149-2618, 3114-3372, 3502-3594)
4. Extract group actions (lines 2068-2147, 2643-3112)
5. Extract contact actions (lines 3394-3499)
6. Update main store to import from modules
7. Test thoroughly

## Benefits

- **Maintainability**: Each module is focused and easier to understand
- **Testability**: Actions can be tested in isolation
- **Reusability**: Actions can be reused or extended
- **Readability**: Main store file becomes much smaller (~200-300 lines vs 3727)

