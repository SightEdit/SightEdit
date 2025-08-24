import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * Integration test configuration for Playwright
 */
export default defineConfig({
  testDir: './e2e',
  
  /* Run tests in files in parallel */
  fullyParallel: true,
  
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 2 : undefined,
  
  /* Reporter to use */
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    process.env.CI ? ['github'] : ['list']
  ],
  
  /* Shared settings for all projects */
  use: {
    /* Base URL for integration tests */
    baseURL: 'http://localhost:3334',
    
    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Record video on failure */
    video: 'retain-on-failure',
    
    /* Timeout for each action */
    actionTimeout: 15000,
    
    /* Timeout for navigation */
    navigationTimeout: 30000,
    
    /* Ignore HTTPS errors in test */
    ignoreHTTPSErrors: true,
  },
  
  /* Configure projects for different testing scenarios */
  projects: [
    // Desktop browsers
    {
      name: 'chromium-desktop',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 }
      },
    },
    
    {
      name: 'firefox-desktop',
      use: { 
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 720 }
      },
    },
    
    {
      name: 'webkit-desktop',
      use: { 
        ...devices['Desktop Safari'],
        viewport: { width: 1280, height: 720 }
      },
    },
    
    // Mobile devices
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
    
    {
      name: 'tablet-ipad',
      use: { ...devices['iPad Pro'] },
    },
    
    // Specific testing scenarios
    {
      name: 'high-dpi',
      use: {
        ...devices['Desktop Chrome'],
        deviceScaleFactor: 2,
        viewport: { width: 1920, height: 1080 }
      },
    },
    
    {
      name: 'slow-network',
      use: {
        ...devices['Desktop Chrome'],
        connectionType: 'slow-3g',
      },
    },
  ],
  
  /* Global setup and teardown */
  globalSetup: require.resolve('./e2e/setup/global-setup.ts'),
  globalTeardown: require.resolve('./e2e/setup/global-teardown.ts'),
  
  /* Run test server before starting tests */
  webServer: [
    {
      command: 'npm run start:test-server',
      url: 'http://localhost:3334',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    }
  ],
  
  /* Test timeout */
  timeout: 60 * 1000,
  
  /* Global test timeout */
  globalTimeout: 30 * 60 * 1000, // 30 minutes
  
  /* Expect timeout */
  expect: {
    timeout: 10000,
  },
  
  /* Output directory */
  outputDir: 'test-results/',
});