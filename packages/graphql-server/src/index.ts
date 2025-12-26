/**
 * SightEdit GraphQL Server
 *
 * Export all GraphQL server components
 */

// Export server
export {
  SightEditGraphQLServer,
  createSightEditGraphQLServer,
  runStandaloneServer
} from './server';

export type { ServerConfig } from './server';

// Export schema
export { typeDefs } from './schema/typeDefs';
export { resolvers, pubsub, TOPICS } from './schema/resolvers';

// Version
export const VERSION = '2.0.0-alpha.1';
