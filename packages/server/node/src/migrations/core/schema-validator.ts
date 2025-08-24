import { DatabaseConnection } from './migration-engine';

export interface SchemaValidationResult {
  isValid: boolean;
  errors: SchemaValidationError[];
  warnings: SchemaValidationWarning[];
  missingTables: string[];
  extraTables: string[];
  missingIndexes: string[];
  extraIndexes: string[];
}

export interface SchemaValidationError {
  type: 'missing_table' | 'missing_column' | 'wrong_type' | 'missing_constraint' | 'missing_index';
  table: string;
  column?: string;
  expected: any;
  actual: any;
  severity: 'error' | 'warning';
}

export interface SchemaValidationWarning {
  type: 'extra_table' | 'extra_column' | 'extra_index' | 'deprecated_feature';
  table: string;
  column?: string;
  message: string;
}

export interface TableSchema {
  name: string;
  columns: ColumnSchema[];
  indexes: IndexSchema[];
  constraints: ConstraintSchema[];
  engine?: string; // MySQL specific
}

export interface ColumnSchema {
  name: string;
  type: string;
  nullable: boolean;
  default?: any;
  autoIncrement?: boolean;
  primary?: boolean;
  unique?: boolean;
}

export interface IndexSchema {
  name: string;
  columns: string[];
  type: 'btree' | 'hash' | 'gin' | 'gist' | 'fulltext';
  unique: boolean;
  partial?: string; // PostgreSQL partial index condition
}

export interface ConstraintSchema {
  name: string;
  type: 'primary_key' | 'foreign_key' | 'unique' | 'check';
  columns: string[];
  referencedTable?: string;
  referencedColumns?: string[];
  onDelete?: 'cascade' | 'restrict' | 'set_null' | 'set_default';
  onUpdate?: 'cascade' | 'restrict' | 'set_null' | 'set_default';
  checkExpression?: string;
}

export class SchemaValidator {
  private connection: DatabaseConnection;
  private expectedSchema: TableSchema[] = [];

  constructor(connection: DatabaseConnection) {
    this.connection = connection;
    this.initializeExpectedSchema();
  }

