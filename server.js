// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { 
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000
});

// ==================== LOGGING SYSTEM ====================
// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create log file with timestamp
const logFileName = `server-${new Date().toISOString().split('T')[0]}.log`;
const logFilePath = path.join(logsDir, logFileName);

// Log levels
const LOG_LEVELS = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  DEBUG: 'DEBUG'
};

// Logging function with payload support
function log(level, message, payload = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    payload,
    pid: process.pid
  };
  
  // Console output (with colors for visibility)
  const consoleMessage = `[${timestamp}] ${level}: ${message}`;
  switch(level) {
    case LOG_LEVELS.ERROR:
      console.error(consoleMessage);
      if (payload) console.error('Payload:', JSON.stringify(payload, null, 2));
      break;
    case LOG_LEVELS.WARN:
      console.warn(consoleMessage);
      if (payload) console.warn('Payload:', JSON.stringify(payload, null, 2));
      break;
    default:
      console.log(consoleMessage);
      if (payload && level === LOG_LEVELS.DEBUG) console.log('Payload:', JSON.stringify(payload, null, 2));
  }
  
  // Write to file (without circular references)
  try {
    const safePayload = payload ? JSON.stringify(payload, getCircularReplacer()) : null;
    const fileEntry = `${timestamp} ${level} ${message} ${safePayload ? `Payload: ${safePayload}` : ''}\n`;
    fs.appendFileSync(logFilePath, fileEntry);
    
    // Also write to a separate payload log for detailed analysis
    if (payload && (level === LOG_LEVELS.INFO || level === LOG_LEVELS.DEBUG)) {
      const payloadLogFile = path.join(logsDir, `payloads-${new Date().toISOString().split('T')[0]}.log`);
      const payloadEntry = {
        timestamp,
        level,
        message,
        payload: safePayload
      };
      fs.appendFileSync(payloadLogFile, JSON.stringify(payloadEntry) + '\n');
    }
  } catch (error) {
    console.error('Failed to write to log file:', error);
  }
}

// Helper to handle circular references in JSON
function getCircularReplacer() {
  const seen = new WeakSet();
  return (key, value) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return "[Circular Reference]";
      }
      seen.add(value);
    }
    
    // Handle special types
    if (value instanceof Set) {
      return Array.from(value);
    }
    if (value instanceof Map) {
      return Object.fromEntries(value);
    }
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack
      };
    }
    
    return value;
  };
}

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  const requestId = uuidv4().slice(0, 8);
  
  // Log request
  log(LOG_LEVELS.INFO, `HTTP Request [${requestId}]`, {
    requestId,
    method: req.method,
    url: req.url,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent'],
    query: req.query,
    timestamp: new Date().toISOString()
  });
  
  // Log response
  const originalSend = res.send;
  res.send = function(body) {
    const responseTime = Date.now() - startTime;
    
    log(LOG_LEVELS.INFO, `HTTP Response [${requestId}]`, {
      requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      contentType: res.get('Content-Type'),
      timestamp: new Date().toISOString()
    });
    
    originalSend.call(this, body);
  };
  
  next();
});

// ==================== SERVER CONFIGURATION ====================
// Serve static files from this folder
app.use(express.static(path.join(__dirname, "public")));

// Serve index.html for root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html/index.html"));
});

// Serve admin.html for /admin
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html/admin.html"));
});

// Serve call-request.html for /call-request
app.get("/call-request", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html/call-request.html"));
});

// Serve video-call.html
app.get("/video-call", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html/video-call.html"));
});

