/**
 * @module @sightedit/core/collaboration
 * @description Real-time collaboration features for SightEdit
 */

import { EventEmitter } from '../utils/event-emitter';
import { SaveData, ElementType } from '../types';
import { JSONValidator } from '../utils/sanitizer';
import { SafeJSONParser } from '../utils/safe-json';

export interface CollaboratorInfo {
  id: string;
  name: string;
  color: string;
  avatar?: string;
  cursor?: { x: number; y: number };
  selection?: { element: string; start: number; end: number };
}

export interface CollaborationConfig {
  websocketUrl: string;
  roomId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
  authToken?: string;
  allowedOrigins?: string[];
  maxMessageSize?: number;
  rateLimitMessages?: number;
  rateLimitWindow?: number;
}

export interface CollaborationMessage {
  type: 'cursor' | 'selection' | 'edit' | 'presence' | 'sync' | 'lock' | 'unlock';
  userId: string;
  data: any;
  timestamp: number;
}

export interface EditOperation {
  sight: string;
  value: any;
  type: ElementType;
  version: number;
  userId: string;
}

/**
 * Manages real-time collaboration features for SightEdit
 */
export class CollaborationManager extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: CollaborationConfig;
  private collaborators: Map<string, CollaboratorInfo> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private editQueue: EditOperation[] = [];
  private lockedElements: Map<string, string> = new Map(); // element -> userId
  private documentVersion = 0;
  private isConnected = false;
  
  // Security and rate limiting
  private messageCount = 0;
  private rateLimitWindow = Date.now();
  private allowedOrigins: Set<string>;
  private maxMessageSize: number;
  private readonly SECURITY_DEFAULTS = {
    maxMessageSize: 100000, // 100KB
    rateLimitMessages: 50,
    rateLimitWindow: 60000, // 1 minute
    allowedOrigins: [window.location.origin]
  };

  constructor(config: CollaborationConfig) {
    super();
    this.config = {
      reconnectInterval: 3000,
      maxReconnectAttempts: 10,
      heartbeatInterval: 30000,
      maxMessageSize: this.SECURITY_DEFAULTS.maxMessageSize,
      rateLimitMessages: this.SECURITY_DEFAULTS.rateLimitMessages,
      rateLimitWindow: this.SECURITY_DEFAULTS.rateLimitWindow,
      allowedOrigins: this.SECURITY_DEFAULTS.allowedOrigins,
      ...config
    };
    
    // Set up security configurations
    this.allowedOrigins = new Set(this.config.allowedOrigins || this.SECURITY_DEFAULTS.allowedOrigins);
    this.maxMessageSize = this.config.maxMessageSize || this.SECURITY_DEFAULTS.maxMessageSize;
    
    // Validate configuration
    this.validateConfig();
  }
  
  /**
   * Validates the collaboration configuration for security
   */
  private validateConfig(): void {
    // Validate room ID format (prevent injection)
    if (!this.config.roomId || !/^[a-zA-Z0-9_-]+$/.test(this.config.roomId)) {
      throw new Error('Invalid room ID format. Use only alphanumeric characters, underscores, and hyphens.');
    }
    
    // Validate user ID format
    if (!this.config.userId || !/^[a-zA-Z0-9_-]+$/.test(this.config.userId)) {
      throw new Error('Invalid user ID format. Use only alphanumeric characters, underscores, and hyphens.');
    }
    
    // Validate WebSocket URL
    try {
      const url = new URL(this.config.websocketUrl);
      if (!['ws:', 'wss:'].includes(url.protocol)) {
        throw new Error('WebSocket URL must use ws:// or wss:// protocol');
      }
    } catch (error) {
      throw new Error('Invalid WebSocket URL');
    }
    
    // Validate auth token if provided
    if (this.config.authToken && (typeof this.config.authToken !== 'string' || this.config.authToken.length < 10)) {
      throw new Error('Auth token must be at least 10 characters long');
    }
  }

  /**
   * Connects to the collaboration server
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      // Validate origin before connecting
      if (!this.validateOrigin()) {
        throw new Error('Connection denied: origin not allowed');
      }
      
      // Build secure URL with authentication
      const url = this.buildSecureUrl();
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.sendPresence();
        this.startHeartbeat();
        this.emit('connected');
        
        // Request sync with current state
        this.send({
          type: 'sync',
          userId: this.config.userId,
          data: { request: true },
          timestamp: Date.now()
        });
      };

      this.ws.onmessage = (event) => {
        try {
          // Security validation before processing
          if (!this.validateMessage(event.data)) {
            console.warn('Received invalid or potentially malicious message');
            return;
          }
          
          // Rate limiting check
          if (!this.checkRateLimit()) {
            console.warn('Rate limit exceeded, dropping message');
            return;
          }
          
          const message = SafeJSONParser.tryParse(event.data);
          if (!message || typeof message !== 'object') {
            console.warn('Invalid message format received');
            return;
          }
          
          // Additional message structure validation
          if (!this.isValidCollaborationMessage(message)) {
            console.warn('Invalid message structure received');
            return;
          }
          
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse collaboration message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.emit('error', error);
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.stopHeartbeat();
        this.emit('disconnected');
        this.attemptReconnect();
      };
    } catch (error) {
      console.error('Failed to connect to collaboration server:', error);
      this.attemptReconnect();
    }
  }

  /**
   * Disconnects from the collaboration server
   */
  disconnect(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.collaborators.clear();
    this.lockedElements.clear();
    this.isConnected = false;
  }

  /**
   * Validates the current origin against allowed origins
   */
  private validateOrigin(): boolean {
    const currentOrigin = window.location.origin;
    return this.allowedOrigins.has(currentOrigin);
  }
  
  /**
   * Builds a secure WebSocket URL with authentication
   */
  private buildSecureUrl(): string {
    const url = new URL(this.config.websocketUrl);
    
    // Add query parameters with validation
    url.searchParams.set('room', encodeURIComponent(this.config.roomId));
    url.searchParams.set('user', encodeURIComponent(this.config.userId));
    
    // Add auth token if provided
    if (this.config.authToken) {
      url.searchParams.set('token', encodeURIComponent(this.config.authToken));
    }
    
    // Add origin for server-side validation
    url.searchParams.set('origin', encodeURIComponent(window.location.origin));
    
    return url.toString();
  }
  
  /**
   * Validates incoming message for size and format
   */
  private validateMessage(data: any): boolean {
    // Check message size
    if (typeof data === 'string' && data.length > this.maxMessageSize) {
      return false;
    }
    
    // Basic JSON validation
    const parsed = SafeJSONParser.tryParse(data);
    if (parsed && typeof parsed === 'object' && parsed !== null) {
      return true;
    } else {
      return false;
    }
  }
  
  /**
   * Checks rate limiting for incoming messages
   */
  private checkRateLimit(): boolean {
    const now = Date.now();
    
    // Reset counter if window has passed
    if (now - this.rateLimitWindow > (this.config.rateLimitWindow || this.SECURITY_DEFAULTS.rateLimitWindow)) {
      this.messageCount = 0;
      this.rateLimitWindow = now;
    }
    
    this.messageCount++;
    
    const limit = this.config.rateLimitMessages || this.SECURITY_DEFAULTS.rateLimitMessages;
    return this.messageCount <= limit;
  }
  
  /**
   * Validates the structure of a collaboration message
   */
  private isValidCollaborationMessage(message: any): message is CollaborationMessage {
    if (!message || typeof message !== 'object') {
      return false;
    }
    
    // Required fields
    if (!message.type || typeof message.type !== 'string') {
      return false;
    }
    
    if (!message.userId || typeof message.userId !== 'string') {
      return false;
    }
    
    if (typeof message.timestamp !== 'number' || message.timestamp <= 0) {
      return false;
    }
    
    // Validate allowed message types
    const allowedTypes = ['cursor', 'selection', 'edit', 'presence', 'sync', 'lock', 'unlock', 'pong'];
    if (!allowedTypes.includes(message.type)) {
      return false;
    }
    
    // Additional validation for specific message types
    switch (message.type) {
      case 'edit':
        return this.validateEditMessage(message.data);
      case 'cursor':
        return this.validateCursorMessage(message.data);
      case 'selection':
        return this.validateSelectionMessage(message.data);
      case 'lock':
      case 'unlock':
        return this.validateLockMessage(message.data);
    }
    
    return true;
  }
  
  /**
   * Validates edit operation messages
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
    
    // Validate value (basic checks)
    if (data.value === undefined) {
      return false;
    }
    
    // JSON validation for complex values
    if (typeof data.value === 'object') {
      const validation = JSONValidator.validate(JSON.stringify(data.value));
      return validation.isValid;
    }
    
    return true;
  }
  
  /**
   * Validates cursor position messages
   */
  private validateCursorMessage(data: any): boolean {
    return data && 
           typeof data.x === 'number' && data.x >= 0 && data.x <= 10000 &&
           typeof data.y === 'number' && data.y >= 0 && data.y <= 10000;
  }
  
  /**
   * Validates selection messages
   */
  private validateSelectionMessage(data: any): boolean {
    return data &&
           typeof data.element === 'string' && data.element.length > 0 &&
           typeof data.start === 'number' && data.start >= 0 &&
           typeof data.end === 'number' && data.end >= data.start;
  }
  
  /**
   * Validates lock/unlock messages
   */
  private validateLockMessage(data: any): boolean {
    return data &&
           typeof data.element === 'string' &&
           /^[a-zA-Z0-9_.-]+$/.test(data.element);
  }
  
  /**
   * Handles incoming collaboration messages
   */
  private handleMessage(message: CollaborationMessage): void {
    // Additional security check: verify message is from known collaborator for edit operations
    if (message.type === 'edit' && !this.collaborators.has(message.userId) && message.userId !== this.config.userId) {
      console.warn('Received edit from unknown collaborator:', message.userId);
      return;
    }
    
    switch (message.type) {
      case 'cursor':
        this.handleCursorUpdate(message);
        break;
      case 'selection':
        this.handleSelectionUpdate(message);
        break;
      case 'edit':
        this.handleEditOperation(message);
        break;
      case 'presence':
        this.handlePresenceUpdate(message);
        break;
      case 'sync':
        this.handleSync(message);
        break;
      case 'lock':
        this.handleElementLock(message);
        break;
      case 'unlock':
        this.handleElementUnlock(message);
        break;
    }
  }

  /**
   * Handles cursor position updates from collaborators
   */
  private handleCursorUpdate(message: CollaborationMessage): void {
    const collaborator = this.collaborators.get(message.userId);
    if (collaborator) {
      collaborator.cursor = message.data;
      this.emit('cursorUpdate', { userId: message.userId, cursor: message.data });
    }
  }

  /**
   * Handles text selection updates from collaborators
   */
  private handleSelectionUpdate(message: CollaborationMessage): void {
    const collaborator = this.collaborators.get(message.userId);
    if (collaborator) {
      collaborator.selection = message.data;
      this.emit('selectionUpdate', { userId: message.userId, selection: message.data });
    }
  }

  /**
   * Handles edit operations from collaborators
   */
  private handleEditOperation(message: CollaborationMessage): void {
    const operation: EditOperation = message.data;
    
    // Additional security validation for edit operations
    if (!this.validateEditMessage(operation)) {
      console.warn('Received invalid edit operation:', operation);
      return;
    }
    
    // Check if user has permission to edit this element (if locked by someone else)
    if (this.isLocked(operation.sight) && this.getElementOwner(operation.sight) !== message.userId) {
      console.warn('Edit attempted on locked element:', operation.sight);
      return;
    }
    
    // Check version conflict
    if (operation.version < this.documentVersion) {
      // Request sync due to version conflict
      this.requestSync();
      return;
    }

    this.documentVersion = operation.version;
    this.emit('remoteEdit', operation);
  }

  /**
   * Handles presence updates (join/leave)
   */
  private handlePresenceUpdate(message: CollaborationMessage): void {
    if (message.data.action === 'join') {
      const collaborator: CollaboratorInfo = {
        id: message.userId,
        name: message.data.name,
        color: message.data.color || this.generateUserColor(message.userId),
        avatar: message.data.avatar
      };
      this.collaborators.set(message.userId, collaborator);
      this.emit('collaboratorJoined', collaborator);
    } else if (message.data.action === 'leave') {
      const collaborator = this.collaborators.get(message.userId);
      if (collaborator) {
        this.collaborators.delete(message.userId);
        this.emit('collaboratorLeft', collaborator);
        
        // Unlock any elements locked by this user
        this.lockedElements.forEach((userId, element) => {
          if (userId === message.userId) {
            this.lockedElements.delete(element);
            this.emit('elementUnlocked', { element, userId });
          }
        });
      }
    }
  }

  /**
   * Handles sync responses from server
   */
  private handleSync(message: CollaborationMessage): void {
    if (message.data.collaborators) {
      // Update collaborators list
      this.collaborators.clear();
      message.data.collaborators.forEach((collab: CollaboratorInfo) => {
        if (collab.id !== this.config.userId) {
          this.collaborators.set(collab.id, collab);
        }
      });
    }

    if (message.data.locks) {
      // Update locked elements
      this.lockedElements.clear();
      Object.entries(message.data.locks).forEach(([element, userId]) => {
        this.lockedElements.set(element, userId as string);
      });
    }

    if (message.data.version !== undefined) {
      this.documentVersion = message.data.version;
    }

    this.emit('synced', message.data);
  }

  /**
   * Handles element lock requests
   */
  private handleElementLock(message: CollaborationMessage): void {
    const { element } = message.data;
    this.lockedElements.set(element, message.userId);
    this.emit('elementLocked', { element, userId: message.userId });
  }

  /**
   * Handles element unlock requests
   */
  private handleElementUnlock(message: CollaborationMessage): void {
    const { element } = message.data;
    this.lockedElements.delete(element);
    this.emit('elementUnlocked', { element, userId: message.userId });
  }

  /**
   * Sends a collaboration message with security validation
   */
  private send(message: CollaborationMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Queue message for when connection is restored
      if (message.type === 'edit') {
        this.editQueue.push(message.data);
      }
      return;
    }
    
    try {
      // Validate message before sending
      if (!this.isValidCollaborationMessage(message)) {
        console.error('Attempted to send invalid message:', message);
        return;
      }
      
      const messageStr = JSON.stringify(message);
      
      // Check message size
      if (messageStr.length > this.maxMessageSize) {
        console.error('Message too large to send:', messageStr.length);
        return;
      }
      
      this.ws.send(messageStr);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }

  /**
   * Sends cursor position update
   */
  sendCursorPosition(x: number, y: number): void {
    this.send({
      type: 'cursor',
      userId: this.config.userId,
      data: { x, y },
      timestamp: Date.now()
    });
  }

  /**
   * Sends selection update
   */
  sendSelection(element: string, start: number, end: number): void {
    this.send({
      type: 'selection',
      userId: this.config.userId,
      data: { element, start, end },
      timestamp: Date.now()
    });
  }

  /**
   * Sends edit operation
   */
  sendEdit(data: SaveData): void {
    const operation: EditOperation = {
      sight: data.sight,
      value: data.value,
      type: data.type,
      version: ++this.documentVersion,
      userId: this.config.userId
    };

    this.send({
      type: 'edit',
      userId: this.config.userId,
      data: operation,
      timestamp: Date.now()
    });
  }

  /**
   * Requests lock on an element
   */
  requestLock(element: string): boolean {
    if (this.lockedElements.has(element)) {
      const owner = this.lockedElements.get(element);
      if (owner !== this.config.userId) {
        return false; // Element is locked by another user
      }
      return true; // Already locked by this user
    }

    this.send({
      type: 'lock',
      userId: this.config.userId,
      data: { element },
      timestamp: Date.now()
    });

    this.lockedElements.set(element, this.config.userId);
    return true;
  }

  /**
   * Releases lock on an element
   */
  releaseLock(element: string): void {
    if (this.lockedElements.get(element) === this.config.userId) {
      this.send({
        type: 'unlock',
        userId: this.config.userId,
        data: { element },
        timestamp: Date.now()
      });
      this.lockedElements.delete(element);
    }
  }

  /**
   * Checks if an element is locked
   */
  isLocked(element: string): boolean {
    return this.lockedElements.has(element) && 
           this.lockedElements.get(element) !== this.config.userId;
  }

  /**
   * Gets the user who locked an element
   */
  getElementOwner(element: string): string | undefined {
    return this.lockedElements.get(element);
  }

  /**
   * Gets all active collaborators
   */
  getCollaborators(): CollaboratorInfo[] {
    return Array.from(this.collaborators.values());
  }

  /**
   * Sends presence information
   */
  private sendPresence(): void {
    this.send({
      type: 'presence',
      userId: this.config.userId,
      data: {
        action: 'join',
        name: this.config.userName,
        avatar: this.config.userAvatar,
        color: this.generateUserColor(this.config.userId)
      },
      timestamp: Date.now()
    });
  }

  /**
   * Requests full sync from server
   */
  private requestSync(): void {
    this.send({
      type: 'sync',
      userId: this.config.userId,
      data: { request: true },
      timestamp: Date.now()
    });
  }

  /**
   * Attempts to reconnect after connection loss
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts!) {
      this.emit('reconnectFailed');
      return;
    }

    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.emit('reconnecting', this.reconnectAttempts);
      this.connect();
    }, this.config.reconnectInterval! * this.reconnectAttempts);
  }

  /**
   * Starts heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Stops heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Generates a unique color for a user
   */
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

  /**
   * Flushes queued edit operations
   */
  private flushEditQueue(): void {
    while (this.editQueue.length > 0) {
      const operation = this.editQueue.shift()!;
      this.send({
        type: 'edit',
        userId: this.config.userId,
        data: operation,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Gets connection status
   */
  isConnectedToServer(): boolean {
    return this.isConnected;
  }
}