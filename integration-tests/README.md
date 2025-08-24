# SightEdit Integration Tests

This directory contains comprehensive integration tests for the SightEdit system, covering all aspects of functionality, performance, security, and accessibility.

## Test Suite Overview

### 📋 Test Categories

1. **API Integration Tests** (`src/api/`)
   - Complete endpoint testing
   - Authentication and authorization
   - Request/response validation
   - Error handling

2. **Database Integration Tests** (`src/database/`)
   - Multi-backend support (PostgreSQL, MySQL, MongoDB, Redis)
   - Data consistency
   - Transaction handling
   - Performance optimization

3. **Security Tests** (`src/security/`)
   - XSS protection
   - SQL injection prevention
   - CSRF protection
   - Input validation and sanitization

4. **Real-time Collaboration Tests** (`src/collaboration/`)
   - WebSocket communication
   - Multi-user scenarios
   - Conflict resolution
   - Presence management

5. **Performance Tests** (`src/performance/`)
   - Load testing
   - Stress testing
   - Response time validation
   - Resource usage monitoring

6. **End-to-End Tests** (`e2e/`)
   - Complete user workflows
   - Cross-browser compatibility
   - Visual regression testing
   - Mobile responsiveness

7. **Accessibility Tests** (`src/accessibility/`)
   - WCAG 2.1 AA compliance
   - Screen reader compatibility
   - Keyboard navigation
   - Color contrast validation

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose
- Playwright browsers (automatically installed)

### Installation

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install

# Start test services
npm run docker:up
```

### Environment Setup

Copy the environment template and configure for your setup:

```bash
cp .env.test.example .env.test
# Edit .env.test with your configuration
```

## 🧪 Running Tests

### Quick Commands

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:api          # API integration tests
npm run test:database     # Database tests
npm run test:auth         # Authentication tests
npm run test:security     # Security tests
npm run test:collaboration # Real-time collaboration
npm run test:performance  # Performance and load tests
npm run test:accessibility # A11y tests

# E2E tests with Playwright
npm run test:e2e          # All browsers
npm run test:e2e:chrome   # Chrome only
npm run test:e2e:firefox  # Firefox only
npm run test:e2e:safari   # Safari only
```

### Coverage and Reporting

```bash
# Run tests with coverage
npm run test:coverage

# Generate detailed reports
npm run test:report

# Visual regression testing
cd e2e/visual-regression
npx playwright test
```

## 🐳 Docker Services

The test environment uses Docker Compose to provide:

- PostgreSQL 15 (port 5433)
- MySQL 8.0 (port 3307)  
- MongoDB 7.0 (port 27018)
- Redis 7 (port 6380)
- MinIO S3 (port 9001)

```bash
# Service management
npm run docker:up     # Start all services
npm run docker:down   # Stop and remove services
npm run docker:logs   # View service logs
```

## 🔧 Configuration

### Test Configuration Files

- `jest.config.integration.js` - Jest configuration for unit/integration tests
- `playwright.config.ts` - Playwright configuration for E2E tests
- `docker/docker-compose.test.yml` - Test services configuration
- `.env.test` - Environment variables

### Key Environment Variables

```bash
# Database connections
POSTGRES_HOST=localhost
POSTGRES_PORT=5433
MYSQL_HOST=localhost
MYSQL_PORT=3307
MONGODB_HOST=localhost
MONGODB_PORT=27018
REDIS_HOST=localhost
REDIS_PORT=6380

# Test server
TEST_SERVER_PORT=3334
TEST_API_BASE_URL=http://localhost:3334

# Security
JWT_SECRET=test-secret-key

# Performance thresholds
PERFORMANCE_TEST_DURATION=30000
LOAD_TEST_CONCURRENT_USERS=50
```

## 📊 Test Coverage

### Coverage Targets

- **Statements**: 80%
- **Branches**: 75%
- **Functions**: 80%
- **Lines**: 80%

### Coverage Reports

Coverage reports are generated in multiple formats:
- HTML: `coverage/lcov-report/index.html`
- JSON: `coverage/coverage-final.json`
- LCOV: `coverage/lcov.info`

## 🤖 CI/CD Integration

### GitHub Actions

The test suite is integrated with GitHub Actions (`.github/workflows/integration-tests.yml`) and runs:

- **Unit & Integration Tests**: Matrix testing across Node.js versions and databases
- **E2E Tests**: Cross-browser testing with sharding
- **Security Scanning**: OWASP ZAP and npm audit
- **Performance Tests**: Load testing with Artillery
- **Visual Regression**: Screenshot comparison testing
- **Accessibility**: Automated WCAG compliance testing

### Test Execution Flow

1. **Setup Phase**: Start Docker services, install dependencies
2. **Unit/Integration Tests**: Run Jest tests with coverage
3. **E2E Tests**: Run Playwright tests across browsers
4. **Security Tests**: Run security-focused test suites
5. **Performance Tests**: Execute load and stress tests
6. **Visual/A11y Tests**: Screenshot and accessibility validation
7. **Reporting**: Generate comprehensive test reports

