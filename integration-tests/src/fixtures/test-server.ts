import express from 'express';
import cors from 'cors';
import { Server } from 'http';
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { DataFactory } from './data-factory.js';

export interface TestServerOptions {
  port?: number;
  enableWebSocket?: boolean;
  enableAuth?: boolean;
  enableCors?: boolean;
}

export class TestServer {
  private app: express.Application;
  private server: Server | null = null;
  private wsServer: WebSocketServer | null = null;
  private port: number;
  private options: TestServerOptions;

  // In-memory storage for testing
  private users: Map<string, any> = new Map();
  private content: Map<string, any> = new Map();
  private sessions: Map<string, any> = new Map();
  
  constructor(options: TestServerOptions = {}) {
    this.app = express();
    this.port = options.port || 3334;
    this.options = {
      enableWebSocket: true,
      enableAuth: true,
      enableCors: true,
      ...options
    };
    
    this.setupMiddleware();
    this.setupRoutes();
    this.seedTestData();
  }

  private setupMiddleware(): void {
    if (this.options.enableCors) {
      this.app.use(cors({
        origin: true,
        credentials: true
      }));
    }
    
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Request logging for tests
    this.app.use((req, res, next) => {
      console.log(`[TEST-SERVER] ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    // Authentication endpoints
    if (this.options.enableAuth) {
      this.setupAuthRoutes();
    }

    // SightEdit API endpoints
    this.setupSightEditRoutes();
    
    // Test utilities
    this.setupTestUtilityRoutes();
  }

  private setupAuthRoutes(): void {
    // Register user
    this.app.post('/auth/register', (req, res) => {
      const { email, password, role = 'user' } = req.body;
      
      if (this.users.has(email)) {
        return res.status(409).json({ error: 'User already exists' });
      }
      
      const user = DataFactory.createUser({ email, role, password });
      user.id = this.users.size + 1;
      this.users.set(email, user);
      
      const token = jwt.sign(
        { userId: user.id, email, role },
        'test-secret',
        { expiresIn: '1h' }
      );
      
      res.status(201).json({ user: { id: user.id, email, role }, token });
    });

    // Login user
    this.app.post('/auth/login', (req, res) => {
      const { email, password } = req.body;
      const user = this.users.get(email);
      
      if (!user || user.password !== password) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        'test-secret',
        { expiresIn: '1h' }
      );
      
      res.json({ user: { id: user.id, email: user.email, role: user.role }, token });
    });

    // Verify token middleware
    this.app.use('/api', (req, res, next) => {
      const authHeader = req.headers.authorization;
      
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }
      
      try {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, 'test-secret') as any;
        req.user = decoded;
        next();
      } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
      }
    });
  }

  private setupSightEditRoutes(): void {
    // Save content
    this.app.post('/api/sightedit/save', (req, res) => {
      const { sight, value, context } = req.body;
      
      if (!sight || value === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      const content = DataFactory.createContent({
        sight,
        value,
        context: context || DataFactory.createContent().context
      });
      
      content.id = this.content.size + 1;
      this.content.set(sight, content);
      
      // Simulate processing delay
      setTimeout(() => {
        res.json({ success: true, id: content.id, sight });
      }, Math.random() * 100);
    });

    // Batch save
    this.app.post('/api/sightedit/batch', (req, res) => {
      const { changes } = req.body;
      
      if (!Array.isArray(changes)) {
        return res.status(400).json({ error: 'Changes must be an array' });
      }
      
      const results = changes.map((change, index) => {
        const { sight, value, context } = change;
        
        if (!sight || value === undefined) {
          return { index, success: false, error: 'Missing required fields' };
        }
        
        const content = DataFactory.createContent({ sight, value, context });
        content.id = this.content.size + index + 1;
        this.content.set(sight, content);
        
        return { index, success: true, id: content.id, sight };
      });
      
      res.json({ results });
    });

    // Get content
    this.app.get('/api/sightedit/content/:sight', (req, res) => {
      const { sight } = req.params;
      const content = this.content.get(sight);
      
      if (!content) {
        return res.status(404).json({ error: 'Content not found' });
      }
      
      res.json(content);
    });

    // Get schema
    this.app.get('/api/sightedit/schema/:sight', (req, res) => {
      const { sight } = req.params;
      
      // Return mock schema
      res.json({
        sight,
        type: 'text',
        validation: {
          required: true,
          minLength: 1,
          maxLength: 1000
        },
        ui: {
          mode: 'inline',
          placeholder: 'Enter text...'
        }
      });
    });

    // File upload
    this.app.post('/api/sightedit/upload', (req, res) => {
      // Mock file upload
      const fileId = `file_${Date.now()}`;
      res.json({
        success: true,
        fileId,
        url: `https://example.com/uploads/${fileId}`,
        size: Math.random() * 1000000,
        type: 'image/jpeg'
      });
    });
  }

  private setupTestUtilityRoutes(): void {
    // Reset test data
    this.app.post('/test/reset', (req, res) => {
      this.users.clear();
      this.content.clear();
      this.sessions.clear();
      this.seedTestData();
      res.json({ success: true });
    });

    // Get test data
    this.app.get('/test/data', (req, res) => {
      res.json({
        users: Array.from(this.users.values()),
        content: Array.from(this.content.values()),
        sessions: Array.from(this.sessions.values())
      });
    });

    // Generate test scenario
    this.app.post('/test/scenario/:name', (req, res) => {
      const { name } = req.params;
      const scenario = DataFactory.createScenario(name);
      
      if (!scenario) {
        return res.status(404).json({ error: 'Scenario not found' });
      }
      
      res.json(scenario);
    });
  }

  private seedTestData(): void {
    // Create default test users
    const defaultUsers = [
      { email: 'admin@test.com', password: 'admin123', role: 'admin' as const },
      { email: 'editor@test.com', password: 'editor123', role: 'editor' as const },
      { email: 'user@test.com', password: 'user123', role: 'user' as const }
    ];

    defaultUsers.forEach((userData, index) => {
      const user = DataFactory.createUser(userData);
      user.id = index + 1;
      this.users.set(userData.email, user);
    });

    // Create some default content
    const defaultContent = DataFactory.createContentItems(10);
    defaultContent.forEach((content, index) => {
      content.id = index + 1;
      this.content.set(content.sight, content);
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`[TEST-SERVER] Started on http://localhost:${this.port}`);
        
        if (this.options.enableWebSocket) {
          this.setupWebSocket();
        }
        
        resolve();
      });
      
      this.server.on('error', reject);
    });
  }

  private setupWebSocket(): void {
    if (!this.server) return;
    
    this.wsServer = new WebSocketServer({ server: this.server });
    
    this.wsServer.on('connection', (ws, req) => {
      console.log('[TEST-SERVER] WebSocket connection established');
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          // Echo back collaboration events
          if (message.type === 'collaboration') {
            this.wsServer?.clients.forEach(client => {
              if (client !== ws && client.readyState === client.OPEN) {
                client.send(JSON.stringify({
                  ...message,
                  timestamp: Date.now()
                }));
              }
            });
          }
          
        } catch (error) {
          console.error('[TEST-SERVER] WebSocket message error:', error);
        }
      });
      
      ws.on('close', () => {
        console.log('[TEST-SERVER] WebSocket connection closed');
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wsServer) {
        this.wsServer.close();
        this.wsServer = null;
      }
      
      if (this.server) {
        this.server.close(() => {
          console.log('[TEST-SERVER] Stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getPort(): number {
    return this.port;
  }

  getBaseUrl(): string {
    return `http://localhost:${this.port}`;
  }
}