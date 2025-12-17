/**
 * Normalizes an ID to a string representation
 * Handles various ID formats: string, object with _id, number, etc.
 * 
 * @param {string|object|number|null|undefined} id - The ID to normalize
 * @returns {string|null} - Normalized ID string or null if invalid
 * 
 * @example
 * normalizeId('123') // '123'
 * normalizeId({ _id: '123' }) // '123'
 * normalizeId(123) // '123'
 * normalizeId(null) // null
 */
export const normalizeId = (id) => {
  if (!id) return null;
  if (typeof id === 'string') return id;
  if (typeof id === 'object' && id._id) return id._id.toString();
  return id?.toString() || null;
};

/**
 * Normalizes an ID from a message object (handles sender/receiver/groupId)
 * 
 * @param {object} message - Message object
 * @param {string} field - Field name ('senderId', 'receiverId', 'groupId', etc.)
 * @returns {string|null} - Normalized ID or null
 */
export const normalizeMessageId = (message, field) => {
  if (!message) return null;
  
  // Try direct field access (e.g., message.senderId)
  const directValue = message[field];
  if (directValue) {
    return normalizeId(directValue);
  }
  
  // Try nested object access (e.g., message.sender._id)
  const nestedField = field.replace(/Id$/, ''); // 'senderId' -> 'sender'
  const nestedObject = message[nestedField];
  if (nestedObject) {
    return normalizeId(nestedObject._id || nestedObject);
  }
  
  return null;
};

