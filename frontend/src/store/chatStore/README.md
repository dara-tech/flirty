# Chat Store Refactoring

This directory contains the refactored chat store, split from the original 3727-line `useChatStore.js` file into smaller, more manageable modules.

## Structure

- `state.js` - Initial state definition
- `utils.js` - Utility functions (e.g., `isDuplicateMessage`)
- `selectors.js` - Simple selector/setter actions
- `typingActions.js` - Typing and status indicator actions
- `userActions.js` - User and conversation management actions
- `messageActions.js` - Message CRUD operations
- `groupActions.js` - Group management actions
- `contactActions.js` - Contact request actions
- `socketSubscriptions.js` - WebSocket event handlers

## Usage

The main `useChatStore.js` file imports and composes all these modules, maintaining the same external API so no changes are needed in components.