// Log endpoints
app.get("/logs", (req, res) => {
  try {
    const lines = parseInt(req.query.lines) || 100;
    const logFile = fs.readFileSync(logFilePath, 'utf8');
    const logLines = logFile.split('\n').filter(line => line.trim());
    const recentLogs = logLines.slice(-lines);
    
    res.json({
      file: logFilePath,
      lines: lines,
      logs: recentLogs,
      totalLines: logLines.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    log(LOG_LEVELS.ERROR, 'Failed to read logs', {
      error: error.message,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ error: 'Failed to read logs' });
  }
});

app.get("/logs/download", (req, res) => {
  res.download(logFilePath, `server-logs-${new Date().toISOString().split('T')[0]}.log`);
});

app.get("/logs/search", (req, res) => {
  const { query, level, date } = req.query;
  
  try {
    const logFile = fs.readFileSync(logFilePath, 'utf8');
    const logLines = logFile.split('\n').filter(line => line.trim());
    
    let filteredLogs = logLines;
    
    if (query) {
      filteredLogs = filteredLogs.filter(line => 
        line.toLowerCase().includes(query.toLowerCase())
      );
    }
    
    if (level) {
      filteredLogs = filteredLogs.filter(line => 
        line.includes(` ${level} `)
      );
    }
    
    if (date) {
      filteredLogs = filteredLogs.filter(line => 
        line.startsWith(date)
      );
    }
    
    res.json({
      query,
      level,
      date,
      count: filteredLogs.length,
      logs: filteredLogs.slice(-500), // Limit to 500 results
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    log(LOG_LEVELS.ERROR, 'Failed to search logs', {
      error: error.message,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ error: 'Failed to search logs' });
  }
});

// Serve health check endpoint
app.get("/health", (req, res) => {
  const healthData = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    connections: Object.keys(waitingQueue).length,
    activeRooms: Object.keys(activeRooms).length,
    connectedSockets: io.engine.clientsCount,
    logFile: logFilePath
  };
  
  log(LOG_LEVELS.INFO, 'Health check requested', healthData);
  res.json(healthData);
});

// ==================== DATA STRUCTURES ====================
let waitingQueue = {}; // { socketId: { id, userData, status, timestamp } }
let activeRooms = {}; // Track active rooms: { roomId: { users: Set, createdAt, timeout } }
let userRooms = {}; // Track user room mappings: { socketId: roomId }
let userDataMap = {}; // Store user data by socket ID
let connectionTimeouts = {}; // Timeout handlers for room connections
let pendingOffers = {}; // Store pending offers for reconnection
let pendingAnswers = {}; // Store pending answers for reconnection

// ==================== CLEANUP FUNCTIONS ====================
// Clean up old data periodically
setInterval(() => {
  const now = Date.now();
  const timeout = 30 * 60 * 1000; // 30 minutes
  
  // Clean up old waiting queue entries
  for (const [socketId, entry] of Object.entries(waitingQueue)) {
    if (now - new Date(entry.timestamp).getTime() > timeout) {
      log(LOG_LEVELS.INFO, `Cleaning up old waiting queue entry`, {
        socketId,
        entry,
        age: Math.round((now - new Date(entry.timestamp).getTime()) / 60000) + ' minutes'
      });
      
      delete waitingQueue[socketId];
      io.to("admin-room").emit("remove-call", { userId: socketId });
    }
  }
  
  // Clean up old rooms
  for (const [roomId, room] of Object.entries(activeRooms)) {
    if (now - room.createdAt > timeout) {
      log(LOG_LEVELS.INFO, `Cleaning up old room`, {
        roomId,
        createdAt: room.createdAt,
        age: Math.round((now - room.createdAt) / 60000) + ' minutes',
        users: Array.from(room.users)
      });
      
      if (room.timeout) clearTimeout(room.timeout);
      delete activeRooms[roomId];
    }
  }
}, 5 * 60 * 1000); // Run every 5 minutes

// Log rotation function
function rotateLogs() {
  const now = new Date();
  const newLogFileName = `server-${now.toISOString().split('T')[0]}.log`;
  const newLogFilePath = path.join(logsDir, newLogFileName);
  
  if (newLogFilePath !== logFilePath) {
    log(LOG_LEVELS.INFO, 'Rotating log file', {
      oldFile: logFilePath,
      newFile: newLogFilePath,
      timestamp: now.toISOString()
    });
  }
  
  // Clean old log files (keep 7 days)
  const files = fs.readdirSync(logsDir);
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  
  files.forEach(file => {
    const filePath = path.join(logsDir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isFile() && stat.mtimeMs < sevenDaysAgo) {
      fs.unlinkSync(filePath);
      log(LOG_LEVELS.INFO, 'Deleted old log file', {
        file: file,
        age: Math.round((Date.now() - stat.mtimeMs) / (24 * 60 * 60 * 1000)) + ' days',
        timestamp: new Date().toISOString()
      });
    }
  });
}

// Run log rotation daily at midnight
setInterval(rotateLogs, 24 * 60 * 60 * 1000);
rotateLogs(); // Run once on startup

// Add periodic logging of server state
setInterval(() => {
  log(LOG_LEVELS.INFO, 'Server State Snapshot', {
    waitingQueueCount: Object.keys(waitingQueue).length,
    activeRoomsCount: Object.keys(activeRooms).length,
    connectedSockets: io.engine.clientsCount,
    userRoomsCount: Object.keys(userRooms).length,
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
}, 300000); // Every 5 minutes

// Helper function to clean up room
function cleanupRoom(roomId) {
  log(LOG_LEVELS.INFO, 'Cleaning up room', {
    roomId,
    roomData: activeRooms[roomId],
    timestamp: new Date().toISOString()
  });
  
  // Notify admin room about room ending
  io.to("admin-room").emit("room-ended", {
    roomId: roomId,
    reason: "call-ended",
    timestamp: new Date().toISOString()
  });

  // Clear timeout if exists
  if (connectionTimeouts[roomId]) {
    clearTimeout(connectionTimeouts[roomId]);
    delete connectionTimeouts[roomId];
  }
  
  if (activeRooms[roomId] && activeRooms[roomId].timeout) {
    clearTimeout(activeRooms[roomId].timeout);
  }
  
  // Clean up pending offers/answers
  delete pendingOffers[roomId];
  delete pendingAnswers[roomId];
  
  // Remove from active rooms
  delete activeRooms[roomId];
  
  // Clean up user room mappings
  for (const [socketId, room] of Object.entries(userRooms)) {
    if (room === roomId) {
      delete userRooms[socketId];
    }
  }
}

function sendBufferedMessages(socketId, roomId) {
  log(LOG_LEVELS.DEBUG, 'Sending buffered messages', {
    socketId,
    roomId,
    timestamp: new Date().toISOString()
  });
  
  // Send safe room info without circular references
  if (activeRooms[roomId]) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      const safeRoomData = {
        roomId: roomId,
        users: Array.from(activeRooms[roomId].users || []),
        createdAt: activeRooms[roomId].createdAt,
        status: activeRooms[roomId].status,
        userData: activeRooms[roomId].userData ? {
          name: activeRooms[roomId].userData.name,
          phone: activeRooms[roomId].userData.phone,
          returnUrl: activeRooms[roomId].userData.returnUrl,
          source: activeRooms[roomId].userData.source
        } : null
      };
      
      socket.emit("room-info-response", {
        roomId: roomId,
        exists: true,
        data: safeRoomData,
        userCount: activeRooms[roomId].users.size
      });
    }
  }
}

// ==================== SOCKET.IO HANDLERS ====================
io.on("connection", (socket) => {
  log(LOG_LEVELS.INFO, 'Socket.IO Connection Established', {
    socketId: socket.id,
    ip: socket.handshake.address,
    userAgent: socket.handshake.headers['user-agent'],
    query: socket.handshake.query,
    timestamp: new Date().toISOString()
  });
  
  // Store initial connection time
  socket.connectionTime = Date.now();
  
  // Send connection acknowledged
  socket.emit("connection-ack", { 
    socketId: socket.id,
    timestamp: new Date().toISOString()
  });

  // User requests a call -> put in queue and notify admins
  socket.on("request-call", (userData) => {
    log(LOG_LEVELS.INFO, 'Call request received', {
      socketId: socket.id,
      userData,
      timestamp: new Date().toISOString()
    });
    
    // Validate user data
    if (!userData || !userData.name) {
      const errorMsg = "Invalid user data";
      log(LOG_LEVELS.WARN, 'Invalid call request', {
        socketId: socket.id,
        error: errorMsg,
        userData
      });
      
      socket.emit("request-failed", { reason: errorMsg });
      return;
    }
    
    // Check if already in queue
    if (waitingQueue[socket.id]) {
      log(LOG_LEVELS.WARN, 'User already in queue', {
        socketId: socket.id,
        existingEntry: waitingQueue[socket.id]
      });
      
      socket.emit("queue-status", { 
        position: Object.keys(waitingQueue).length,
        message: "You are already in the queue",
        alreadyInQueue: true
      });
      return;
    }
    
    waitingQueue[socket.id] = { 
      id: socket.id, 
      userData: {
        ...userData,
        socketId: socket.id,
        ipAddress: socket.handshake.address
      },
      timestamp: new Date().toISOString(),
      status: 'waiting'
    };
    
    // Store user data for reconnection
    userDataMap[socket.id] = waitingQueue[socket.id].userData;
    
    log(LOG_LEVELS.INFO, 'User added to queue', {
      socketId: socket.id,
      userName: userData.name,
      queuePosition: Object.keys(waitingQueue).length,
      waitingQueueSize: Object.keys(waitingQueue).length
    });
    
    io.to("admin-room").emit("new-call", waitingQueue[socket.id]);
    
    // Notify user they are in queue
    const position = Object.keys(waitingQueue).length;
    socket.emit("queue-status", { 
      position: position,
      message: position === 1 ? 
        "You are next in line for a support agent" : 
        `You are position #${position} in the queue`,
      estimatedWait: Math.max(1, position - 1) * 2 // Estimated minutes
    });
    
    // Set timeout for queue (30 minutes)
    const queueTimeout = setTimeout(() => {
      if (waitingQueue[socket.id]) {
        log(LOG_LEVELS.INFO, 'Queue timeout for user', {
          socketId: socket.id,
          userName: userData.name,
          waitingTime: "30 minutes"
        });
        
        delete waitingQueue[socket.id];
        socket.emit("queue-timeout", { 
          message: "Your queue time has expired. Please try again." 
        });
        io.to("admin-room").emit("remove-call", { userId: socket.id });
      }
    }, 30 * 60 * 1000);
    
    // Store timeout reference
    waitingQueue[socket.id].timeout = queueTimeout;
  });

  // Admin requests active rooms
  socket.on("get-active-rooms", () => {
    log(LOG_LEVELS.INFO, 'Admin requesting active rooms', {
      adminId: socket.id,
      timestamp: new Date().toISOString()
    });
    
    const activeRoomsList = Object.entries(activeRooms).map(([roomId, room]) => ({
      roomId,
      userData: room.userData,
      users: Array.from(room.users),
      createdAt: room.createdAt
    }));
    
    socket.emit("active-rooms", {
      count: activeRoomsList.length,
      rooms: activeRoomsList,
      timestamp: new Date().toISOString()
    });
  });

  // Admin joins admin-room and receives all waiting users
  socket.on("admin-join", () => {
    log(LOG_LEVELS.INFO, 'Admin joined admin room', {
      adminId: socket.id,
      timestamp: new Date().toISOString()
    });
    
    socket.join("admin-room");
    
    // Send connection info
    socket.emit("admin-connected", {
      socketId: socket.id,
      waitingCount: Object.keys(waitingQueue).length,
      timestamp: new Date().toISOString()
    });
    
    // Send all waiting users to this admin
    Object.values(waitingQueue).forEach(user => {
      socket.emit("new-call", user);
    });
    
    // Send active room count
    socket.emit("active-rooms", {
      count: Object.keys(activeRooms).length,
      rooms: Object.keys(activeRooms)
    });
  });

  // Admin requests queue info
  socket.on("get-queue", () => {
    log(LOG_LEVELS.DEBUG, 'Admin requesting queue info', {
      adminId: socket.id
    });
    
    socket.emit("queue-info", {
      count: Object.keys(waitingQueue).length,
      users: Object.values(waitingQueue),
      timestamp: new Date().toISOString()
    });
  });

  // Admin accepts -> create a unique room and notify both admin + user
  socket.on("accept-call", ({ userId }) => {
    log(LOG_LEVELS.INFO, 'Admin accepting call', {
      adminId: socket.id,
      userId,
      timestamp: new Date().toISOString()
    });
    
    if (!waitingQueue[userId]) {
      log(LOG_LEVELS.WARN, 'User not found in waiting queue', {
        adminId: socket.id,
        userId,
        waitingQueueSize: Object.keys(waitingQueue).length
      });
      
      socket.emit("accept-failed", { 
        reason: "User no longer waiting",
        userId: userId 
      });
      return;
    }

    const roomId = uuidv4();
    log(LOG_LEVELS.INFO, 'Creating room for call', {
      roomId,
      adminId: socket.id,
      userId,
      timestamp: new Date().toISOString()
    });
    
    // Remove user from waiting queue
    const userEntry = waitingQueue[userId];
    delete waitingQueue[userId];
    
    // Clear queue timeout if exists
    if (userEntry.timeout) {
      clearTimeout(userEntry.timeout);
    }
    
    // Store user data for room
    const userData = userEntry.userData;
    
    // Create room entry
    activeRooms[roomId] = {
      users: new Set([socket.id, userId]),
      createdAt: Date.now(),
      adminId: socket.id,
      userId: userId,
      userData: userData,
      status: 'connecting'
    };
    
    // Store room mappings
    userRooms[socket.id] = roomId;
    userRooms[userId] = roomId;
    
    // Set connection timeout (90 seconds for slow permissions)
    const timeout = setTimeout(() => {
      log(LOG_LEVELS.WARN, 'Connection timeout for room', {
        roomId,
        elapsedTime: "90 seconds",
        users: Array.from(activeRooms[roomId]?.users || [])
      });
      
      io.to(roomId).emit("connection-timeout", { 
        roomId: roomId,
        message: "Connection timeout. Please try again." 
      });
      
      // Clean up room
      cleanupRoom(roomId);
    }, 90000); // 90 seconds
    
    activeRooms[roomId].timeout = timeout;
    connectionTimeouts[roomId] = timeout;
    
    // Join both users to the room
    io.sockets.sockets.get(socket.id)?.join(roomId);
    io.sockets.sockets.get(userId)?.join(roomId);
    
    // Notify the user with the roomId (so user can join)
    io.to(userId).emit("call-accepted", { 
      roomId, 
      adminId: socket.id,
      userData: userData,
      timestamp: new Date().toISOString(),
      connectionTimeout: 90 // seconds
    });
    
    // Notify admin room about new room
    io.to("admin-room").emit("room-created", {
      roomId: roomId,
      userData: userData,
      adminId: socket.id,
      timestamp: new Date().toISOString()
    });

    // Notify the admin that the call has been accepted and provide roomId
    socket.emit("call-accepted-admin", { 
      roomId, 
      userId,
      userData: userData,
      timestamp: new Date().toISOString(),
      connectionTimeout: 90 // seconds
    });

    // Also notify other admins to remove the queued user from UI
    io.to("admin-room").emit("remove-call", { userId: userId });
  });

  // User or admin successfully joined room
  socket.on("room-joined", ({ room, role, mediaReady = false }) => {
    log(LOG_LEVELS.INFO, 'User joined room', {
      socketId: socket.id,
      room,
      role,
      mediaReady,
      timestamp: new Date().toISOString()
    });
    
    // Clear connection timeout if both users have joined
    if (activeRooms[room] && connectionTimeouts[room]) {
      clearTimeout(connectionTimeouts[room]);
      delete connectionTimeouts[room];
      activeRooms[room].timeout = null;
      activeRooms[room].status = 'active';
      
      log(LOG_LEVELS.INFO, 'Room connection timeout cleared', {
        room,
        socketId: socket.id
      });
    }
    
    // Update room status
    if (activeRooms[room]) {
      activeRooms[room].status = 'active';
    }
    
    // Notify other user in room about reconnection
    socket.to(room).emit("peer-reconnected", { 
      socketId: socket.id,
      role: role,
      mediaReady: mediaReady,
      timestamp: new Date().toISOString(),
      isReconnection: true
    });
    
    // Send safe room info
    if (activeRooms[room]) {
      const safeRoomData = {
        roomId: room,
        users: Array.from(activeRooms[room].users || []),
        status: activeRooms[room].status,
        userCount: activeRooms[room].users.size
      };
      
      socket.emit("room-info", safeRoomData);
    }
  });

  // Media ready notification
  socket.on("media-ready", ({ room, hasVideo, hasAudio }) => {
    log(LOG_LEVELS.INFO, 'Media ready notification', {
      socketId: socket.id,
      room,
      hasVideo,
      hasAudio,
      timestamp: new Date().toISOString()
    });
    
    // Notify other user
    socket.to(room).emit("peer-media-ready", {
      socketId: socket.id,
      hasVideo: hasVideo,
      hasAudio: hasAudio,
      timestamp: new Date().toISOString()
    });
  });

  // Cancel call request
  socket.on("cancel-call", () => {
    log(LOG_LEVELS.INFO, 'User canceling call request', {
      socketId: socket.id,
      wasInQueue: !!waitingQueue[socket.id],
      timestamp: new Date().toISOString()
    });
    
    if (waitingQueue[socket.id]) {
      // Clear timeout if exists
      if (waitingQueue[socket.id].timeout) {
        clearTimeout(waitingQueue[socket.id].timeout);
      }
      
      delete waitingQueue[socket.id];
      io.to("admin-room").emit("remove-call", { userId: socket.id });
      socket.emit("call-canceled", { 
        message: "Call request canceled",
        timestamp: new Date().toISOString()
      });
    }
  });

  // Reconnection handling
  socket.on("reconnect-call", ({ room, userId }) => {
    log(LOG_LEVELS.INFO, 'Reconnection attempt', {
      newSocketId: socket.id,
      oldUserId: userId,
      room,
      timestamp: new Date().toISOString()
    });
    
    if (activeRooms[room] && activeRooms[room].users.has(userId)) {
      socket.join(room);
      userRooms[socket.id] = room;
      
      // Update socket ID mapping if reconnecting with new socket
      if (socket.id !== userId) {
        activeRooms[room].users.delete(userId);
        activeRooms[room].users.add(socket.id);
        userRooms[socket.id] = room;
        delete userRooms[userId];
      }
      
      socket.to(room).emit("user-reconnected", { 
        id: socket.id,
        oldId: userId,
        timestamp: new Date().toISOString()
      });
      
      socket.emit("reconnect-success", {
        roomId: room,
        users: Array.from(activeRooms[room].users),
        timestamp: new Date().toISOString()
      });
      
      log(LOG_LEVELS.INFO, 'Reconnection successful', {
        socketId: socket.id,
        room,
        usersInRoom: Array.from(activeRooms[room].users)
      });
    } else {
      log(LOG_LEVELS.WARN, 'Reconnection failed', {
        socketId: socket.id,
        room,
        userId,
        roomExists: !!activeRooms[room],
        userInRoom: activeRooms[room]?.users.has(userId)
      });
      
      socket.emit("reconnect-failed", {
        reason: "Room not found or user not in room",
        roomId: room,
        userId: userId
      });
    }
  });

  // Join room handler
  socket.on("join-room", (room) => {
    log(LOG_LEVELS.INFO, 'User joining room', {
      socketId: socket.id,
      room,
      currentRooms: Array.from(socket.rooms),
      timestamp: new Date().toISOString()
    });
    
    // Check if already in room
    const currentRooms = Array.from(socket.rooms);
    if (currentRooms.includes(room)) {
      log(LOG_LEVELS.DEBUG, 'User already in room', {
        socketId: socket.id,
        room
      });
      return;
    }
    
    socket.join(room);
    
    // Update room tracking
    if (activeRooms[room]) {
      // Remove old socket ID if it exists
      activeRooms[room].users.delete(socket.id);
      // Add new socket ID
      activeRooms[room].users.add(socket.id);
      userRooms[socket.id] = room;
    }
    
    // Notify others in room (but not ourselves)
    socket.to(room).emit("user-joined", { 
      id: socket.id,
      timestamp: new Date().toISOString(),
      isReconnection: true
    });
    
    // Send any pending offers/answers
    if (pendingOffers[room] && pendingOffers[room][socket.id]) {
      log(LOG_LEVELS.DEBUG, 'Sending pending offer', {
        socketId: socket.id,
        room,
        offerExists: true
      });
      
      socket.emit("offer", pendingOffers[room][socket.id]);
    }
    if (pendingAnswers[room] && pendingAnswers[room][socket.id]) {
      log(LOG_LEVELS.DEBUG, 'Sending pending answer', {
        socketId: socket.id,
        room,
        answerExists: true
      });
      
      socket.emit("answer", pendingAnswers[room][socket.id]);
    }
    
    // Send buffered messages
    sendBufferedMessages(socket.id, room);
  });

  // WebRTC signaling messages
  socket.on("offer", ({ room, offer, targetId }) => {
    log(LOG_LEVELS.INFO, 'WebRTC Offer', {
      socketId: socket.id,
      room,
      targetId: targetId || 'broadcast',
      offerType: offer.type,
      timestamp: new Date().toISOString()
    });
    
    // Store offer for reconnection
    if (!pendingOffers[room]) pendingOffers[room] = {};
    if (targetId) {
      pendingOffers[room][targetId] = offer;
    }
    
    if (targetId) {
      // Send to specific target
      socket.to(targetId).emit("offer", offer);
    } else {
      // Broadcast to room (excluding sender)
      socket.to(room).emit("offer", offer);
    }
  });

  socket.on("answer", ({ room, answer, targetId }) => {
    log(LOG_LEVELS.INFO, 'WebRTC Answer', {
      socketId: socket.id,
      room,
      targetId: targetId || 'broadcast',
      answerType: answer.type,
      timestamp: new Date().toISOString()
    });
    
    // Store answer for reconnection
    if (!pendingAnswers[room]) pendingAnswers[room] = {};
    if (targetId) {
      pendingAnswers[room][targetId] = answer;
    }
    
    if (targetId) {
      // Send to specific target
      socket.to(targetId).emit("answer", answer);
    } else {
      // Broadcast to room (excluding sender)
      socket.to(room).emit("answer", answer);
    }
  });

  socket.on("ice", ({ room, candidate, targetId }) => {
    log(LOG_LEVELS.DEBUG, 'WebRTC ICE Candidate', {
      socketId: socket.id,
      room,
      targetId: targetId || 'broadcast',
      candidate: candidate ? candidate.candidate.substring(0, 50) + '...' : null,
      timestamp: new Date().toISOString()
    });
    
    if (targetId) {
      // Send to specific target
      socket.to(targetId).emit("ice", candidate);
    } else {
      // Broadcast to room (excluding sender)
      socket.to(room).emit("ice", candidate);
    }
  });

  // End call
  socket.on("end-call", ({ room, reason }) => {
    log(LOG_LEVELS.INFO, 'Call ended', {
      socketId: socket.id,
      room,
      reason: reason || "Call ended by peer",
      timestamp: new Date().toISOString()
    });
    
    // Notify other user
    socket.to(room).emit("call-ended", {
      by: socket.id,
      reason: reason || "Call ended by peer",
      timestamp: new Date().toISOString()
    });
    
    // Clean up room
    cleanupRoom(room);
    
    // Notify user
    socket.emit("call-ended-confirm", {
      roomId: room,
      timestamp: new Date().toISOString()
    });
  });

  // Leave room
  socket.on("leave-room", (room) => {
    log(LOG_LEVELS.INFO, 'User leaving room', {
      socketId: socket.id,
      room,
      timestamp: new Date().toISOString()
    });
    
    socket.leave(room);
    
    // Update room tracking
    if (activeRooms[room]) {
      activeRooms[room].users.delete(socket.id);
      if (activeRooms[room].users.size === 0) {
        cleanupRoom(room);
      }
    }
    
    delete userRooms[socket.id];
  });

  // Ping/pong for connection health
  socket.on("ping", () => {
    log(LOG_LEVELS.DEBUG, 'Ping received', {
      socketId: socket.id,
      timestamp: new Date().toISOString()
    });
    
    socket.emit("pong", { 
      timestamp: new Date().toISOString(),
      serverTime: Date.now()
    });
  });

  // Get user info
  socket.on("get-user-info", ({ userId }) => {
    log(LOG_LEVELS.DEBUG, 'User info requested', {
      requester: socket.id,
      targetUserId: userId,
      timestamp: new Date().toISOString()
    });
    
    const info = userDataMap[userId] || waitingQueue[userId]?.userData;
    socket.emit("user-info", {
      userId: userId,
      data: info,
      found: !!info
    });
  });

  // Get room info
  socket.on("get-room-info", (room) => {
    log(LOG_LEVELS.DEBUG, 'Room info requested', {
      requester: socket.id,
      room,
      timestamp: new Date().toISOString()
    });
    
    const roomInfo = activeRooms[room];
    socket.emit("room-info-response", {
      roomId: room,
      exists: !!roomInfo,
      data: roomInfo,
      userCount: roomInfo?.users.size || 0
    });
  });

  // Chat messages
  socket.on("chat-message", ({ room, message, senderName, senderRole }) => {
    log(LOG_LEVELS.INFO, 'Chat message sent', {
      socketId: socket.id,
      room,
      senderName,
      senderRole,
      messageLength: message.length,
      messagePreview: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
      timestamp: new Date().toISOString()
    });
    
    const messageData = {
      message: message,
      senderName: senderName,
      senderRole: senderRole,
      timestamp: new Date().toISOString(),
      socketId: socket.id
    };
    
    // Broadcast to room
    socket.to(room).emit("chat-message", messageData);
    
    // Also send back to sender for confirmation
    socket.emit("chat-message-sent", {
      ...messageData,
      status: "sent"
    });
  });

  // Send single product to room
  socket.on("send-product", ({ room, product }) => {
    log(LOG_LEVELS.INFO, 'Product shared', {
      socketId: socket.id,
      room,
      productTitle: product.title,
      productId: product.id,
      timestamp: new Date().toISOString()
    });
    
    if (!room || !product) {
      socket.emit("send-product-error", { error: "Missing room or product data" });
      return;
    }
    
    // Check if room exists
    if (!activeRooms[room]) {
      socket.emit("send-product-error", { error: "Room not found" });
      return;
    }
    
    // Send product info to all users in the room
    io.to(room).emit("product-shared", {
      product: product,
      sender: socket.id,
      senderName: userDataMap[socket.id]?.name || "Admin",
      timestamp: new Date().toISOString()
    });
    
    // Confirm to sender
    socket.emit("product-sent", {
      room: room,
      product: product,
      timestamp: new Date().toISOString()
    });
  });

  // Send multiple products to room
  socket.on("send-products", ({ room, products }) => {
    log(LOG_LEVELS.INFO, 'Multiple products shared', {
      socketId: socket.id,
      room,
      productCount: products.length,
      productTitles: products.map(p => p.title).slice(0, 3),
      timestamp: new Date().toISOString()
    });
    
    if (!room || !products || !Array.isArray(products)) {
      socket.emit("send-product-error", { error: "Missing room or products data" });
      return;
    }
    
    // Check if room exists
    if (!activeRooms[room]) {
      socket.emit("send-product-error", { error: "Room not found" });
      return;
    }
    
    // Send products info to all users in the room
    io.to(room).emit("products-shared", {
      products: products,
      sender: socket.id,
      timestamp: new Date().toISOString(),
      count: products.length,
      type: 'multiple'
    });
    
    // Confirm to sender
    socket.emit("products-sent", {
      room: room,
      products: products,
      timestamp: new Date().toISOString()
    });
  });

  socket.on("get-room-details", ({ roomId }) => {
    log(LOG_LEVELS.DEBUG, 'Room details requested', {
      requester: socket.id,
      roomId,
      timestamp: new Date().toISOString()
    });
    
    const room = activeRooms[roomId];
    if (room) {
      socket.emit("room-info", {
        roomId: roomId,
        userData: room.userData,
        users: Array.from(room.users),
        createdAt: room.createdAt,
        status: room.status
      });
    } else {
      socket.emit("room-info", {
        roomId: roomId,
        error: "Room not found"
      });
    }
  });

  // Error handler
  socket.on("error", (error) => {
    log(LOG_LEVELS.ERROR, 'Socket error', {
      socketId: socket.id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    socket.emit("socket-error", {
      error: error.message || "Unknown socket error",
      timestamp: new Date().toISOString()
    });
  });

  // Disconnect handler
  socket.on("disconnect", (reason) => {
    log(LOG_LEVELS.INFO, 'Socket disconnected', {
      socketId: socket.id,
      reason: reason,
      connectionDuration: Date.now() - socket.connectionTime,
      waitingQueue: waitingQueue[socket.id] ? true : false,
      currentRoom: userRooms[socket.id] || null,
      timestamp: new Date().toISOString()
    });
    
    const room = userRooms[socket.id];
    
    // Clean up room tracking
    if (room && activeRooms[room]) {
      activeRooms[room].users.delete(socket.id);
      
      // Only notify if room still has other users
      if (activeRooms[room].users.size > 0) {
        // Notify other user in room about disconnection
        socket.to(room).emit("peer-disconnected", {
          socketId: socket.id,
          reason: reason,
          timestamp: new Date().toISOString(),
          reconnectPossible: reason === "transport close" || reason === "ping timeout"
        });
      }
      
      // Clean up empty rooms after delay (allow reconnection)
      setTimeout(() => {
        if (activeRooms[room] && activeRooms[room].users.size === 0) {
          log(LOG_LEVELS.INFO, 'Cleaning up empty room', {
            room,
            reason: 'empty after disconnect grace period'
          });
          
          cleanupRoom(room);
        }
      }, 30000); // 30 second grace period for reconnection
    }
    
    // Don't immediately delete from userRooms - allow reconnection
    setTimeout(() => {
      if (!io.sockets.sockets.get(socket.id)) {
        delete userRooms[socket.id];
        delete userDataMap[socket.id];
      }
    }, 60000); // 60 seconds
  });
});

// Ensure Socket.IO handshake responses include ngrok skip header
io.engine.on('initial_headers', (headers) => {
  headers['ngrok-skip-browser-warning'] = '1';
});

// ==================== SERVER STARTUP ====================
// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  log(LOG_LEVELS.INFO, 'Server Started', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    platform: process.platform,
    timestamp: new Date().toISOString(),
    logFile: logFilePath
  });
  
  console.log(`🚀 Signaling server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📝 Logs endpoint: http://localhost:${PORT}/logs`);
  console.log(`👑 Admin panel: http://localhost:${PORT}/admin`);
  console.log(`📞 Call endpoint: http://localhost:${PORT}/call-request`);
});

// Handle server shutdown gracefully
process.on('SIGTERM', () => {
  log(LOG_LEVELS.WARN, 'SIGTERM Received - Graceful Shutdown Initiated', {
    timestamp: new Date().toISOString(),
    connectedClients: io.engine.clientsCount,
    waitingQueueCount: Object.keys(waitingQueue).length,
    activeRoomsCount: Object.keys(activeRooms).length
  });
  
  // Notify all connected clients
  io.emit('server-shutdown', {
    message: 'Server is shutting down for maintenance',
    timestamp: new Date().toISOString()
  });
  
  // Close server after short delay
  setTimeout(() => {
    server.close(() => {
      log(LOG_LEVELS.INFO, 'Server closed', {
        timestamp: new Date().toISOString()
      });
      process.exit(0);
    });
  }, 5000);
});

// // Handle uncaught exceptions
// process.on('uncaughtException', (error) => {
//   log(LOG_LEVELS.ERROR, 'Uncaught Exception', {
//     error: error.message,
//     stack: error.stack,
//     timestamp: new Date().toISOString()
//   });
//   // Don't exit, keep server running
// });

process.on('unhandledRejection', (reason, promise) => {
  log(LOG_LEVELS.ERROR, 'Unhandled Rejection', {
    reason: reason,
    promise: promise,
    timestamp: new Date().toISOString()
  });
});