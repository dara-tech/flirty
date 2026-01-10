# Backend Capacity & Scalability Analysis

## Current Configuration

### Database Connection Pool
- **Max Pool Size:** 10 connections
- **Server Selection Timeout:** 5 seconds
- **Socket Timeout:** 45 seconds

### Rate Limiting
- **Auth endpoints:** 5 requests per 15 minutes
- **Message sending:** 30 messages per minute
- **General API:** 100 requests per 15 minutes
- **Strict operations:** 10 requests per hour

### Request Limits
- **Request Timeout:** 30 seconds
- **Body Size Limit:** 500MB (for video uploads)

### Socket.IO Configuration
- **No explicit connection limit** (uses Node.js default)
- **In-memory storage** for:
  - Active calls
  - Pending calls
  - Group call rooms
  - User locations
  - User socket mappings

---

## Current Capacity Estimates

### Single Server Instance

#### Concurrent Users
- **Socket.IO connections:** ~10,000-50,000 (depends on server resources)
- **Active database connections:** 10 (pool limit)
- **Bottleneck:** Database connection pool (10 connections)

#### Estimated User Capacity (Single Server)

**Conservative Estimate:**
- **Concurrent users:** 1,000-2,000 users
- **Active calls:** ~100-200 simultaneous calls
- **Messages per second:** ~50-100 messages/sec
- **Database queries:** Limited by 10 connection pool

**Optimistic Estimate (with good hardware):**
- **Concurrent users:** 5,000-10,000 users
- **Active calls:** ~500-1,000 simultaneous calls
- **Messages per second:** ~200-500 messages/sec

**Hardware Requirements:**
- **CPU:** 4-8 cores
- **RAM:** 4-8 GB
- **Network:** 100 Mbps+

---

## Bottlenecks & Limitations

### 1. Database Connection Pool (Critical)
**Current:** 10 connections
**Impact:** Limits concurrent database operations
**Solution:** Increase pool size based on load

```javascript
// Recommended for production
maxPoolSize: 50-100  // For medium traffic
maxPoolSize: 100-200 // For high traffic
```

### 2. In-Memory Storage (Critical)
**Current:** All data stored in memory (Maps)
**Impact:** 
- Data lost on server restart
- Cannot scale horizontally (multiple servers)
- Memory usage grows with users

**Solutions:**
- Use Redis for shared state
- Use database for persistent data
- Implement session sharing

### 3. Single Server Instance
**Current:** One Node.js process
**Impact:** Limited by single CPU core (Node.js is single-threaded)
**Solution:** Use Node.js clustering or multiple servers

### 4. Socket.IO Connection Limits
**Current:** No explicit limit
**Impact:** Memory usage grows with connections
**Solution:** Set connection limits and use Redis adapter

---

## Scalability Recommendations

### Level 1: Single Server Optimization (Current → 2,000 users)

#### Database Pool Increase
```javascript
// backend/src/lib/db.js
const options = {
  maxPoolSize: 50,  // Increase from 10
  minPoolSize: 5,   // Maintain minimum connections
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};
```

#### Add Connection Limits
```javascript
// backend/src/lib/socket.js
const io = new Server(server, {
  cors: { ... },
  maxHttpBufferSize: 1e8, // 100MB
  pingTimeout: 60000,
  pingInterval: 25000,
  // Add connection limits
  transports: ['websocket', 'polling'],
  allowEIO3: true,
});
```

**Estimated Capacity:** 2,000-5,000 concurrent users

---

### Level 2: Horizontal Scaling (2,000 → 10,000+ users)

#### 1. Add Redis for Shared State
```javascript
// Install: npm install redis socket.io-redis
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);

io.adapter(createAdapter(pubClient, subClient));
```

**Benefits:**
- Shared state across multiple servers
- Session persistence
- Better scalability

#### 2. Use Redis for In-Memory Data
```javascript
// Replace Maps with Redis
// activeCalls → Redis hash
// userSockets → Redis hash
// groupCallRooms → Redis hash
```

#### 3. Load Balancer Setup
```
[Users] → [Load Balancer] → [Server 1]
                              [Server 2]
                              [Server 3]
                              [Server N]
```

**Estimated Capacity:** 10,000-50,000 concurrent users (with 3-5 servers)

---

### Level 3: Advanced Scaling (10,000+ users)

#### 1. Database Optimization
- **Read Replicas:** Separate read/write operations
- **Connection Pooling:** Per-server pools
- **Indexing:** Optimize database queries
- **Caching:** Redis cache for frequent queries

#### 2. Microservices Architecture
```
[API Gateway] → [Auth Service]
                [Message Service]
                [Call Service]
                [Group Service]
```

#### 3. CDN for Static Assets
- Serve images/videos from CDN
- Reduce server load

