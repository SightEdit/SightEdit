import { FullConfig } from '@playwright/test';

async function globalTeardown(config: FullConfig) {
  console.log('Stopping test server...');
  
  // Get server instance from setup
  const setup = require('./global-setup');
  const server = setup.default.server();
  
  if (server) {
    return new Promise<void>((resolve) => {
      server.close(() => {
        console.log('Test server stopped');
        resolve();
      });
    });
  }
}

export default globalTeardown;