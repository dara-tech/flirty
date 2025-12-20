# API Endpoints Documentation

## Base URL
```
/api
```

## Authentication Endpoints (`/api/auth`)

### Public Routes
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/google` - Google OAuth authentication

### Protected Routes
- `GET /api/auth/me` - Get current user info
- `PUT /api/auth/update-profile` - Update user profile
- `PUT /api/auth/change-password` - Change password

---

## Message Endpoints (`/api/messages`)

### Get Data
- `GET /api/messages/users` - Get users with conversations
- `GET /api/messages/users/all` - Get all users
- `GET /api/messages/last-messages` - Get last messages for conversations
- `GET /api/messages/:id` - Get messages with a user
- `GET /api/messages/by-type/:id` - Get messages by type (images, files, etc.)
- `GET /api/messages/saved/all` - Get saved messages

### Send/Update
- `POST /api/messages/send/:id` - Send message to user
- `PUT /api/messages/edit/:id` - Edit message
- `PUT /api/messages/update-image/:id` - Update message image
- `PUT /api/messages/pin/:id` - Pin message
- `PUT /api/messages/unpin/:id` - Unpin message
- `PUT /api/messages/reaction/:id` - Add reaction to message
- `PUT /api/messages/listen/:id` - Mark voice message as listened
- `PUT /api/messages/save/:id` - Save message

### Delete
- `DELETE /api/messages/:id` - Delete message
- `DELETE /api/messages/conversation/:id` - Delete conversation
- `DELETE /api/messages/reaction/:id` - Remove reaction
- `DELETE /api/messages/save/:id` - Unsave message
- `DELETE /api/messages/media/:id` - Delete message media

---

## Group Endpoints (`/api/groups`)

### Get Data
- `GET /api/groups/my-groups` - Get user's groups
- `GET /api/groups/last-messages` - Get last messages for groups
- `GET /api/groups/:id` - Get group details
- `GET /api/groups/:id/messages` - Get group messages
- `GET /api/groups/:id/messages/by-type` - Get group messages by type

### Create/Update
- `POST /api/groups/create` - Create new group
- `POST /api/groups/:id/send` - Send message to group
- `POST /api/groups/:id/members` - Add members to group
- `PUT /api/groups/:id/info` - Update group info

### Delete/Leave
- `DELETE /api/groups/:id` - Delete group
- `DELETE /api/groups/:id/members/:memberId` - Remove member from group
- `POST /api/groups/:id/leave` - Leave group

---

## Contact Endpoints (`/api/contacts`)

- `GET /api/contacts` - Get user's contacts
- `GET /api/contacts/requests` - Get pending contact requests
- `GET /api/contacts/status/:userId` - Get contact status with user
- `POST /api/contacts/request` - Send contact request
- `POST /api/contacts/accept` - Accept contact request
- `POST /api/contacts/reject` - Reject contact request

---

## Call Endpoints (`/api/calls`)

- `GET /api/calls/history` - Get call history
  - Query params: `page`, `limit`
- `GET /api/calls/stats` - Get call statistics
- `DELETE /api/calls` - Delete calls
  - Body: `{ callIds: [string] }`

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

- Auth endpoints: `authLimiter` (stricter)
- Message endpoints: `messageLimiter`
- Other endpoints: `apiLimiter`

