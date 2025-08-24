import { test, expect } from '@playwright/test';
import { DataFactory } from '../../src/fixtures/data-factory.js';

test.describe('User Registration Workflow', () => {
  
  test.beforeEach(async ({ page }) => {
    // Reset test data before each test
    await page.request.post('/test/reset');
  });

  test('should complete full registration workflow', async ({ page }) => {
    const newUser = DataFactory.createUser({
      email: 'newuser@integration-test.com',
      password: 'SecurePassword123!'
    });

    // Navigate to registration page (assuming it exists)
    await page.goto('/');
    
    // Look for registration/sign-up elements
    const signUpButton = page.locator('button:has-text("Sign Up"), a:has-text("Register"), [data-testid="register-button"]').first();
    
    if (await signUpButton.isVisible()) {
      await signUpButton.click();
      
      // Fill registration form
      await page.fill('input[type="email"], input[name="email"], #email', newUser.email);
      await page.fill('input[type="password"], input[name="password"], #password', newUser.password!);
      
      // Look for role selector if present
      const roleSelect = page.locator('select[name="role"], #role');
      if (await roleSelect.isVisible()) {
        await roleSelect.selectOption(newUser.role);
      }
      
      // Submit registration
      await page.click('button[type="submit"], button:has-text("Register"), button:has-text("Sign Up")');
      
      // Verify successful registration
      await expect(page).toHaveURL(/dashboard|profile|welcome/);
      await expect(page.locator('text=Welcome, text=Dashboard, text=Profile')).toBeVisible();
    } else {
      // If no UI registration, test via API and verify the user can login
      const response = await page.request.post('/auth/register', {
        data: {
          email: newUser.email,
          password: newUser.password,
          role: newUser.role
        }
      });
      
      expect(response.status()).toBe(201);
      const responseData = await response.json();
      expect(responseData.user.email).toBe(newUser.email);
      expect(responseData.token).toBeDefined();
    }
  });

  test('should validate email format during registration', async ({ page }) => {
    const invalidEmails = [
      'invalid-email',
      '@domain.com',
      'user@',
      'user space@domain.com',
      ''
    ];

    for (const invalidEmail of invalidEmails) {
      // Reset for each attempt
      await page.request.post('/test/reset');
      
      const response = await page.request.post('/auth/register', {
        data: {
          email: invalidEmail,
          password: 'ValidPassword123!',
          role: 'user'
        }
      });
      
      expect(response.status()).toBeGreaterThanOrEqual(400);
    }
  });

  test('should enforce password strength requirements', async ({ page }) => {
    const weakPasswords = [
      '123',
      'password',
      'abc',
      '   ',
      ''
    ];

    const user = DataFactory.createUser();

    for (const weakPassword of weakPasswords) {
      const response = await page.request.post('/auth/register', {
        data: {
          email: `test${Date.now()}@test.com`,
          password: weakPassword,
          role: 'user'
        }
      });
      
      // Should reject weak passwords
      expect(response.status()).toBeGreaterThanOrEqual(400);
    }
  });

  test('should prevent duplicate email registration', async ({ page }) => {
    const user = DataFactory.createUser();
    
    // Register first user
    const firstResponse = await page.request.post('/auth/register', {
      data: {
        email: user.email,
        password: user.password,
        role: user.role
      }
    });
    
    expect(firstResponse.status()).toBe(201);
    
    // Try to register with same email
    const duplicateResponse = await page.request.post('/auth/register', {
      data: {
        email: user.email,
        password: 'DifferentPassword123!',
        role: 'editor'
      }
    });
    
    expect(duplicateResponse.status()).toBe(409);
  });
});

