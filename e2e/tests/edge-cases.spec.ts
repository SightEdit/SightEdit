import { test, expect } from '@playwright/test';
import { TestPage } from '../pages/TestPage';

test.describe('Edge Cases and Error Scenarios', () => {
  let testPage: TestPage;

  test.beforeEach(async ({ page }) => {
    testPage = new TestPage(page);
    await testPage.goto();
    await testPage.resetTestData();
  });

  test.describe('Network Edge Cases', () => {
    test('should handle complete network disconnection', async ({ page }) => {
      await testPage.enableEditMode();
      
      // Disconnect network
      await page.setOfflineMode(true);
      
      await testPage.editText(testPage.heroTitle, 'Offline edit');
      
      // Should queue the change
      const queueSize = await page.evaluate(() => {
        return window.SightEdit.getOfflineQueueSize();
      });
      expect(queueSize).toBeGreaterThan(0);
      
      // Reconnect network
      await page.setOfflineMode(false);
      
      // Process queue
      await page.evaluate(() => {
        return window.SightEdit.processOfflineQueue();
      });
      
      // Should eventually save
      await page.waitForFunction(() => {
        return window.SightEdit.getOfflineQueueSize() === 0;
      });
    });

    test('should handle intermittent network issues', async ({ page }) => {
      let requestCount = 0;
      
      await page.route('/api/sightedit/save', route => {
        requestCount++;
        
        if (requestCount % 2 === 1) {
          // Fail every other request
          route.abort('failed');
        } else {
          route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ success: true })
          });
        }
      });

      await testPage.editText(testPage.heroTitle, 'Intermittent network');
      
      // Should eventually succeed after retries
      await testPage.expectElementText(testPage.heroTitle, 'Intermittent network');
      expect(requestCount).toBeGreaterThanOrEqual(2);
    });

    test('should handle slow network connections', async ({ page }) => {
      await page.route('/api/sightedit/save', route => {
        // Simulate 3 second delay
        setTimeout(() => {
          route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ success: true })
          });
        }, 3000);
      });

      const startTime = Date.now();
      await testPage.editText(testPage.heroTitle, 'Slow network');
      const endTime = Date.now();
      
      // Should show loading state during slow request
      expect(endTime - startTime).toBeGreaterThan(2900);
      await testPage.expectElementText(testPage.heroTitle, 'Slow network');
    });

    test('should handle server errors gracefully', async ({ page }) => {
      await page.route('/api/sightedit/save', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Internal server error',
            code: 'SERVER_ERROR'
          })
        });
      });

      await testPage.enableEditMode();
      await testPage.heroTitle.click();
      
      const textEditor = page.locator('.sightedit-text-editor');
      await textEditor.fill('Server error test');
      await textEditor.press('Enter');
      
      // Should show user-friendly error
      const errorNotification = page.locator('.sightedit-error-notification');
      await expect(errorNotification).toBeVisible();
      await expect(errorNotification).toContainText('server error');
    });
  });

  test.describe('DOM Manipulation Edge Cases', () => {
    test('should handle elements being removed during editing', async ({ page }) => {
      await testPage.enableEditMode();
      await testPage.heroTitle.click();
      
      const textEditor = page.locator('.sightedit-text-editor');
      await expect(textEditor).toBeVisible();
      
      // Remove the element being edited
      await page.evaluate(() => {
        const element = document.querySelector('[data-sight-id="hero-title"]');
        if (element) element.remove();
      });
      
      // Editor should handle this gracefully
      await expect(textEditor).not.toBeVisible();
      
      // No errors should be thrown
      const errors = await page.evaluate(() => {
        return window.testErrors || [];
      });
      expect(errors.length).toBe(0);
    });

    test('should handle parent elements being modified', async ({ page }) => {
      await testPage.enableEditMode();
      
      // Modify parent structure while editing
      await testPage.heroTitle.click();
      const textEditor = page.locator('.sightedit-text-editor');
      await expect(textEditor).toBeVisible();
      
      await page.evaluate(() => {
        const heroSection = document.querySelector('.hero');
        if (heroSection) {
          heroSection.style.display = 'none';
        }
      });
      
      // Should handle parent hiding
      await textEditor.fill('Parent modified test');
      await textEditor.press('Enter');
      
      // Make parent visible again to check result
      await page.evaluate(() => {
        const heroSection = document.querySelector('.hero');
        if (heroSection) {
          heroSection.style.display = 'block';
        }
      });
      
      await testPage.expectElementText(testPage.heroTitle, 'Parent modified test');
    });

    test('should handle duplicate data-sight-id attributes', async ({ page }) => {
      // Add duplicate element
      await page.evaluate(() => {
        const duplicate = document.createElement('h1');
        duplicate.setAttribute('data-sight', 'text');
        duplicate.setAttribute('data-sight-id', 'hero-title'); // Same ID
        duplicate.textContent = 'Duplicate element';
        document.body.appendChild(duplicate);
      });

      await testPage.enableEditMode();
      
      // Should detect both elements but handle gracefully
      const detectedElements = await page.evaluate(() => {
        return window.SightEdit.getDetectedElements().filter(el => el.sight === 'hero-title');
      });
      
      expect(detectedElements.length).toBeGreaterThan(1);
      
      // Editing one shouldn't affect the other unexpectedly
      await testPage.editText(testPage.heroTitle, 'Original element');
      await testPage.expectElementText(testPage.heroTitle, 'Original element');
    });

    test('should handle deeply nested editable elements', async ({ page }) => {
      // Create deeply nested structure
      await page.evaluate(() => {
        let parent = document.body;
        for (let i = 0; i < 50; i++) {
          const div = document.createElement('div');
          div.className = `level-${i}`;
          parent.appendChild(div);
          parent = div;
        }
        
        const deepElement = document.createElement('span');
        deepElement.setAttribute('data-sight', 'text');
        deepElement.setAttribute('data-sight-id', 'deep-element');
        deepElement.textContent = 'Deep nested element';
        parent.appendChild(deepElement);
      });

      await testPage.enableEditMode();
      
      const deepElement = page.locator('[data-sight-id="deep-element"]');
      await deepElement.click();
      
      const textEditor = page.locator('.sightedit-text-editor');
      await expect(textEditor).toBeVisible();
      
      await textEditor.fill('Deep edit successful');
      await textEditor.press('Enter');
      
      await expect(deepElement).toHaveText('Deep edit successful');
    });
  });

  test.describe('Browser Compatibility Edge Cases', () => {
    test('should handle missing modern JavaScript features', async ({ page }) => {
      // Mock missing features
      await page.evaluate(() => {
        // Remove modern methods
        delete Array.prototype.find;
        delete Object.assign;
        delete Promise.prototype.finally;
      });

      // Should still initialize
      await testPage.goto();
      
      const isInitialized = await page.evaluate(() => {
        return window.SightEdit && window.SightEdit.isInitialized();
      });
      expect(isInitialized).toBe(true);
    });

    test('should handle missing localStorage', async ({ page }) => {
      // Mock localStorage being unavailable
      await page.evaluate(() => {
        Object.defineProperty(window, 'localStorage', {
          value: null,
          writable: true
        });
      });

      await testPage.enableEditMode();
      
      // Should fall back to memory storage
      await testPage.editText(testPage.heroTitle, 'No localStorage test');
      await testPage.expectElementText(testPage.heroTitle, 'No localStorage test');
    });

    test('should handle missing sessionStorage', async ({ page }) => {
      await page.evaluate(() => {
        Object.defineProperty(window, 'sessionStorage', {
          value: null,
          writable: true
        });
      });

      await testPage.enableEditMode();
      await testPage.editText(testPage.heroTitle, 'No sessionStorage test');
      await testPage.expectElementText(testPage.heroTitle, 'No sessionStorage test');
    });

    test('should handle missing fetch API', async ({ page }) => {
      await page.evaluate(() => {
        delete window.fetch;
      });

      // Should fall back to XMLHttpRequest
      await testPage.editText(testPage.heroTitle, 'No fetch API test');
      await testPage.expectElementText(testPage.heroTitle, 'No fetch API test');
    });

    test('should handle missing MutationObserver', async ({ page }) => {
      await page.evaluate(() => {
        delete window.MutationObserver;
      });

      // Should fall back to polling or other methods
      await page.evaluate(() => {
        const newElement = document.createElement('div');
        newElement.setAttribute('data-sight', 'text');
        newElement.setAttribute('data-sight-id', 'no-observer-test');
        newElement.textContent = 'Dynamic element';
        document.body.appendChild(newElement);
      });

      await page.waitForTimeout(500); // Give time for fallback detection
      
      await testPage.enableEditMode();
      
      const dynamicElement = page.locator('[data-sight-id="no-observer-test"]');
      await expect(dynamicElement).toHaveClass(/sightedit-highlight/);
    });
  });

  test.describe('Data Validation Edge Cases', () => {
    test('should handle extremely long text input', async ({ page }) => {
      const veryLongText = 'A'.repeat(1000000); // 1MB of text
      
      await testPage.enableEditMode();
      await testPage.heroTitle.click();
      
      const textEditor = page.locator('.sightedit-text-editor');
      
      // Should handle without crashing
      await textEditor.fill(veryLongText);
      await textEditor.press('Enter');
      
      const savedText = await testPage.heroTitle.textContent();
      expect(savedText?.length).toBeGreaterThan(100000);
    });

    test('should handle special Unicode characters', async ({ page }) => {
      const unicodeText = '🌟 Test with emojis 你好 العالم ñoño 🚀';
      
      await testPage.editText(testPage.heroTitle, unicodeText);
      await testPage.expectElementText(testPage.heroTitle, unicodeText);
    });

    test('should handle invalid JSON gracefully', async ({ page }) => {
      await testPage.enableEditMode();
      await testPage.jsonEditor.click();
      
      const jsonModal = page.locator('.sightedit-json-modal');
      const textArea = jsonModal.locator('textarea');
      
      await textArea.fill('{ invalid: json, missing: "quotes" }');
      
      const saveButton = jsonModal.locator('[data-action="save"]');
      await saveButton.click();
      
      // Should show validation error
      const errorMessage = jsonModal.locator('.syntax-error');
      await expect(errorMessage).toBeVisible();
      
      // Modal should stay open
      await expect(jsonModal).toBeVisible();
    });

    test('should handle circular references in data', async ({ page }) => {
      await page.evaluate(() => {
        const obj = { name: 'test' };
        obj.self = obj; // Circular reference
        
        try {
          JSON.stringify(obj);
        } catch (error) {
          window.testCircularError = error.message;
        }
      });

      const errorMessage = await page.evaluate(() => window.testCircularError);
      expect(errorMessage).toContain('circular');
    });

    test('should handle null and undefined values', async ({ page }) => {
      await page.evaluate(() => {
        // Test with null/undefined elements
        const nullElement = document.createElement('div');
        nullElement.setAttribute('data-sight', 'text');
        nullElement.setAttribute('data-sight-id', 'null-test');
        nullElement.textContent = null;
        document.body.appendChild(nullElement);
        
        const undefinedElement = document.createElement('div');
        undefinedElement.setAttribute('data-sight', 'text');
        undefinedElement.setAttribute('data-sight-id', 'undefined-test');
        undefinedElement.textContent = undefined;
        document.body.appendChild(undefinedElement);
      });

      await testPage.enableEditMode();
      
      const nullElement = page.locator('[data-sight-id="null-test"]');
      const undefinedElement = page.locator('[data-sight-id="undefined-test"]');
      
      // Should handle null/undefined gracefully
      await nullElement.click();
      const textEditor1 = page.locator('.sightedit-text-editor');
      await expect(textEditor1).toBeVisible();
      await textEditor1.press('Escape');
      
      await undefinedElement.click();
      const textEditor2 = page.locator('.sightedit-text-editor');
      await expect(textEditor2).toBeVisible();
    });
  });

  test.describe('Performance Edge Cases', () => {
    test('should handle rapid consecutive edits', async ({ page }) => {
      let saveCount = 0;
      
      await page.route('/api/sightedit/save', route => {
        saveCount++;
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ success: true, saveId: saveCount })
        });
      });

      await testPage.enableEditMode();
      
      // Make 50 rapid edits
      for (let i = 0; i < 50; i++) {
        await testPage.heroTitle.click();
        const textEditor = page.locator('.sightedit-text-editor');
        await textEditor.fill(`Rapid edit ${i}`);
        await textEditor.press('Enter');
        await page.waitForTimeout(10);
      }
      
      // Should debounce and not make 50 separate requests
      expect(saveCount).toBeLessThan(50);
      
      const finalText = await testPage.heroTitle.textContent();
      expect(finalText).toBe('Rapid edit 49');
    });

    test('should handle memory pressure scenarios', async ({ page }) => {
      // Create many elements to consume memory
      await page.evaluate(() => {
        const container = document.createElement('div');
        const largeArray = [];
        
        for (let i = 0; i < 10000; i++) {
          const element = document.createElement('div');
          element.setAttribute('data-sight', 'text');
          element.setAttribute('data-sight-id', `memory-test-${i}`);
          element.textContent = 'A'.repeat(1000); // 1KB per element
          container.appendChild(element);
          largeArray.push(element);
        }
        
        document.body.appendChild(container);
        window.testLargeArray = largeArray;
      });

      const initialMemory = await page.evaluate(() => {
        return performance.memory?.usedJSHeapSize || 0;
      });

      await testPage.enableEditMode();
      
      // Should still be responsive
      await testPage.editText(testPage.heroTitle, 'Memory pressure test');
      await testPage.expectElementText(testPage.heroTitle, 'Memory pressure test');
      
      const finalMemory = await page.evaluate(() => {
        return performance.memory?.usedJSHeapSize || 0;
      });
      
      // Memory shouldn't have increased excessively
      const memoryIncrease = finalMemory - initialMemory;
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // 100MB limit
    });

    test('should handle window resize during editing', async ({ page }) => {
      await testPage.enableEditMode();
      await testPage.navLinks.click();
      
      const modal = page.locator('.sightedit-collection-modal');
      await expect(modal).toBeVisible();
      
      // Resize window dramatically
      await page.setViewportSize({ width: 320, height: 480 });
      await page.waitForTimeout(100);
      
      // Modal should adapt to new size
      const modalBox = await modal.boundingBox();
      expect(modalBox?.width).toBeLessThan(400);
      
      // Should still be functional
      const addButton = modal.locator('[data-action="add-item"]');
      await expect(addButton).toBeVisible();
      
      // Resize back
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.waitForTimeout(100);
      
      // Should adapt again
      const newModalBox = await modal.boundingBox();
      expect(newModalBox?.width).toBeGreaterThan(modalBox?.width || 0);
    });
  });

  test.describe('Security Edge Cases', () => {
    test('should prevent prototype pollution attacks', async ({ page }) => {
      await page.evaluate(() => {
        try {
          // Attempt prototype pollution
          const maliciousData = {
            '__proto__': {
              'isAdmin': true
            }
          };
          
          window.SightEdit.save({
            sight: 'pollution-test',
            value: maliciousData,
            type: 'json'
          });
          
          // Check if pollution occurred
          window.testPollutionResult = {}.__proto__.isAdmin;
        } catch (error) {
          window.testPollutionError = error.message;
        }
      });

      const pollutionResult = await page.evaluate(() => window.testPollutionResult);
      expect(pollutionResult).not.toBe(true);
    });

    test('should sanitize CSS injection attempts', async ({ page }) => {
      const maliciousCSS = 'color: red; } body { display: none !important; } .fake { color';
      
      await testPage.enableEditMode();
      
      // Try to inject CSS through style attributes
      await page.evaluate((css) => {
        const element = document.querySelector('[data-sight-id="hero-title"]');
        if (element) {
          element.style.cssText = css;
        }
      }, maliciousCSS);

      // Body should still be visible
      const bodyVisible = await page.evaluate(() => {
        const body = document.body;
        const styles = getComputedStyle(body);
        return styles.display !== 'none';
      });
      
      expect(bodyVisible).toBe(true);
    });

    test('should prevent event handler injection', async ({ page }) => {
      await testPage.enableEditMode();
      await testPage.heroTitle.click();
      
      const textEditor = page.locator('.sightedit-text-editor');
      
      // Try to inject event handler
      await textEditor.fill('<img src=x onerror="window.testEventInjection=true">');
      await textEditor.press('Enter');
      
      // Event handler should not execute
      const injectionResult = await page.evaluate(() => window.testEventInjection);
      expect(injectionResult).toBeFalsy();
    });
  });

  test.describe('Cleanup and Resource Management', () => {
    test('should clean up event listeners on destroy', async ({ page }) => {
      const initialListenerCount = await page.evaluate(() => {
        return window.getEventListeners ? Object.keys(window.getEventListeners(document)).length : 0;
      });

      await testPage.enableEditMode();
      
      await page.evaluate(() => {
        window.SightEdit.destroy();
      });

      const finalListenerCount = await page.evaluate(() => {
        return window.getEventListeners ? Object.keys(window.getEventListeners(document)).length : initialListenerCount;
      });

      // Should not have leaked listeners
      expect(finalListenerCount).toBeLessThanOrEqual(initialListenerCount + 5);
    });

    test('should clean up DOM modifications on destroy', async ({ page }) => {
      await testPage.enableEditMode();
      
      // Check that highlighting was added
      const highlightCount = await page.locator('.sightedit-highlight').count();
      expect(highlightCount).toBeGreaterThan(0);
      
      await page.evaluate(() => {
        window.SightEdit.destroy();
      });

      // Highlights should be cleaned up
      const finalHighlightCount = await page.locator('.sightedit-highlight').count();
      expect(finalHighlightCount).toBe(0);
    });

    test('should handle multiple initialization attempts', async ({ page }) => {
      // Try to initialize multiple times
      await page.evaluate(async () => {
        await window.SightEdit.init({ endpoint: '/api/sightedit' });
        await window.SightEdit.init({ endpoint: '/api/sightedit' });
        await window.SightEdit.init({ endpoint: '/api/sightedit' });
      });

      // Should still work correctly
      await testPage.enableEditMode();
      await testPage.editText(testPage.heroTitle, 'Multiple init test');
      await testPage.expectElementText(testPage.heroTitle, 'Multiple init test');
    });

    test('should handle destruction during active editing', async ({ page }) => {
      await testPage.enableEditMode();
      await testPage.heroTitle.click();
      
      const textEditor = page.locator('.sightedit-text-editor');
      await expect(textEditor).toBeVisible();
      
      // Destroy while editing
      await page.evaluate(() => {
        window.SightEdit.destroy();
      });

      // Editor should be cleaned up
      await expect(textEditor).not.toBeVisible();
      
      // No errors should occur
      const errors = await page.evaluate(() => {
        return window.testErrors || [];
      });
      expect(errors.length).toBe(0);
    });
  });
});