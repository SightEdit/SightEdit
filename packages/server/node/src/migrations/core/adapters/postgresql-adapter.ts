import { DatabaseAdapter } from './database-adapter';
import { DatabaseConnection } from '../migration-engine';

export class PostgreSQLAdapter extends DatabaseAdapter {
  protected getDefaultPort(): number {
    return 5432;
  }

  async connect(): Promise<DatabaseConnection> {
    const { Client } = await import('pg');
    const params = this.getConnectionParams();

    const client = new Client({
      host: params.host,
      port: params.port,
      user: params.username,
      password: params.password,
      database: params.database,
      ssl: params.ssl ? { rejectUnauthorized: false } : false,
    });

    await client.connect();

    return {
      type: 'postgresql',
      database: params.database,
      
      async query(sql: string, params?: any[]): Promise<any> {
        try {
          const result = await client.query(sql, params);
          return result.rows;
        } catch (error) {
          throw new Error(`PostgreSQL query failed: ${error}\nSQL: ${sql}`);
        }
      },

      async transaction<T>(callback: (connection: DatabaseConnection) => Promise<T>): Promise<T> {
        await client.query('BEGIN');
        
        const transactionConnection: DatabaseConnection = {
          ...this,
          async query(sql: string, params?: any[]): Promise<any> {
            try {
              const result = await client.query(sql, params);
              return result.rows;
            } catch (error) {
              await client.query('ROLLBACK').catch(() => {});
              throw new Error(`PostgreSQL transaction query failed: ${error}\nSQL: ${sql}`);
            }
          },
        };

        try {
          const result = await callback(transactionConnection);
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK').catch(() => {});
          throw error;
        }
      },

      async close(): Promise<void> {
        await client.end();
      },
    };
  }
}