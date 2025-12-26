/**
 * Apollo Server Setup
 *
 * GraphQL server with subscriptions support
 */

import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { createServer } from 'http';
import express from 'express';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { makeExecutableSchema } from '@graphql-tools/schema';
import cors from 'cors';
import bodyParser from 'body-parser';

import { typeDefs } from './schema/typeDefs';
import { resolvers } from './schema/resolvers';

export interface ServerConfig {
  port?: number;
  cors?: {
    origin?: string | string[];
    credentials?: boolean;
  };
  context?: (req: any) => Promise<any> | any;
  onServerStart?: (url: string, wsUrl: string) => void;
}

export class SightEditGraphQLServer {
  private app: express.Application;
  private httpServer: any;
  private wsServer: WebSocketServer | null = null;
  private apolloServer: ApolloServer | null = null;
  private schema: any;
  private config: ServerConfig;

  constructor(config: ServerConfig = {}) {
    this.config = config;
    this.app = express();
    this.httpServer = createServer(this.app);
    this.schema = makeExecutableSchema({ typeDefs, resolvers });
  }

  async start(): Promise<void> {
    const port = this.config.port || 4000;

    // Create WebSocket server for subscriptions
    this.wsServer = new WebSocketServer({
      server: this.httpServer,
      path: '/graphql'
    });

    // Setup WebSocket server
    const serverCleanup = useServer(
      {
        schema: this.schema,
        context: async (ctx) => {
          return this.config.context
            ? await this.config.context(ctx)
            : {};
        }
      },
      this.wsServer
    );

    // Create Apollo Server
    this.apolloServer = new ApolloServer({
      schema: this.schema,
      plugins: [
        // Proper shutdown for the HTTP server
        ApolloServerPluginDrainHttpServer({ httpServer: this.httpServer }),

        // Proper shutdown for the WebSocket server
        {
          async serverWillStart() {
            return {
              async drainServer() {
                await serverCleanup.dispose();
              }
            };
          }
        }
      ]
    });

    await this.apolloServer.start();

    // Setup middleware
    this.app.use(
      '/graphql',
      cors<cors.CorsRequest>(this.config.cors || {
        origin: '*',
        credentials: true
      }),
      bodyParser.json(),
      expressMiddleware(this.apolloServer, {
        context: async ({ req }) => {
          return this.config.context
            ? await this.config.context(req)
            : {};
        }
      })
    );

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // Start HTTP server
    await new Promise<void>((resolve) => {
      this.httpServer.listen(port, () => {
        const url = `http://localhost:${port}/graphql`;
        const wsUrl = `ws://localhost:${port}/graphql`;

        console.log(`🚀 SightEdit GraphQL Server ready at ${url}`);
        console.log(`🔌 Subscriptions ready at ${wsUrl}`);

        if (this.config.onServerStart) {
          this.config.onServerStart(url, wsUrl);
        }

        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.apolloServer) {
      await this.apolloServer.stop();
    }

    if (this.wsServer) {
      this.wsServer.close();
    }

    if (this.httpServer) {
      await new Promise<void>((resolve, reject) => {
        this.httpServer.close((err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    console.log('🛑 Server stopped');
  }

  getApp(): express.Application {
    return this.app;
  }

  getHttpServer(): any {
    return this.httpServer;
  }
}

// Factory function for easy setup
export async function createSightEditGraphQLServer(
  config?: ServerConfig
): Promise<SightEditGraphQLServer> {
  const server = new SightEditGraphQLServer(config);
  await server.start();
  return server;
}

// Standalone server runner
export async function runStandaloneServer(port: number = 4000): Promise<void> {
  const server = new SightEditGraphQLServer({
    port,
    onServerStart: (url, wsUrl) => {
      console.log('\n📝 GraphQL Playground available at:');
      console.log(`   ${url}`);
      console.log('\n🔌 WebSocket subscriptions at:');
      console.log(`   ${wsUrl}`);
      console.log('\n💡 Try these queries:');
      console.log('   query { listSchemas { sight type } }');
      console.log('   mutation { saveContent(input: { sight: "test", value: "Hello" }) { success } }');
      console.log('   subscription { contentChanged { sight value timestamp } }\n');
    }
  });

  await server.start();

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('\nSIGTERM received, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('\nSIGINT received, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });
}
