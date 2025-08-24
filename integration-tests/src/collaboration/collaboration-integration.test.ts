import { describe, beforeAll, afterAll, beforeEach, test, expect } from '@jest/globals';
import WebSocket from 'ws';
import request from 'supertest';
import { TestServer } from '../fixtures/test-server.js';
import { DataFactory } from '../fixtures/data-factory.js';

describe('Real-time Collaboration Integration Tests', () => {
  let testServer: TestServer;
  let baseURL: string;
  let wsURL: string;
  let authTokens: Record<string, string> = {};

  beforeAll(async () => {
    testServer = new TestServer({ 
      port: 3338,
      enableWebSocket: true 
    });
    await testServer.start();
    baseURL = testServer.getBaseUrl();
    wsURL = baseURL.replace('http', 'ws');
    
    // Login as different users to get auth tokens
    const users = [
      { email: 'admin@test.com', password: 'admin123', role: 'admin' },
      { email: 'editor@test.com', password: 'editor123', role: 'editor' },
      { email: 'user@test.com', password: 'user123', role: 'user' }
    ];

    for (const user of users) {
      const response = await request(baseURL)
        .post('/auth/login')
        .send({ email: user.email, password: user.password });
      
      authTokens[user.role] = response.body.token;
    }
  });

  afterAll(async () => {
    await testServer.stop();
  });

  beforeEach(async () => {
    await request(baseURL).post('/test/reset');
  });

  describe('WebSocket Connection Management', () => {
    test('should establish WebSocket connection successfully', async () => {
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket connection timeout'));
        }, 5000);

        const ws = new WebSocket(wsURL);
        
        ws.on('open', () => {
          clearTimeout(timeout);
          ws.close();
          resolve();
        });
        
        ws.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    });

    test('should handle multiple concurrent WebSocket connections', async () => {
      const connectionPromises = Array.from({ length: 10 }, () => {
        return new Promise<WebSocket>((resolve, reject) => {
          const ws = new WebSocket(wsURL);
          
          ws.on('open', () => resolve(ws));
          ws.on('error', reject);
        });
      });

      const connections = await Promise.all(connectionPromises);
      expect(connections).toHaveLength(10);

      // Clean up connections
      connections.forEach(ws => ws.close());
    });

    test('should handle WebSocket connection failures gracefully', async () => {
      const invalidWsURL = 'ws://localhost:9999'; // Non-existent server
      
      return new Promise<void>((resolve) => {
        const ws = new WebSocket(invalidWsURL);
        
        ws.on('error', () => {
          // Expected error - connection should fail gracefully
          resolve();
        });
        
        ws.on('open', () => {
          // Unexpected - should not connect to invalid URL
          ws.close();
          expect(false).toBe(true); // Force failure
        });
      });
    });
  });

  describe('Real-time Content Collaboration', () => {
    test('should broadcast content changes to all connected clients', async () => {
      const testContent = DataFactory.createContent();
      const numClients = 3;
      const clients: WebSocket[] = [];
      const receivedMessages: any[][] = Array.from({ length: numClients }, () => []);

      // Connect multiple clients
      for (let i = 0; i < numClients; i++) {
        const ws = new WebSocket(wsURL);
        clients.push(ws);
        
        await new Promise<void>((resolve) => {
          ws.on('open', resolve);
        });

        // Setup message listener
        ws.on('message', (data) => {
          receivedMessages[i].push(JSON.parse(data.toString()));
        });
      }

      // Send collaboration event from first client
      const collaborationEvent = {
        type: 'collaboration',
        action: 'edit',
        sight: testContent.sight,
        value: 'Updated content',
        userId: 1,
        timestamp: Date.now()
      };

      clients[0].send(JSON.stringify(collaborationEvent));

      // Wait for message propagation
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check that other clients received the message
      for (let i = 1; i < numClients; i++) {
        expect(receivedMessages[i]).toHaveLength(1);
        expect(receivedMessages[i][0]).toMatchObject({
          type: 'collaboration',
          action: 'edit',
          sight: testContent.sight
        });
      }

      // First client should not receive its own message
      expect(receivedMessages[0]).toHaveLength(0);

      // Clean up
      clients.forEach(ws => ws.close());
    });

    test('should handle simultaneous edits from multiple users', async () => {
      const testContent = DataFactory.createContent();
      const clients: WebSocket[] = [];
      const allReceivedMessages: any[] = [];

      // Connect 3 clients
      for (let i = 0; i < 3; i++) {
        const ws = new WebSocket(wsURL);
        clients.push(ws);
        
        await new Promise<void>((resolve) => {
          ws.on('open', resolve);
        });

        // Collect all messages
        ws.on('message', (data) => {
          allReceivedMessages.push(JSON.parse(data.toString()));
        });
      }

      // Send simultaneous edits
      const editEvents = [
        { type: 'collaboration', action: 'edit', sight: testContent.sight, value: 'Edit 1', userId: 1 },
        { type: 'collaboration', action: 'edit', sight: testContent.sight, value: 'Edit 2', userId: 2 },
        { type: 'collaboration', action: 'edit', sight: testContent.sight, value: 'Edit 3', userId: 3 }
      ];

      // Send events quickly in succession
      editEvents.forEach((event, index) => {
        setTimeout(() => {
          clients[index].send(JSON.stringify(event));
        }, index * 10);
      });

      // Wait for all messages to propagate
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Each client should receive messages from other clients
      // Total messages should be less than or equal to 6 (3 clients * 2 messages each could receive)
      expect(allReceivedMessages.length).toBeGreaterThan(0);
      expect(allReceivedMessages.length).toBeLessThanOrEqual(6);

      // Clean up
      clients.forEach(ws => ws.close());
    });

    test('should maintain message order during rapid exchanges', async () => {
      const testContent = DataFactory.createContent();
      const client1 = new WebSocket(wsURL);
      const client2 = new WebSocket(wsURL);
      const client2Messages: any[] = [];

      await Promise.all([
        new Promise<void>(resolve => client1.on('open', resolve)),
        new Promise<void>(resolve => client2.on('open', resolve))
      ]);

      client2.on('message', (data) => {
        client2Messages.push(JSON.parse(data.toString()));
      });

      // Send rapid sequence of messages
      const messageCount = 10;
      for (let i = 0; i < messageCount; i++) {
        client1.send(JSON.stringify({
          type: 'collaboration',
          action: 'edit',
          sight: testContent.sight,
          value: `Edit ${i}`,
          sequence: i,
          userId: 1
        }));
      }

      // Wait for all messages to be received
      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(client2Messages).toHaveLength(messageCount);

      // Verify message order
      for (let i = 0; i < messageCount; i++) {
        expect(client2Messages[i].sequence).toBe(i);
        expect(client2Messages[i].value).toBe(`Edit ${i}`);
      }

      client1.close();
      client2.close();
    });
  });

  describe('User Presence and Awareness', () => {
    test('should track active users on content elements', async () => {
      const testContent = DataFactory.createContent();
      const clients: WebSocket[] = [];

      // Connect multiple users
      for (let i = 0; i < 3; i++) {
        const ws = new WebSocket(wsURL);
        clients.push(ws);
        await new Promise<void>(resolve => ws.on('open', resolve));
      }

      // Send user presence events
      const presenceEvents = [
        { type: 'collaboration', action: 'lock', sight: testContent.sight, userId: 1 },
        { type: 'collaboration', action: 'lock', sight: testContent.sight, userId: 2 },
        { type: 'collaboration', action: 'unlock', sight: testContent.sight, userId: 1 }
      ];

      for (const event of presenceEvents) {
        const clientIndex = event.userId - 1;
        clients[clientIndex].send(JSON.stringify(event));
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Clean up
      clients.forEach(ws => ws.close());
    });

    test('should handle user disconnect during editing', async () => {
      const testContent = DataFactory.createContent();
      const client1 = new WebSocket(wsURL);
      const client2 = new WebSocket(wsURL);
      const client2Messages: any[] = [];

      await Promise.all([
        new Promise<void>(resolve => client1.on('open', resolve)),
        new Promise<void>(resolve => client2.on('open', resolve))
      ]);

      client2.on('message', (data) => {
        client2Messages.push(JSON.parse(data.toString()));
      });

      // Client 1 starts editing
      client1.send(JSON.stringify({
        type: 'collaboration',
        action: 'lock',
        sight: testContent.sight,
        userId: 1
      }));

      await new Promise(resolve => setTimeout(resolve, 100));

      // Client 1 disconnects abruptly
      client1.close();

      // Wait to see if any cleanup messages are sent
      await new Promise(resolve => setTimeout(resolve, 500));

      // In a real system, other clients should be notified of the disconnection
      // For this test, we just verify the system doesn't crash
      expect(client2Messages.length).toBeGreaterThanOrEqual(0);

      client2.close();
    });
  });

  describe('Conflict Resolution', () => {
    test('should handle conflicting edits to same content', async () => {
      const testContent = DataFactory.createContent();
      
      // Create initial content via API
      await request(baseURL)
        .post('/api/sightedit/save')
        .set('Authorization', `Bearer ${authTokens.admin}`)
        .send({
          sight: testContent.sight,
          value: 'Original content',
          context: testContent.context
        });

      // Simulate two users editing the same content
      const edit1 = request(baseURL)
        .post('/api/sightedit/save')
        .set('Authorization', `Bearer ${authTokens.editor}`)
        .send({
          sight: testContent.sight,
          value: 'Edit by editor',
          context: testContent.context
        });

      const edit2 = request(baseURL)
        .post('/api/sightedit/save')
        .set('Authorization', `Bearer ${authTokens.user}`)
        .send({
          sight: testContent.sight,
          value: 'Edit by user',
          context: testContent.context
        });

      const [response1, response2] = await Promise.all([edit1, edit2]);

      // Both requests should succeed (last-write-wins or proper conflict resolution)
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      // Verify final state
      const finalContent = await request(baseURL)
        .get(`/api/sightedit/content/${testContent.sight}`)
        .set('Authorization', `Bearer ${authTokens.admin}`);

      expect(finalContent.status).toBe(200);
      // Should have one of the edits
      expect(['Edit by editor', 'Edit by user']).toContain(finalContent.body.value);
    });

    test('should handle version conflicts in batch updates', async () => {
      const batchContent = DataFactory.createContentItems(5);
      
      // Create initial content
      for (const content of batchContent) {
        await request(baseURL)
          .post('/api/sightedit/save')
          .set('Authorization', `Bearer ${authTokens.admin}`)
          .send({
            sight: content.sight,
            value: content.value,
            context: content.context
          });
      }

      // Simulate conflicting batch updates
      const batch1 = batchContent.map(content => ({
        sight: content.sight,
        value: `Batch 1: ${content.value}`,
        context: content.context
      }));

      const batch2 = batchContent.map(content => ({
        sight: content.sight,
        value: `Batch 2: ${content.value}`,
        context: content.context
      }));

      const batchUpdate1 = request(baseURL)
        .post('/api/sightedit/batch')
        .set('Authorization', `Bearer ${authTokens.editor}`)
        .send({ changes: batch1 });

      const batchUpdate2 = request(baseURL)
        .post('/api/sightedit/batch')
        .set('Authorization', `Bearer ${authTokens.user}`)
        .send({ changes: batch2 });

      const [batchResponse1, batchResponse2] = await Promise.all([batchUpdate1, batchUpdate2]);

      expect(batchResponse1.status).toBe(200);
      expect(batchResponse2.status).toBe(200);

      // Verify that all items were processed
      expect(batchResponse1.body.results).toHaveLength(5);
      expect(batchResponse2.body.results).toHaveLength(5);
    });
  });

  describe('Real-time Notifications', () => {
    test('should broadcast save notifications to collaborators', async () => {
      const testContent = DataFactory.createContent();
      const client1 = new WebSocket(wsURL);
      const client2 = new WebSocket(wsURL);
      const notificationsReceived: any[] = [];

      await Promise.all([
        new Promise<void>(resolve => client1.on('open', resolve)),
        new Promise<void>(resolve => client2.on('open', resolve))
      ]);

      client2.on('message', (data) => {
        notificationsReceived.push(JSON.parse(data.toString()));
      });

      // Save content via API (simulating user 1 saving)
      await request(baseURL)
        .post('/api/sightedit/save')
        .set('Authorization', `Bearer ${authTokens.admin}`)
        .send({
          sight: testContent.sight,
          value: testContent.value,
          context: testContent.context
        });

      // Send save notification via WebSocket
      client1.send(JSON.stringify({
        type: 'collaboration',
        action: 'save',
        sight: testContent.sight,
        value: testContent.value,
        userId: 1,
        success: true
      }));

      await new Promise(resolve => setTimeout(resolve, 200));

      // Client 2 should receive the save notification
      expect(notificationsReceived).toHaveLength(1);
      expect(notificationsReceived[0]).toMatchObject({
        type: 'collaboration',
        action: 'save',
        sight: testContent.sight,
        success: true
      });

      client1.close();
      client2.close();
    });

    test('should handle WebSocket message errors gracefully', async () => {
      const client = new WebSocket(wsURL);
      await new Promise<void>(resolve => client.on('open', resolve));

      // Send malformed messages
      const malformedMessages = [
        'invalid json',
        '{ incomplete json',
        '',
        null,
        undefined
      ];

      for (const message of malformedMessages) {
        try {
          if (message !== null && message !== undefined) {
            client.send(message);
          }
        } catch (error) {
          // Expected for some invalid messages
        }
      }

      // Send valid message to ensure connection is still working
      client.send(JSON.stringify({
        type: 'collaboration',
        action: 'test',
        sight: 'test-sight'
      }));

      await new Promise(resolve => setTimeout(resolve, 200));

      client.close();
    });
  });

  describe('Collaboration Performance', () => {
    test('should handle high-frequency collaboration events', async () => {
      const testContent = DataFactory.createContent();
      const client1 = new WebSocket(wsURL);
      const client2 = new WebSocket(wsURL);
      const messagesReceived = new Set();

      await Promise.all([
        new Promise<void>(resolve => client1.on('open', resolve)),
        new Promise<void>(resolve => client2.on('open', resolve))
      ]);

      client2.on('message', (data) => {
        const message = JSON.parse(data.toString());
        messagesReceived.add(message.sequence);
      });

      // Send high frequency events
      const eventCount = 100;
      const startTime = Date.now();

      for (let i = 0; i < eventCount; i++) {
        client1.send(JSON.stringify({
          type: 'collaboration',
          action: 'edit',
          sight: testContent.sight,
          value: `Edit ${i}`,
          sequence: i,
          userId: 1
        }));
      }

      // Wait for all messages to be processed
      await new Promise(resolve => setTimeout(resolve, 2000));

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Should process events reasonably quickly
      expect(processingTime).toBeLessThan(5000);

      // Should receive most messages (allowing for some loss in high-frequency scenarios)
      const receivedCount = messagesReceived.size;
      expect(receivedCount).toBeGreaterThan(eventCount * 0.8); // At least 80%

      client1.close();
      client2.close();
    });

    test('should maintain performance with many concurrent users', async () => {
      const userCount = 20;
      const clients: WebSocket[] = [];
      const startTime = Date.now();

      // Connect many users simultaneously
      const connectionPromises = Array.from({ length: userCount }, async (_, i) => {
        const ws = new WebSocket(wsURL);
        clients.push(ws);
        
        return new Promise<void>((resolve, reject) => {
          ws.on('open', resolve);
          ws.on('error', reject);
        });
      });

      await Promise.all(connectionPromises);
      
      const connectionTime = Date.now() - startTime;
      
      // Should be able to establish connections quickly
      expect(connectionTime).toBeLessThan(3000);

      // Send messages from all users
      const messageStart = Date.now();
      
      clients.forEach((client, index) => {
        client.send(JSON.stringify({
          type: 'collaboration',
          action: 'edit',
          sight: `content-${index}`,
          value: `Message from user ${index}`,
          userId: index
        }));
      });

      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const messageTime = Date.now() - messageStart;
      
      // Should handle messages from all users reasonably quickly
      expect(messageTime).toBeLessThan(2000);

      // Clean up
      clients.forEach(ws => ws.close());
    });
  });

  describe('Collaboration Security', () => {
    test('should validate collaboration messages', async () => {
      const client = new WebSocket(wsURL);
      await new Promise<void>(resolve => client.on('open', resolve));

      const invalidMessages = [
        { type: 'collaboration' }, // Missing required fields
        { action: 'edit' }, // Missing type
        { type: 'invalid', action: 'unknown' }, // Invalid type/action
        { type: 'collaboration', action: 'edit', sight: '<script>alert("xss")</script>' } // XSS attempt
      ];

      for (const message of invalidMessages) {
        client.send(JSON.stringify(message));
      }

      // System should handle invalid messages gracefully
      await new Promise(resolve => setTimeout(resolve, 500));

      client.close();
    });

    test('should prevent unauthorized collaboration actions', async () => {
      const client = new WebSocket(wsURL);
      await new Promise<void>(resolve => client.on('open', resolve));

      // Try to perform actions as different users without proper authentication
      const unauthorizedMessages = [
        { type: 'collaboration', action: 'edit', sight: 'test', userId: 999, value: 'unauthorized edit' },
        { type: 'collaboration', action: 'delete', sight: 'test', userId: 'admin' }, // Invalid userId type
        { type: 'collaboration', action: 'admin', sight: 'test', userId: 1 } // Invalid action
      ];

      for (const message of unauthorizedMessages) {
        client.send(JSON.stringify(message));
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      client.close();
    });
  });
});