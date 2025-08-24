/**
 * WebSocket server for real-time collaboration with security features
 */

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import * as url from 'url';

interface Client {
  id: string;
  ws: WebSocket;
  roomId: string;
  userName: string;
  userAvatar?: string;
  color: string;
  lastActivity: Date;
  origin: string;
  authToken?: string;
  messageCount: number;
  rateLimitWindow: number;
  ipAddress: string;
}

interface Room {
  id: string;
  clients: Map<string, Client>;
  locks: Map<string, string>; // element -> userId
  version: number;
  state: any;
  createdAt: Date;
  lastActivity: Date;
}

export interface CollaborationServerConfig {
  port?: number;
  allowedOrigins?: string[];
  requireAuth?: boolean;
  authSecret?: string;
  maxRoomSize?: number;
  maxMessageSize?: number;
  rateLimitMessages?: number;
  rateLimitWindow?: number;
  roomTimeout?: number;
}

export class CollaborationServer extends EventEmitter {
  private wss: WebSocketServer;
  private rooms: Map<string, Room> = new Map();
  private clients: Map<string, Client> = new Map();
  private cleanupInterval: NodeJS.Timeout;
  private config: Required<CollaborationServerConfig>;
  private allowedOrigins: Set<string>;
  private ipConnections: Map<string, { count: number; lastReset: number }> = new Map();
  
  private readonly SECURITY_DEFAULTS: Required<CollaborationServerConfig> = {
    port: 8080,
    allowedOrigins: ['http://localhost:3000', 'http://localhost:8080'],
    requireAuth: false,
    authSecret: crypto.randomBytes(32).toString('hex'),
    maxRoomSize: 50,
    maxMessageSize: 100000, // 100KB
    rateLimitMessages: 50,
    rateLimitWindow: 60000, // 1 minute
    roomTimeout: 24 * 60 * 60 * 1000 // 24 hours
  };

