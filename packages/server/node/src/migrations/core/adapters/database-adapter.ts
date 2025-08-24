import { DatabaseConnection, DatabaseType, MigrationConfig } from '../migration-engine';

export abstract class DatabaseAdapter {
  protected config: MigrationConfig['database'];

  constructor(config: MigrationConfig['database']) {
    this.config = config;
  }

  abstract connect(): Promise<DatabaseConnection>;

  static async create(config: MigrationConfig['database']): Promise<DatabaseConnection> {
    let adapter: DatabaseAdapter;

    switch (config.type) {
      case 'postgresql':
        const { PostgreSQLAdapter } = await import('./postgresql-adapter');
        adapter = new PostgreSQLAdapter(config);
        break;
      case 'mysql':
        const { MySQLAdapter } = await import('./mysql-adapter');
        adapter = new MySQLAdapter(config);
        break;
      case 'sqlite':
        const { SQLiteAdapter } = await import('./sqlite-adapter');
        adapter = new SQLiteAdapter(config);
        break;
      case 'mongodb':
        const { MongoDBAdapter } = await import('./mongodb-adapter');
        adapter = new MongoDBAdapter(config);
        break;
      default:
        throw new Error(`Unsupported database type: ${config.type}`);
    }

    return adapter.connect();
  }

  protected parseConnectionString(connectionString: string): {
    protocol: string;
    username?: string;
    password?: string;
    host: string;
    port?: number;
    database: string;
    options?: Record<string, string>;
  } {
    const url = new URL(connectionString);
    
    return {
      protocol: url.protocol.slice(0, -1),
      username: url.username || undefined,
      password: url.password || undefined,
      host: url.hostname,
      port: url.port ? parseInt(url.port) : undefined,
      database: url.pathname.slice(1),
      options: Object.fromEntries(url.searchParams.entries()),
    };
  }

  protected getConnectionParams(): {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    ssl?: boolean;
  } {
    if (typeof this.config.connection === 'string') {
      const parsed = this.parseConnectionString(this.config.connection);
      return {
        host: parsed.host,
        port: parsed.port || this.getDefaultPort(),
        username: parsed.username || '',
        password: parsed.password || '',
        database: parsed.database,
        ssl: parsed.options?.ssl === 'true',
      };
    }

    return {
      host: this.config.connection.host,
      port: this.config.connection.port,
      username: this.config.connection.username,
      password: this.config.connection.password,
      database: this.config.connection.database,
      ssl: this.config.connection.ssl,
    };
  }

  protected abstract getDefaultPort(): number;
}