#### 4. Message Queue (RabbitMQ/Kafka)
- Async message processing
- Better handling of message spikes

**Estimated Capacity:** 50,000+ concurrent users

---

## Resource Usage Estimates

### Per User (Average)
- **Memory:** ~2-5 MB (socket connection + state)
- **CPU:** ~0.1-0.5% (idle), ~1-5% (active)
- **Network:** ~10-50 KB/s (idle), ~100-500 KB/s (active call)
- **Database:** ~1-5 queries per minute

### Server Resource Calculation

**Example: 1,000 concurrent users**
- **Memory:** 1,000 × 3 MB = ~3 GB
- **CPU:** 1,000 × 0.3% = ~300% (3 cores)
- **Network:** 1,000 × 30 KB/s = ~30 MB/s
- **Database:** 1,000 × 3 queries/min = 3,000 queries/min = 50 queries/sec

**Example: 5,000 concurrent users**
- **Memory:** 5,000 × 3 MB = ~15 GB
- **CPU:** 5,000 × 0.3% = ~1,500% (15 cores)
- **Network:** 5,000 × 30 KB/s = ~150 MB/s
- **Database:** 5,000 × 3 queries/min = 15,000 queries/min = 250 queries/sec

---

## Database Capacity

### MongoDB Limits
- **Default max connections:** 65,536
- **Recommended:** 100-1,000 connections per server
- **With connection pool (10):** Can handle ~50-100 queries/sec efficiently

### Current Bottleneck
**10 connection pool = ~50-100 queries/sec max**

**Solutions:**
1. Increase pool size to 50-100
2. Use connection pooling per server instance
3. Add read replicas for read-heavy operations

---

## Socket.IO Capacity

### Single Server Limits
- **Theoretical:** 65,536 connections (OS limit)
- **Practical:** 10,000-20,000 (depends on resources)
- **Recommended:** 5,000-10,000 per server

### With Redis Adapter (Multiple Servers)
- **Total capacity:** N servers × 5,000-10,000 users
- **Example:** 5 servers = 25,000-50,000 users

---

## Recommended Server Sizes

### Small Scale (1,000-2,000 users)
- **Servers:** 1
- **CPU:** 4 cores
- **RAM:** 8 GB
- **Database Pool:** 20-30
- **Cost:** Low

### Medium Scale (2,000-10,000 users)
- **Servers:** 2-3
- **CPU:** 8 cores each
- **RAM:** 16 GB each
- **Database Pool:** 50-100 per server
- **Redis:** Required
- **Load Balancer:** Required
- **Cost:** Medium

### Large Scale (10,000+ users)
- **Servers:** 5-10+
- **CPU:** 16+ cores each
- **RAM:** 32+ GB each
- **Database Pool:** 100-200 per server
- **Redis Cluster:** Required
- **Load Balancer:** Required
- **CDN:** Recommended
- **Cost:** High

---

## Monitoring & Metrics

### Key Metrics to Track
1. **Active connections:** Socket.IO connections
2. **Database pool usage:** Active/idle connections
3. **Memory usage:** Server RAM consumption
4. **CPU usage:** Server CPU load
5. **Response times:** API response times
6. **Error rates:** Failed requests/calls
7. **Message throughput:** Messages per second

### Recommended Tools
- **PM2:** Process management & monitoring
- **New Relic / Datadog:** Application monitoring
- **MongoDB Atlas:** Database monitoring
- **Redis Insight:** Redis monitoring

---

## Quick Wins (Immediate Improvements)

1. **Increase database pool to 50**
   - Impact: 5x database capacity
   - Effort: 5 minutes

2. **Add connection monitoring**
   - Impact: Better visibility
   - Effort: 1 hour

3. **Set Socket.IO limits**
   - Impact: Prevent memory issues
   - Effort: 30 minutes

4. **Add Redis for shared state**
   - Impact: Enable horizontal scaling
   - Effort: 2-4 hours

---

## Current vs Optimized Capacity

| Metric | Current | Optimized (Single) | With Scaling |
|--------|---------|-------------------|--------------|
| Concurrent Users | 1,000-2,000 | 2,000-5,000 | 10,000-50,000+ |
| Database Pool | 10 | 50-100 | 50-100 per server |
| Servers | 1 | 1 | 3-10 |
| Memory Usage | 3-6 GB | 6-15 GB | Distributed |
| Messages/sec | 50-100 | 200-500 | 1,000-5,000+ |

---

## Conclusion

**Current Capacity:** ~1,000-2,000 concurrent users per server

**With Optimizations:** ~2,000-5,000 concurrent users per server

**With Horizontal Scaling:** 10,000-50,000+ concurrent users (multiple servers)

**Primary Bottleneck:** Database connection pool (10 connections)

**First Priority:** Increase database pool size to 50-100

**Second Priority:** Add Redis for shared state to enable scaling

