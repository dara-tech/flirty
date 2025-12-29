import {
  FaFolder,
  FaStar,
  FaBriefcase,
  FaUsers,
  FaBullseye,
  FaThumbtack,
  FaLock,
  FaComment,
  FaPhone,
  FaCamera,
  FaHeart,
  FaBookmark,
  FaTag,
  FaInbox,
  FaArchive,
} from "react-icons/fa";

// Map of icon names to React icon components
export const FOLDER_ICON_MAP = {
  FaFolder: FaFolder,
  FaStar: FaStar,
  FaBriefcase: FaBriefcase,
  FaUsers: FaUsers,
  FaBullseye: FaBullseye,
  FaThumbtack: FaThumbtack,
  FaLock: FaLock,
  FaComment: FaComment,
  FaPhone: FaPhone,
  FaCamera: FaCamera,
  FaHeart: FaHeart,
  FaBookmark: FaBookmark,
  FaTag: FaTag,
  FaInbox: FaInbox,
  FaArchive: FaArchive,
};

// Migration map: old emoji icons to new React icon names
const EMOJI_TO_ICON_MAP = {
  "📁": "FaFolder",
  "⭐": "FaStar",
  "💼": "FaBriefcase",
  "👥": "FaUsers",
  "🎯": "FaBullseye",
  "📌": "FaThumbtack",
  "🔒": "FaLock",
  "💬": "FaComment",
  "📞": "FaPhone",
  "📷": "FaCamera",
};

// List of available icon names
export const FOLDER_ICONS = Object.keys(FOLDER_ICON_MAP);

// Default icon name
export const DEFAULT_FOLDER_ICON = "FaFolder";

// Helper function to normalize icon name (convert old emojis to new icon names)
const normalizeIconName = (iconName) => {
  if (!iconName) return DEFAULT_FOLDER_ICON;
  // If it's an old emoji, convert it to the new icon name
  if (EMOJI_TO_ICON_MAP[iconName]) {
    return EMOJI_TO_ICON_MAP[iconName];
  }
  // If it's already a valid icon name, return it
  if (FOLDER_ICON_MAP[iconName]) {
    return iconName;
  }
  // Otherwise, return default
  return DEFAULT_FOLDER_ICON;
};

// Helper function to get icon component from icon name
export const getFolderIcon = (iconName) => {
  const normalizedName = normalizeIconName(iconName);
  return FOLDER_ICON_MAP[normalizedName] || FOLDER_ICON_MAP[DEFAULT_FOLDER_ICON];
};