  constructor(config: CollaborationServerConfig = {}) {
    super();
    
    this.config = { ...this.SECURITY_DEFAULTS, ...config };
    this.allowedOrigins = new Set(this.config.allowedOrigins);
    
    this.wss = new WebSocketServer({ 
      port: this.config.port,
      verifyClient: (info: any) => this.verifyClient(info)
    });
    
    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      try {
        this.handleConnection(ws, req);
      } catch (error) {
        console.error('Failed to handle connection:', error);
        ws.close(1008, 'Connection rejected');
      }
    });

    // Clean up inactive rooms and clients
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Every minute

    console.log(`Secure collaboration server running on port ${this.config.port}`);
    console.log(`Allowed origins: ${Array.from(this.allowedOrigins).join(', ')}`);
    console.log(`Authentication required: ${this.config.requireAuth}`);
  }

  /**
   * Verifies client connection before accepting WebSocket upgrade
   */
  private verifyClient(info: { origin?: string; req: IncomingMessage }): boolean {
    try {
      const origin = info.origin || info.req.headers.origin;
      
      // Check origin
      if (!this.isOriginAllowed(origin || '')) {
        console.warn(`Connection rejected: invalid origin ${origin}`);
        return false;
      }
      
      // Check IP rate limiting
      const clientIP = this.getClientIP(info.req);
      if (!this.checkIPRateLimit(clientIP)) {
        console.warn(`Connection rejected: IP rate limit exceeded for ${clientIP}`);
        return false;
      }
      
      // Validate URL parameters
      const parsedUrl = url.parse(info.req.url || '', true);
      const { room: roomId, user: userId } = parsedUrl.query;
      
      if (!this.validateConnectionParams(
        typeof roomId === 'string' ? roomId : '',
        typeof userId === 'string' ? userId : ''
      )) {
        console.warn(`Connection rejected: invalid parameters`);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error verifying client:', error);
      return false;
    }
  }
  
  /**
   * Gets client IP address from request
   */
  private getClientIP(req: IncomingMessage): string {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
           req.socket.remoteAddress ||
           'unknown';
  }
  
  /**
   * Checks if origin is allowed
   */
  private isOriginAllowed(origin: string): boolean {
    if (!origin) return false;
    return this.allowedOrigins.has(origin) || this.allowedOrigins.has('*');
  }
  
  /**
   * Checks IP-based rate limiting for new connections
   */
  private checkIPRateLimit(ip: string): boolean {
    const now = Date.now();
    const connection = this.ipConnections.get(ip);
    
    if (!connection) {
      this.ipConnections.set(ip, { count: 1, lastReset: now });
      return true;
    }
    
    // Reset counter if window has passed
    if (now - connection.lastReset > this.config.rateLimitWindow) {
      connection.count = 1;
      connection.lastReset = now;
      return true;
    }
    
    // Check rate limit (allow more connections per IP than messages)
    const maxConnections = Math.max(10, this.config.rateLimitMessages);
    connection.count++;
    return connection.count <= maxConnections;
  }
  
  /**
   * Validates connection parameters
   */
  private validateConnectionParams(roomId: string, userId: string): boolean {
    // Validate room ID format
    if (!roomId || typeof roomId !== 'string' || !/^[a-zA-Z0-9_-]{1,50}$/.test(roomId)) {
      return false;
    }
    
    // Validate user ID format
    if (!userId || typeof userId !== 'string' || !/^[a-zA-Z0-9_-]{1,50}$/.test(userId)) {
      return false;
    }
    
    return true;
  }
  
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const parsedUrl = url.parse(req.url || '', true);
    const roomId = typeof parsedUrl.query.room === 'string' ? parsedUrl.query.room : '';
    const userId = typeof parsedUrl.query.user === 'string' ? parsedUrl.query.user : '';
    const authToken = typeof parsedUrl.query.token === 'string' ? parsedUrl.query.token : undefined;
    const origin = req.headers.origin || 'unknown';
    
    // Additional authentication check if required
    if (this.config.requireAuth && !this.validateAuthToken(authToken || '')) {
      ws.close(1008, 'Authentication failed');
      return;
    }

    // Check room size limit
    let room = this.rooms.get(roomId);
    if (!room) {
      room = {
        id: roomId,
        clients: new Map(),
        locks: new Map(),
        version: 0,
        state: {},
        createdAt: new Date(),
        lastActivity: new Date()
      };
      this.rooms.set(roomId, room);
    } else if (room.clients.size >= this.config.maxRoomSize) {
      ws.close(1008, 'Room is full');
      return;
    }
    
    // Check if user is already connected (prevent duplicate connections)
    if (room.clients.has(userId)) {
      const existingClient = room.clients.get(userId)!;
      if (existingClient.ws.readyState === WebSocket.OPEN) {
        ws.close(1008, 'User already connected');
        return;
      }
      // Remove stale connection
      room.clients.delete(userId);
      this.clients.delete(userId);
    }

    // Create client with security properties
    const client: Client = {
      id: userId,
      ws,
      roomId,
      userName: `User ${userId}`,
      color: this.generateUserColor(userId),
      lastActivity: new Date(),
      origin,
      authToken,
      messageCount: 0,
      rateLimitWindow: Date.now(),
      ipAddress: this.getClientIP(req)
    };

    // Add client to room and global registry
    room.clients.set(userId, client);
    this.clients.set(userId, client);

    // Set up WebSocket handlers with security
    ws.on('message', (data: Buffer) => {
      try {
        if (!this.validateMessage(client, data)) {
          console.warn(`Invalid message from client ${userId}`);
          return;
        }
        this.handleMessage(client, data);
      } catch (error) {
        console.error(`Error handling message from ${userId}:`, error);
      }
    });

    ws.on('close', () => {
      this.handleDisconnect(client);
    });

    ws.on('error', (error: Error) => {
      console.error(`WebSocket error for client ${userId}:`, error);
      this.handleDisconnect(client);
    });

    ws.on('pong', () => {
      client.lastActivity = new Date();
    });

    // Send initial sync
    this.sendSync(client, room);

    // Notify others of new participant
    this.broadcastToRoom(room, client, {
      type: 'presence',
      userId: client.id,
      data: {
        action: 'join',
        name: client.userName,
        avatar: client.userAvatar,
        color: client.color
      },
      timestamp: Date.now()
    });

    this.emit('clientConnected', { roomId, userId });
  }

  /**
   * Validates authentication token
   */
  private validateAuthToken(token: string): boolean {
    if (!this.config.requireAuth) return true;
    if (!token) return false;
    
    try {
      // Simple token validation - in production, use proper JWT validation
      const parts = token.split('.');
      if (parts.length !== 3) return false;
      
      // Decode payload (basic validation)
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      
      // Check expiration
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        return false;
      }
      
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Validates incoming message
   */
  private validateMessage(client: Client, data: Buffer): boolean {
    // Size validation
    if (data.length > this.config.maxMessageSize) {
      return false;
    }
    
    // Rate limiting
    const now = Date.now();
    
    // Reset rate limit window if needed
    if (now - client.rateLimitWindow > this.config.rateLimitWindow) {
      client.messageCount = 0;
      client.rateLimitWindow = now;
    }
    
    client.messageCount++;
    
    if (client.messageCount > this.config.rateLimitMessages) {
      console.warn(`Rate limit exceeded for client ${client.id}`);
      return false;
    }
    
    // JSON validation
    try {
      const message = JSON.parse(data.toString());
      return this.validateMessageStructure(message);
    } catch {
      return false;
    }
  }
  
  /**
   * Validates message structure
   */
  private validateMessageStructure(message: any): boolean {
    if (!message || typeof message !== 'object') {
      return false;
    }
    
    // Required fields
    if (!message.type || typeof message.type !== 'string') {
      return false;
    }
    
    // Validate allowed message types
    const allowedTypes = ['ping', 'cursor', 'selection', 'edit', 'presence', 'sync', 'lock', 'unlock'];
    if (!allowedTypes.includes(message.type)) {
      return false;
    }
    
    // Additional validation for edit messages
    if (message.type === 'edit') {
      return this.validateEditMessage(message.data);
    }
    
    return true;
  }
  
  /**
   * Validates edit message data
   */
  private validateEditMessage(data: any): boolean {
    if (!data || typeof data !== 'object') {
      return false;
    }
    
    // Validate sight identifier
    if (!data.sight || typeof data.sight !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(data.sight)) {
      return false;
    }
    
    // Validate element type
    const allowedTypes = ['text', 'richtext', 'image', 'link', 'color', 'date', 'number', 'select', 'json', 'collection'];
    if (!data.type || !allowedTypes.includes(data.type)) {
      return false;
    }
    
    return true;
  }
  
  private handleMessage(client: Client, data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());
      client.lastActivity = new Date();

      const room = this.rooms.get(client.roomId);
      if (!room) return;
      
      // Update room activity
      room.lastActivity = new Date();

      switch (message.type) {
        case 'ping':
          // Respond with pong
          client.ws.send(JSON.stringify({ type: 'pong' }));
          break;

        case 'cursor':
          this.handleCursorUpdate(client, room, message);
          break;

        case 'selection':
          this.handleSelectionUpdate(client, room, message);
          break;

        case 'edit':
          // Additional security check for edit operations
          if (this.canUserEdit(client, message.data?.sight)) {
            this.handleEditOperation(client, room, message);
          } else {
            console.warn(`Edit denied for user ${client.id} on element ${message.data?.sight}`);
          }
          break;

        case 'presence':
          this.handlePresenceUpdate(client, room, message);
          break;

        case 'sync':
          this.sendSync(client, room);
          break;

        case 'lock':
          this.handleLockRequest(client, room, message);
          break;

        case 'unlock':
          this.handleUnlockRequest(client, room, message);
          break;

        default:
          console.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('Failed to process message:', error);
    }
  }

  private handleCursorUpdate(client: Client, room: Room, message: any): void {
    // Broadcast cursor position to all other clients in room
    this.broadcastToRoom(room, client, message);
  }

  private handleSelectionUpdate(client: Client, room: Room, message: any): void {
    // Broadcast selection to all other clients in room
    this.broadcastToRoom(room, client, message);
  }

  /**
   * Checks if user can edit a specific element
   */
  private canUserEdit(client: Client, elementId: string): boolean {
    if (!elementId) return false;
    
    const room = this.rooms.get(client.roomId);
    if (!room) return false;
    
    // Check if element is locked by another user
    const lockOwner = room.locks.get(elementId);
    return !lockOwner || lockOwner === client.id;
  }
  
  private handleEditOperation(client: Client, room: Room, message: any): void {
    // Validate edit data
    if (!this.validateEditMessage(message.data)) {
      console.warn(`Invalid edit data from client ${client.id}`);
      return;
    }
    
    // Update room version
    room.version++;
    message.data.version = room.version;

    // Store state update with security metadata
    if (message.data.sight) {
      if (!room.state[message.data.sight]) {
        room.state[message.data.sight] = {};
      }
      room.state[message.data.sight] = {
        value: message.data.value,
        type: message.data.type,
        version: room.version,
        lastEditBy: client.id,
        lastEditAt: Date.now(),
        clientOrigin: client.origin,
        clientIP: client.ipAddress
      };
    }

    // Broadcast edit to all clients including sender (for version sync)
    this.broadcastToRoom(room, null, message);

    this.emit('editOperation', {
      roomId: room.id,
      userId: client.id,
      operation: message.data
    });
  }

  private handlePresenceUpdate(client: Client, room: Room, message: any): void {
    // Update client info
    if (message.data.name) {
      client.userName = message.data.name;
    }
    if (message.data.avatar) {
      client.userAvatar = message.data.avatar;
    }

    // Broadcast to others
    this.broadcastToRoom(room, client, message);
  }

  private handleLockRequest(client: Client, room: Room, message: any): void {
    const element = message.data.element;
    
    // Check if element is already locked
    if (room.locks.has(element)) {
      const owner = room.locks.get(element);
      if (owner !== client.id) {
        // Send lock denied
        client.ws.send(JSON.stringify({
          type: 'lockDenied',
          data: { element, owner },
          timestamp: Date.now()
        }));
        return;
      }
    }

    // Grant lock
    room.locks.set(element, client.id);
    
    // Broadcast lock to all clients
    this.broadcastToRoom(room, null, {
      type: 'lock',
      userId: client.id,
      data: { element },
      timestamp: Date.now()
    });

    this.emit('elementLocked', {
      roomId: room.id,
      userId: client.id,
      element
    });
  }

  private handleUnlockRequest(client: Client, room: Room, message: any): void {
    const element = message.data.element;
    
    // Check if client owns the lock
    if (room.locks.get(element) === client.id) {
      room.locks.delete(element);
      
      // Broadcast unlock to all clients
      this.broadcastToRoom(room, null, {
        type: 'unlock',
        userId: client.id,
        data: { element },
        timestamp: Date.now()
      });

      this.emit('elementUnlocked', {
        roomId: room.id,
        userId: client.id,
        element
      });
    }
  }

  private handleDisconnect(client: Client): void {
    const room = this.rooms.get(client.roomId);
    
    if (room) {
      // Remove client from room
      room.clients.delete(client.id);
      
      // Release all locks held by this client
      const locksToRelease: string[] = [];
      room.locks.forEach((userId, element) => {
        if (userId === client.id) {
          locksToRelease.push(element);
        }
      });
      
      locksToRelease.forEach(element => {
        room.locks.delete(element);
        this.broadcastToRoom(room, null, {
          type: 'unlock',
          userId: client.id,
          data: { element },
          timestamp: Date.now()
        });
      });
      
      // Notify others of departure
      this.broadcastToRoom(room, null, {
        type: 'presence',
        userId: client.id,
        data: { action: 'leave' },
        timestamp: Date.now()
      });
      
      // Clean up empty room
      if (room.clients.size === 0) {
        this.rooms.delete(client.roomId);
      }
    }
    
    // Remove from global client registry
    this.clients.delete(client.id);
    
    this.emit('clientDisconnected', {
      roomId: client.roomId,
      userId: client.id
    });
  }

  private sendSync(client: Client, room: Room): void {
    const collaborators = Array.from(room.clients.values())
      .filter(c => c.id !== client.id)
      .map(c => ({
        id: c.id,
        name: c.userName,
        color: c.color,
        avatar: c.userAvatar
      }));

    const locks: Record<string, string> = {};
    room.locks.forEach((userId, element) => {
      locks[element] = userId;
    });

    client.ws.send(JSON.stringify({
      type: 'sync',
      data: {
        collaborators,
        locks,
        version: room.version,
        state: room.state
      },
      timestamp: Date.now()
    }));
  }

  private broadcastToRoom(room: Room, exclude: Client | null, message: any): void {
    const messageStr = JSON.stringify(message);
    
    room.clients.forEach(client => {
      if ((!exclude || client.id !== exclude.id) && 
          client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(messageStr);
      }
    });
  }

  private cleanup(): void {
    const now = new Date();
    const clientTimeout = 5 * 60 * 1000; // 5 minutes
    
    // Clean up inactive clients
    this.clients.forEach(client => {
      const inactive = now.getTime() - client.lastActivity.getTime();
      if (inactive > clientTimeout) {
        console.log(`Removing inactive client: ${client.id}`);
        client.ws.terminate();
        this.handleDisconnect(client);
      } else {
        // Send ping to check connection
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping();
        }
      }
    });
    
    // Clean up old rooms
    this.rooms.forEach((room, roomId) => {
      const roomAge = now.getTime() - room.createdAt.getTime();
      const roomInactive = now.getTime() - room.lastActivity.getTime();
      
      if (room.clients.size === 0 || roomAge > this.config.roomTimeout || roomInactive > clientTimeout) {
        this.rooms.delete(roomId);
        console.log(`Removed room: ${roomId} (empty: ${room.clients.size === 0}, age: ${roomAge}, inactive: ${roomInactive})`);
      }
    });
    
    // Clean up IP connection tracking
    this.ipConnections.forEach((connection, ip) => {
      if (now.getTime() - connection.lastReset > this.config.rateLimitWindow * 2) {
        this.ipConnections.delete(ip);
      }
    });
  }

  private generateUserColor(userId: string): string {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
      '#6C5CE7', '#A8E6CF', '#FFD3B6', '#FF8B94', '#A1C4FD'
    ];
    
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash = hash & hash;
    }
    
    return colors[Math.abs(hash) % colors.length];
  }

  public getStats(): any {
    return {
      rooms: this.rooms.size,
      clients: this.clients.size,
      roomDetails: Array.from(this.rooms.entries()).map(([id, room]) => ({
        id,
        clients: room.clients.size,
        locks: room.locks.size,
        version: room.version
      }))
    };
  }

  public close(): void {
    clearInterval(this.cleanupInterval);
    
    // Close all connections
    this.clients.forEach(client => {
      client.ws.close(1000, 'Server shutting down');
    });
    
    this.wss.close();
  }
}