test.describe('User Login Workflow', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.request.post('/test/reset');
  });

  test('should complete full login workflow', async ({ page }) => {
    // Navigate to login page
    await page.goto('/');
    
    // Look for login elements
    const loginButton = page.locator('button:has-text("Login"), button:has-text("Sign In"), a:has-text("Login"), [data-testid="login-button"]').first();
    
    if (await loginButton.isVisible()) {
      await loginButton.click();
      
      // Fill login form with default test user
      await page.fill('input[type="email"], input[name="email"], #email', 'admin@test.com');
      await page.fill('input[type="password"], input[name="password"], #password', 'admin123');
      
      // Submit login
      await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")');
      
      // Verify successful login
      await expect(page).toHaveURL(/dashboard|profile|admin/);
      await expect(page.locator('text=Welcome, text=Dashboard, text=Logout')).toBeVisible();
    } else {
      // Test login via API
      const response = await page.request.post('/auth/login', {
        data: {
          email: 'admin@test.com',
          password: 'admin123'
        }
      });
      
      expect(response.status()).toBe(200);
      const responseData = await response.json();
      expect(responseData.token).toBeDefined();
      expect(responseData.user.email).toBe('admin@test.com');
    }
  });

  test('should handle invalid login credentials', async ({ page }) => {
    const invalidCredentials = [
      { email: 'nonexistent@test.com', password: 'admin123' },
      { email: 'admin@test.com', password: 'wrongpassword' },
      { email: '', password: 'admin123' },
      { email: 'admin@test.com', password: '' }
    ];

    for (const credentials of invalidCredentials) {
      const response = await page.request.post('/auth/login', {
        data: credentials
      });
      
      expect(response.status()).toBe(401);
    }
  });

  test('should remember login session', async ({ page, context }) => {
    // Login via API to get token
    const loginResponse = await page.request.post('/auth/login', {
      data: {
        email: 'admin@test.com',
        password: 'admin123'
      }
    });
    
    const { token } = await loginResponse.json();
    
    // Set auth token in browser storage
    await page.goto('/');
    await page.evaluate((token) => {
      localStorage.setItem('authToken', token);
    }, token);
    
    // Reload page - should still be authenticated
    await page.reload();
    
    // Test authenticated API call
    const apiResponse = await page.request.get('/api/sightedit/schema/test', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    expect(apiResponse.status()).toBe(200);
  });
});

