import { describe, beforeAll, afterAll, beforeEach, afterEach, test, expect } from '@jest/globals';
import request from 'supertest';
import { TestServer } from '../fixtures/test-server.js';
import { DataFactory } from '../fixtures/data-factory.js';

describe('SightEdit API Integration Tests', () => {
  let testServer: TestServer;
  let baseURL: string;
  let authToken: string;

  beforeAll(async () => {
    testServer = new TestServer({ port: 3335 });
    await testServer.start();
    baseURL = testServer.getBaseUrl();
  });

  afterAll(async () => {
    await testServer.stop();
  });

  beforeEach(async () => {
    // Reset test data before each test
    await request(baseURL).post('/test/reset');
    
    // Login to get auth token
    const loginResponse = await request(baseURL)
      .post('/auth/login')
      .send({
        email: 'editor@test.com',
        password: 'editor123'
      });
    
    expect(loginResponse.status).toBe(200);
    authToken = loginResponse.body.token;
  });

  describe('Content Save Endpoint', () => {
    test('should save content successfully with valid data', async () => {
      const testContent = DataFactory.createContent();
      
      const response = await request(baseURL)
        .post('/api/sightedit/save')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sight: testContent.sight,
          value: testContent.value,
          context: testContent.context
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        sight: testContent.sight
      });
      expect(response.body.id).toBeDefined();
    });

    test('should reject content save without authentication', async () => {
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

    test('should reject content save with invalid token', async () => {
      const testContent = DataFactory.createContent();
      
      const response = await request(baseURL)
        .post('/api/sightedit/save')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          sight: testContent.sight,
          value: testContent.value
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid token');
    });

    test('should reject content save without required fields', async () => {
      const response = await request(baseURL)
        .post('/api/sightedit/save')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Missing sight and value
          context: DataFactory.createContent().context
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required fields');
    });

    test('should handle various content types correctly', async () => {
      const contentTypes = [
        { type: 'text', value: 'Plain text content' },
        { type: 'richtext', value: '<p>Rich <strong>text</strong> content</p>' },
        { type: 'json', value: { key: 'value', nested: { data: 123 } } },
        { type: 'number', value: 42.5 },
        { type: 'boolean', value: true },
        { type: 'array', value: ['item1', 'item2', 'item3'] }
      ];

      for (const { type, value } of contentTypes) {
        const testContent = DataFactory.createContent({ value });
        
        const response = await request(baseURL)
          .post('/api/sightedit/save')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            sight: `${type}_${testContent.sight}`,
            value,
            context: { ...testContent.context, elementType: type }
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      }
    });
  });

  describe('Batch Save Endpoint', () => {
    test('should save multiple content items successfully', async () => {
      const changes = DataFactory.createContentItems(5).map(content => ({
        sight: content.sight,
        value: content.value,
        context: content.context
      }));

      const response = await request(baseURL)
        .post('/api/sightedit/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ changes });

      expect(response.status).toBe(200);
      expect(response.body.results).toHaveLength(5);
      
      response.body.results.forEach((result: any, index: number) => {
        expect(result).toMatchObject({
          index,
          success: true,
          sight: changes[index].sight
        });
        expect(result.id).toBeDefined();
      });
    });

    test('should handle mixed success/failure in batch save', async () => {
      const changes = [
        // Valid change
        {
          sight: 'valid_sight',
          value: 'Valid content',
          context: DataFactory.createContent().context
        },
        // Invalid change - missing sight
        {
          value: 'Invalid content'
        },
        // Valid change
        {
          sight: 'another_valid_sight',
          value: 'More valid content',
          context: DataFactory.createContent().context
        }
      ];

      const response = await request(baseURL)
        .post('/api/sightedit/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ changes });

      expect(response.status).toBe(200);
      expect(response.body.results).toHaveLength(3);
      expect(response.body.results[0].success).toBe(true);
      expect(response.body.results[1].success).toBe(false);
      expect(response.body.results[1].error).toBe('Missing required fields');
      expect(response.body.results[2].success).toBe(true);
    });

    test('should reject batch save with invalid data format', async () => {
      const response = await request(baseURL)
        .post('/api/sightedit/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          changes: 'not-an-array'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Changes must be an array');
    });
  });

  describe('Content Retrieval Endpoint', () => {
    test('should retrieve existing content', async () => {
      // First, save some content
      const testContent = DataFactory.createContent();
      const saveResponse = await request(baseURL)
        .post('/api/sightedit/save')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sight: testContent.sight,
          value: testContent.value,
          context: testContent.context
        });

      expect(saveResponse.status).toBe(200);

      // Then retrieve it
      const getResponse = await request(baseURL)
        .get(`/api/sightedit/content/${testContent.sight}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body).toMatchObject({
        sight: testContent.sight,
        value: testContent.value
      });
    });

    test('should return 404 for non-existent content', async () => {
      const response = await request(baseURL)
        .get('/api/sightedit/content/non-existent-sight')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Content not found');
    });
  });

  describe('Schema Endpoint', () => {
    test('should return schema for any sight identifier', async () => {
      const sightId = 'test-sight-123';
      
      const response = await request(baseURL)
        .get(`/api/sightedit/schema/${sightId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        sight: sightId,
        type: expect.any(String),
        validation: expect.any(Object),
        ui: expect.any(Object)
      });
    });
  });

  describe('File Upload Endpoint', () => {
    test('should handle file upload request', async () => {
      const response = await request(baseURL)
        .post('/api/sightedit/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from('fake file content'), 'test.jpg');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        fileId: expect.any(String),
        url: expect.any(String),
        size: expect.any(Number),
        type: expect.any(String)
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed JSON requests', async () => {
      const response = await request(baseURL)
        .post('/api/sightedit/save')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(response.status).toBe(400);
    });

    test('should handle oversized requests', async () => {
      const largeContent = 'x'.repeat(11 * 1024 * 1024); // 11MB
      
      const response = await request(baseURL)
        .post('/api/sightedit/save')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sight: 'large-content',
          value: largeContent
        });

      expect(response.status).toBe(413);
    });
  });

  describe('Response Performance', () => {
    test('should respond to save requests within acceptable time', async () => {
      const testContent = DataFactory.createContent();
      const startTime = Date.now();
      
      const response = await request(baseURL)
        .post('/api/sightedit/save')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sight: testContent.sight,
          value: testContent.value,
          context: testContent.context
        });

      const responseTime = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(500); // Should respond within 500ms
    });

    test('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = 10;
      const promises = Array.from({ length: concurrentRequests }, (_, i) => {
        const testContent = DataFactory.createContent();
        return request(baseURL)
          .post('/api/sightedit/save')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            sight: `concurrent_${i}_${testContent.sight}`,
            value: testContent.value,
            context: testContent.context
          });
      });

      const startTime = Date.now();
      const responses = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      // All requests should complete within 2 seconds
      expect(totalTime).toBeLessThan(2000);
    });
  });

  describe('Content Validation', () => {
    test('should accept valid HTML in richtext content', async () => {
      const validHtml = '<p>Valid <em>HTML</em> content with <a href="#">links</a></p>';
      
      const response = await request(baseURL)
        .post('/api/sightedit/save')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sight: 'html-content',
          value: validHtml,
          context: { elementType: 'richtext' }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should handle Unicode content correctly', async () => {
      const unicodeContent = '你好世界 🌍 مرحبا بالعالم';
      
      const response = await request(baseURL)
        .post('/api/sightedit/save')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sight: 'unicode-content',
          value: unicodeContent
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});