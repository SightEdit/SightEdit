/**
 * GraphQL Type Definitions
 *
 * Schema for SightEdit GraphQL API
 */

export const typeDefs = `#graphql
  # Scalar types
  scalar JSON
  scalar DateTime

  # Element types enum
  enum ElementType {
    TEXT
    RICHTEXT
    NUMBER
    DATE
    IMAGE
    COLOR
    SELECT
    CHECKBOX
    LINK
    FILE
    JSON
    COLLECTION
  }

  # Save operation status
  enum SaveStatus {
    SUCCESS
    ERROR
    PENDING
  }

  # Content value (can be any type)
  scalar ContentValue

  # Element Schema
  type ElementSchema {
    sight: String!
    type: ElementType!
    properties: JSON
  }

  input ElementSchemaInput {
    sight: String!
    type: ElementType!
    properties: JSON
  }

  # Theme configuration
  type ThemeConfig {
    mode: String!
    colors: JSON!
    typography: JSON!
    spacing: JSON!
    borderRadius: JSON!
    shadows: JSON!
    zIndex: JSON!
    components: JSON
  }

  input ThemeConfigInput {
    mode: String
    colors: JSON
    typography: JSON
    spacing: JSON
    borderRadius: JSON
    shadows: JSON
    zIndex: JSON
    components: JSON
  }

  # Save data
  input SaveInput {
    sight: String!
    value: ContentValue!
    type: ElementType
    id: String
    context: JSON
  }

  # Save response
  type SaveResponse {
    success: Boolean!
    id: String
    message: String
    error: String
    data: JSON
  }

  # Batch operation
  input BatchOperation {
    action: String!
    data: SaveInput!
  }

  # Batch response
  type BatchOperationResult {
    success: Boolean!
    data: SaveResponse
    error: String
  }

  type BatchResponse {
    success: Boolean!
    results: [BatchOperationResult!]!
    total: Int!
    successful: Int!
    failed: Int!
  }

  # Content entry
  type ContentEntry {
    id: ID!
    sight: String!
    value: ContentValue
    type: ElementType
    metadata: JSON
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  # User (for collaboration)
  type User {
    id: ID!
    name: String!
    email: String
    avatar: String
    status: String
  }

  # Active editor (for collaboration)
  type ActiveEditor {
    userId: ID!
    sight: String!
    startedAt: DateTime!
    user: User
  }

  # Change event (for subscriptions)
  type ChangeEvent {
    sight: String!
    value: ContentValue
    type: ElementType
    userId: ID
    timestamp: DateTime!
  }

  # Schema update event
  type SchemaUpdateEvent {
    sight: String!
    schema: ElementSchema!
    timestamp: DateTime!
  }

  # Theme update event
  type ThemeUpdateEvent {
    theme: ThemeConfig!
    timestamp: DateTime!
  }

  # Validation result
  type ValidationResult {
    valid: Boolean!
    errors: [ValidationError!]
  }

  type ValidationError {
    field: String!
    message: String!
    code: String
  }

  # History entry
  type HistoryEntry {
    id: ID!
    sight: String!
    value: ContentValue
    previousValue: ContentValue
    type: ElementType
    userId: ID
    user: User
    timestamp: DateTime!
    action: String!
  }

  # Statistics
  type Statistics {
    totalEdits: Int!
    totalUsers: Int!
    activeEditors: Int!
    lastUpdate: DateTime
  }

  # Queries
  type Query {
    # Fetch content by sight ID
    fetchContent(sight: String!): ContentValue

    # Fetch multiple contents
    fetchContents(sights: [String!]!): [ContentEntry!]!

    # Fetch schema for a sight
    fetchSchema(sight: String!): ElementSchema

    # List all schemas
    listSchemas: [ElementSchema!]!

    # Fetch current theme
    fetchTheme: ThemeConfig

    # List theme presets
    listThemePresets: [String!]!

    # Validate content
    validateContent(sight: String!, value: ContentValue!): ValidationResult!

    # Get active editors
    getActiveEditors: [ActiveEditor!]!

    # Get edit history
    getHistory(
      sight: String
      limit: Int
      offset: Int
      userId: ID
    ): [HistoryEntry!]!

    # Get statistics
    getStatistics: Statistics!

    # Search content
    searchContent(
      query: String!
      types: [ElementType!]
      limit: Int
    ): [ContentEntry!]!
  }

  # Mutations
  type Mutation {
    # Save single content
    saveContent(input: SaveInput!): SaveResponse!

    # Batch save multiple contents
    batchSave(operations: [BatchOperation!]!): BatchResponse!

    # Update schema
    updateSchema(sight: String!, schema: ElementSchemaInput!): ElementSchema!

    # Delete schema
    deleteSchema(sight: String!): Boolean!

    # Update theme
    updateTheme(theme: ThemeConfigInput!): ThemeConfig!

    # Reset theme to preset
    resetTheme(preset: String!): ThemeConfig!

    # Start editing (for collaboration)
    startEditing(sight: String!, userId: ID!): Boolean!

    # Stop editing (for collaboration)
    stopEditing(sight: String!, userId: ID!): Boolean!

    # Revert to history entry
    revertToHistory(historyId: ID!): SaveResponse!

    # Clear history
    clearHistory(sight: String): Boolean!
  }

  # Subscriptions (for real-time updates)
  type Subscription {
    # Subscribe to content changes
    contentUpdated(sight: String): ChangeEvent!

    # Subscribe to all content changes
    contentChanged: ChangeEvent!

    # Subscribe to schema updates
    schemaUpdated(sight: String): SchemaUpdateEvent!

    # Subscribe to theme updates
    themeUpdated: ThemeUpdateEvent!

    # Subscribe to active editors
    activeEditorsChanged: [ActiveEditor!]!

    # Subscribe to user actions
    userAction(userId: ID): ChangeEvent!
  }
`;
