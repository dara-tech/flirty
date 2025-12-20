export function formatMessageTime(date) {
    return new Date(date).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

/**
 * Normalize an ID to a string format for consistent comparison
 * Handles both string IDs and Mongoose ObjectId objects
 * @param {string|object|null|undefined} id - The ID to normalize
 * @returns {string|null} - Normalized ID string or null if invalid
 */
export function normalizeId(id) {
  if (!id) return null;
  if (typeof id === 'string') return id;
  if (typeof id === 'object' && id._id) return id._id.toString();
  return id.toString();
}