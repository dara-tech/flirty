// Track recently added message IDs to prevent duplicates (race condition between API and socket)
const recentMessageIds = new Set();
const MESSAGE_DEDUP_TIMEOUT = 5000; // 5 seconds

// Helper to check and track message IDs
export const isDuplicateMessage = (messageId) => {
  if (!messageId) return false;
  const idStr = String(messageId);
  if (recentMessageIds.has(idStr)) {
    return true; // Duplicate detected
  }
  // Add to tracking set
  recentMessageIds.add(idStr);
  // Clean up after timeout
  setTimeout(() => {
    recentMessageIds.delete(idStr);
  }, MESSAGE_DEDUP_TIMEOUT);
  return false; // Not a duplicate
};

