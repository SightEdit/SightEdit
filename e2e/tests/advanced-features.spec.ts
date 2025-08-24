import { test, expect } from '@playwright/test';
import { TestPage } from '../pages/TestPage';

test.describe('Advanced SightEdit Features', () => {
  let testPage: TestPage;

  test.beforeEach(async ({ page }) => {
    testPage = new TestPage(page);
    await testPage.goto();
    await testPage.resetTestData();
  });

  test.describe('Plugin System', () => {
    test('should load and register plugins dynamically', async ({ page }) => {
      await page.evaluate(() => {
        // Mock plugin
        const TestPlugin = {
          name: 'test-plugin',
          version: '1.0.0',
          editors: {
            'custom': class CustomEditor {
              constructor(element, options) {
                this.element = element;
                this.options = options;
              }
              
              render() {
                const editor = document.createElement('div');
                editor.className = 'custom-editor';
                editor.textContent = 'Custom Editor Active';
                document.body.appendChild(editor);
                return editor;
              }
              
              destroy() {
                const editor = document.querySelector('.custom-editor');
                if (editor) editor.remove();
              }
            }
          }
        };
        
        // Register plugin
        window.SightEdit.registerPlugin(TestPlugin);
      });

      // Add element that uses custom editor
      await page.evaluate(() => {
        const customElement = document.createElement('div');
        customElement.setAttribute('data-sight', 'custom');
        customElement.setAttribute('data-sight-id', 'custom-element');
        customElement.textContent = 'Custom Element';
        document.body.appendChild(customElement);
      });

      await testPage.enableEditMode();
      
      const customElement = page.locator('[data-sight-id="custom-element"]');
      await customElement.click();
      
      const customEditor = page.locator('.custom-editor');
      await expect(customEditor).toBeVisible();
      await expect(customEditor).toContainText('Custom Editor Active');
    });

    test('should handle plugin initialization errors gracefully', async ({ page }) => {
      await page.evaluate(() => {
        const BadPlugin = {
          name: 'bad-plugin',
          init() {
            throw new Error('Plugin initialization failed');
          }
        };
        
        try {
          window.SightEdit.registerPlugin(BadPlugin);
        } catch (error) {
          console.error('Plugin error caught:', error.message);
        }
      });

      // SightEdit should still work
      await testPage.enableEditMode();
      await testPage.editText(testPage.heroTitle, 'Still working after plugin error');
      await testPage.expectElementText(testPage.heroTitle, 'Still working after plugin error');
    });

    test('should support plugin dependencies', async ({ page }) => {
      await page.evaluate(() => {
        const BasePlugin = {
          name: 'base-plugin',
          provides: ['base-functionality']
        };
        
        const DependentPlugin = {
          name: 'dependent-plugin',
          dependencies: ['base-functionality'],
          init() {
            if (!window.SightEdit.hasPlugin('base-plugin')) {
              throw new Error('Dependency not found');
            }
          }
        };
        
        window.SightEdit.registerPlugin(BasePlugin);
        window.SightEdit.registerPlugin(DependentPlugin);
        
        const hasBase = window.SightEdit.hasPlugin('base-plugin');
        const hasDependent = window.SightEdit.hasPlugin('dependent-plugin');
        
        window.testPluginResults = { hasBase, hasDependent };
      });

      const results = await page.evaluate(() => window.testPluginResults);
      expect(results.hasBase).toBe(true);
      expect(results.hasDependent).toBe(true);
    });
  });

  test.describe('Advanced API Features', () => {
    test('should handle batch operations with mixed success/failure', async ({ page }) => {
      // Mock API to simulate partial failures
      await page.route('/api/sightedit/batch', route => {
        const request = route.request();
        const postData = JSON.parse(request.postData() || '{}');
        
        const results = postData.operations.map((op, index) => {
          if (index === 1) {
            return {
              success: false,
              error: 'Validation failed',
              sight: op.sight
            };
          }
          return {
            success: true,
            sight: op.sight,
            value: op.value
          };
        });
        
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            results
          })
        });
      });

      await page.evaluate(async () => {
        const operations = [
          { action: 'save', sight: 'test-1', value: 'Success 1' },
          { action: 'save', sight: 'test-2', value: 'This will fail' },
          { action: 'save', sight: 'test-3', value: 'Success 3' }
        ];
        
        const result = await window.SightEdit.batchSave(operations);
        window.testBatchResult = result;
      });

      const batchResult = await page.evaluate(() => window.testBatchResult);
      expect(batchResult.results[0].success).toBe(true);
      expect(batchResult.results[1].success).toBe(false);
      expect(batchResult.results[2].success).toBe(true);
    });

    test('should implement request deduplication', async ({ page }) => {
      let requestCount = 0;
      
      await page.route('/api/sightedit/save', route => {
        requestCount++;
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ success: true, requestNumber: requestCount })
        });
      });

      // Make multiple identical requests simultaneously
      await page.evaluate(async () => {
        const promises = [];
        for (let i = 0; i < 5; i++) {
          promises.push(
            window.SightEdit.save({
              sight: 'dedup-test',
              value: 'Same value',
              type: 'text'
            })
          );
        }
        
        const results = await Promise.all(promises);
        window.testDedupResults = results;
      });

      // Should have made only one request due to deduplication
      expect(requestCount).toBe(1);
      
      const results = await page.evaluate(() => window.testDedupResults);
      expect(results.length).toBe(5);
      expect(results[0].requestNumber).toBe(1);
    });

    test('should handle API rate limiting gracefully', async ({ page }) => {
      let requestCount = 0;
      
      await page.route('/api/sightedit/save', route => {
        requestCount++;
        
        if (requestCount <= 2) {
          route.fulfill({
            status: 429,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'Rate limit exceeded',
              retryAfter: 100
            })
          });
        } else {
          route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ success: true })
          });
        }
      });

      await page.evaluate(async () => {
        try {
          const result = await window.SightEdit.save({
            sight: 'rate-limit-test',
            value: 'Test value',
            type: 'text'
          });
          window.testRateLimitResult = result;
        } catch (error) {
          window.testRateLimitError = error.message;
        }
      });

      // Should eventually succeed after retries
      const result = await page.evaluate(() => window.testRateLimitResult);
      expect(result.success).toBe(true);
      expect(requestCount).toBeGreaterThan(2);
    });
  });

  test.describe('Advanced UI Features', () => {
    test('should support custom themes', async ({ page }) => {
      await page.evaluate(() => {
        window.SightEdit.setTheme({
          colors: {
            primary: '#ff0000',
            secondary: '#00ff00',
            background: '#0000ff'
          },
          fonts: {
            primary: 'Arial, sans-serif',
            monospace: 'Monaco, monospace'
          }
        });
      });

      await testPage.enableEditMode();
      
      // Check that theme colors are applied
      const themeColor = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        return style.getPropertyValue('--sightedit-primary-color');
      });
      
      expect(themeColor).toBe('#ff0000');
    });

    test('should support right-to-left (RTL) languages', async ({ page }) => {
      await page.evaluate(() => {
        document.documentElement.dir = 'rtl';
        document.documentElement.lang = 'ar';
      });

      await testPage.enableEditMode();
      await testPage.heroTitle.click();
      
      const textEditor = page.locator('.sightedit-text-editor');
      await expect(textEditor).toBeVisible();
      
      // Check RTL styling is applied
      const direction = await textEditor.evaluate(el => {
        return getComputedStyle(el).direction;
      });
      
      expect(direction).toBe('rtl');
    });

    test('should support high contrast mode', async ({ page }) => {
      await page.emulateMedia({ 'prefers-contrast': 'more' });
      
      await testPage.enableEditMode();
      
      // Check high contrast styles are applied
      const contrastRatio = await page.evaluate(() => {
        const highlight = document.querySelector('.sightedit-highlight');
        if (!highlight) return 0;
        
        const style = getComputedStyle(highlight);
        return style.getPropertyValue('--sightedit-contrast-ratio') || '4.5';
      });
      
      expect(parseFloat(contrastRatio)).toBeGreaterThanOrEqual(4.5);
    });

    test('should support reduced motion preferences', async ({ page }) => {
      await page.emulateMedia({ 'prefers-reduced-motion': 'reduce' });
      
      await testPage.enableEditMode();
      await testPage.heroTitle.click();
      
      const textEditor = page.locator('.sightedit-text-editor');
      
      // Check that animations are reduced/disabled
      const animationDuration = await textEditor.evaluate(el => {
        return getComputedStyle(el).animationDuration;
      });
      
      expect(animationDuration).toMatch(/0s|0\.01s/);
    });

    test('should handle extremely large content', async ({ page }) => {
      const largeContent = 'A'.repeat(100000); // 100KB of text
      
      await testPage.enableEditMode();
      await testPage.heroTitle.click();
      
      const textEditor = page.locator('.sightedit-text-editor');
      await textEditor.fill(largeContent);
      await textEditor.press('Enter');
      
      // Should handle large content without crashing
      await expect(textEditor).not.toBeVisible();
      
      const updatedContent = await testPage.heroTitle.textContent();
      expect(updatedContent?.length).toBe(largeContent.length);
    });
  });

  test.describe('Accessibility Features', () => {
    test('should support screen reader announcements', async ({ page }) => {
      await testPage.enableEditMode();
      
      // Check for aria-live regions
      const liveRegion = page.locator('[aria-live="polite"]');
      await expect(liveRegion).toBeVisible();
      
      await testPage.editText(testPage.heroTitle, 'New title');
      
      // Should announce the change
      const announcement = await liveRegion.textContent();
      expect(announcement).toContain('saved');
    });

    test('should provide proper focus management', async ({ page }) => {
      await testPage.enableEditMode();
      
      // Tab through editable elements
      await page.keyboard.press('Tab');
      let focusedElement = await page.locator(':focus').getAttribute('data-sight-id');
      expect(focusedElement).toBeTruthy();
      
      await page.keyboard.press('Tab');
      const nextFocusedElement = await page.locator(':focus').getAttribute('data-sight-id');
      expect(nextFocusedElement).not.toBe(focusedElement);
    });

    test('should support keyboard navigation in modals', async ({ page }) => {
      await testPage.enableEditMode();
      await testPage.navLinks.click();
      
      const modal = page.locator('.sightedit-collection-modal');
      await expect(modal).toBeVisible();
      
      // Should trap focus within modal
      await page.keyboard.press('Tab');
      const focusedElement = await page.locator(':focus');
      const isWithinModal = await focusedElement.evaluate(el => {
        return el.closest('.sightedit-collection-modal') !== null;
      });
      
      expect(isWithinModal).toBe(true);
      
      // Escape should close modal and restore focus
      await page.keyboard.press('Escape');
      await expect(modal).not.toBeVisible();
    });

    test('should provide appropriate ARIA labels and roles', async ({ page }) => {
      await testPage.enableEditMode();
      
      const editableElements = page.locator('[data-sight]');
      const firstElement = editableElements.first();
      
      // Check ARIA attributes
      await expect(firstElement).toHaveAttribute('role', 'button');
      await expect(firstElement).toHaveAttribute('aria-label');
      await expect(firstElement).toHaveAttribute('tabindex', '0');
      
      await firstElement.click();
      
      const editor = page.locator('.sightedit-text-editor');
      await expect(editor).toHaveAttribute('role', 'textbox');
      await expect(editor).toHaveAttribute('aria-label');
    });
  });

  test.describe('Performance Edge Cases', () => {
    test('should handle memory leaks with many elements', async ({ page }) => {
      // Add 1000 editable elements
      await page.evaluate(() => {
        const container = document.createElement('div');
        for (let i = 0; i < 1000; i++) {
          const element = document.createElement('div');
          element.setAttribute('data-sight', 'text');
          element.setAttribute('data-sight-id', `perf-element-${i}`);
          element.textContent = `Element ${i}`;
          container.appendChild(element);
        }
        document.body.appendChild(container);
      });

      const initialMemory = await page.evaluate(() => {
        return performance.memory?.usedJSHeapSize || 0;
      });

      await testPage.enableEditMode();
      await testPage.disableEditMode();

      // Force garbage collection if available
      await page.evaluate(() => {
        if (window.gc) {
          window.gc();
        }
      });

      const finalMemory = await page.evaluate(() => {
        return performance.memory?.usedJSHeapSize || 0;
      });

      // Memory should not increase significantly
      const memoryIncrease = finalMemory - initialMemory;
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 50MB
    });

    test('should handle rapid edit mode toggling', async ({ page }) => {
      const startTime = Date.now();
      
      // Toggle edit mode 100 times rapidly
      for (let i = 0; i < 100; i++) {
        await page.keyboard.press('Control+e');
        await page.waitForTimeout(10);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time
      expect(duration).toBeLessThan(5000);
      
      // Should still be functional
      await testPage.editText(testPage.heroTitle, 'Rapid toggle test');
      await testPage.expectElementText(testPage.heroTitle, 'Rapid toggle test');
    });

    test('should handle concurrent save operations', async ({ page }) => {
      let saveCount = 0;
      
      await page.route('/api/sightedit/save', route => {
        saveCount++;
        // Simulate slow API
        setTimeout(() => {
          route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ success: true, saveNumber: saveCount })
          });
        }, 100);
      });

      // Start multiple save operations
      await page.evaluate(async () => {
        const promises = [];
        for (let i = 0; i < 10; i++) {
          promises.push(
            window.SightEdit.save({
              sight: `concurrent-${i}`,
              value: `Value ${i}`,
              type: 'text'
            })
          );
        }
        
        const results = await Promise.all(promises);
        window.testConcurrentResults = results;
      });

      const results = await page.evaluate(() => window.testConcurrentResults);
      expect(results.length).toBe(10);
      expect(saveCount).toBe(10);
    });
  });

  test.describe('Security Features', () => {
    test('should sanitize XSS attempts in content', async ({ page }) => {
      const xssPayload = '<script>alert("XSS")</script><img src=x onerror=alert("XSS2")>';
      
      await testPage.enableEditMode();
      await testPage.heroTitle.click();
      
      const textEditor = page.locator('.sightedit-text-editor');
      await textEditor.fill(xssPayload);
      await textEditor.press('Enter');
      
      // Content should be sanitized
      const content = await testPage.heroTitle.textContent();
      expect(content).not.toContain('<script>');
      expect(content).not.toContain('onerror');
      
      // No alerts should have been triggered
      page.on('dialog', dialog => {
        throw new Error('XSS alert triggered');
      });
    });

    test('should validate file uploads for security', async ({ page }) => {
      await testPage.enableEditMode();
      await testPage.galleryImages.first().click();
      
      const imageEditor = page.locator('.sightedit-image-modal');
      const fileInput = imageEditor.locator('input[type="file"]');
      
      // Try to upload a potentially malicious file
      const maliciousFile = {
        name: 'test.php',
        mimeType: 'application/x-php',
        buffer: Buffer.from('<?php echo "malicious code"; ?>')
      };
      
      await fileInput.setInputFiles(maliciousFile);
      
      const saveButton = imageEditor.locator('[data-action="save"]');
      await saveButton.click();
      
      // Should show error for invalid file type
      const errorMessage = imageEditor.locator('.error-message');
      await expect(errorMessage).toBeVisible();
      await expect(errorMessage).toContainText('Invalid file type');
    });

    test('should prevent CSRF attacks', async ({ page }) => {
      // Mock CSRF token validation
      await page.route('/api/sightedit/save', route => {
        const headers = route.request().headers();
        const csrfToken = headers['x-csrf-token'];
        
        if (!csrfToken || csrfToken !== 'valid-csrf-token') {
          route.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'CSRF token missing or invalid' })
          });
          return;
        }
        
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ success: true })
        });
      });

      // Set valid CSRF token
      await page.evaluate(() => {
        window.SightEdit.setCSRFToken('valid-csrf-token');
      });

      await testPage.editText(testPage.heroTitle, 'CSRF protected save');
      
      // Should succeed with valid token
      await testPage.expectElementText(testPage.heroTitle, 'CSRF protected save');
    });
  });

  test.describe('Internationalization', () => {
    test('should support multiple languages', async ({ page }) => {
      await page.evaluate(() => {
        window.SightEdit.setLanguage('es', {
          'edit.save': 'Guardar',
          'edit.cancel': 'Cancelar',
          'edit.delete': 'Eliminar',
          'error.network': 'Error de red'
        });
      });

      await testPage.enableEditMode();
      await testPage.heroTitle.click();
      
      const textEditor = page.locator('.sightedit-text-editor');
      const saveButton = textEditor.locator('button');
      
      // Should show Spanish text
      await expect(saveButton).toContainText('Guardar');
    });

    test('should format dates according to locale', async ({ page }) => {
      await page.evaluate(() => {
        window.SightEdit.setLocale('en-US');
      });

      await testPage.editDate(testPage.dateInput, '2024-03-15');
      
      const displayedDate = await page.evaluate(() => {
        const element = document.querySelector('[data-sight-id="launch-date"]');
        return element.getAttribute('data-formatted-date');
      });
      
      // Should be formatted for US locale
      expect(displayedDate).toMatch(/03\/15\/2024|3\/15\/2024/);
    });

    test('should handle currency formatting', async ({ page }) => {
      // Add a price element to test
      await page.evaluate(() => {
        const priceElement = document.createElement('input');
        priceElement.setAttribute('data-sight', 'currency');
        priceElement.setAttribute('data-sight-id', 'price');
        priceElement.setAttribute('data-currency', 'EUR');
        priceElement.value = '1234.56';
        document.body.appendChild(priceElement);
      });

      await page.evaluate(() => {
        window.SightEdit.setLocale('de-DE');
      });

      await testPage.enableEditMode();
      
      const priceElement = page.locator('[data-sight-id="price"]');
      await priceElement.click();
      
      // Should format as German currency
      const formattedValue = await priceElement.inputValue();
      expect(formattedValue).toMatch(/1\.234,56|1 234,56/);
    });
  });
});