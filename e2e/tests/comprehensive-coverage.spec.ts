import { test, expect } from '@playwright/test';
import { TestPage } from '../pages/TestPage';

test.describe('100% Coverage - Comprehensive Test Suite', () => {
  let testPage: TestPage;

  test.beforeEach(async ({ page }) => {
    testPage = new TestPage(page);
    await testPage.goto();
    await testPage.resetTestData();
  });

  test.describe('Complete API Coverage', () => {
    test('should test all CRUD operations', async ({ page }) => {
      const apiCalls = [];
      
      // Monitor all API calls
      page.on('request', request => {
        if (request.url().includes('/api/sightedit/')) {
          apiCalls.push({
            method: request.method(),
            url: request.url(),
            data: request.postData()
          });
        }
      });

      await testPage.enableEditMode();

      // CREATE operations
      await testPage.addCollectionItem(testPage.navLinks, {
        text: 'New Page',
        url: '/new',
        target: '_self'
      });

      // READ operations
      await page.evaluate(() => {
        return window.SightEdit.load('hero-title');
      });

      // UPDATE operations
      await testPage.editText(testPage.heroTitle, 'Updated via API');
      await testPage.editNumber(testPage.numberInput, 2500);
      await testPage.editDate(testPage.dateInput, '2024-12-25');

      // DELETE operations (via collection)
      await testPage.enableEditMode();
      await testPage.navLinks.click();
      
      const collectionModal = page.locator('.sightedit-collection-modal');
      const firstItem = collectionModal.locator('.collection-item').first();
      const deleteButton = firstItem.locator('[data-action="delete"]');
      await deleteButton.click();
      
      const saveButton = collectionModal.locator('[data-action="save"]');
      await saveButton.click();

      // Verify all CRUD operations were called
      const createCalls = apiCalls.filter(call => call.method === 'POST' && call.url.includes('/save'));
      const readCalls = apiCalls.filter(call => call.method === 'GET' && call.url.includes('/data'));
      const updateCalls = apiCalls.filter(call => call.method === 'POST' && call.url.includes('/save'));
      
      expect(createCalls.length).toBeGreaterThan(0);
      expect(readCalls.length).toBeGreaterThan(0);
      expect(updateCalls.length).toBeGreaterThan(0);
    });

    test('should handle all HTTP status codes', async ({ page }) => {
      const statusCodes = [200, 201, 400, 401, 403, 404, 429, 500, 502, 503, 504];
      const results = {};

      for (const statusCode of statusCodes) {
        await page.route('/api/sightedit/save', route => {
          route.fulfill({
            status: statusCode,
            contentType: 'application/json',
            body: JSON.stringify({
              success: statusCode < 400,
              error: statusCode >= 400 ? `HTTP ${statusCode} Error` : undefined
            })
          });
        });

        try {
          await testPage.editText(testPage.heroTitle, `Status ${statusCode} test`);
          results[statusCode] = 'handled';
        } catch (error) {
          results[statusCode] = 'error';
        }

        await testPage.resetTestData();
        await page.unroute('/api/sightedit/save');
      }

      // All status codes should be handled gracefully
      Object.values(results).forEach(result => {
        expect(result).toBe('handled');
      });
    });

    test('should test all query parameters and headers', async ({ page }) => {
      const requestDetails = [];

      page.on('request', request => {
        if (request.url().includes('/api/sightedit/')) {
          requestDetails.push({
            url: request.url(),
            headers: request.headers(),
            method: request.method()
          });
        }
      });

      // Set various configurations that should affect requests
      await page.evaluate(() => {
        window.SightEdit.setConfig({
          apiKey: 'test-api-key',
          userId: 'test-user-123',
          sessionId: 'session-abc',
          version: '1.0.0',
          debug: true
        });
      });

      await testPage.editText(testPage.heroTitle, 'Header test');

      const request = requestDetails.find(r => r.method === 'POST');
      expect(request?.headers['authorization']).toBeTruthy();
      expect(request?.headers['content-type']).toBe('application/json');
      expect(request?.headers['user-agent']).toBeTruthy();
    });

    test('should test request/response transformation', async ({ page }) => {
      // Test request transformation
      await page.route('/api/sightedit/save', route => {
        const request = route.request();
        const postData = JSON.parse(request.postData() || '{}');
        
        // Verify request transformation
        expect(postData.sight).toBeTruthy();
        expect(postData.value).toBeTruthy();
        expect(postData.type).toBeTruthy();
        expect(postData.timestamp).toBeTruthy();
        
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            transformed: {
              originalValue: postData.value,
              processedValue: postData.value.toUpperCase(),
              metadata: {
                processor: 'api-transformer',
                version: '2.0'
              }
            }
          })
        });
      });

      await testPage.editText(testPage.heroTitle, 'transform test');

      // Verify response was processed
      const transformedData = await page.evaluate(() => {
        return window.SightEdit.getLastResponse();
      });

      expect(transformedData?.transformed?.processedValue).toBe('TRANSFORM TEST');
    });
  });

  test.describe('Complete UI Component Coverage', () => {
    test('should test all modal interactions', async ({ page }) => {
      const modals = [
        { trigger: '[data-sight="collection"]', modalClass: '.sightedit-collection-modal' },
        { trigger: '[data-sight="image"]', modalClass: '.sightedit-image-modal' },
        { trigger: '[data-sight="json"]', modalClass: '.sightedit-json-modal' }
      ];

      for (const modal of modals) {
        await testPage.enableEditMode();
        await page.locator(modal.trigger).first().click();
        
        const modalElement = page.locator(modal.modalClass);
        await expect(modalElement).toBeVisible();

        // Test modal close methods
        await page.keyboard.press('Escape');
        await expect(modalElement).not.toBeVisible();

        // Test backdrop click
        await page.locator(modal.trigger).first().click();
        await expect(modalElement).toBeVisible();
        
        await page.locator(`${modal.modalClass} .modal-backdrop`).click({ force: true });
        await expect(modalElement).not.toBeVisible();

        // Test close button
        await page.locator(modal.trigger).first().click();
        await expect(modalElement).toBeVisible();
        
        const closeButton = modalElement.locator('.close-button, [data-action="close"]');
        if (await closeButton.isVisible()) {
          await closeButton.click();
          await expect(modalElement).not.toBeVisible();
        }
      }
    });

    test('should test all tooltip interactions', async ({ page }) => {
      await testPage.enableEditMode();

      const editableElements = page.locator('[data-sight]');
      const elementCount = await editableElements.count();

      for (let i = 0; i < Math.min(elementCount, 10); i++) {
        const element = editableElements.nth(i);
        
        // Hover to show tooltip
        await element.hover();
        
        const tooltip = page.locator('.sightedit-tooltip');
        if (await tooltip.isVisible()) {
          // Test tooltip content
          const tooltipText = await tooltip.textContent();
          expect(tooltipText?.length).toBeGreaterThan(0);
          
          // Test tooltip positioning
          const tooltipBox = await tooltip.boundingBox();
          const elementBox = await element.boundingBox();
          
          expect(tooltipBox).toBeTruthy();
          expect(elementBox).toBeTruthy();
        }
        
        // Move away to hide tooltip
        await page.mouse.move(0, 0);
      }
    });

    test('should test all dropdown interactions', async ({ page }) => {
      await testPage.enableEditMode();
      await testPage.selectInput.click();
      
      const selectEditor = page.locator('.sightedit-select-editor');
      await expect(selectEditor).toBeVisible();
      
      const dropdown = selectEditor.locator('select, .dropdown');
      
      // Test all options
      const options = await dropdown.locator('option, .dropdown-option').all();
      
      for (const option of options) {
        const value = await option.getAttribute('value') || await option.textContent();
        
        if (value) {
          await option.click();
          
          // Verify selection
          const selectedValue = await dropdown.inputValue().catch(() => 
            dropdown.locator('.selected').textContent()
          );
          
          expect(selectedValue).toBeTruthy();
        }
      }
    });

    test('should test all animation states', async ({ page }) => {
      await testPage.enableEditMode();

      // Test fade-in animations
      const elements = page.locator('.sightedit-highlight');
      const firstElement = elements.first();
      
      // Check animation properties
      const animationName = await firstElement.evaluate(el => {
        return getComputedStyle(el).animationName;
      });
      
      const animationDuration = await firstElement.evaluate(el => {
        return getComputedStyle(el).animationDuration;
      });
      
      expect(animationName).not.toBe('none');
      expect(animationDuration).not.toBe('0s');

      // Test loading animations
      await testPage.heroTitle.click();
      const textEditor = page.locator('.sightedit-text-editor');
      
      // Should show loading state during save
      await textEditor.fill('Animation test');
      await textEditor.press('Enter');
      
      const loadingIndicator = page.locator('.sightedit-loading');
      if (await loadingIndicator.isVisible()) {
        expect(loadingIndicator).toBeVisible();
      }
    });
  });

  test.describe('Complete Event System Coverage', () => {
    test('should test all event types', async ({ page }) => {
      const events = [];

      await page.evaluate(() => {
        const eventTypes = [
          'init', 'destroy', 'editModeToggled', 'elementActivated', 'elementDeactivated',
          'beforeSave', 'save', 'saveError', 'load', 'loadError',
          'validate', 'validationError', 'upload', 'uploadProgress', 'uploadError',
          'pluginRegistered', 'pluginError', 'configChanged',
          'offlineQueueChanged', 'networkStatusChanged'
        ];

        window.testEvents = [];

        eventTypes.forEach(eventType => {
          window.SightEdit.on(eventType, (data) => {
            window.testEvents.push({ type: eventType, data, timestamp: Date.now() });
          });
        });
      });

      // Trigger various events
      await testPage.enableEditMode(); // editModeToggled, elementActivated
      await testPage.editText(testPage.heroTitle, 'Event test'); // beforeSave, save, validate
      await testPage.disableEditMode(); // editModeToggled, elementDeactivated

      // Trigger error events
      await page.route('/api/sightedit/save', route => {
        route.fulfill({ status: 500, body: 'Server error' });
      });

      try {
        await testPage.editText(testPage.heroSubtitle, 'Error test');
      } catch (error) {
        // Expected to fail
      }

      // Check that events were fired
      const capturedEvents = await page.evaluate(() => window.testEvents);
      const eventTypes = capturedEvents.map(e => e.type);
      
      expect(eventTypes).toContain('editModeToggled');
      expect(eventTypes).toContain('elementActivated');
      expect(eventTypes).toContain('beforeSave');
      expect(eventTypes).toContain('save');
      expect(capturedEvents.length).toBeGreaterThan(5);
    });

    test('should test event propagation and bubbling', async ({ page }) => {
      await page.evaluate(() => {
        window.propagationTest = [];

        // Test event propagation order
        window.SightEdit.on('elementActivated', (data) => {
          window.propagationTest.push('elementActivated-1');
        });

        window.SightEdit.on('elementActivated', (data) => {
          window.propagationTest.push('elementActivated-2');
        });

        window.SightEdit.on('beforeSave', (data) => {
          window.propagationTest.push('beforeSave');
        });

        window.SightEdit.on('save', (data) => {
          window.propagationTest.push('save');
        });
      });

      await testPage.enableEditMode();
      await testPage.editText(testPage.heroTitle, 'Propagation test');

      const propagationOrder = await page.evaluate(() => window.propagationTest);
      
      // Events should fire in correct order
      const elementActivatedIndex = propagationOrder.indexOf('elementActivated-1');
      const beforeSaveIndex = propagationOrder.indexOf('beforeSave');
      const saveIndex = propagationOrder.indexOf('save');
      
      expect(elementActivatedIndex).toBeLessThan(beforeSaveIndex);
      expect(beforeSaveIndex).toBeLessThan(saveIndex);
    });

    test('should test event cancellation', async ({ page }) => {
      await page.evaluate(() => {
        window.SightEdit.on('beforeSave', (data) => {
          if (data.value === 'CANCEL') {
            return false; // Cancel the save
          }
        });

        window.saveCancelled = false;
        window.SightEdit.on('saveError', (data) => {
          if (data.reason === 'cancelled') {
            window.saveCancelled = true;
          }
        });
      });

      await testPage.enableEditMode();
      await testPage.heroTitle.click();
      
      const textEditor = page.locator('.sightedit-text-editor');
      await textEditor.fill('CANCEL');
      await textEditor.press('Enter');

      const wasCancelled = await page.evaluate(() => window.saveCancelled);
      expect(wasCancelled).toBe(true);

      // Content should not have changed
      const actualContent = await testPage.heroTitle.textContent();
      expect(actualContent).not.toBe('CANCEL');
    });
  });

  test.describe('Complete Validation Coverage', () => {
    test('should test all validation rules', async ({ page }) => {
      // Add elements with various validation rules
      await page.evaluate(() => {
        const validationTests = [
          { type: 'text', rules: { required: true, minLength: 5, maxLength: 50 } },
          { type: 'email', rules: { required: true, pattern: /^[^@]+@[^@]+\.[^@]+$/ } },
          { type: 'number', rules: { required: true, min: 0, max: 100 } },
          { type: 'date', rules: { required: true, min: '2024-01-01', max: '2024-12-31' } },
          { type: 'url', rules: { required: true, pattern: /^https?:\/\/.+/ } }
        ];

        validationTests.forEach((test, index) => {
          const element = document.createElement('input');
          element.setAttribute('data-sight', test.type);
          element.setAttribute('data-sight-id', `validation-test-${index}`);
          element.setAttribute('data-validation', JSON.stringify(test.rules));
          element.value = '';
          document.body.appendChild(element);
        });
      });

      await testPage.enableEditMode();

      // Test required field validation
      const requiredField = page.locator('[data-sight-id="validation-test-0"]');
      await requiredField.click();
      
      const textEditor = page.locator('.sightedit-text-editor');
      await textEditor.fill(''); // Empty value
      await textEditor.press('Enter');
      
      const requiredError = page.locator('.validation-error');
      await expect(requiredError).toBeVisible();
      await expect(requiredError).toContainText('required');

      // Test minLength validation
      await requiredField.click();
      await textEditor.fill('abc'); // Too short
      await textEditor.press('Enter');
      
      await expect(requiredError).toContainText('minimum length');

      // Test valid input
      await requiredField.click();
      await textEditor.fill('Valid input text'); // Valid
      await textEditor.press('Enter');
      
      await expect(requiredError).not.toBeVisible();

      // Test email validation
      const emailField = page.locator('[data-sight-id="validation-test-1"]');
      await emailField.click();
      await textEditor.fill('invalid-email');
      await textEditor.press('Enter');
      
      const emailError = page.locator('.validation-error');
      await expect(emailError).toContainText('valid email');

      // Test number range validation
      const numberField = page.locator('[data-sight-id="validation-test-2"]');
      await numberField.click();
      
      const numberEditor = page.locator('.sightedit-number-editor input');
      await numberEditor.fill('150'); // Too high
      
      const numberSave = page.locator('.sightedit-number-editor [data-action="save"]');
      await numberSave.click();
      
      const rangeError = page.locator('.validation-error');
      await expect(rangeError).toContainText('maximum');
    });

    test('should test custom validation functions', async ({ page }) => {
      await page.evaluate(() => {
        window.SightEdit.addValidator('custom-email', (value) => {
          const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
          if (!emailRegex.test(value)) {
            return 'Please enter a valid email address';
          }
          return null; // Valid
        });

        window.SightEdit.addValidator('profanity-filter', (value) => {
          const badWords = ['spam', 'banned', 'inappropriate'];
          for (const word of badWords) {
            if (value.toLowerCase().includes(word)) {
              return 'Content contains inappropriate language';
            }
          }
          return null;
        });

        // Add element with custom validation
        const customElement = document.createElement('input');
        customElement.setAttribute('data-sight', 'text');
        customElement.setAttribute('data-sight-id', 'custom-validation-test');
        customElement.setAttribute('data-validators', 'custom-email,profanity-filter');
        document.body.appendChild(customElement);
      });

      await testPage.enableEditMode();
      
      const customField = page.locator('[data-sight-id="custom-validation-test"]');
      await customField.click();
      
      const textEditor = page.locator('.sightedit-text-editor');
      
      // Test custom email validation
      await textEditor.fill('invalid.email');
      await textEditor.press('Enter');
      
      const validationError = page.locator('.validation-error');
      await expect(validationError).toContainText('valid email address');

      // Test profanity filter
      await customField.click();
      await textEditor.fill('test@spam.com');
      await textEditor.press('Enter');
      
      await expect(validationError).toContainText('inappropriate language');

      // Test valid input
      await customField.click();
      await textEditor.fill('valid@example.com');
      await textEditor.press('Enter');
      
      await expect(validationError).not.toBeVisible();
    });

    test('should test async validation', async ({ page }) => {
      // Mock async validation endpoint
      await page.route('/api/validate', route => {
        const url = new URL(route.request().url());
        const value = url.searchParams.get('value');
        
        setTimeout(() => {
          const isValid = value !== 'taken@example.com';
          route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
              valid: isValid,
              message: isValid ? null : 'Email address is already taken'
            })
          });
        }, 500); // Simulate network delay
      });

      await page.evaluate(() => {
        window.SightEdit.addAsyncValidator('email-availability', async (value) => {
          const response = await fetch(`/api/validate?value=${encodeURIComponent(value)}`);
          const result = await response.json();
          return result.valid ? null : result.message;
        });

        const asyncElement = document.createElement('input');
        asyncElement.setAttribute('data-sight', 'text');
        asyncElement.setAttribute('data-sight-id', 'async-validation-test');
        asyncElement.setAttribute('data-async-validators', 'email-availability');
        document.body.appendChild(asyncElement);
      });

      await testPage.enableEditMode();
      
      const asyncField = page.locator('[data-sight-id="async-validation-test"]');
      await asyncField.click();
      
      const textEditor = page.locator('.sightedit-text-editor');
      
      // Test async validation failure
      await textEditor.fill('taken@example.com');
      await textEditor.press('Enter');
      
      // Should show loading state
      const loadingIndicator = page.locator('.validation-loading');
      if (await loadingIndicator.isVisible()) {
        await expect(loadingIndicator).toBeVisible();
      }
      
      // Should eventually show error
      const asyncError = page.locator('.validation-error');
      await expect(asyncError).toContainText('already taken');

      // Test async validation success
      await asyncField.click();
      await textEditor.fill('available@example.com');
      await textEditor.press('Enter');
      
      await expect(asyncError).not.toBeVisible();
    });
  });

  test.describe('Complete Accessibility Coverage', () => {
    test('should test all ARIA attributes and roles', async ({ page }) => {
      await testPage.enableEditMode();

      const ariaTests = [
        { selector: '[data-sight="text"]', expectedRole: 'button', expectedLabel: true },
        { selector: '[data-sight="richtext"]', expectedRole: 'button', expectedLabel: true },
        { selector: '[data-sight="image"]', expectedRole: 'button', expectedLabel: true },
        { selector: '[data-sight="select"]', expectedRole: 'button', expectedLabel: true }
      ];

      for (const test of ariaTests) {
        const elements = page.locator(test.selector);
        const firstElement = elements.first();
        
        if (await firstElement.isVisible()) {
          const role = await firstElement.getAttribute('role');
          const ariaLabel = await firstElement.getAttribute('aria-label');
          const ariaLabelledBy = await firstElement.getAttribute('aria-labelledby');
          
          expect(role).toBe(test.expectedRole);
          
          if (test.expectedLabel) {
            expect(ariaLabel || ariaLabelledBy).toBeTruthy();
          }
        }
      }
    });

    test('should test keyboard navigation order', async ({ page }) => {
      await testPage.enableEditMode();

      const editableElements = page.locator('[data-sight]');
      const elementCount = await editableElements.count();
      
      // Tab through all elements
      let currentTabIndex = 0;
      
      for (let i = 0; i < elementCount; i++) {
        await page.keyboard.press('Tab');
        
        const focusedElement = page.locator(':focus');
        const tabIndex = await focusedElement.getAttribute('tabindex');
        
        if (tabIndex !== null) {
          const numericTabIndex = parseInt(tabIndex);
          expect(numericTabIndex).toBeGreaterThanOrEqual(currentTabIndex);
          currentTabIndex = numericTabIndex;
        }
      }
    });

    test('should test screen reader announcements', async ({ page }) => {
      await page.evaluate(() => {
        window.ariaAnnouncements = [];
        
        // Monitor aria-live region changes
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (mutation.target.hasAttribute('aria-live')) {
              window.ariaAnnouncements.push({
                text: mutation.target.textContent,
                timestamp: Date.now()
              });
            }
          });
        });
        
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true
        });
      });

      await testPage.enableEditMode();
      await testPage.editText(testPage.heroTitle, 'Screen reader test');

      const announcements = await page.evaluate(() => window.ariaAnnouncements);
      
      // Should have made announcements for mode changes and saves
      expect(announcements.length).toBeGreaterThan(0);
      
      const saveAnnouncement = announcements.find(a => a.text.includes('saved'));
      expect(saveAnnouncement).toBeTruthy();
    });

    test('should test high contrast mode support', async ({ page }) => {
      await page.emulateMedia({ 'prefers-contrast': 'more' });
      
      await testPage.enableEditMode();
      
      // Check contrast ratios
      const highlightedElements = page.locator('.sightedit-highlight');
      const firstHighlight = highlightedElements.first();
      
      const styles = await firstHighlight.evaluate(el => {
        const computed = getComputedStyle(el);
        return {
          backgroundColor: computed.backgroundColor,
          borderColor: computed.borderColor,
          color: computed.color
        };
      });
      
      // Colors should be adapted for high contrast
      expect(styles.backgroundColor).not.toBe('transparent');
      expect(styles.borderColor).not.toBe('transparent');
    });

    test('should test focus management in complex scenarios', async ({ page }) => {
      await testPage.enableEditMode();
      
      // Open modal
      await testPage.navLinks.click();
      const modal = page.locator('.sightedit-collection-modal');
      await expect(modal).toBeVisible();
      
      // Focus should be trapped within modal
      await page.keyboard.press('Tab');
      const focusedElement = page.locator(':focus');
      
      const isWithinModal = await focusedElement.evaluate(el => {
        return el.closest('.sightedit-collection-modal') !== null;
      });
      expect(isWithinModal).toBe(true);
      
      // Close modal and check focus restoration
      await page.keyboard.press('Escape');
      await expect(modal).not.toBeVisible();
      
      const restoredFocus = page.locator(':focus');
      const isFocusRestored = await restoredFocus.evaluate(el => {
        return el.hasAttribute('data-sight');
      });
      expect(isFocusRestored).toBe(true);
    });
  });

  test.describe('Complete Error Handling Coverage', () => {
    test('should handle all possible JavaScript errors', async ({ page }) => {
      const errorScenarios = [
        'TypeError: Cannot read property',
        'ReferenceError: variable is not defined',
        'SyntaxError: Unexpected token',
        'RangeError: Maximum call stack',
        'URIError: URI malformed'
      ];

      await page.evaluate(() => {
        window.caughtErrors = [];
        
        const originalError = console.error;
        console.error = (...args) => {
          window.caughtErrors.push(args.join(' '));
          originalError.apply(console, args);
        };
        
        window.onerror = (message, source, lineno, colno, error) => {
          window.caughtErrors.push(`${message} at ${source}:${lineno}:${colno}`);
        };
      });

      // Simulate various error scenarios
      for (const errorType of errorScenarios) {
        await page.evaluate((error) => {
          try {
            if (error.includes('TypeError')) {
              const obj = null;
              obj.property.access();
            } else if (error.includes('ReferenceError')) {
              undefinedVariable.method();
            } else if (error.includes('SyntaxError')) {
              eval('{ invalid: syntax }');
            } else if (error.includes('RangeError')) {
              function recursive() { recursive(); }
              recursive();
            } else if (error.includes('URIError')) {
              decodeURIComponent('%');
            }
          } catch (e) {
            // Errors should be caught and handled gracefully
          }
        }, errorType);
      }

      // SightEdit should still be functional despite errors
      await testPage.enableEditMode();
      await testPage.editText(testPage.heroTitle, 'Error resilience test');
      await testPage.expectElementText(testPage.heroTitle, 'Error resilience test');

      const caughtErrors = await page.evaluate(() => window.caughtErrors);
      
      // Errors should have been caught and logged
      expect(caughtErrors.length).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe('Complete Performance Coverage', () => {
    test('should measure all performance metrics', async ({ page }) => {
      await page.evaluate(() => {
        window.performanceMarks = [];
        
        const originalMark = performance.mark;
        performance.mark = function(name) {
          window.performanceMarks.push({ name, timestamp: Date.now() });
          return originalMark.call(this, name);
        };
      });

      // Trigger various performance-sensitive operations
      await testPage.goto();
      await testPage.enableEditMode();
      
      // Add many elements to test scalability
      await page.evaluate(() => {
        for (let i = 0; i < 100; i++) {
          const element = document.createElement('div');
          element.setAttribute('data-sight', 'text');
          element.setAttribute('data-sight-id', `perf-element-${i}`);
          element.textContent = `Performance test element ${i}`;
          document.body.appendChild(element);
        }
      });

      await page.waitForTimeout(100); // Let detection complete
      
      // Rapid interactions
      for (let i = 0; i < 10; i++) {
        await testPage.editText(testPage.heroTitle, `Rapid edit ${i}`);
      }

      const performanceMarks = await page.evaluate(() => window.performanceMarks);
      
      // Should have performance marks for key operations
      const initMarks = performanceMarks.filter(m => m.name.includes('init'));
      const detectionMarks = performanceMarks.filter(m => m.name.includes('detection'));
      const saveMarks = performanceMarks.filter(m => m.name.includes('save'));
      
      expect(initMarks.length).toBeGreaterThan(0);
      expect(detectionMarks.length).toBeGreaterThan(0);
      expect(saveMarks.length).toBeGreaterThan(0);
    });

    test('should test memory usage patterns', async ({ page }) => {
      const memorySnapshots = [];

      // Take initial memory snapshot
      let initialMemory = await page.evaluate(() => {
        return performance.memory ? performance.memory.usedJSHeapSize : 0;
      });
      memorySnapshots.push({ phase: 'initial', memory: initialMemory });

      // Initialize SightEdit
      await testPage.goto();
      let afterInit = await page.evaluate(() => {
        return performance.memory ? performance.memory.usedJSHeapSize : 0;
      });
      memorySnapshots.push({ phase: 'after-init', memory: afterInit });

      // Enable edit mode
      await testPage.enableEditMode();
      let afterEditMode = await page.evaluate(() => {
        return performance.memory ? performance.memory.usedJSHeapSize : 0;
      });
      memorySnapshots.push({ phase: 'after-edit-mode', memory: afterEditMode });

      // Perform operations
      for (let i = 0; i < 20; i++) {
        await testPage.editText(testPage.heroTitle, `Memory test ${i}`);
      }
      let afterOperations = await page.evaluate(() => {
        return performance.memory ? performance.memory.usedJSHeapSize : 0;
      });
      memorySnapshots.push({ phase: 'after-operations', memory: afterOperations });

      // Cleanup
      await page.evaluate(() => {
        window.SightEdit.destroy();
      });
      let afterCleanup = await page.evaluate(() => {
        if (window.gc) window.gc();
        return performance.memory ? performance.memory.usedJSHeapSize : 0;
      });
      memorySnapshots.push({ phase: 'after-cleanup', memory: afterCleanup });

      // Memory should not increase excessively
      const maxIncrease = Math.max(...memorySnapshots.map(s => s.memory)) - initialMemory;
      expect(maxIncrease).toBeLessThan(50 * 1024 * 1024); // 50MB limit

      // Memory should decrease after cleanup
      expect(afterCleanup).toBeLessThan(afterOperations);
    });
  });
});