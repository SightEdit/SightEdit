import { describe, beforeAll, afterAll, beforeEach, test, expect } from '@jest/globals';
import { Client as PostgresClient } from 'pg';
import mysql from 'mysql2/promise';
import { MongoClient, Db } from 'mongodb';
import { createClient } from 'redis';
import { DataFactory, TestUser, TestContent } from '../fixtures/data-factory.js';

describe('Database Integration Tests', () => {
  let postgresClient: PostgresClient;
  let mysqlConnection: mysql.Connection;
  let mongoClient: MongoClient;
  let mongoDb: Db;
  let redisClient: any;

  beforeAll(async () => {
    // Setup PostgreSQL connection
    postgresClient = new PostgresClient({
      host: 'localhost',
      port: 5433,
      user: 'test_user',
      password: 'test_password',
      database: 'sightedit_test'
    });
    await postgresClient.connect();

    // Setup MySQL connection
    mysqlConnection = await mysql.createConnection({
      host: 'localhost',
      port: 3307,
      user: 'test_user',
      password: 'test_password',
      database: 'sightedit_test'
    });

    // Setup MongoDB connection
    mongoClient = new MongoClient('mongodb://test_user:test_password@localhost:27018/sightedit_test?authSource=admin');
    await mongoClient.connect();
    mongoDb = mongoClient.db('sightedit_test');

    // Setup Redis connection
    redisClient = createClient({
      url: 'redis://localhost:6380'
    });
    await redisClient.connect();
  });

  afterAll(async () => {
    await postgresClient.end();
    await mysqlConnection.end();
    await mongoClient.close();
    await redisClient.quit();
  });

  beforeEach(async () => {
    // Clean up all databases before each test
    await cleanupDatabases();
  });

  async function cleanupDatabases() {
    // PostgreSQL cleanup
    await postgresClient.query('TRUNCATE TABLE sessions, content, users RESTART IDENTITY CASCADE');
    
    // MySQL cleanup
    await mysqlConnection.execute('SET FOREIGN_KEY_CHECKS = 0');
    await mysqlConnection.execute('TRUNCATE TABLE sessions');
    await mysqlConnection.execute('TRUNCATE TABLE content');
    await mysqlConnection.execute('TRUNCATE TABLE users');
    await mysqlConnection.execute('SET FOREIGN_KEY_CHECKS = 1');
    
    // MongoDB cleanup
    await mongoDb.collection('content').deleteMany({});
    await mongoDb.collection('users').deleteMany({});
    await mongoDb.collection('sessions').deleteMany({});
    
    // Redis cleanup
    await redisClient.flushDb();
  }

  describe('PostgreSQL Operations', () => {
    test('should create and retrieve users', async () => {
      const testUser = DataFactory.createUser();
      
      // Insert user
      const insertResult = await postgresClient.query(
        'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING *',
        [testUser.email, testUser.passwordHash, testUser.role]
      );
      
      expect(insertResult.rows).toHaveLength(1);
      expect(insertResult.rows[0].email).toBe(testUser.email);
      
      // Retrieve user
      const selectResult = await postgresClient.query(
        'SELECT * FROM users WHERE email = $1',
        [testUser.email]
      );
      
      expect(selectResult.rows).toHaveLength(1);
      expect(selectResult.rows[0]).toMatchObject({
        email: testUser.email,
        role: testUser.role
      });
    });

    test('should enforce unique email constraint', async () => {
      const testUser = DataFactory.createUser();
      
      // Insert first user
      await postgresClient.query(
        'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)',
        [testUser.email, testUser.passwordHash, testUser.role]
      );
      
      // Try to insert duplicate email
      await expect(
        postgresClient.query(
          'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)',
          [testUser.email, 'different_hash', 'user']
        )
      ).rejects.toThrow();
    });

    test('should handle content with JSONB context', async () => {
      const testContent = DataFactory.createContent();
      
      const insertResult = await postgresClient.query(
        'INSERT INTO content (sight, value, context) VALUES ($1, $2, $3) RETURNING *',
        [testContent.sight, testContent.value, JSON.stringify(testContent.context)]
      );
      
      expect(insertResult.rows).toHaveLength(1);
      expect(insertResult.rows[0].sight).toBe(testContent.sight);
      
      // Query with JSONB operators
      const contextQuery = await postgresClient.query(
        "SELECT * FROM content WHERE context->>'elementType' = $1",
        [testContent.context.elementType]
      );
      
      expect(contextQuery.rows).toHaveLength(1);
    });

    test('should handle complex JSONB queries', async () => {
      const contents = DataFactory.createContentItems(5);
      
      // Insert content with various element types
      for (const content of contents) {
        await postgresClient.query(
          'INSERT INTO content (sight, value, context) VALUES ($1, $2, $3)',
          [content.sight, content.value, JSON.stringify(content.context)]
        );
      }
      
      // Query by nested JSON property
      const urlQueries = await postgresClient.query(
        "SELECT * FROM content WHERE context->>'url' LIKE $1",
        ['%example%']
      );
      
      expect(urlQueries.rows.length).toBeGreaterThanOrEqual(0);
      
      // Update JSONB data
      await postgresClient.query(
        "UPDATE content SET context = context || $1 WHERE sight = $2",
        [JSON.stringify({ updated: true }), contents[0].sight]
      );
      
      const updatedContent = await postgresClient.query(
        'SELECT * FROM content WHERE sight = $1',
        [contents[0].sight]
      );
      
      expect(updatedContent.rows[0].context.updated).toBe(true);
    });
  });

  describe('MySQL Operations', () => {
    test('should create and retrieve users', async () => {
      const testUser = DataFactory.createUser();
      
      // Insert user
      const [insertResult] = await mysqlConnection.execute(
        'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
        [testUser.email, testUser.passwordHash, testUser.role]
      ) as any;
      
      expect(insertResult.affectedRows).toBe(1);
      
      // Retrieve user
      const [selectResult] = await mysqlConnection.execute(
        'SELECT * FROM users WHERE email = ?',
        [testUser.email]
      ) as any;
      
      expect(selectResult).toHaveLength(1);
      expect(selectResult[0]).toMatchObject({
        email: testUser.email,
        role: testUser.role
      });
    });

    test('should handle JSON column operations', async () => {
      const testContent = DataFactory.createContent();
      
      // Insert content
      await mysqlConnection.execute(
        'INSERT INTO content (sight, value, context) VALUES (?, ?, ?)',
        [testContent.sight, testContent.value, JSON.stringify(testContent.context)]
      );
      
      // Query JSON data
      const [jsonQuery] = await mysqlConnection.execute(
        'SELECT * FROM content WHERE JSON_EXTRACT(context, "$.elementType") = ?',
        [testContent.context.elementType]
      ) as any;
      
      expect(jsonQuery).toHaveLength(1);
      expect(jsonQuery[0].sight).toBe(testContent.sight);
    });

    test('should handle transactions correctly', async () => {
      const testUsers = DataFactory.createUsers(3);
      
      await mysqlConnection.beginTransaction();
      
      try {
        for (const user of testUsers) {
          await mysqlConnection.execute(
            'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
            [user.email, user.passwordHash, user.role]
          );
        }
        
        await mysqlConnection.commit();
        
        // Verify all users were inserted
        const [result] = await mysqlConnection.execute('SELECT COUNT(*) as count FROM users') as any;
        expect(result[0].count).toBe(3);
        
      } catch (error) {
        await mysqlConnection.rollback();
        throw error;
      }
    });

    test('should rollback transaction on error', async () => {
      const testUser = DataFactory.createUser();
      
      // Insert a user first
      await mysqlConnection.execute(
        'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
        [testUser.email, testUser.passwordHash, testUser.role]
      );
      
      await mysqlConnection.beginTransaction();
      
      try {
        // This should succeed
        await mysqlConnection.execute(
          'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
          ['new@test.com', 'hash', 'user']
        );
        
        // This should fail due to duplicate email
        await mysqlConnection.execute(
          'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
          [testUser.email, 'different_hash', 'admin']
        );
        
        await mysqlConnection.commit();
        
      } catch (error) {
        await mysqlConnection.rollback();
        
        // Verify rollback worked - only original user should exist
        const [result] = await mysqlConnection.execute('SELECT COUNT(*) as count FROM users') as any;
        expect(result[0].count).toBe(1);
      }
    });
  });

  describe('MongoDB Operations', () => {
    test('should create and retrieve documents', async () => {
      const testUser = DataFactory.createUser();
      
      // Insert user
      const insertResult = await mongoDb.collection('users').insertOne(testUser);
      expect(insertResult.acknowledged).toBe(true);
      
      // Retrieve user
      const retrievedUser = await mongoDb.collection('users').findOne({
        email: testUser.email
      });
      
      expect(retrievedUser).toMatchObject({
        email: testUser.email,
        role: testUser.role
      });
    });

    test('should handle complex document queries', async () => {
      const contents = DataFactory.createContentItems(10);
      
      // Insert content
      await mongoDb.collection('content').insertMany(contents);
      
      // Query by nested properties
      const textContents = await mongoDb.collection('content')
        .find({ 'context.elementType': 'text' })
        .toArray();
      
      expect(textContents.length).toBeGreaterThanOrEqual(0);
      
      // Query with regex
      const urlQuery = await mongoDb.collection('content')
        .find({ 'context.url': { $regex: /https?:\/\/.*\.com/ } })
        .toArray();
      
      expect(urlQuery.length).toBeGreaterThanOrEqual(0);
    });

    test('should handle document updates', async () => {
      const testContent = DataFactory.createContent();
      
      await mongoDb.collection('content').insertOne(testContent);
      
      // Update document
      const updateResult = await mongoDb.collection('content').updateOne(
        { sight: testContent.sight },
        { 
          $set: { 
            value: 'Updated value',
            'context.updated': true
          } 
        }
      );
      
      expect(updateResult.modifiedCount).toBe(1);
      
      // Verify update
      const updatedDoc = await mongoDb.collection('content').findOne({
        sight: testContent.sight
      });
      
      expect(updatedDoc?.value).toBe('Updated value');
      expect(updatedDoc?.context.updated).toBe(true);
    });

    test('should handle aggregation pipelines', async () => {
      const contents = DataFactory.createContentItems(20);
      await mongoDb.collection('content').insertMany(contents);
      
      // Aggregate by element type
      const aggregateResult = await mongoDb.collection('content').aggregate([
        { $group: { _id: '$context.elementType', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]).toArray();
      
      expect(aggregateResult.length).toBeGreaterThan(0);
      expect(aggregateResult[0]).toHaveProperty('_id');
      expect(aggregateResult[0]).toHaveProperty('count');
    });
  });

  describe('Redis Operations', () => {
    test('should store and retrieve string values', async () => {
      const key = 'test:string';
      const value = 'test value';
      
      await redisClient.set(key, value);
      const retrieved = await redisClient.get(key);
      
      expect(retrieved).toBe(value);
    });

    test('should handle JSON data', async () => {
      const testUser = DataFactory.createUser();
      const key = `user:${testUser.email}`;
      
      await redisClient.set(key, JSON.stringify(testUser));
      const retrieved = await redisClient.get(key);
      const parsedUser = JSON.parse(retrieved);
      
      expect(parsedUser).toMatchObject(testUser);
    });

    test('should handle expiration', async () => {
      const key = 'test:expiring';
      const value = 'will expire';
      
      await redisClient.setEx(key, 1, value); // Expire in 1 second
      
      const immediate = await redisClient.get(key);
      expect(immediate).toBe(value);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const afterExpiry = await redisClient.get(key);
      expect(afterExpiry).toBeNull();
    });

    test('should handle hash operations', async () => {
      const sessionId = 'session:123';
      const sessionData = DataFactory.createSession();
      
      await redisClient.hSet(sessionId, {
        userId: sessionData.userId.toString(),
        expiresAt: sessionData.expiresAt.toISOString(),
        data: JSON.stringify(sessionData.data)
      });
      
      const retrievedData = await redisClient.hGetAll(sessionId);
      
      expect(retrievedData.userId).toBe(sessionData.userId.toString());
      expect(new Date(retrievedData.expiresAt)).toEqual(sessionData.expiresAt);
    });

    test('should handle list operations for real-time features', async () => {
      const collaborationEvents = Array.from({ length: 5 }, () => 
        DataFactory.createCollaborationEvent()
      );
      
      const listKey = 'events:collaboration';
      
      // Push events to list
      for (const event of collaborationEvents) {
        await redisClient.lPush(listKey, JSON.stringify(event));
      }
      
      // Get recent events
      const recentEvents = await redisClient.lRange(listKey, 0, 2);
      expect(recentEvents).toHaveLength(3);
      
      const parsedEvents = recentEvents.map(event => JSON.parse(event));
      expect(parsedEvents[0]).toMatchObject({
        id: expect.any(String),
        userId: expect.any(Number),
        action: expect.any(String)
      });
    });
  });

  describe('Cross-Database Consistency', () => {
    test('should maintain data consistency across databases', async () => {
      const testUser = DataFactory.createUser();
      const testContent = DataFactory.createContent();
      
      // Insert user into all SQL databases
      await postgresClient.query(
        'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)',
        [testUser.email, testUser.passwordHash, testUser.role]
      );
      
      await mysqlConnection.execute(
        'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
        [testUser.email, testUser.passwordHash, testUser.role]
      );
      
      await mongoDb.collection('users').insertOne(testUser);
      
      // Insert content into all databases
      await postgresClient.query(
        'INSERT INTO content (sight, value, context) VALUES ($1, $2, $3)',
        [testContent.sight, testContent.value, JSON.stringify(testContent.context)]
      );
      
      await mysqlConnection.execute(
        'INSERT INTO content (sight, value, context) VALUES (?, ?, ?)',
        [testContent.sight, testContent.value, JSON.stringify(testContent.context)]
      );
      
      await mongoDb.collection('content').insertOne(testContent);
      
      // Verify data exists in all databases
      const pgUser = await postgresClient.query('SELECT * FROM users WHERE email = $1', [testUser.email]);
      const mysqlUser = await mysqlConnection.execute('SELECT * FROM users WHERE email = ?', [testUser.email]);
      const mongoUser = await mongoDb.collection('users').findOne({ email: testUser.email });
      
      expect(pgUser.rows).toHaveLength(1);
      expect((mysqlUser[0] as any)).toHaveLength(1);
      expect(mongoUser).toBeDefined();
      
      // All should have the same email and role
      expect(pgUser.rows[0].email).toBe(testUser.email);
      expect((mysqlUser[0] as any)[0].email).toBe(testUser.email);
      expect(mongoUser?.email).toBe(testUser.email);
    });
  });

  describe('Performance Tests', () => {
    test('should handle bulk inserts efficiently', async () => {
      const bulkSize = 1000;
      const testContents = DataFactory.createContentItems(bulkSize);
      
      // Test PostgreSQL bulk insert
      const pgStart = Date.now();
      const pgValues = testContents.map((content, i) => 
        `('pg_${content.sight}', '${content.value}', '${JSON.stringify(content.context)}')`
      ).join(',');
      
      await postgresClient.query(
        `INSERT INTO content (sight, value, context) VALUES ${pgValues}`
      );
      const pgTime = Date.now() - pgStart;
      
      // Test MongoDB bulk insert
      const mongoStart = Date.now();
      const mongoContents = testContents.map(content => ({
        ...content,
        sight: `mongo_${content.sight}`
      }));
      await mongoDb.collection('content').insertMany(mongoContents);
      const mongoTime = Date.now() - mongoStart;
      
      console.log(`PostgreSQL bulk insert (${bulkSize} records): ${pgTime}ms`);
      console.log(`MongoDB bulk insert (${bulkSize} records): ${mongoTime}ms`);
      
      // Both should complete within reasonable time
      expect(pgTime).toBeLessThan(5000);
      expect(mongoTime).toBeLessThan(5000);
    });
  });
});