  private initializeExpectedSchema(): void {
    // Define the expected SightEdit schema
    this.expectedSchema = [
      {
        name: 'users',
        columns: [
          { name: 'id', type: 'integer', nullable: false, primary: true, autoIncrement: true },
          { name: 'username', type: 'varchar(255)', nullable: false, unique: true },
          { name: 'email', type: 'varchar(255)', nullable: false, unique: true },
          { name: 'password_hash', type: 'varchar(255)', nullable: false },
          { name: 'role', type: 'varchar(50)', nullable: false, default: 'user' },
          { name: 'is_active', type: 'boolean', nullable: false, default: true },
          { name: 'created_at', type: 'timestamp', nullable: false, default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'timestamp', nullable: false, default: 'CURRENT_TIMESTAMP' },
        ],
        indexes: [
          { name: 'idx_users_email', columns: ['email'], type: 'btree', unique: true },
          { name: 'idx_users_username', columns: ['username'], type: 'btree', unique: true },
          { name: 'idx_users_role', columns: ['role'], type: 'btree', unique: false },
        ],
        constraints: [
          { name: 'pk_users', type: 'primary_key', columns: ['id'] },
          { name: 'uk_users_email', type: 'unique', columns: ['email'] },
          { name: 'uk_users_username', type: 'unique', columns: ['username'] },
          { name: 'ck_users_role', type: 'check', columns: ['role'], checkExpression: "role IN ('admin', 'editor', 'user')" },
        ],
      },
      {
        name: 'content',
        columns: [
          { name: 'id', type: 'integer', nullable: false, primary: true, autoIncrement: true },
          { name: 'sight', type: 'varchar(255)', nullable: false },
          { name: 'element_type', type: 'varchar(50)', nullable: false },
          { name: 'content_data', type: 'jsonb', nullable: false },
          { name: 'context', type: 'jsonb', nullable: false },
          { name: 'version', type: 'integer', nullable: false, default: 1 },
          { name: 'user_id', type: 'integer', nullable: true },
          { name: 'created_at', type: 'timestamp', nullable: false, default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'timestamp', nullable: false, default: 'CURRENT_TIMESTAMP' },
        ],
        indexes: [
          { name: 'idx_content_sight_context', columns: ['sight', 'context'], type: 'btree', unique: false },
          { name: 'idx_content_user_id', columns: ['user_id'], type: 'btree', unique: false },
          { name: 'idx_content_updated_at', columns: ['updated_at'], type: 'btree', unique: false },
          { name: 'idx_content_element_type', columns: ['element_type'], type: 'btree', unique: false },
        ],
        constraints: [
          { name: 'pk_content', type: 'primary_key', columns: ['id'] },
          { name: 'fk_content_user_id', type: 'foreign_key', columns: ['user_id'], referencedTable: 'users', referencedColumns: ['id'], onDelete: 'set_null' },
        ],
      },
      {
        name: 'permissions',
        columns: [
          { name: 'id', type: 'integer', nullable: false, primary: true, autoIncrement: true },
          { name: 'user_id', type: 'integer', nullable: false },
          { name: 'resource', type: 'varchar(255)', nullable: false },
          { name: 'action', type: 'varchar(50)', nullable: false },
          { name: 'granted', type: 'boolean', nullable: false, default: true },
          { name: 'created_at', type: 'timestamp', nullable: false, default: 'CURRENT_TIMESTAMP' },
        ],
        indexes: [
          { name: 'idx_permissions_user_id', columns: ['user_id'], type: 'btree', unique: false },
          { name: 'idx_permissions_resource', columns: ['resource'], type: 'btree', unique: false },
        ],
        constraints: [
          { name: 'pk_permissions', type: 'primary_key', columns: ['id'] },
          { name: 'uk_permissions_user_resource_action', type: 'unique', columns: ['user_id', 'resource', 'action'] },
          { name: 'fk_permissions_user_id', type: 'foreign_key', columns: ['user_id'], referencedTable: 'users', referencedColumns: ['id'], onDelete: 'cascade' },
          { name: 'ck_permissions_action', type: 'check', columns: ['action'], checkExpression: "action IN ('read', 'write', 'delete', 'admin')" },
        ],
      },
      {
        name: 'audit_logs',
        columns: [
          { name: 'id', type: 'integer', nullable: false, primary: true, autoIncrement: true },
          { name: 'user_id', type: 'integer', nullable: true },
          { name: 'action', type: 'varchar(100)', nullable: false },
          { name: 'resource_type', type: 'varchar(50)', nullable: false },
          { name: 'resource_id', type: 'varchar(255)', nullable: true },
          { name: 'old_values', type: 'jsonb', nullable: true },
          { name: 'new_values', type: 'jsonb', nullable: true },
          { name: 'ip_address', type: 'inet', nullable: true },
          { name: 'user_agent', type: 'text', nullable: true },
          { name: 'created_at', type: 'timestamp', nullable: false, default: 'CURRENT_TIMESTAMP' },
        ],
        indexes: [
          { name: 'idx_audit_logs_user_id', columns: ['user_id'], type: 'btree', unique: false },
          { name: 'idx_audit_logs_action', columns: ['action'], type: 'btree', unique: false },
          { name: 'idx_audit_logs_created_at', columns: ['created_at'], type: 'btree', unique: false },
          { name: 'idx_audit_logs_resource', columns: ['resource_type', 'resource_id'], type: 'btree', unique: false },
        ],
        constraints: [
          { name: 'pk_audit_logs', type: 'primary_key', columns: ['id'] },
          { name: 'fk_audit_logs_user_id', type: 'foreign_key', columns: ['user_id'], referencedTable: 'users', referencedColumns: ['id'], onDelete: 'set_null' },
        ],
      },
    ];

    // Adapt schema based on database type
    this.adaptSchemaForDatabase();
  }

  private adaptSchemaForDatabase(): void {
    switch (this.connection.type) {
      case 'mongodb':
        this.expectedSchema = this.adaptForMongoDB(this.expectedSchema);
        break;
      case 'mysql':
        this.expectedSchema = this.adaptForMySQL(this.expectedSchema);
        break;
      case 'sqlite':
        this.expectedSchema = this.adaptForSQLite(this.expectedSchema);
        break;
      case 'postgresql':
        // PostgreSQL is the base schema
        break;
    }
  }

