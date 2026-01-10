# API Endpoints Documentation

## Base URL
```
/api
```

## Authentication Endpoints (`/api/auth`)

### Public Routes

#### `POST /api/auth/signup` - User registration
**Request:**
```json
{
  "fullname": "John Doe",
  "email": "john@example.com",
  "password": "SecurePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "fullname": "John Doe",
    "email": "john@example.com",
    "profilePic": null
  }
}
```

#### `POST /api/auth/login` - User login
**Request:**
```json
{
  "email": "john@example.com",
  "password": "SecurePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "fullname": "John Doe",
    "email": "john@example.com",
    "profilePic": null
  }
}
```
*Note: Token is set as HTTP-only cookie*

#### `POST /api/auth/logout` - User logout
**Request:** No body required

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

#### `POST /api/auth/google` - Google OAuth authentication
**Request:**
```json
{
  "credential": "google_oauth_token_here"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Google authentication successful",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "fullname": "John Doe",
    "email": "john@example.com",
    "profilePic": "https://..."
  }
}
```

### Protected Routes

#### `GET /api/auth/me` - Get current user info
**Request:** No body required (uses cookie/auth header)

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "fullname": "John Doe",
    "email": "john@example.com",
    "profilePic": "https://..."
  }
}
```

#### `PUT /api/auth/update-profile` - Update user profile
**Request:**
```json
{
  "fullname": "John Updated",
  "profilePic": "https://cloudinary.com/image.jpg"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "fullname": "John Updated",
    "email": "john@example.com",
    "profilePic": "https://cloudinary.com/image.jpg"
  }
}
```

#### `PUT /api/auth/change-password` - Change password
**Request:**
```json
{
  "currentPassword": "OldPassword123",
  "newPassword": "NewPassword456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

---

## Message Endpoints (`/api/messages`)

### Get Data

#### `GET /api/messages/users` - Get users with conversations
**Query Params:** `?page=1&limit=50`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "fullname": "Jane Doe",
      "email": "jane@example.com",
      "profilePic": "https://..."
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "totalPages": 2,
    "hasMore": true
  }
}
```

#### `GET /api/messages/users/all` - Get all users
**Query Params:** `?page=1&limit=200`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "fullname": "Jane Doe",
      "email": "jane@example.com",
      "profilePic": "https://..."
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 200,
    "total": 500,
    "totalPages": 3,
    "hasMore": true
  }
}
```

#### `GET /api/messages/last-messages` - Get last messages for conversations
**Response:**
```json
{
  "success": true,
  "data": [
    {
      "senderId": "507f1f77bcf86cd799439011",
      "receiverId": "507f1f77bcf86cd799439012",
      "text": "Hello!",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### `GET /api/messages/:id` - Get messages with a user
**Query Params:** `?page=1&limit=50&before=messageId` (optional)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439020",
      "senderId": {
        "_id": "507f1f77bcf86cd799439011",
        "fullname": "John Doe",
        "profilePic": "https://..."
      },
      "receiverId": {
        "_id": "507f1f77bcf86cd799439012",
        "fullname": "Jane Doe",
        "profilePic": "https://..."
      },
      "text": "Hello!",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "hasMore": true
  }
}
```

#### `GET /api/messages/by-type/:id` - Get messages by type
**Query Params:** `?type=images` (options: images, files, audio, video, links)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439020",
      "image": ["https://cloudinary.com/image.jpg"],
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### `GET /api/messages/saved/all` - Get saved messages
**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439020",
      "text": "Important note",
      "savedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 10,
    "totalPages": 1,
    "hasMore": false
  }
}
```

### Send/Update

#### `POST /api/messages/send/:id` - Send message to user
**Params:** `id` = receiver user ID

**Request (Text):**
```json
{
  "text": "Hello, how are you?"
}
```

**Request (Image):**
```multipart/form-data
text: "Check this out!"
image: [File]
```

**Request (File):**
```multipart/form-data
text: "Here's the document"
file: [File]
fileName: "document.pdf"
fileSize: 1024000
fileType: "application/pdf"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439020",
    "senderId": "507f1f77bcf86cd799439011",
    "receiverId": "507f1f77bcf86cd799439012",
    "text": "Hello, how are you?",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

