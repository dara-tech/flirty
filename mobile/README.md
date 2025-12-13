# Chat App - React Native (Mobile)

React Native mobile app built with Expo, NativeWind (Tailwind CSS), and React Navigation.

## 🚀 Quick Start

### Prerequisites
- Node.js 20.19.4 or higher
- npm or yarn
- Expo CLI (installed globally or via npx)
- iOS Simulator (Mac) or Android Emulator

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm start

# Run on iOS (Mac only)
npm run ios

# Run on Android
npm run android

# Run on Web
npm run web
```

## 📁 Project Structure

```
mobile/
├── src/
│   ├── screens/          # Screen components
│   │   ├── LoginScreen.js
│   │   ├── ChatScreen.js
│   │   ├── ContactsScreen.js
│   │   └── MapScreen.js
│   ├── components/       # Reusable components
│   ├── store/            # Zustand stores
│   │   ├── useAuthStore.js
│   │   └── useChatStore.js
│   ├── lib/              # Utilities
│   │   ├── api.js        # Axios instance
│   │   └── storage.js     # AsyncStorage wrapper
│   └── navigation/       # Navigation config
├── App.js                # Main app component
├── global.css            # Tailwind CSS imports
├── tailwind.config.js    # Tailwind configuration
├── babel.config.js       # Babel config with NativeWind
└── metro.config.js       # Metro bundler config
```

## 🎨 Styling with NativeWind

This project uses **NativeWind v4** (Tailwind CSS for React Native).

### Usage

```jsx
import { View, Text } from 'react-native';

export default function MyComponent() {
  return (
    <View className="flex-1 bg-base-100 p-4">
      <Text className="text-2xl font-bold text-base-content">
        Hello World
      </Text>
    </View>
  );
}
```

### Available Classes

All Tailwind CSS classes work! Examples:
- Layout: `flex`, `flex-1`, `items-center`, `justify-between`
- Spacing: `p-4`, `m-2`, `px-6`, `py-3`
- Colors: `bg-primary`, `text-base-content`, `border-base-300`
- Typography: `text-xl`, `font-bold`, `text-center`
- And many more!

## 🔧 Configuration

### Backend URL

Update the backend URL in `src/lib/api.js`:

```javascript
const getBackendURL = () => {
  if (__DEV__) {
    return 'http://localhost:5002/api'; // Your local backend
  }
  return 'https://your-backend.com/api'; // Production backend
};
```

### Socket.IO URL

Update the Socket.IO URL in `src/store/useAuthStore.js`:

```javascript
const socket = io('http://localhost:5002', {
  auth: { token },
  transports: ['websocket'],
});
```

## 📦 Key Dependencies

- **Expo** - React Native framework
- **NativeWind** - Tailwind CSS for React Native
- **React Navigation** - Navigation library
- **Zustand** - State management
- **Axios** - HTTP client
- **Socket.IO Client** - Real-time communication
- **AsyncStorage** - Local storage

## 🛠️ Development

### Adding New Screens

1. Create screen in `src/screens/`
2. Add route in `App.js`
3. Use NativeWind classes for styling

### Adding New Components

1. Create component in `src/components/`
2. Use NativeWind classes
3. Export and import where needed

### State Management

Use Zustand stores in `src/store/`:
- `useAuthStore` - Authentication state
- `useChatStore` - Chat messages and contacts

## 🚢 Building for Production

### iOS

```bash
# Build with EAS (Expo Application Services)
eas build --platform ios

# Or build locally (requires Mac + Xcode)
npx expo build:ios
```

### Android

```bash
# Build with EAS
eas build --platform android

# Or build locally
npx expo build:android
```

## 📝 Notes

- NativeWind v4 uses a different setup than v3
- Make sure `global.css` is imported in `App.js`
- Metro bundler needs to be configured for NativeWind
- Use `className` prop instead of `style` for Tailwind classes

## 🔗 Resources

- [Expo Docs](https://docs.expo.dev/)
- [NativeWind Docs](https://www.nativewind.dev/)
- [React Navigation](https://reactnavigation.org/)
- [Zustand](https://github.com/pmndrs/zustand)