  private adaptForMongoDB(schema: TableSchema[]): TableSchema[] {
    // MongoDB uses collections instead of tables and documents instead of rows
    return schema.map(table => ({
      ...table,
      name: table.name, // Collections
      columns: [], // MongoDB doesn't have fixed columns
      indexes: table.indexes.map(index => ({
        ...index,
        type: 'btree', // MongoDB primarily uses B-tree indexes
      })),
      constraints: [], // MongoDB doesn't have foreign key constraints
    }));
  }

  private adaptForMySQL(schema: TableSchema[]): TableSchema[] {
    return schema.map(table => ({
      ...table,
      columns: table.columns.map(column => ({
        ...column,
        type: this.convertTypeForMySQL(column.type),
      })),
      engine: 'InnoDB',
    }));
  }

  private adaptForSQLite(schema: TableSchema[]): TableSchema[] {
    return schema.map(table => ({
      ...table,
      columns: table.columns.map(column => ({
        ...column,
        type: this.convertTypeForSQLite(column.type),
      })),
      constraints: table.constraints.filter(constraint => 
        // SQLite has limited constraint support
        constraint.type !== 'check' || this.connection.type === 'sqlite'
      ),
    }));
  }

  private convertTypeForMySQL(type: string): string {
    const typeMap: Record<string, string> = {
      'integer': 'INT',
      'varchar(255)': 'VARCHAR(255)',
      'varchar(50)': 'VARCHAR(50)',
      'varchar(100)': 'VARCHAR(100)',
      'text': 'TEXT',
      'boolean': 'TINYINT(1)',
      'timestamp': 'TIMESTAMP',
      'jsonb': 'JSON',
      'inet': 'VARCHAR(45)', // IPv4/IPv6 address
    };
    return typeMap[type] || type;
  }

  private convertTypeForSQLite(type: string): string {
    const typeMap: Record<string, string> = {
      'integer': 'INTEGER',
      'varchar(255)': 'TEXT',
      'varchar(50)': 'TEXT',
      'varchar(100)': 'TEXT',
      'text': 'TEXT',
      'boolean': 'INTEGER',
      'timestamp': 'DATETIME',
      'jsonb': 'TEXT',
      'inet': 'TEXT',
    };
    return typeMap[type] || type;
  }

  async validateSchema(): Promise<SchemaValidationResult> {
    const result: SchemaValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      missingTables: [],
      extraTables: [],
      missingIndexes: [],
      extraIndexes: [],
    };

    try {
      // Get actual database schema
      const actualSchema = await this.getDatabaseSchema();

      // Validate tables
      await this.validateTables(actualSchema, result);

      // Validate columns
      await this.validateColumns(actualSchema, result);

      // Validate indexes
      await this.validateIndexes(actualSchema, result);

      // Validate constraints
      await this.validateConstraints(actualSchema, result);

      result.isValid = result.errors.length === 0;
    } catch (error) {
      result.errors.push({
        type: 'missing_table',
        table: 'unknown',
        expected: 'valid schema',
        actual: error,
        severity: 'error',
      });
      result.isValid = false;
    }

