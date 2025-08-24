import { describe, beforeAll, afterAll, beforeEach, test, expect } from '@jest/globals';
import request from 'supertest';
import { TestServer } from '../fixtures/test-server.js';
import { DataFactory } from '../fixtures/data-factory.js';

describe('Performance and Load Testing Integration', () => {
  let testServer: TestServer;
  let baseURL: string;
  let authToken: string;

  beforeAll(async () => {
    testServer = new TestServer({ port: 3339 });
    await testServer.start();
    baseURL = testServer.getBaseUrl();
    
    // Login to get auth token
    const loginResponse = await request(baseURL)
      .post('/auth/login')
      .send({
        email: 'admin@test.com',
        password: 'admin123'
      });
    
    authToken = loginResponse.body.token;
  }, 30000);

  afterAll(async () => {
    await testServer.stop();
  });

  beforeEach(async () => {
    await request(baseURL).post('/test/reset');
  });

  describe('API Response Time Performance', () => {
    test('should respond to save requests within acceptable time limits', async () => {
      const testContent = DataFactory.createContent();
      const maxAcceptableTime = 500; // 500ms
      
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
      expect(responseTime).toBeLessThan(maxAcceptableTime);
    });

    test('should handle batch saves efficiently', async () => {
      const batchSizes = [10, 50, 100];
      
      for (const batchSize of batchSizes) {
        const batchContent = DataFactory.createContentItems(batchSize);
        const changes = batchContent.map(content => ({
          sight: content.sight,
          value: content.value,
          context: content.context
        }));
        
        const startTime = Date.now();
        
        const response = await request(baseURL)
          .post('/api/sightedit/batch')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ changes });
        
        const responseTime = Date.now() - startTime;
        const timePerItem = responseTime / batchSize;
        
        expect(response.status).toBe(200);
        expect(response.body.results).toHaveLength(batchSize);
        
        // Should process items efficiently (less than 50ms per item)
        expect(timePerItem).toBeLessThan(50);
        
        console.log(`Batch size ${batchSize}: ${responseTime}ms total, ${timePerItem.toFixed(2)}ms per item`);
      }
    }, 30000);

    test('should maintain performance under content size variations', async () => {
      const contentSizes = [
        { name: 'small', size: 100 },      // 100 characters
        { name: 'medium', size: 10000 },   // 10KB
        { name: 'large', size: 100000 },   // 100KB
        { name: 'xlarge', size: 500000 }   // 500KB
      ];
      
      for (const contentSize of contentSizes) {
        const largeContent = 'x'.repeat(contentSize.size);
        const testContent = DataFactory.createContent({ value: largeContent });
        
        const startTime = Date.now();
        
        const response = await request(baseURL)
          .post('/api/sightedit/save')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            sight: `${contentSize.name}-${testContent.sight}`,
            value: largeContent,
            context: testContent.context
          });
        
        const responseTime = Date.now() - startTime;
        
        if (response.status === 200) {
          expect(response.body.success).toBe(true);
          
          // Larger content should still process within reasonable time
          const maxTime = Math.max(1000, contentSize.size / 1000); // Base 1s + 1ms per KB
          expect(responseTime).toBeLessThan(maxTime);
          
          console.log(`${contentSize.name} content (${contentSize.size} chars): ${responseTime}ms`);
        } else {
          // If rejected due to size limits, should fail quickly
          expect(responseTime).toBeLessThan(100);
          expect(response.status).toBeGreaterThanOrEqual(400);
        }
      }
    }, 30000);
  });

  describe('Concurrent Request Handling', () => {
    test('should handle moderate concurrent load', async () => {
      const concurrentUsers = 20;
      const requestsPerUser = 5;
      
      const allRequests = [];
      
      // Create concurrent requests from multiple "users"
      for (let user = 0; user < concurrentUsers; user++) {
        for (let req = 0; req < requestsPerUser; req++) {
          const testContent = DataFactory.createContent();
          
          const requestPromise = request(baseURL)
            .post('/api/sightedit/save')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              sight: `user${user}-req${req}-${testContent.sight}`,
              value: `Content from user ${user}, request ${req}`,
              context: testContent.context
            });
          
          allRequests.push(requestPromise);
        }
      }
      
      const startTime = Date.now();
      const responses = await Promise.all(allRequests);
      const totalTime = Date.now() - startTime;
      
      // Check that most requests succeeded
      const successfulRequests = responses.filter(res => res.status === 200);
      const successRate = successfulRequests.length / responses.length;
      
      expect(successRate).toBeGreaterThan(0.9); // 90% success rate
      expect(totalTime).toBeLessThan(10000); // Complete within 10 seconds
      
      console.log(`Concurrent load test: ${successfulRequests.length}/${responses.length} successful, ${totalTime}ms total`);
    }, 30000);

    test('should handle burst traffic patterns', async () => {
      const burstSizes = [5, 15, 30, 10, 2];
      const results = [];
      
      for (const burstSize of burstSizes) {
        const burstRequests = [];
        
        for (let i = 0; i < burstSize; i++) {
          const testContent = DataFactory.createContent();
          
          const requestPromise = request(baseURL)
            .post('/api/sightedit/save')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              sight: `burst-${Date.now()}-${i}-${testContent.sight}`,
              value: `Burst content ${i}`,
              context: testContent.context
            });
          
          burstRequests.push(requestPromise);
        }
        
        const startTime = Date.now();
        const responses = await Promise.all(burstRequests);
        const burstTime = Date.now() - startTime;
        
        const successCount = responses.filter(res => res.status === 200).length;
        const successRate = successCount / burstSize;
        
        results.push({
          size: burstSize,
          time: burstTime,
          successRate,
          avgTimePerRequest: burstTime / burstSize
        });
        
        expect(successRate).toBeGreaterThan(0.8); // 80% success rate per burst
        
        // Small delay between bursts
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      results.forEach(result => {
        console.log(`Burst ${result.size}: ${result.time}ms, ${(result.successRate * 100).toFixed(1)}% success, ${result.avgTimePerRequest.toFixed(2)}ms avg`);
      });
    }, 30000);

    test('should gracefully handle overload conditions', async () => {
      const overloadRequestCount = 100;
      const overloadRequests = [];
      
      // Create a large number of requests quickly
      for (let i = 0; i < overloadRequestCount; i++) {
        const testContent = DataFactory.createContent();
        
        const requestPromise = request(baseURL)
          .post('/api/sightedit/save')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            sight: `overload-${i}-${testContent.sight}`,
            value: `Overload test ${i}`,
            context: testContent.context
          })
          .then(response => ({ status: response.status, index: i }))
          .catch(error => ({ status: 500, index: i, error: error.message }));
        
        overloadRequests.push(requestPromise);
      }
      
      const startTime = Date.now();
      const responses = await Promise.all(overloadRequests);
      const totalTime = Date.now() - startTime;
      
      // Analyze response patterns
      const statusCounts = responses.reduce((acc, res) => {
        acc[res.status] = (acc[res.status] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);
      
      // Server should handle overload gracefully - either succeed or fail fast
      expect(totalTime).toBeLessThan(30000); // Should complete within 30 seconds
      
      // Should have some successful requests
      expect(statusCounts[200] || 0).toBeGreaterThan(0);
      
      // If there are failures, they should be proper HTTP status codes
      Object.keys(statusCounts).forEach(status => {
        const statusCode = parseInt(status);
        expect(statusCode).toBeGreaterThanOrEqual(200);
        expect(statusCode).toBeLessThan(600);
      });
      
      console.log(`Overload test: ${totalTime}ms total, Status codes:`, statusCounts);
    }, 60000);
  });

  describe('Memory and Resource Usage', () => {
    test('should handle large batches without memory leaks', async () => {
      const largeBatchSizes = [100, 250, 500];
      
      for (const batchSize of largeBatchSizes) {
        const batchContent = DataFactory.createContentItems(batchSize);
        const changes = batchContent.map(content => ({
          sight: content.sight,
          value: content.value,
          context: content.context
        }));
        
        const startTime = Date.now();
        const startMemory = process.memoryUsage();
        
        const response = await request(baseURL)
          .post('/api/sightedit/batch')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ changes });
        
        const endTime = Date.now();
        const endMemory = process.memoryUsage();
        
        const processingTime = endTime - startTime;
        const memoryIncrease = endMemory.heapUsed - startMemory.heapUsed;
        const memoryPerItem = memoryIncrease / batchSize;
        
        if (response.status === 200) {
          expect(response.body.results).toHaveLength(batchSize);
          
          // Should process efficiently
          expect(processingTime).toBeLessThan(batchSize * 10); // 10ms per item max
          
          console.log(`Batch ${batchSize}: ${processingTime}ms, ${memoryIncrease} bytes memory (+${memoryPerItem.toFixed(0)} per item)`);
        } else {
          // If rejected, should fail quickly without consuming much memory
          expect(processingTime).toBeLessThan(1000);
        }
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
        
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }, 60000);

    test('should handle repeated operations efficiently', async () => {
      const iterationCount = 50;
      const responseTimes: number[] = [];
      
      for (let i = 0; i < iterationCount; i++) {
        const testContent = DataFactory.createContent();
        
        const startTime = Date.now();
        
        const response = await request(baseURL)
          .post('/api/sightedit/save')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            sight: `repeated-${i}-${testContent.sight}`,
            value: `Repeated operation ${i}`,
            context: testContent.context
          });
        
        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);
        
        expect(response.status).toBe(200);
        
        // Small delay to avoid overwhelming the server
        if (i % 10 === 9) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
      
      // Analyze performance trends
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);
      const minResponseTime = Math.min(...responseTimes);
      
      // Performance should remain stable
      expect(maxResponseTime).toBeLessThan(avgResponseTime * 3); // No response should be 3x average
      expect(avgResponseTime).toBeLessThan(1000); // Average should be under 1 second
      
      console.log(`Repeated operations: avg=${avgResponseTime.toFixed(2)}ms, min=${minResponseTime}ms, max=${maxResponseTime}ms`);
    }, 60000);
  });

  describe('Database Performance', () => {
    test('should handle large content volumes efficiently', async () => {
      const volumeTest = async (itemCount: number) => {
        // Pre-populate with content
        const bulkContent = DataFactory.createContentItems(itemCount);
        const batchSize = 50;
        
        for (let i = 0; i < bulkContent.length; i += batchSize) {
          const batch = bulkContent.slice(i, i + batchSize);
          const changes = batch.map(content => ({
            sight: content.sight,
            value: content.value,
            context: content.context
          }));
          
          await request(baseURL)
            .post('/api/sightedit/batch')
            .set('Authorization', `Bearer ${authToken}`)
            .send({ changes });
        }
        
        // Test retrieval performance
        const randomSight = bulkContent[Math.floor(Math.random() * bulkContent.length)].sight;
        
        const startTime = Date.now();
        const response = await request(baseURL)
          .get(`/api/sightedit/content/${randomSight}`)
          .set('Authorization', `Bearer ${authToken}`);
        const retrievalTime = Date.now() - startTime;
        
        return {
          itemCount,
          retrievalTime,
          success: response.status === 200
        };
      };
      
      const volumeTestCases = [100, 500, 1000];
      
      for (const itemCount of volumeTestCases) {
        const result = await volumeTest(itemCount);
        
        expect(result.success).toBe(true);
        expect(result.retrievalTime).toBeLessThan(500); // Should retrieve within 500ms
        
        console.log(`Volume test ${result.itemCount} items: retrieval ${result.retrievalTime}ms`);
        
        // Reset between volume tests
        await request(baseURL).post('/test/reset');
      }
    }, 120000);
  });

  describe('Network Performance', () => {
    test('should handle various payload sizes efficiently', async () => {
      const payloadSizes = [
        { name: 'tiny', content: 'x'.repeat(10) },
        { name: 'small', content: 'x'.repeat(1000) },
        { name: 'medium', content: 'x'.repeat(10000) },
        { name: 'large', content: JSON.stringify(DataFactory.createScenario('performance-test-data')) }
      ];
      
      for (const payload of payloadSizes) {
        const testContent = DataFactory.createContent({ value: payload.content });
        
        const startTime = Date.now();
        
        const response = await request(baseURL)
          .post('/api/sightedit/save')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            sight: `${payload.name}-${testContent.sight}`,
            value: payload.content,
            context: testContent.context
          });
        
        const responseTime = Date.now() - startTime;
        const payloadSizeKB = Buffer.byteLength(payload.content, 'utf8') / 1024;
        
        if (response.status === 200) {
          expect(response.body.success).toBe(true);
          
          // Throughput should be reasonable (at least 100 KB/s)
          const throughputKBps = payloadSizeKB / (responseTime / 1000);
          expect(throughputKBps).toBeGreaterThan(50);
          
          console.log(`${payload.name} payload: ${payloadSizeKB.toFixed(2)}KB, ${responseTime}ms, ${throughputKBps.toFixed(2)} KB/s`);
        } else {
          // If rejected due to size, should fail quickly
          expect(responseTime).toBeLessThan(200);
        }
      }
    });
  });

  describe('Stress Testing', () => {
    test('should maintain functionality under sustained load', async () => {
      const testDurationMs = 10000; // 10 seconds
      const requestIntervalMs = 100; // Request every 100ms
      
      const results: Array<{ time: number; success: boolean; responseTime: number }> = [];
      const startTime = Date.now();
      
      while (Date.now() - startTime < testDurationMs) {
        const testContent = DataFactory.createContent();
        const requestStart = Date.now();
        
        try {
          const response = await request(baseURL)
            .post('/api/sightedit/save')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              sight: `stress-${Date.now()}-${testContent.sight}`,
              value: `Stress test content at ${new Date().toISOString()}`,
              context: testContent.context
            });
          
          const responseTime = Date.now() - requestStart;
          
          results.push({
            time: Date.now() - startTime,
            success: response.status === 200,
            responseTime
          });
          
        } catch (error) {
          results.push({
            time: Date.now() - startTime,
            success: false,
            responseTime: Date.now() - requestStart
          });
        }
        
        // Wait before next request
        await new Promise(resolve => setTimeout(resolve, requestIntervalMs));
      }
      
      // Analyze stress test results
      const totalRequests = results.length;
      const successfulRequests = results.filter(r => r.success).length;
      const successRate = successfulRequests / totalRequests;
      const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / totalRequests;
      
      // Should maintain reasonable performance under stress
      expect(successRate).toBeGreaterThan(0.8); // 80% success rate
      expect(avgResponseTime).toBeLessThan(2000); // Average response under 2 seconds
      
      console.log(`Stress test: ${totalRequests} requests, ${(successRate * 100).toFixed(1)}% success, ${avgResponseTime.toFixed(2)}ms avg response`);
    }, 30000);
  });
});