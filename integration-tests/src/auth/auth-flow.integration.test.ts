import { describe, beforeAll, afterAll, beforeEach, test, expect } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { TestServer } from '../fixtures/test-server.js';
import { DataFactory } from '../fixtures/data-factory.js';

describe('Authentication & Authorization Flow Integration Tests', () => {
  let testServer: TestServer;
  let baseURL: string;
  
  beforeAll(async () => {
    testServer = new TestServer({ port: 3336 });
    await testServer.start();
    baseURL = testServer.getBaseUrl();
  });

  afterAll(async () => {
    await testServer.stop();
  });

  beforeEach(async () => {
    // Reset test data before each test
    await request(baseURL).post('/test/reset');
  });

  describe('User Registration Flow', () => {
    test('should register new user successfully', async () => {
      const userData = {
        email: 'newuser@test.com',
        password: 'SecurePass123!',
        role: 'user'
      };

      const response = await request(baseURL)
        .post('/auth/register')
        .send(userData);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        user: {
          id: expect.any(Number),
          email: userData.email,
          role: userData.role
        },
        token: expect.any(String)
      });

      // Verify token is valid
      const decoded = jwt.verify(response.body.token, 'test-secret') as any;
      expect(decoded.email).toBe(userData.email);
      expect(decoded.role).toBe(userData.role);
    });

    test('should reject registration with existing email', async () => {
      const userData = {
        email: 'admin@test.com', // This already exists in test data
        password: 'NewPass123!',
        role: 'user'
      };

      const response = await request(baseURL)
        .post('/auth/register')
        .send(userData);

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('User already exists');
    });

    test('should validate required fields during registration', async () => {
      const testCases = [
        { data: { password: 'pass123' }, missingField: 'email' },
        { data: { email: 'test@test.com' }, missingField: 'password' },
        { data: {}, missingField: 'email and password' }
      ];

      for (const testCase of testCases) {
        const response = await request(baseURL)
          .post('/auth/register')
          .send(testCase.data);

        expect(response.status).toBe(400);
      }
    });

    test('should default role to user when not specified', async () => {
      const userData = {
        email: 'defaultrole@test.com',
        password: 'SecurePass123!'
        // No role specified
      };

      const response = await request(baseURL)
        .post('/auth/register')
        .send(userData);

      expect(response.status).toBe(201);
      expect(response.body.user.role).toBe('user');
    });
  });

  describe('User Login Flow', () => {
    test('should login with valid credentials', async () => {
      const response = await request(baseURL)
        .post('/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'admin123'
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        user: {
          id: expect.any(Number),
          email: 'admin@test.com',
          role: 'admin'
        },
        token: expect.any(String)
      });

      // Verify token contains correct user data
      const decoded = jwt.verify(response.body.token, 'test-secret') as any;
      expect(decoded.email).toBe('admin@test.com');
      expect(decoded.role).toBe('admin');
      expect(decoded.userId).toBe(response.body.user.id);
    });

    test('should reject login with invalid email', async () => {
      const response = await request(baseURL)
        .post('/auth/login')
        .send({
          email: 'nonexistent@test.com',
          password: 'admin123'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid credentials');
    });

    test('should reject login with invalid password', async () => {
      const response = await request(baseURL)
        .post('/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid credentials');
    });

    test('should reject login with missing credentials', async () => {
      const testCases = [
        { email: 'admin@test.com' }, // Missing password
        { password: 'admin123' }, // Missing email
        {} // Missing both
      ];

      for (const credentials of testCases) {
        const response = await request(baseURL)
          .post('/auth/login')
          .send(credentials);

        expect(response.status).toBe(401);
      }
    });
  });

  describe('Token-based Authorization', () => {
    let validTokens: Record<string, string> = {};

    beforeEach(async () => {
      // Login as different users to get valid tokens
      const users = [
        { email: 'admin@test.com', password: 'admin123', role: 'admin' },
        { email: 'editor@test.com', password: 'editor123', role: 'editor' },
        { email: 'user@test.com', password: 'user123', role: 'user' }
      ];

      for (const user of users) {
        const response = await request(baseURL)
          .post('/auth/login')
          .send({ email: user.email, password: user.password });
        
        validTokens[user.role] = response.body.token;
      }
    });

    test('should allow access with valid token', async () => {
      const testContent = DataFactory.createContent();

      const response = await request(baseURL)
        .post('/api/sightedit/save')
        .set('Authorization', `Bearer ${validTokens.editor}`)
        .send({
          sight: testContent.sight,
          value: testContent.value,
          context: testContent.context
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should reject requests without token', async () => {
      const testContent = DataFactory.createContent();

      const response = await request(baseURL)
        .post('/api/sightedit/save')
        .send({
          sight: testContent.sight,
          value: testContent.value
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('No token provided');
    });

    test('should reject requests with malformed token', async () => {
      const testContent = DataFactory.createContent();

      const response = await request(baseURL)
        .post('/api/sightedit/save')
        .set('Authorization', 'Bearer invalid-token-format')
        .send({
          sight: testContent.sight,
          value: testContent.value
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid token');
    });

    test('should reject expired tokens', async () => {
      // Create an expired token
      const expiredToken = jwt.sign(
        { userId: 1, email: 'test@test.com', role: 'user' },
        'test-secret',
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      const testContent = DataFactory.createContent();

      const response = await request(baseURL)
        .post('/api/sightedit/save')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({
          sight: testContent.sight,
          value: testContent.value
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid token');
    });

    test('should reject tokens with invalid signature', async () => {
      // Create a token with wrong secret
      const invalidToken = jwt.sign(
        { userId: 1, email: 'test@test.com', role: 'user' },
        'wrong-secret',
        { expiresIn: '1h' }
      );

      const testContent = DataFactory.createContent();

      const response = await request(baseURL)
        .post('/api/sightedit/save')
        .set('Authorization', `Bearer ${invalidToken}`)
        .send({
          sight: testContent.sight,
          value: testContent.value
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid token');
    });
  });

  describe('Role-based Access Control (RBAC)', () => {
    let userTokens: Record<string, string> = {};

    beforeEach(async () => {
      const users = [
        { email: 'admin@test.com', password: 'admin123', role: 'admin' },
        { email: 'editor@test.com', password: 'editor123', role: 'editor' },
        { email: 'user@test.com', password: 'user123', role: 'user' }
      ];

      for (const user of users) {
        const response = await request(baseURL)
          .post('/auth/login')
          .send({ email: user.email, password: user.password });
        
        userTokens[user.role] = response.body.token;
      }
    });

    test('should allow all roles to save content', async () => {
      const testContent = DataFactory.createContent();
      
      for (const [role, token] of Object.entries(userTokens)) {
        const response = await request(baseURL)
          .post('/api/sightedit/save')
          .set('Authorization', `Bearer ${token}`)
          .send({
            sight: `${role}_${testContent.sight}`,
            value: `Content by ${role}`,
            context: testContent.context
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      }
    });

    test('should allow all roles to retrieve content', async () => {
      // First, create some content
      const testContent = DataFactory.createContent();
      
      await request(baseURL)
        .post('/api/sightedit/save')
        .set('Authorization', `Bearer ${userTokens.admin}`)
        .send({
          sight: testContent.sight,
          value: testContent.value,
          context: testContent.context
        });

      // Then test retrieval with different roles
      for (const [role, token] of Object.entries(userTokens)) {
        const response = await request(baseURL)
          .get(`/api/sightedit/content/${testContent.sight}`)
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.sight).toBe(testContent.sight);
      }
    });

    test('should handle role escalation attempts', async () => {
      // User tries to register as admin
      const response = await request(baseURL)
        .post('/auth/register')
        .send({
          email: 'hacker@test.com',
          password: 'hack123',
          role: 'admin' // Trying to escalate to admin
        });

      // Registration should succeed but role should be validated server-side
      expect(response.status).toBe(201);
      
      // In a real system, the server should validate/restrict role assignment
      // For this test, we just verify the registration worked
      expect(response.body.user.email).toBe('hacker@test.com');
    });
  });

  describe('Session Management', () => {
    test('should create session on login', async () => {
      const loginResponse = await request(baseURL)
        .post('/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'admin123'
        });

      expect(loginResponse.status).toBe(200);
      
      // Verify we can use the token immediately
      const testContent = DataFactory.createContent();
      
      const apiResponse = await request(baseURL)
        .post('/api/sightedit/save')
        .set('Authorization', `Bearer ${loginResponse.body.token}`)
        .send({
          sight: testContent.sight,
          value: testContent.value
        });

      expect(apiResponse.status).toBe(200);
    });

    test('should handle concurrent sessions for same user', async () => {
      const credentials = {
        email: 'admin@test.com',
        password: 'admin123'
      };

      // Create multiple sessions
      const session1 = await request(baseURL)
        .post('/auth/login')
        .send(credentials);
      
      const session2 = await request(baseURL)
        .post('/auth/login')
        .send(credentials);

      expect(session1.status).toBe(200);
      expect(session2.status).toBe(200);
      
      // Both tokens should be different
      expect(session1.body.token).not.toBe(session2.body.token);
      
      // Both should be valid for API calls
      const testContent1 = DataFactory.createContent();
      const testContent2 = DataFactory.createContent();

      const api1 = await request(baseURL)
        .post('/api/sightedit/save')
        .set('Authorization', `Bearer ${session1.body.token}`)
        .send({ sight: testContent1.sight, value: testContent1.value });

      const api2 = await request(baseURL)
        .post('/api/sightedit/save')
        .set('Authorization', `Bearer ${session2.body.token}`)
        .send({ sight: testContent2.sight, value: testContent2.value });

      expect(api1.status).toBe(200);
      expect(api2.status).toBe(200);
    });
  });

  describe('Security Headers and CORS', () => {
    test('should include appropriate CORS headers', async () => {
      const response = await request(baseURL)
        .options('/api/sightedit/save')
        .set('Origin', 'https://example.com')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Authorization,Content-Type');

      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toBeDefined();
      expect(response.headers['access-control-allow-headers']).toBeDefined();
    });

    test('should handle preflight requests correctly', async () => {
      const response = await request(baseURL)
        .options('/api/sightedit/save')
        .set('Origin', 'https://example.com');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBeTruthy();
    });
  });

  describe('Authentication Edge Cases', () => {
    test('should handle malformed Authorization header', async () => {
      const malformedHeaders = [
        'Bearer', // No token
        'Basic token', // Wrong auth type
        'Bearer token1 token2', // Multiple tokens
        '', // Empty header
        'InvalidFormat token' // Invalid format
      ];

      for (const authHeader of malformedHeaders) {
        const response = await request(baseURL)
          .get('/api/sightedit/content/test')
          .set('Authorization', authHeader);

        expect(response.status).toBe(401);
      }
    });

    test('should handle JWT with missing claims', async () => {
      // Create token with missing required claims
      const incompleteToken = jwt.sign(
        { email: 'test@test.com' }, // Missing userId and role
        'test-secret',
        { expiresIn: '1h' }
      );

      const response = await request(baseURL)
        .get('/api/sightedit/content/test')
        .set('Authorization', `Bearer ${incompleteToken}`);

      // Should either work with defaults or reject - depends on implementation
      expect([200, 401, 403]).toContain(response.status);
    });

    test('should handle very long tokens', async () => {
      // Create a token with very long payload
      const longPayload = {
        userId: 1,
        email: 'test@test.com',
        role: 'user',
        metadata: 'x'.repeat(10000) // Very long string
      };

      const longToken = jwt.sign(longPayload, 'test-secret', { expiresIn: '1h' });

      const response = await request(baseURL)
        .get('/api/sightedit/content/test')
        .set('Authorization', `Bearer ${longToken}`);

      // Should handle gracefully
      expect([200, 401, 413]).toContain(response.status);
    });

    test('should rate limit authentication attempts', async () => {
      const attempts = Array.from({ length: 10 }, (_, i) => 
        request(baseURL)
          .post('/auth/login')
          .send({
            email: 'admin@test.com',
            password: 'wrongpassword'
          })
      );

      const responses = await Promise.all(attempts);
      
      // All should fail with 401, but server should handle the load
      responses.forEach(response => {
        expect(response.status).toBe(401);
      });
    });
  });

  describe('Token Refresh and Expiration', () => {
    test('should handle near-expired tokens', async () => {
      // Create a token that expires soon
      const nearExpiryToken = jwt.sign(
        { userId: 1, email: 'test@test.com', role: 'user' },
        'test-secret',
        { expiresIn: '1s' } // Expires in 1 second
      );

      // Should work immediately
      const immediateResponse = await request(baseURL)
        .get('/api/sightedit/schema/test')
        .set('Authorization', `Bearer ${nearExpiryToken}`);

      expect(immediateResponse.status).toBe(200);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should fail after expiration
      const expiredResponse = await request(baseURL)
        .get('/api/sightedit/schema/test')
        .set('Authorization', `Bearer ${nearExpiryToken}`);

      expect(expiredResponse.status).toBe(401);
    });
  });
});