    return result;
  }

  private async getDatabaseSchema(): Promise<TableSchema[]> {
    switch (this.connection.type) {
      case 'postgresql':
        return this.getPostgreSQLSchema();
      case 'mysql':
        return this.getMySQLSchema();
      case 'sqlite':
        return this.getSQLiteSchema();
      case 'mongodb':
        return this.getMongoDBSchema();
      default:
        throw new Error(`Unsupported database type: ${this.connection.type}`);
    }
  }

  private async getPostgreSQLSchema(): Promise<TableSchema[]> {
    const tables: TableSchema[] = [];
    
    // Get all tables
    const tablesQuery = `
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `;
    const tableRows = await this.connection.query(tablesQuery);

    for (const tableRow of tableRows) {
      const tableName = tableRow.tablename;
      
      // Get columns
      const columnsQuery = `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `;
      const columnRows = await this.connection.query(columnsQuery, [tableName]);
      
      const columns = columnRows.map((col: any) => ({
        name: col.column_name,
        type: col.data_type,
        nullable: col.is_nullable === 'YES',
        default: col.column_default,
      }));

      // Get indexes
      const indexesQuery = `
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = $1
      `;
      const indexRows = await this.connection.query(indexesQuery, [tableName]);
      
      const indexes = indexRows.map((idx: any) => ({
        name: idx.indexname,
        columns: this.parseIndexColumns(idx.indexdef),
        type: 'btree' as const,
        unique: idx.indexdef.includes('UNIQUE'),
      }));

      tables.push({
        name: tableName,
        columns,
        indexes,
        constraints: [], // TODO: Implement constraint parsing
      });
    }

    return tables;
  }

  private async getMySQLSchema(): Promise<TableSchema[]> {
    const tables: TableSchema[] = [];
    
    // Get all tables
    const tablesQuery = 'SHOW TABLES';
    const tableRows = await this.connection.query(tablesQuery);

    for (const tableRow of tableRows) {
      const tableName = Object.values(tableRow)[0] as string;
      
      // Get columns
      const columnsQuery = `DESCRIBE ${tableName}`;
      const columnRows = await this.connection.query(columnsQuery);
      
      const columns = columnRows.map((col: any) => ({
        name: col.Field,
        type: col.Type,
        nullable: col.Null === 'YES',
        default: col.Default,
        primary: col.Key === 'PRI',
      }));

      // Get indexes
      const indexesQuery = `SHOW INDEX FROM ${tableName}`;
      const indexRows = await this.connection.query(indexesQuery);
      
      const indexMap = new Map<string, any>();
      indexRows.forEach((idx: any) => {
        if (!indexMap.has(idx.Key_name)) {
          indexMap.set(idx.Key_name, {
            name: idx.Key_name,
            columns: [],
            unique: idx.Non_unique === 0,
            type: 'btree' as const,
          });
        }
        indexMap.get(idx.Key_name).columns.push(idx.Column_name);
      });
      
      const indexes = Array.from(indexMap.values());

      tables.push({
        name: tableName,
        columns,
        indexes,
        constraints: [],
      });
    }

    return tables;
  }

  private async getSQLiteSchema(): Promise<TableSchema[]> {
    const tables: TableSchema[] = [];
    
    // Get all tables
    const tablesQuery = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'";
    const tableRows = await this.connection.query(tablesQuery);

    for (const tableRow of tableRows) {
      const tableName = tableRow.name;
      
      // Get table info
      const tableInfoQuery = `PRAGMA table_info(${tableName})`;
      const columnRows = await this.connection.query(tableInfoQuery);
      
      const columns = columnRows.map((col: any) => ({
        name: col.name,
        type: col.type,
        nullable: col.notnull === 0,
        default: col.dflt_value,
        primary: col.pk === 1,
      }));

      // Get indexes
      const indexesQuery = `PRAGMA index_list(${tableName})`;
      const indexRows = await this.connection.query(indexesQuery);
      
      const indexes = [];
      for (const idxRow of indexRows) {
        const indexInfoQuery = `PRAGMA index_info(${idxRow.name})`;
        const indexInfo = await this.connection.query(indexInfoQuery);
        
        indexes.push({
          name: idxRow.name,
          columns: indexInfo.map((info: any) => info.name),
          unique: idxRow.unique === 1,
          type: 'btree' as const,
        });
      }

      tables.push({
        name: tableName,
        columns,
        indexes,
        constraints: [],
      });
    }

    return tables;
  }

  private async getMongoDBSchema(): Promise<TableSchema[]> {
    const collections: TableSchema[] = [];
    
    // Get all collections
    const collectionNames = await this.connection.query('db.listCollectionNames()');

    for (const collectionName of collectionNames) {
      // Get indexes for collection
      const indexes = await this.connection.query(`db.${collectionName}.getIndexes()`);
      
      const indexSchemas = indexes.map((idx: any) => ({
        name: idx.name,
        columns: Object.keys(idx.key),
        unique: idx.unique || false,
        type: 'btree' as const,
      }));

      collections.push({
        name: collectionName,
        columns: [], // MongoDB is schemaless
        indexes: indexSchemas,
        constraints: [],
      });
    }

    return collections;
  }

  private parseIndexColumns(indexDef: string): string[] {
    // Parse PostgreSQL index definition to extract columns
    const match = indexDef.match(/\(([^)]+)\)/);
    if (!match) return [];
    
    return match[1].split(',').map(col => col.trim().replace(/"/g, ''));
  }

  private async validateTables(actualSchema: TableSchema[], result: SchemaValidationResult): Promise<void> {
    const expectedTables = new Set(this.expectedSchema.map(t => t.name));
    const actualTables = new Set(actualSchema.map(t => t.name));

    // Find missing tables
    for (const expectedTable of expectedTables) {
      if (!actualTables.has(expectedTable)) {
        result.missingTables.push(expectedTable);
        result.errors.push({
          type: 'missing_table',
          table: expectedTable,
          expected: 'table to exist',
          actual: 'table not found',
          severity: 'error',
        });
      }
    }

    // Find extra tables (not necessarily an error, just a warning)
    for (const actualTable of actualTables) {
      if (!expectedTables.has(actualTable) && !actualTable.startsWith('sightedit_migration')) {
        result.extraTables.push(actualTable);
        result.warnings.push({
          type: 'extra_table',
          table: actualTable,
          message: `Table '${actualTable}' is not part of the expected SightEdit schema`,
        });
      }
    }
  }

  private async validateColumns(actualSchema: TableSchema[], result: SchemaValidationResult): Promise<void> {
    const actualTableMap = new Map(actualSchema.map(t => [t.name, t]));

    for (const expectedTable of this.expectedSchema) {
      const actualTable = actualTableMap.get(expectedTable.name);
      if (!actualTable) continue; // Table missing, already reported

      const actualColumnMap = new Map(actualTable.columns.map(c => [c.name, c]));
      
      for (const expectedColumn of expectedTable.columns) {
        const actualColumn = actualColumnMap.get(expectedColumn.name);
        
        if (!actualColumn) {
          result.errors.push({
            type: 'missing_column',
            table: expectedTable.name,
            column: expectedColumn.name,
            expected: expectedColumn,
            actual: 'column not found',
            severity: 'error',
          });
          continue;
        }

        // Validate column type
        if (!this.isCompatibleType(expectedColumn.type, actualColumn.type)) {
          result.errors.push({
            type: 'wrong_type',
            table: expectedTable.name,
            column: expectedColumn.name,
            expected: expectedColumn.type,
            actual: actualColumn.type,
            severity: 'error',
          });
        }

        // Validate nullable
        if (expectedColumn.nullable !== actualColumn.nullable) {
          result.errors.push({
            type: 'wrong_type',
            table: expectedTable.name,
            column: expectedColumn.name,
            expected: `nullable: ${expectedColumn.nullable}`,
            actual: `nullable: ${actualColumn.nullable}`,
            severity: 'warning',
          });
        }
      }

      // Check for extra columns
      for (const actualColumn of actualTable.columns) {
        if (!expectedTable.columns.some(c => c.name === actualColumn.name)) {
          result.warnings.push({
            type: 'extra_column',
            table: expectedTable.name,
            column: actualColumn.name,
            message: `Column '${actualColumn.name}' is not part of the expected schema`,
          });
        }
      }
    }
  }

  private async validateIndexes(actualSchema: TableSchema[], result: SchemaValidationResult): Promise<void> {
    const actualTableMap = new Map(actualSchema.map(t => [t.name, t]));

    for (const expectedTable of this.expectedSchema) {
      const actualTable = actualTableMap.get(expectedTable.name);
      if (!actualTable) continue;

      const actualIndexMap = new Map(actualTable.indexes.map(i => [i.name, i]));
      
      for (const expectedIndex of expectedTable.indexes) {
        const actualIndex = actualIndexMap.get(expectedIndex.name);
        
        if (!actualIndex) {
          result.missingIndexes.push(`${expectedTable.name}.${expectedIndex.name}`);
          result.errors.push({
            type: 'missing_index',
            table: expectedTable.name,
            expected: expectedIndex,
            actual: 'index not found',
            severity: 'warning', // Indexes are important for performance but not critical
          });
          continue;
        }

        // Validate index columns
        const expectedColumns = [...expectedIndex.columns].sort();
        const actualColumns = [...actualIndex.columns].sort();
        
        if (JSON.stringify(expectedColumns) !== JSON.stringify(actualColumns)) {
          result.errors.push({
            type: 'missing_index',
            table: expectedTable.name,
            expected: expectedColumns,
            actual: actualColumns,
            severity: 'warning',
          });
        }
      }

      // Check for extra indexes (usually not a problem)
      for (const actualIndex of actualTable.indexes) {
        if (!expectedTable.indexes.some(i => i.name === actualIndex.name)) {
          result.extraIndexes.push(`${expectedTable.name}.${actualIndex.name}`);
        }
      }
    }
  }

  private async validateConstraints(actualSchema: TableSchema[], result: SchemaValidationResult): Promise<void> {
    // Constraint validation is complex and database-specific
    // For now, we'll implement basic validation
    // TODO: Implement comprehensive constraint validation
  }

  private isCompatibleType(expected: string, actual: string): boolean {
    // Normalize types for comparison
    const normalizeType = (type: string): string => {
      return type.toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/varchar\(\d+\)/g, 'varchar')
        .replace(/char\(\d+\)/g, 'char')
        .replace(/numeric\(\d+,?\d*\)/g, 'numeric');
    };

    const normalizedExpected = normalizeType(expected);
    const normalizedActual = normalizeType(actual);

    // Type compatibility mappings for different databases
    const typeCompatibility: Record<string, string[]> = {
      'integer': ['int', 'integer', 'serial', 'bigint', 'int4'],
      'varchar': ['varchar', 'text', 'character varying'],
      'text': ['text', 'longtext', 'mediumtext'],
      'boolean': ['boolean', 'bool', 'tinyint', 'bit'],
      'timestamp': ['timestamp', 'datetime', 'timestamptz'],
      'jsonb': ['jsonb', 'json', 'text'],
      'inet': ['inet', 'varchar'],
    };

    // Check direct match
    if (normalizedExpected === normalizedActual) {
      return true;
    }

    // Check compatibility mappings
    for (const [baseType, compatibleTypes] of Object.entries(typeCompatibility)) {
      if (compatibleTypes.includes(normalizedExpected) && compatibleTypes.includes(normalizedActual)) {
        return true;
      }
    }

    return false;
  }

  async generateMigration(validationResult: SchemaValidationResult): Promise<string> {
    if (validationResult.isValid) {
      return '// Schema is valid, no migration needed';
    }

    let migration = `import { DatabaseConnection } from '../core/migration-engine';

export const description = 'Fix schema validation issues';

export async function up(connection: DatabaseConnection): Promise<void> {
`;

    // Generate fixes for missing tables
    for (const tableName of validationResult.missingTables) {
      const tableSchema = this.expectedSchema.find(t => t.name === tableName);
      if (tableSchema) {
        migration += this.generateCreateTableSQL(tableSchema);
      }
    }

    // Generate fixes for missing columns
    for (const error of validationResult.errors) {
      if (error.type === 'missing_column' && error.column) {
        migration += `  // Add missing column: ${error.table}.${error.column}
  await connection.query(\`
    ALTER TABLE ${error.table} 
    ADD COLUMN ${error.column} ${(error.expected as ColumnSchema).type}${(error.expected as ColumnSchema).nullable ? '' : ' NOT NULL'}
  \`);
  
`;
      }
    }

    // Generate fixes for missing indexes
    for (const indexName of validationResult.missingIndexes) {
      const [tableName, indexShortName] = indexName.split('.');
      const tableSchema = this.expectedSchema.find(t => t.name === tableName);
      const indexSchema = tableSchema?.indexes.find(i => i.name === indexShortName);
      
      if (indexSchema) {
        migration += `  // Add missing index: ${indexName}
  await connection.query(\`
    CREATE ${indexSchema.unique ? 'UNIQUE ' : ''}INDEX ${indexSchema.name}
    ON ${tableName} (${indexSchema.columns.join(', ')})
  \`);
  
`;
      }
    }

    migration += `}

export async function down(connection: DatabaseConnection): Promise<void> {
  // TODO: Implement rollback for schema fixes
  // Warning: This may result in data loss
}
`;

    return migration;
  }

  private generateCreateTableSQL(tableSchema: TableSchema): string {
    const columnDefs = tableSchema.columns.map(col => {
      let def = `    ${col.name} ${col.type}`;
      if (!col.nullable) def += ' NOT NULL';
      if (col.default !== undefined) def += ` DEFAULT ${col.default}`;
      if (col.primary) def += ' PRIMARY KEY';
      if (col.autoIncrement) def += ' AUTO_INCREMENT';
      return def;
    });

    return `  // Create missing table: ${tableSchema.name}
  await connection.query(\`
    CREATE TABLE ${tableSchema.name} (
${columnDefs.join(',\n')}
    )
  \`);
  
`;
  }
}