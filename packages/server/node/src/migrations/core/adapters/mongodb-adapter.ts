import { DatabaseAdapter } from './database-adapter';
import { DatabaseConnection } from '../migration-engine';

export class MongoDBAdapter extends DatabaseAdapter {
  protected getDefaultPort(): number {
    return 27017;
  }

  async connect(): Promise<DatabaseConnection> {
    const { MongoClient } = await import('mongodb');
    let connectionString: string;
    let databaseName: string;

    if (typeof this.config.connection === 'string') {
      connectionString = this.config.connection;
      const url = new URL(connectionString);
      databaseName = url.pathname.slice(1) || 'sightedit';
    } else {
      const params = this.getConnectionParams();
      connectionString = `mongodb://${params.username}:${params.password}@${params.host}:${params.port}`;
      databaseName = params.database;
    }

    const client = new MongoClient(connectionString);
    await client.connect();
    
    const database = client.db(databaseName);
    let session: any = null;

    return {
      type: 'mongodb',
      database: databaseName,
      
      async query(command: string, params?: any[]): Promise<any> {
        try {
          // Parse MongoDB shell commands
          if (command.startsWith('db.')) {
            return await this.executeMongoCommand(database, command, session);
          } else {
            // Handle raw JavaScript for MongoDB
            const func = new Function('db', 'session', command);
            return await func(database, session);
          }
        } catch (error) {
          throw new Error(`MongoDB query failed: ${error}\nCommand: ${command}`);
        }
      },

      async transaction<T>(callback: (connection: DatabaseConnection) => Promise<T>): Promise<T> {
        session = client.startSession();
        
        const transactionConnection: DatabaseConnection = {
          ...this,
          async query(command: string, params?: any[]): Promise<any> {
            try {
              return await this.executeMongoCommand(database, command, session);
            } catch (error) {
              await session.abortTransaction().catch(() => {});
              throw new Error(`MongoDB transaction query failed: ${error}\nCommand: ${command}`);
            }
          },
        };

        try {
          await session.startTransaction();
          const result = await callback(transactionConnection);
          await session.commitTransaction();
          return result;
        } catch (error) {
          await session.abortTransaction().catch(() => {});
          throw error;
        } finally {
          await session.endSession();
          session = null;
        }
      },

      async close(): Promise<void> {
        if (session) {
          await session.endSession();
        }
        await client.close();
      },

      // Helper method to execute MongoDB shell commands
      async executeMongoCommand(db: any, command: string, session: any): Promise<any> {
        // Parse common MongoDB operations
        if (command.includes('.find(')) {
          const match = command.match(/db\.(\w+)\.find\((.*?)\)/);
          if (match) {
            const [, collection, query] = match;
            const queryObj = query ? JSON.parse(query) : {};
            return await db.collection(collection).find(queryObj, { session }).toArray();
          }
        } else if (command.includes('.insertOne(')) {
          const match = command.match(/db\.(\w+)\.insertOne\((.*?)\)/);
          if (match) {
            const [, collection, doc] = match;
            const document = JSON.parse(doc);
            return await db.collection(collection).insertOne(document, { session });
          }
        } else if (command.includes('.insertMany(')) {
          const match = command.match(/db\.(\w+)\.insertMany\((.*?)\)/);
          if (match) {
            const [, collection, docs] = match;
            const documents = JSON.parse(docs);
            return await db.collection(collection).insertMany(documents, { session });
          }
        } else if (command.includes('.updateOne(')) {
          const match = command.match(/db\.(\w+)\.updateOne\((.*?), (.*?)\)/);
          if (match) {
            const [, collection, filter, update] = match;
            const filterObj = JSON.parse(filter);
            const updateObj = JSON.parse(update);
            return await db.collection(collection).updateOne(filterObj, updateObj, { session });
          }
        } else if (command.includes('.updateMany(')) {
          const match = command.match(/db\.(\w+)\.updateMany\((.*?), (.*?)\)/);
          if (match) {
            const [, collection, filter, update] = match;
            const filterObj = JSON.parse(filter);
            const updateObj = JSON.parse(update);
            return await db.collection(collection).updateMany(filterObj, updateObj, { session });
          }
        } else if (command.includes('.deleteOne(')) {
          const match = command.match(/db\.(\w+)\.deleteOne\((.*?)\)/);
          if (match) {
            const [, collection, filter] = match;
            const filterObj = JSON.parse(filter);
            return await db.collection(collection).deleteOne(filterObj, { session });
          }
        } else if (command.includes('.deleteMany(')) {
          const match = command.match(/db\.(\w+)\.deleteMany\((.*?)\)/);
          if (match) {
            const [, collection, filter] = match;
            const filterObj = filter ? JSON.parse(filter) : {};
            return await db.collection(collection).deleteMany(filterObj, { session });
          }
        } else if (command.includes('.createIndex(')) {
          const match = command.match(/db\.(\w+)\.createIndex\((.*?), (.*?)\)/);
          if (match) {
            const [, collection, keys, options] = match;
            const keysObj = JSON.parse(keys);
            const optionsObj = options ? JSON.parse(options) : {};
            return await db.collection(collection).createIndex(keysObj, { ...optionsObj, session });
          }
        } else if (command.includes('.getIndexes()')) {
          const match = command.match(/db\.(\w+)\.getIndexes\(\)/);
          if (match) {
            const [, collection] = match;
            return await db.collection(collection).indexes();
          }
        } else if (command.includes('.drop()')) {
          const match = command.match(/db\.(\w+)\.drop\(\)/);
          if (match) {
            const [, collection] = match;
            return await db.collection(collection).drop({ session });
          }
        } else if (command.includes('db.createCollection(')) {
          const match = command.match(/db\.createCollection\("(\w+)"\)/);
          if (match) {
            const [, collection] = match;
            return await db.createCollection(collection, { session });
          }
        } else if (command === 'db.listCollectionNames()') {
          return await db.listCollections({}, { session }).toArray().then((collections: any[]) => 
            collections.map(c => c.name)
          );
        } else if (command === 'db.version()') {
          const result = await db.admin().serverStatus();
          return result.version;
        }

        // Fallback: try to execute as JavaScript
        try {
          const func = new Function('db', 'session', `return ${command}`);
          return await func(db, session);
        } catch (error) {
          throw new Error(`Unsupported MongoDB command: ${command}`);
        }
      },
    };
  }
}