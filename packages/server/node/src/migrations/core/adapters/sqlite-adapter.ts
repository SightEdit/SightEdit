import { DatabaseAdapter } from './database-adapter';
import { DatabaseConnection } from '../migration-engine';
import * as path from 'path';

export class SQLiteAdapter extends DatabaseAdapter {
  protected getDefaultPort(): number {
    return 0; // SQLite doesn't use ports
  }

  async connect(): Promise<DatabaseConnection> {
    const sqlite3 = await import('sqlite3');
    const { Database } = sqlite3;
    const { promisify } = await import('util');

    let dbPath: string;
    
    if (typeof this.config.connection === 'string') {
      // Handle file:// URLs and direct file paths
      dbPath = this.config.connection.startsWith('file://')
        ? this.config.connection.slice(7)
        : this.config.connection.startsWith('sqlite://')
        ? this.config.connection.slice(9)
        : this.config.connection;
    } else {
      dbPath = this.config.connection.database;
    }

    // Resolve relative paths
    if (!path.isAbsolute(dbPath)) {
      dbPath = path.resolve(process.cwd(), dbPath);
    }

    return new Promise((resolve, reject) => {
      const db = new Database(dbPath, (err) => {
        if (err) {
          reject(new Error(`SQLite connection failed: ${err.message}`));
          return;
        }

        // Enable foreign keys
        db.run('PRAGMA foreign_keys = ON');

        const connection: DatabaseConnection = {
          type: 'sqlite',
          database: dbPath,
          
          async query(sql: string, params?: any[]): Promise<any> {
            return new Promise((resolve, reject) => {
              const isSelect = sql.trim().toUpperCase().startsWith('SELECT');
              
              if (isSelect) {
                db.all(sql, params || [], (err, rows) => {
                  if (err) {
                    reject(new Error(`SQLite query failed: ${err.message}\nSQL: ${sql}`));
                  } else {
                    resolve(rows || []);
                  }
                });
              } else {
                db.run(sql, params || [], function(err) {
                  if (err) {
                    reject(new Error(`SQLite query failed: ${err.message}\nSQL: ${sql}`));
                  } else {
                    resolve({ 
                      lastID: this.lastID, 
                      changes: this.changes,
                      affectedRows: this.changes 
                    });
                  }
                });
              }
            });
          },

          async transaction<T>(callback: (connection: DatabaseConnection) => Promise<T>): Promise<T> {
            return new Promise(async (resolve, reject) => {
              db.serialize(async () => {
                await connection.query('BEGIN TRANSACTION');
                
                const transactionConnection: DatabaseConnection = {
                  ...connection,
                  async query(sql: string, params?: any[]): Promise<any> {
                    try {
                      return await connection.query(sql, params);
                    } catch (error) {
                      await connection.query('ROLLBACK').catch(() => {});
                      throw error;
                    }
                  },
                };

                try {
                  const result = await callback(transactionConnection);
                  await connection.query('COMMIT');
                  resolve(result);
                } catch (error) {
                  await connection.query('ROLLBACK').catch(() => {});
                  reject(error);
                }
              });
            });
          },

          async close(): Promise<void> {
            return new Promise((resolve, reject) => {
              db.close((err) => {
                if (err) {
                  reject(new Error(`SQLite close failed: ${err.message}`));
                } else {
                  resolve();
                }
              });
            });
          },
        };

        resolve(connection);
      });
    });
  }
}