#### `PUT /api/messages/edit/:id` - Edit message
**Params:** `id` = message ID

**Request:**
```json
{
  "text": "Updated message text"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Message updated successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439020",
    "text": "Updated message text",
    "editedAt": "2024-01-15T10:35:00Z"
  }
}
```

#### `PUT /api/messages/update-image/:id` - Update message image
**Params:** `id` = message ID

**Request:**
```multipart/form-data
image: [File]
```

**Response:**
```json
{
  "success": true,
  "message": "Image updated successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439020",
    "image": ["https://cloudinary.com/new-image.jpg"]
  }
}
```

#### `PUT /api/messages/pin/:id` - Pin message
**Params:** `id` = message ID

**Response:**
```json
{
  "success": true,
  "message": "Message pinned successfully"
}
```

#### `PUT /api/messages/unpin/:id` - Unpin message
**Params:** `id` = message ID

**Response:**
```json
{
  "success": true,
  "message": "Message unpinned successfully"
}
```

#### `PUT /api/messages/reaction/:id` - Add reaction to message
**Params:** `id` = message ID

**Request:**
```json
{
  "emoji": "👍"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Reaction added successfully"
}
```

#### `PUT /api/messages/listen/:id` - Mark voice message as listened
**Params:** `id` = message ID

**Response:**
```json
{
  "success": true,
  "message": "Voice message marked as listened"
}
```

#### `PUT /api/messages/save/:id` - Save message
**Params:** `id` = message ID

**Response:**
```json
{
  "success": true,
  "message": "Message saved successfully"
}
```

### Delete

#### `DELETE /api/messages/:id` - Delete message
**Params:** `id` = message ID

**Response:**
```json
{
  "success": true,
  "message": "Message deleted successfully"
}
```

#### `DELETE /api/messages/conversation/:id` - Delete conversation
**Params:** `id` = user ID

**Response:**
```json
{
  "success": true,
  "message": "Conversation deleted successfully"
}
```

#### `DELETE /api/messages/reaction/:id` - Remove reaction
**Params:** `id` = message ID

**Request:**
```json
{
  "emoji": "👍"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Reaction removed successfully"
}
```

#### `DELETE /api/messages/save/:id` - Unsave message
**Params:** `id` = message ID

**Response:**
```json
{
  "success": true,
  "message": "Message unsaved successfully"
}
```

#### `DELETE /api/messages/media/:id` - Delete message media
**Params:** `id` = message ID

**Response:**
```json
{
  "success": true,
  "message": "Media deleted successfully"
}
```

---

## Group Endpoints (`/api/groups`)

### Get Data

