/**
 * Chat bubble style utilities
 * Returns className strings for different bubble styles
 */

export const getBubbleStyles = (style, isMyMessage) => {
  const styles = {
    rounded: {
      my: "bg-gradient-to-br from-primary to-primary/90 text-primary-content rounded-3xl rounded-br-sm shadow-lg shadow-primary/20",
      other: "bg-base-200/95 backdrop-blur-sm text-base-content rounded-3xl rounded-bl-sm shadow-lg shadow-black/10 border border-base-300/50",
    },
    square: {
      my: "bg-gradient-to-br from-primary to-primary/90 text-primary-content rounded-lg shadow-md shadow-primary/20",
      other: "bg-base-200/95 backdrop-blur-sm text-base-content rounded-lg shadow-md shadow-black/10 border border-base-300/50",
    },
    minimal: {
      my: "bg-primary text-primary-content rounded-md shadow-sm",
      other: "bg-base-200 text-base-content rounded-md shadow-sm border border-base-300/30",
    },
    bordered: {
      my: "bg-primary/10 text-primary border-2 border-primary rounded-2xl rounded-br-md shadow-sm",
      other: "bg-base-100 text-base-content border-2 border-base-300 rounded-2xl rounded-bl-md shadow-sm",
    },
    gradient: {
      my: "bg-gradient-to-br from-primary via-primary/95 to-primary/90 text-primary-content rounded-3xl rounded-br-md shadow-xl shadow-primary/30 border border-primary/20",
      other: "bg-gradient-to-br from-base-200 via-base-200/95 to-base-300 text-base-content rounded-3xl rounded-bl-md shadow-xl shadow-black/15 border border-base-300/60",
    },
    modern: {
      my: "bg-primary text-primary-content rounded-2xl rounded-br-none shadow-lg shadow-primary/25 backdrop-blur-sm",
      other: "bg-base-200 text-base-content rounded-2xl rounded-bl-none shadow-lg shadow-black/15 backdrop-blur-sm border-l-4 border-primary/30",
    },
  };

  return styles[style] || styles.rounded;
};

export const bubbleStyleOptions = [
  {
    id: "rounded",
    name: "Rounded",
    description: "Soft rounded corners with gradient",
    preview: {
      my: "rounded-3xl rounded-br-sm",
      other: "rounded-3xl rounded-bl-sm",
    },
  },
  {
    id: "square",
    name: "Square",
    description: "Sharp corners, modern look",
    preview: {
      my: "rounded-lg",
      other: "rounded-lg",
    },
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Simple and clean design",
    preview: {
      my: "rounded-md",
      other: "rounded-md",
    },
  },
  {
    id: "bordered",
    name: "Bordered",
    description: "Bordered style with outline",
    preview: {
      my: "rounded-2xl rounded-br-md border-2",
      other: "rounded-2xl rounded-bl-md border-2",
    },
  },
  {
    id: "gradient",
    name: "Gradient",
    description: "Rich gradient effects",
    preview: {
      my: "rounded-3xl rounded-br-md",
      other: "rounded-3xl rounded-bl-md",
    },
  },
  {
    id: "modern",
    name: "Modern",
    description: "Contemporary flat design",
    preview: {
      my: "rounded-2xl rounded-br-none",
      other: "rounded-2xl rounded-bl-none",
    },
  },
];

