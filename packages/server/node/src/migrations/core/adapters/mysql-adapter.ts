import { DatabaseAdapter } from './database-adapter';
import { DatabaseConnection } from '../migration-engine';

export class MySQLAdapter extends DatabaseAdapter {
  protected getDefaultPort(): number {
    return 3306;
  }

  async connect(): Promise<DatabaseConnection> {
    const mysql = await import('mysql2/promise');
    const params = this.getConnectionParams();

    const connection = await mysql.createConnection({
      host: params.host,
      port: params.port,
      user: params.username,
      password: params.password,
      database: params.database,
      ssl: params.ssl,
      multipleStatements: true,
    });

    return {
      type: 'mysql',
      database: params.database,
      
      async query(sql: string, params?: any[]): Promise<any> {
        try {
          const [rows] = await connection.execute(sql, params);
          return rows;
        } catch (error) {
          throw new Error(`MySQL query failed: ${error}\nSQL: ${sql}`);
        }
      },

      async transaction<T>(callback: (connection: DatabaseConnection) => Promise<T>): Promise<T> {
        await connection.beginTransaction();
        
        const transactionConnection: DatabaseConnection = {
          ...this,
          async query(sql: string, params?: any[]): Promise<any> {
            try {
              const [rows] = await connection.execute(sql, params);
              return rows;
            } catch (error) {
              await connection.rollback().catch(() => {});
              throw new Error(`MySQL transaction query failed: ${error}\nSQL: ${sql}`);
            }
          },
        };

        try {
          const result = await callback(transactionConnection);
          await connection.commit();
          return result;
        } catch (error) {
          await connection.rollback().catch(() => {});
          throw error;
        }
      },

      async close(): Promise<void> {
        await connection.end();
      },
    };
  }
}