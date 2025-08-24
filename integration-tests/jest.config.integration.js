export default {
  displayName: 'Integration Tests',
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.integration.test.ts',
    '**/*.integration.test.ts'
  ],
  testTimeout: 30000,
  setupFilesAfterEnv: [
    '<rootDir>/src/setup/database.setup.ts',
    '<rootDir>/src/setup/auth.setup.ts',
    '<rootDir>/src/setup/server.setup.ts'
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true
    }]
  },
  moduleNameMapping: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/setup/**',
    '!src/fixtures/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  globalSetup: '<rootDir>/src/setup/global-setup.ts',
  globalTeardown: '<rootDir>/src/setup/global-teardown.ts',
  maxWorkers: 1, // Prevent race conditions in integration tests
  testSequencer: '<rootDir>/src/utils/test-sequencer.ts'
};