## 📈 Performance Testing

### Load Testing Scenarios

- **Normal Load**: 50 concurrent users, 5 minutes
- **Stress Test**: 100+ concurrent users, escalating load
- **Spike Test**: Sudden traffic increases
- **Volume Test**: Large data sets and batch operations

### Performance Metrics

- Response time percentiles (P50, P95, P99)
- Throughput (requests per second)
- Error rates
- Resource utilization

### Artillery Configuration

```yaml
config:
  target: 'http://localhost:3334'
  phases:
    - duration: 300
      arrivalRate: 5
    - duration: 300  
      arrivalRate: 10
    - duration: 600
      arrivalRate: 15
```

## 🔒 Security Testing

### Security Test Categories

1. **Input Validation**
   - XSS payload testing
   - SQL injection attempts
   - Command injection prevention
   - Path traversal protection

2. **Authentication Security**
   - Token validation
   - Session management
   - Authorization bypass attempts
   - Brute force protection

3. **Data Protection**
   - Sensitive data exposure
   - Encryption validation
   - CSRF protection
   - HTTP header security

### OWASP ZAP Integration

Automated security scanning with OWASP ZAP:
- Baseline scan for common vulnerabilities
- Custom rules for application-specific tests
- Integration with CI/CD pipeline

## ♿ Accessibility Testing

### WCAG 2.1 AA Compliance

Tests validate compliance with:
- Perceivable: Color contrast, text alternatives
- Operable: Keyboard navigation, focus management
- Understandable: Clear language, consistent navigation
- Robust: Screen reader compatibility

### Accessibility Tools

- **axe-core**: Automated accessibility testing
- **Playwright a11y**: Browser-based accessibility checks
- **Color contrast**: Automated contrast ratio validation
- **Keyboard navigation**: Tab order and focus testing

## 📱 Mobile and Responsive Testing

### Device Testing Matrix

- Desktop: 1920x1080, 1366x768
- Tablet: iPad (768x1024), iPad Pro (1024x1366)
- Mobile: iPhone (375x667), Android (360x640)

### Touch Interaction Tests

- Minimum touch target size (44px)
- Gesture support
- Responsive breakpoints
- Mobile-specific UI elements

## 🐛 Debugging Tests

### Debug Mode

```bash
# Run tests in debug mode
npm run test:debug

# Run specific test with debugging
npm test -- --testNamePattern="specific test" --detectOpenHandles --forceExit

# Debug E2E tests
npx playwright test --debug
npx playwright test --headed --slowMo=1000
```

### Test Artifacts

Failed tests generate artifacts:
- Screenshots on failure
- Video recordings (E2E tests)
- Network logs
- Console output
- Coverage reports

### Common Issues

1. **Database connection errors**: Ensure Docker services are running
2. **Port conflicts**: Check if test ports (3334, 5433, etc.) are available
3. **Browser issues**: Update Playwright browsers with `npx playwright install`
4. **Memory issues**: Increase Node.js memory limit: `--max-old-space-size=4096`

## 📝 Writing New Tests

### Test Structure Guidelines

```typescript
describe('Feature Integration Tests', () => {
  let testServer: TestServer;
  let baseURL: string;
  
  beforeAll(async () => {
    testServer = new TestServer({ port: 3340 });
    await testServer.start();
    baseURL = testServer.getBaseUrl();
  });

  afterAll(async () => {
    await testServer.stop();
  });

  beforeEach(async () => {
    // Reset test data
    await request(baseURL).post('/test/reset');
  });

  test('should handle specific scenario', async () => {
    // Arrange
    const testData = DataFactory.createTestData();
    
    // Act
    const response = await request(baseURL)
      .post('/api/endpoint')
      .send(testData);
    
    // Assert
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject(expectedResult);
  });
});
```

### Best Practices

1. **Isolation**: Each test should be independent
2. **Clean State**: Reset data before each test
3. **Realistic Data**: Use DataFactory for test data generation
4. **Clear Assertions**: Test one thing at a time
5. **Error Scenarios**: Include negative test cases
6. **Performance**: Consider test execution time

## 🔄 Maintenance

### Regular Tasks

- Update test dependencies monthly
- Review and update test data fixtures
- Monitor test execution times
- Update browser versions for E2E tests
- Review security test payloads
- Validate accessibility standards updates

### Monitoring

- Test execution metrics in CI/CD
- Coverage trends over time
- Performance regression detection
- Flaky test identification
- Resource usage optimization

## 📚 Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Playwright Testing](https://playwright.dev/docs/intro)
- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [axe-core Rules](https://github.com/dequelabs/axe-core/blob/master/doc/rule-descriptions.md)

## 🆘 Support

For issues with the test suite:
1. Check the troubleshooting section above
2. Review test logs in `test-results/`
3. Ensure all prerequisites are installed
4. Verify Docker services are running
5. Check for port conflicts

For questions or improvements, please open an issue or pull request.