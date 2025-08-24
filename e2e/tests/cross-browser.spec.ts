import { test, expect, devices } from '@playwright/test';
import { TestPage } from '../pages/TestPage';

test.describe('Cross-Browser Compatibility', () => {
  let testPage: TestPage;

  test.beforeEach(async ({ page }) => {
    testPage = new TestPage(page);
    await testPage.goto();
    await testPage.resetTestData();
  });

  test.describe('Desktop Browsers', () => {
    test('should work correctly in Chromium', async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'This test is for Chromium only');
      
      // Test basic functionality
      await testPage.enableEditMode();
      await testPage.editText(testPage.heroTitle, 'Chromium Test');
      await testPage.expectElementText(testPage.heroTitle, 'Chromium Test');
      
      // Test keyboard shortcuts
      await page.keyboard.press('Control+e');
      const editMode = await page.evaluate(() => window.SightEdit.isEditMode());
      expect(editMode).toBe(false);
    });

    test('should work correctly in Firefox', async ({ page, browserName }) => {
      test.skip(browserName !== 'firefox', 'This test is for Firefox only');
      
      // Test basic functionality
      await testPage.enableEditMode();
      await testPage.editText(testPage.heroTitle, 'Firefox Test');
      await testPage.expectElementText(testPage.heroTitle, 'Firefox Test');
      
      // Test rich text editing (which can behave differently in Firefox)
      await testPage.editRichText(testPage.featureDesc, 'Firefox <strong>rich text</strong>');
      const content = await testPage.featureDesc.innerHTML();
      expect(content).toContain('<strong>rich text</strong>');
    });

    test('should work correctly in WebKit', async ({ page, browserName }) => {
      test.skip(browserName !== 'webkit', 'This test is for WebKit only');
      
      // Test basic functionality
      await testPage.enableEditMode();
      await testPage.editText(testPage.heroTitle, 'WebKit Test');
      await testPage.expectElementText(testPage.heroTitle, 'WebKit Test');
      
      // Test date picker (Safari has specific date input behavior)
      await testPage.editDate(testPage.dateInput, '2024-06-15');
      await testPage.expectElementValue(testPage.dateInput, '2024-06-15');
    });
  });

  test.describe('Browser-Specific Features', () => {
    test('should handle browser-specific keyboard shortcuts', async ({ page, browserName }) => {
      const isMac = process.platform === 'darwin';
      const modifier = isMac ? 'Meta' : 'Control';
      
      // Test edit mode toggle with correct modifier
      await page.keyboard.press(`${modifier}+e`);
      
      const editMode = await page.evaluate(() => window.SightEdit.isEditMode());
      expect(editMode).toBe(true);
      
      // Test escape key behavior
      await testPage.heroTitle.click();
      const textEditor = page.locator('.sightedit-text-editor');
      await expect(textEditor).toBeVisible();
      
      await page.keyboard.press('Escape');
      await expect(textEditor).not.toBeVisible();
    });

    test('should handle clipboard operations correctly', async ({ page, browserName }) => {
      // Skip if browser doesn't support clipboard API
      const clipboardSupported = await page.evaluate(() => {
        return 'clipboard' in navigator && 'writeText' in navigator.clipboard;
      });
      
      test.skip(!clipboardSupported, 'Clipboard API not supported');
      
      await testPage.enableEditMode();
      await testPage.heroTitle.click();
      
      const textEditor = page.locator('.sightedit-text-editor');
      await textEditor.fill('Copy Test Text');
      
      // Select all and copy
      await textEditor.press('Control+a');
      await textEditor.press('Control+c');
      
      // Clear and paste
      await textEditor.clear();
      await textEditor.press('Control+v');
      
      const content = await textEditor.inputValue();
      expect(content).toBe('Copy Test Text');
    });

    test('should handle file upload in different browsers', async ({ page, browserName }) => {
      await testPage.enableEditMode();
      await testPage.galleryImages.first().click();
      
      const imageEditor = page.locator('.sightedit-image-modal');
      await expect(imageEditor).toBeVisible();
      
      const fileInput = imageEditor.locator('input[type="file"]');
      
      // Create a test file buffer
      const testFile = {
        name: 'test-image.png',
        mimeType: 'image/png',
        buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
      };
      
      await fileInput.setInputFiles(testFile);
      
      // Browser-specific behavior testing
      if (browserName === 'webkit') {
        // Safari might show different file picker behavior
        await page.waitForTimeout(100);
      }
      
      const fileName = await page.evaluate(() => {
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        return input.files?.[0]?.name || '';
      });
      
      expect(fileName).toBe('test-image.png');
    });

    test('should handle touch events on touch-capable browsers', async ({ page, browserName }) => {
      // Simulate touch device
      await page.emulateMedia({ 'prefers-reduced-motion': 'no-preference' });
      
      await testPage.enableEditMode();
      
      // Use touch events instead of mouse clicks
      const heroTitleBox = await testPage.heroTitle.boundingBox();
      if (heroTitleBox) {
        await page.touchscreen.tap(heroTitleBox.x + heroTitleBox.width / 2, heroTitleBox.y + heroTitleBox.height / 2);
      }
      
      const textEditor = page.locator('.sightedit-text-editor');
      await expect(textEditor).toBeVisible();
      
      // Test touch-friendly UI elements
      const touchButtons = page.locator('.sightedit-touch-button');
      if (await touchButtons.count() > 0) {
        const buttonBox = await touchButtons.first().boundingBox();
        if (buttonBox) {
          // Verify button is large enough for touch (minimum 44px)
          expect(buttonBox.width).toBeGreaterThanOrEqual(44);
          expect(buttonBox.height).toBeGreaterThanOrEqual(44);
        }
      }
    });
  });

  test.describe('Performance Across Browsers', () => {
    test('should initialize quickly in all browsers', async ({ page, browserName }) => {
      // Measure initialization time
      const startTime = Date.now();
      
      await testPage.goto();
      
      await page.waitForFunction(() => {
        return typeof window.SightEdit !== 'undefined' && window.SightEdit.isInitialized();
      });
      
      const endTime = Date.now();
      const initTime = endTime - startTime;
      
      // Should initialize within reasonable time (adjust threshold as needed)
      expect(initTime).toBeLessThan(5000);
      
      console.log(`${browserName} initialization time: ${initTime}ms`);
    });

    test('should handle large collections efficiently', async ({ page, browserName }) => {
      // Add many items to test performance
      await page.evaluate(() => {
        const largeCollection = document.createElement('div');
        largeCollection.setAttribute('data-sight', 'collection');
        largeCollection.setAttribute('data-sight-id', 'large-collection');
        
        for (let i = 0; i < 100; i++) {
          const item = document.createElement('div');
          item.textContent = `Item ${i}`;
          largeCollection.appendChild(item);
        }
        
        document.body.appendChild(largeCollection);
      });
      
      await page.waitForTimeout(100); // Let SightEdit detect new elements
      
      const startTime = Date.now();
      
      await testPage.enableEditMode();
      
      const largeCollection = page.locator('[data-sight-id="large-collection"]');
      await largeCollection.click();
      
      const collectionModal = page.locator('.sightedit-collection-modal');
      await expect(collectionModal).toBeVisible();
      
      const endTime = Date.now();
      const openTime = endTime - startTime;
      
      // Should open large collection editor within reasonable time
      expect(openTime).toBeLessThan(3000);
      
      console.log(`${browserName} large collection open time: ${openTime}ms`);
    });
  });

  test.describe('Error Handling Across Browsers', () => {
    test('should handle network errors gracefully', async ({ page, browserName }) => {
      // Simulate network failure
      await page.route('/api/sightedit/**', route => {
        route.abort('failed');
      });
      
      await testPage.enableEditMode();
      await testPage.editText(testPage.heroTitle, 'Network Error Test');
      
      // Should queue the change without throwing errors
      const queueSize = await page.evaluate(() => {
        return window.SightEdit.getOfflineQueueSize();
      });
      expect(queueSize).toBeGreaterThan(0);
      
      // Should show user-friendly error message
      const errorNotification = page.locator('.sightedit-error-notification');
      await expect(errorNotification).toBeVisible();
    });

    test('should handle JavaScript errors without breaking', async ({ page, browserName }) => {
      // Inject code that might cause errors in specific browsers
      await page.addInitScript(() => {
        // Override console.error to catch any errors
        window.testErrors = [];
        const originalError = console.error;
        console.error = (...args) => {
          window.testErrors.push(args.join(' '));
          originalError.apply(console, args);
        };
      });
      
      await testPage.enableEditMode();
      
      // Simulate potential error-causing operations
      await page.evaluate(() => {
        // Try to access potentially undefined properties
        try {
          window.SightEdit.undefinedMethod();
        } catch (e) {
          // Expected to fail
        }
      });
      
      // SightEdit should still be functional
      await testPage.editText(testPage.heroTitle, 'Error Recovery Test');
      await testPage.expectElementText(testPage.heroTitle, 'Error Recovery Test');
      
      // Check for any unexpected errors
      const errors = await page.evaluate(() => window.testErrors);
      
      // Filter out expected/harmless errors
      const unexpectedErrors = errors.filter((error: string) => {
        return !error.includes('undefinedMethod') && !error.includes('404');
      });
      
      expect(unexpectedErrors.length).toBe(0);
    });
  });

  test.describe('Accessibility Across Browsers', () => {
    test('should be keyboard navigable in all browsers', async ({ page, browserName }) => {
      await testPage.enableEditMode();
      
      // Test tab navigation
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      
      // Should be able to activate editor with keyboard
      await page.keyboard.press('Enter');
      
      const activeEditor = page.locator('.sightedit-editor.active');
      await expect(activeEditor).toBeVisible();
      
      // Should be able to escape with keyboard
      await page.keyboard.press('Escape');
      await expect(activeEditor).not.toBeVisible();
    });

    test('should support screen readers in all browsers', async ({ page, browserName }) => {
      await testPage.enableEditMode();
      
      // Check for ARIA attributes
      const editableElements = page.locator('[data-sight]');
      const firstElement = editableElements.first();
      
      await expect(firstElement).toHaveAttribute('role');
      await expect(firstElement).toHaveAttribute('aria-label');
      
      // Check for focus management
      await firstElement.click();
      const focusedElement = page.locator(':focus');
      await expect(focusedElement).toBeVisible();
    });
  });
});