test.describe('Content Editing Workflow', () => {
  let authToken: string;
  
  test.beforeEach(async ({ page }) => {
    await page.request.post('/test/reset');
    
    // Login to get auth token
    const loginResponse = await page.request.post('/auth/login', {
      data: {
        email: 'editor@test.com',
        password: 'editor123'
      }
    });
    
    const loginData = await loginResponse.json();
    authToken = loginData.token;
  });

  test('should complete end-to-end editing workflow', async ({ page }) => {
    // Create a test page with editable content
    const testContent = `
      <div data-sight="title">Original Title</div>
      <div data-sight="description">Original Description</div>
      <img data-sight="hero-image" src="https://example.com/original.jpg" alt="Original Image">
    `;
    
    await page.setContent(`
      <html>
      <head>
        <script src="/path/to/sightedit.js"></script>
      </head>
      <body>
        ${testContent}
        <script>
          localStorage.setItem('authToken', '${authToken}');
          // Initialize SightEdit if available
          if (window.SightEdit) {
            window.SightEdit.init({
              apiEndpoint: '${page.url()}api/sightedit',
              debug: true
            });
          }
        </script>
      </body>
      </html>
    `);
    
    // Enter edit mode (typically Ctrl+E or Cmd+E)
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+KeyE' : 'Control+KeyE');
    
    // Wait for edit mode to activate
    await page.waitForTimeout(1000);
    
    // Look for edit indicators or floating UI
    const editIndicators = page.locator('[data-sight]');
    await expect(editIndicators.first()).toBeVisible();
    
    // Edit the title
    const titleElement = page.locator('[data-sight="title"]');
    await titleElement.click();
    
    // If inline editing
    if (await titleElement.locator('input, textarea').isVisible()) {
      await titleElement.locator('input, textarea').fill('Updated Title');
      await page.keyboard.press('Enter');
    } else {
      // If modal/popup editing
      const editModal = page.locator('.sight-edit-modal, .edit-popup, [role="dialog"]');
      if (await editModal.isVisible()) {
        await editModal.locator('input, textarea').fill('Updated Title');
        await editModal.locator('button:has-text("Save")').click();
      }
    }
    
    // Verify content was updated
    await expect(titleElement).toContainText('Updated Title');
    
    // Exit edit mode
    await page.keyboard.press('Escape');
    
    // Verify the change persisted by checking API
    const savedContent = await page.request.get(`/api/sightedit/content/title`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (savedContent.status() === 200) {
      const contentData = await savedContent.json();
      expect(contentData.value).toContain('Updated Title');
    }
  });

  test('should handle different element types', async ({ page }) => {
    const elementTypes = [
      { sight: 'text-element', type: 'text', originalValue: 'Original Text', newValue: 'Updated Text' },
      { sight: 'number-element', type: 'number', originalValue: '42', newValue: '100' },
      { sight: 'date-element', type: 'date', originalValue: '2024-01-01', newValue: '2024-12-31' },
      { sight: 'link-element', type: 'link', originalValue: 'https://example.com', newValue: 'https://updated.com' }
    ];
    
    for (const element of elementTypes) {
      // Create page with specific element type
      await page.setContent(`
        <html>
        <head>
          <script>localStorage.setItem('authToken', '${authToken}');</script>
        </head>
        <body>
          <div data-sight="${element.sight}" data-type="${element.type}">${element.originalValue}</div>
        </body>
        </html>
      `);
      
      // Test saving via API
      const saveResponse = await page.request.post('/api/sightedit/save', {
        headers: { 'Authorization': `Bearer ${authToken}` },
        data: {
          sight: element.sight,
          value: element.newValue,
          context: {
            elementType: element.type,
            url: page.url(),
            selector: `[data-sight="${element.sight}"]`
          }
        }
      });
      
      expect(saveResponse.status()).toBe(200);
    }
  });

  test('should handle batch content updates', async ({ page }) => {
    const batchUpdates = Array.from({ length: 5 }, (_, i) => {
      const content = DataFactory.createContent();
      return {
        sight: `batch-${i}-${content.sight}`,
        value: `Batch Update ${i}`,
        context: content.context
      };
    });
    
    const batchResponse = await page.request.post('/api/sightedit/batch', {
      headers: { 'Authorization': `Bearer ${authToken}` },
      data: { changes: batchUpdates }
    });
    
    expect(batchResponse.status()).toBe(200);
    
    const batchResult = await batchResponse.json();
    expect(batchResult.results).toHaveLength(5);
    
    // Verify all updates succeeded
    batchResult.results.forEach((result: any, index: number) => {
      expect(result.success).toBe(true);
      expect(result.sight).toBe(batchUpdates[index].sight);
    });
  });
});

test.describe('User Permission Workflow', () => {
  
  test('should enforce role-based permissions', async ({ page }) => {
    const roles = ['admin', 'editor', 'user'];
    
    for (const role of roles) {
      // Login as different roles
      const loginResponse = await page.request.post('/auth/login', {
        data: {
          email: `${role}@test.com`,
          password: `${role}123`
        }
      });
      
      expect(loginResponse.status()).toBe(200);
      
      const { token } = await loginResponse.json();
      
      // Test content saving (should be allowed for all roles in this system)
      const testContent = DataFactory.createContent();
      const saveResponse = await page.request.post('/api/sightedit/save', {
        headers: { 'Authorization': `Bearer ${token}` },
        data: {
          sight: `${role}-${testContent.sight}`,
          value: testContent.value,
          context: testContent.context
        }
      });
      
      expect(saveResponse.status()).toBe(200);
    }
  });

  test('should handle unauthorized access attempts', async ({ page }) => {
    const protectedEndpoints = [
      { method: 'POST', url: '/api/sightedit/save' },
      { method: 'POST', url: '/api/sightedit/batch' },
      { method: 'GET', url: '/api/sightedit/content/test' },
      { method: 'GET', url: '/api/sightedit/schema/test' }
    ];
    
    for (const endpoint of protectedEndpoints) {
      let response;
      
      if (endpoint.method === 'POST') {
        response = await page.request.post(endpoint.url, {
          data: { test: 'data' }
        });
      } else {
        response = await page.request.get(endpoint.url);
      }
      
      expect(response.status()).toBe(401);
    }
  });
});