#### `GET /api/groups/my-groups` - Get user's groups
**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439030",
      "name": "Project Team",
      "groupPic": "https://...",
      "admin": {
        "_id": "507f1f77bcf86cd799439011",
        "fullname": "John Doe"
      },
      "members": [
        {
          "_id": "507f1f77bcf86cd799439012",
          "fullname": "Jane Doe"
        }
      ]
    }
  ]
}
```

#### `GET /api/groups/last-messages` - Get last messages for groups
**Response:**
```json
{
  "success": true,
  "data": [
    {
      "groupId": "507f1f77bcf86cd799439030",
      "text": "Meeting at 3pm",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### `GET /api/groups/:id` - Get group details
**Params:** `id` = group ID

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439030",
    "name": "Project Team",
    "groupPic": "https://...",
    "admin": {
      "_id": "507f1f77bcf86cd799439011",
      "fullname": "John Doe",
      "profilePic": "https://..."
    },
    "members": [
      {
        "_id": "507f1f77bcf86cd799439012",
        "fullname": "Jane Doe",
        "profilePic": "https://..."
      }
    ]
  }
}
```

#### `GET /api/groups/:id/messages` - Get group messages
**Params:** `id` = group ID
**Query Params:** `?limit=50&before=messageId` (optional)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439040",
      "groupId": "507f1f77bcf86cd799439030",
      "senderId": {
        "_id": "507f1f77bcf86cd799439011",
        "fullname": "John Doe"
      },
      "text": "Meeting at 3pm",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "hasMore": true
}
```

#### `GET /api/groups/:id/messages/by-type` - Get group messages by type
**Params:** `id` = group ID
**Query Params:** `?type=images` (options: images, files, audio, video, links)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439040",
      "image": ["https://cloudinary.com/image.jpg"],
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Create/Update

#### `POST /api/groups/create` - Create new group
**Request:**
```json
{
  "name": "Project Team",
  "groupPic": "https://...",
  "members": ["507f1f77bcf86cd799439012", "507f1f77bcf86cd799439013"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Group created successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439030",
    "name": "Project Team",
    "groupPic": "https://...",
    "admin": "507f1f77bcf86cd799439011",
    "members": ["507f1f77bcf86cd799439012", "507f1f77bcf86cd799439013"]
  }
}
```

#### `POST /api/groups/:id/send` - Send message to group
**Params:** `id` = group ID

**Request:**
```json
{
  "text": "Hello team!"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439040",
    "groupId": "507f1f77bcf86cd799439030",
    "senderId": "507f1f77bcf86cd799439011",
    "text": "Hello team!",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

#### `POST /api/groups/:id/members` - Add members to group
**Params:** `id` = group ID

**Request:**
```json
{
  "userIds": ["507f1f77bcf86cd799439014", "507f1f77bcf86cd799439015"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Members added successfully",
  "data": {
    "addedCount": 2,
    "members": [
      {
        "_id": "507f1f77bcf86cd799439014",
        "fullname": "Bob Smith"
      },
      {
        "_id": "507f1f77bcf86cd799439015",
        "fullname": "Alice Johnson"
      }
    ]
  }
}
```

#### `PUT /api/groups/:id/info` - Update group info
**Params:** `id` = group ID

**Request:**
```json
{
  "name": "Updated Group Name",
  "groupPic": "https://new-image.jpg"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Group info updated successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439030",
    "name": "Updated Group Name",
    "groupPic": "https://new-image.jpg"
  }
}
```

### Delete/Leave

#### `DELETE /api/groups/:id` - Delete group
**Params:** `id` = group ID

**Response:**
```json
{
  "success": true,
  "message": "Group deleted successfully"
}
```

#### `DELETE /api/groups/:id/members/:memberId` - Remove member from group
**Params:** 
- `id` = group ID
- `memberId` = user ID to remove

**Response:**
```json
{
  "success": true,
  "message": "Member removed successfully"
}
```

#### `POST /api/groups/:id/leave` - Leave group
**Params:** `id` = group ID

**Response:**
```json
{
  "success": true,
  "message": "Left group successfully"
}
```

---

## Contact Endpoints (`/api/contacts`)

#### `GET /api/contacts` - Get user's contacts
**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "fullname": "Jane Doe",
      "email": "jane@example.com",
      "profilePic": "https://...",
      "status": "accepted"
    }
  ]
}
```

#### `GET /api/contacts/requests` - Get pending contact requests
**Response:**
```json
{
  "success": true,
  "data": {
    "sent": [
      {
        "_id": "507f1f77bcf86cd799439050",
        "receiverId": {
          "_id": "507f1f77bcf86cd799439012",
          "fullname": "Jane Doe"
        },
        "status": "pending",
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ],
    "received": [
      {
        "_id": "507f1f77bcf86cd799439051",
        "senderId": {
          "_id": "507f1f77bcf86cd799439013",
          "fullname": "Bob Smith"
        },
        "status": "pending",
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ]
  }
}
```

#### `GET /api/contacts/status/:userId` - Get contact status with user
**Params:** `userId` = user ID

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "accepted",
    "isContact": true
  }
}
```

#### `POST /api/contacts/request` - Send contact request
**Request:**
```json
{
  "receiverId": "507f1f77bcf86cd799439012"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Contact request sent successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439050",
    "senderId": "507f1f77bcf86cd799439011",
    "receiverId": "507f1f77bcf86cd799439012",
    "status": "pending"
  }
}
```

#### `POST /api/contacts/accept` - Accept contact request
**Request:**
```json
{
  "requestId": "507f1f77bcf86cd799439051"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Contact request accepted successfully"
}
```

#### `POST /api/contacts/reject` - Reject contact request
**Request:**
```json
{
  "requestId": "507f1f77bcf86cd799439051"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Contact request rejected successfully"
}
```

---

## Call Endpoints (`/api/calls`)

#### `GET /api/calls/history` - Get call history
**Query Params:** `?page=1&limit=100`

**Response:**
```json
{
  "success": true,
  "message": "Call history retrieved successfully",
  "data": [
    {
      "id": "507f1f77bcf86cd799439060",
      "contact": {
        "_id": "507f1f77bcf86cd799439012",
        "fullname": "Jane Doe",
        "profilePic": "https://..."
      },
      "type": "outgoing",
      "status": "answered",
      "duration": 120,
      "timestamp": "2024-01-15T10:30:00Z",
      "count": 1
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 100,
    "total": 50,
    "totalPages": 1,
    "hasMore": false
  }
}
```

#### `GET /api/calls/stats` - Get call statistics
**Response:**
```json
{
  "success": true,
  "message": "Call statistics retrieved successfully",
  "data": {
    "total": 50,
    "byStatus": {
      "answered": 30,
      "missed": 15,
      "rejected": 3,
      "cancelled": 2
    },
    "byType": {
      "voice": 40,
      "video": 10
    },
    "byDirection": {
      "outgoing": 25,
      "incoming": 25
    },
    "totalDuration": 3600,
    "recentCalls": 20
  }
}
```

#### `DELETE /api/calls` - Delete calls
**Request:**
```json
{
  "callIds": [
    "507f1f77bcf86cd799439060",
    "507f1f77bcf86cd799439061"
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "2 calls deleted successfully",
  "data": {
    "deletedCount": 2
  }
}
```

---

## Folder Endpoints (`/api/folders`)

### Get Data

#### `GET /api/folders` - Get all folders for user
**Response:**
```json
{
  "success": true,
  "folders": [
    {
      "_id": "507f1f77bcf86cd799439070",
      "userId": "507f1f77bcf86cd799439011",
      "name": "Work",
      "icon": "📁",
      "color": "#3b82f6",
      "order": 0,
      "isExpanded": true,
      "conversations": [
        {
          "type": "user",
          "id": "507f1f77bcf86cd799439012",
          "addedAt": "2024-01-15T10:30:00Z"
        }
      ],
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Create/Update

#### `POST /api/folders` - Create new folder
**Request:**
```json
{
  "name": "Work",
  "icon": "📁",
  "color": "#3b82f6"
}
```

**Response:**
```json
{
  "success": true,
  "folder": {
    "_id": "507f1f77bcf86cd799439070",
    "userId": "507f1f77bcf86cd799439011",
    "name": "Work",
    "icon": "📁",
    "color": "#3b82f6",
    "order": 0,
    "conversations": [],
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

#### `PUT /api/folders/:id` - Update folder
**Params:** `id` = folder ID

**Request:**
```json
{
  "name": "Updated Folder Name",
  "icon": "📂",
  "color": "#10b981",
  "isExpanded": false,
  "order": 1
}
```

**Response:**
```json
{
  "success": true,
  "folder": {
    "_id": "507f1f77bcf86cd799439070",
    "name": "Updated Folder Name",
    "icon": "📂",
    "color": "#10b981",
    "isExpanded": false,
    "order": 1
  }
}
```

#### `PUT /api/folders/reorder` - Reorder folders
**Request:**
```json
{
  "folderOrders": [
    {
      "folderId": "507f1f77bcf86cd799439070",
      "order": 0
    },
    {
      "folderId": "507f1f77bcf86cd799439071",
      "order": 1
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "folders": [
    {
      "_id": "507f1f77bcf86cd799439070",
      "name": "Work",
      "order": 0
    },
    {
      "_id": "507f1f77bcf86cd799439071",
      "name": "Personal",
      "order": 1
    }
  ]
}
```

#### `POST /api/folders/:id/conversations` - Add conversation to folder
**Params:** `id` = folder ID

**Request:**
```json
{
  "type": "user",
  "conversationId": "507f1f77bcf86cd799439012"
}
```

*Note: `type` can be "user" or "group"*

**Response:**
```json
{
  "success": true,
  "folder": {
    "_id": "507f1f77bcf86cd799439070",
    "conversations": [
      {
        "type": "user",
        "id": "507f1f77bcf86cd799439012",
        "addedAt": "2024-01-15T10:30:00Z"
      }
    ]
  }
}
```

### Delete

#### `DELETE /api/folders/:id` - Delete folder
**Params:** `id` = folder ID

**Response:**
```json
{
  "success": true,
  "message": "Folder deleted successfully"
}
```

#### `DELETE /api/folders/:id/conversations` - Remove conversation from folder
**Params:** `id` = folder ID

**Request:**
```json
{
  "type": "user",
  "conversationId": "507f1f77bcf86cd799439012"
}
```

**Response:**
```json
{
  "success": true,
  "folder": {
    "_id": "507f1f77bcf86cd799439070",
    "conversations": []
  }
}
```

---

## Health Check Endpoint

#### `GET /health` - Health check
**Request:** No body required (public endpoint)

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600.5,
  "environment": "production",
  "database": {
    "status": "connected",
    "readyState": 1
  },
  "memory": {
    "used": "150 MB",
    "total": "200 MB",
    "rss": "180 MB"
  }
}
```

*Note: Returns 200 if healthy, 503 if degraded (database disconnected)*

---

## Response Format

### Success Response
```json
{
  "success": true,
  "message": "Success message",
  "data": { ... }
}
```

### Paginated Response
```json
{
  "success": true,
  "message": "Success message",
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "totalPages": 2,
    "hasMore": true
  }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error message",
  "errors": { ... }
}
```

---

## Authentication

Most endpoints require authentication. Include the JWT token in the request:

**Header:**
```
Authorization: Bearer <token>
```

**Cookie:**
```
token=<token>
```

---

## Rate Limiting

- **Auth endpoints:** `authLimiter` - 5 requests per 15 minutes
- **Message endpoints:** `messageLimiter` - 30 messages per minute
- **General API:** `apiLimiter` - 100 requests per 15 minutes
- **Strict operations:** `strictLimiter` - 10 requests per hour

**Rate Limit Response (429):**
```json
{
  "success": false,
  "message": "Too many requests, please try again later"
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 408 | Request Timeout |
| 429 | Too Many Requests |
| 500 | Internal Server Error |

---

## Example Usage

### JavaScript/TypeScript (Axios)
```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5002/api',
  withCredentials: true // For cookie-based auth
});

// Login
const login = async (email, password) => {
  const response = await api.post('/auth/login', { email, password });
  return response.data;
};

// Send message
const sendMessage = async (userId, text) => {
  const response = await api.post(`/messages/send/${userId}`, { text });
  return response.data;
};

// Get call history
const getCallHistory = async (page = 1, limit = 100) => {
  const response = await api.get(`/calls/history?page=${page}&limit=${limit}`);
  return response.data;
};
```

### cURL Examples
```bash
# Login
curl -X POST http://localhost:5002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john@example.com","password":"password123"}' \
  -c cookies.txt

# Send message (with cookie)
curl -X POST http://localhost:5002/api/messages/send/USER_ID \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"text":"Hello!"}'

# Get call history
curl -X GET "http://localhost:5002/api/calls/history?page=1&limit=100" \
  -b cookies.txt
```

