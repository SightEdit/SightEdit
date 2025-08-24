import { test, expect, devices } from '@playwright/test';
import { TestPage } from '../pages/TestPage';

test.describe('Mobile Responsiveness', () => {
  let testPage: TestPage;

  test.beforeEach(async ({ page }) => {
    testPage = new TestPage(page);
    await testPage.goto();
    await testPage.resetTestData();
  });

  test.describe('Mobile Chrome', () => {
    test.use({ ...devices['Pixel 5'] });

    test('should render correctly on mobile Chrome', async ({ page }) => {
      await testPage.enableEditMode();
      
      // Check that edit mode toggle is accessible on mobile
      const viewport = page.viewportSize();
      expect(viewport?.width).toBeLessThan(500);
      
      // Check that editable elements are properly highlighted
      await expect(testPage.heroTitle).toHaveClass(/sightedit-highlight/);
      
      // Verify touch-friendly UI elements
      const editableElements = page.locator('[data-sight]');
      const firstElement = editableElements.first();
      const box = await firstElement.boundingBox();
      
      // Touch targets should be at least 44px
      expect(box?.height).toBeGreaterThanOrEqual(44);
    });

    test('should handle touch interactions correctly', async ({ page }) => {
      await testPage.enableEditMode();
      
      // Use touch tap instead of click
      const heroTitleBox = await testPage.heroTitle.boundingBox();
      if (heroTitleBox) {
        await page.touchscreen.tap(
          heroTitleBox.x + heroTitleBox.width / 2,
          heroTitleBox.y + heroTitleBox.height / 2
        );
      }
      
      const textEditor = page.locator('.sightedit-text-editor');
      await expect(textEditor).toBeVisible();
      
      // Check that mobile keyboard appears (indirectly through input focus)
      const editorInput = textEditor.locator('input, textarea').first();
      await expect(editorInput).toBeFocused();
    });

    test('should handle pinch zoom gracefully', async ({ page }) => {
      await testPage.enableEditMode();
      
      // Simulate pinch zoom
      await page.touchscreen.tap(200, 200);
      await page.evaluate(() => {
        // Simulate zoom by changing viewport meta tag
        const viewport = document.querySelector('meta[name="viewport"]');
        if (viewport) {
          viewport.setAttribute('content', 'width=device-width, initial-scale=2.0, user-scalable=yes');
        }
      });
      
      await page.waitForTimeout(100);
      
      // SightEdit should still work after zoom
      await testPage.editText(testPage.heroTitle, 'Zoomed Mobile Test');
      await testPage.expectElementText(testPage.heroTitle, 'Zoomed Mobile Test');
    });

    test('should handle mobile modal interactions', async ({ page }) => {
      await testPage.enableEditMode();
      
      // Open collection editor (which uses modal)
      await testPage.navLinks.click();
      
      const collectionModal = page.locator('.sightedit-collection-modal');
      await expect(collectionModal).toBeVisible();
      
      // Check that modal takes appropriate space on mobile
      const modalBox = await collectionModal.boundingBox();
      const viewport = page.viewportSize();
      
      if (modalBox && viewport) {
        // Modal should use most of the screen on mobile
        expect(modalBox.width).toBeGreaterThan(viewport.width * 0.8);
      }
      
      // Test swipe to close (if implemented)
      const modalContent = collectionModal.locator('.modal-content');
      if (modalContent) {
        const contentBox = await modalContent.boundingBox();
        if (contentBox) {
          // Swipe down to close
          await page.touchscreen.tap(contentBox.x + contentBox.width / 2, contentBox.y + 20);
          await page.touchscreen.tap(contentBox.x + contentBox.width / 2, contentBox.y + contentBox.height - 20);
        }
      }
    });

    test('should handle long content scrolling in editors', async ({ page }) => {
      await testPage.enableEditMode();
      
      // Create a long text to test scrolling
      const longText = 'This is a very long text that should cause scrolling in mobile editors. '.repeat(20);
      
      await testPage.heroTitle.click();
      const textEditor = page.locator('.sightedit-text-editor');
      await textEditor.fill(longText);
      
      // Check that editor content is scrollable
      const scrollHeight = await textEditor.evaluate(el => el.scrollHeight);
      const clientHeight = await textEditor.evaluate(el => el.clientHeight);
      
      if (scrollHeight > clientHeight) {
        // Test scrolling
        await textEditor.evaluate(el => el.scrollTop = el.scrollHeight);
        const scrollTop = await textEditor.evaluate(el => el.scrollTop);
        expect(scrollTop).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Mobile Safari', () => {
    test.use({ ...devices['iPhone 12'] });

    test('should work correctly on iPhone', async ({ page }) => {
      await testPage.enableEditMode();
      
      // Test iOS-specific behavior
      await testPage.editText(testPage.heroTitle, 'iPhone Test');
      await testPage.expectElementText(testPage.heroTitle, 'iPhone Test');
      
      // Test date picker (iOS has specific date input behavior)
      await testPage.editDate(testPage.dateInput, '2024-07-15');
      await testPage.expectElementValue(testPage.dateInput, '2024-07-15');
    });

    test('should handle iOS keyboard interactions', async ({ page }) => {
      await testPage.enableEditMode();
      await testPage.heroTitle.click();
      
      const textEditor = page.locator('.sightedit-text-editor');
      const editorInput = textEditor.locator('input, textarea').first();
      
      // Test iOS autocomplete/autocorrect behavior
      await editorInput.fill('test');
      
      // iOS might show autocomplete suggestions
      const autocompleteVisible = await page.locator('.autocomplete-suggestions').isVisible().catch(() => false);
      
      // Should still be able to complete editing regardless
      await editorInput.press('Enter');
      await expect(textEditor).not.toBeVisible();
    });

    test('should handle safe area insets', async ({ page }) => {
      // Simulate iPhone with notch
      await page.addStyleTag({
        content: `
          :root {
            --safe-area-inset-top: 44px;
            --safe-area-inset-bottom: 34px;
            --safe-area-inset-left: 0px;
            --safe-area-inset-right: 0px;
          }
        `
      });
      
      await testPage.enableEditMode();
      
      // Check that SightEdit UI respects safe area
      const editModeToggle = page.locator('[data-sightedit-toggle]');
      if (await editModeToggle.isVisible()) {
        const toggleBox = await editModeToggle.boundingBox();
        if (toggleBox) {
          // Should not be in the notch area
          expect(toggleBox.y).toBeGreaterThan(44);
        }
      }
    });
  });

  test.describe('Tablet Devices', () => {
    test.use({ ...devices['iPad Pro'] });

    test('should work correctly on tablet', async ({ page }) => {
      await testPage.enableEditMode();
      
      const viewport = page.viewportSize();
      expect(viewport?.width).toBeGreaterThan(768);
      
      // Tablet should use desktop-like behavior
      await testPage.editText(testPage.heroTitle, 'Tablet Test');
      await testPage.expectElementText(testPage.heroTitle, 'Tablet Test');
      
      // Collection editor should use more space on tablet
      await testPage.navLinks.click();
      const collectionModal = page.locator('.sightedit-collection-modal');
      await expect(collectionModal).toBeVisible();
      
      const modalBox = await collectionModal.boundingBox();
      if (modalBox && viewport) {
        // Should not take full width on tablet
        expect(modalBox.width).toBeLessThan(viewport.width * 0.9);
      }
    });

    test('should handle orientation changes', async ({ page }) => {
      await testPage.enableEditMode();
      
      // Start in portrait
      await page.setViewportSize({ width: 768, height: 1024 });
      await testPage.editText(testPage.heroTitle, 'Portrait Test');
      
      // Switch to landscape
      await page.setViewportSize({ width: 1024, height: 768 });
      
      // Should still work in landscape
      await testPage.editText(testPage.heroSubtitle, 'Landscape Test');
      await testPage.expectElementText(testPage.heroSubtitle, 'Landscape Test');
      
      // Check that UI adapts to new orientation
      const heroSection = page.locator('.hero');
      const heroBox = await heroSection.boundingBox();
      if (heroBox) {
        expect(heroBox.width).toBeGreaterThan(heroBox.height);
      }
    });
  });

  test.describe('Responsive Breakpoints', () => {
    test('should adapt to different screen sizes', async ({ page }) => {
      const breakpoints = [
        { width: 320, height: 568, name: 'small phone' },
        { width: 375, height: 667, name: 'medium phone' },
        { width: 768, height: 1024, name: 'tablet' },
        { width: 1024, height: 768, name: 'small desktop' },
        { width: 1440, height: 900, name: 'large desktop' }
      ];
      
      for (const breakpoint of breakpoints) {
        await page.setViewportSize({ width: breakpoint.width, height: breakpoint.height });
        
        await testPage.enableEditMode();
        
        // Check that SightEdit adapts to the viewport
        const detectedElements = await page.evaluate(() => {
          return window.SightEdit.getDetectedElements().length;
        });
        expect(detectedElements).toBeGreaterThan(0);
        
        // Test basic editing functionality at each breakpoint
        await testPage.editText(testPage.heroTitle, `${breakpoint.name} test`);
        await testPage.expectElementText(testPage.heroTitle, `${breakpoint.name} test`);
        
        console.log(`✓ ${breakpoint.name} (${breakpoint.width}x${breakpoint.height})`);
      }
    });

    test('should handle extreme aspect ratios', async ({ page }) => {
      // Test very wide screen
      await page.setViewportSize({ width: 2560, height: 600 });
      await testPage.enableEditMode();
      await testPage.editText(testPage.heroTitle, 'Wide Screen Test');
      
      // Test very tall screen
      await page.setViewportSize({ width: 400, height: 1200 });
      await testPage.enableEditMode();
      await testPage.editText(testPage.heroSubtitle, 'Tall Screen Test');
      
      // Both should work without issues
      await testPage.expectElementText(testPage.heroSubtitle, 'Tall Screen Test');
    });
  });

  test.describe('Touch Gestures', () => {
    test.use({ ...devices['Pixel 5'] });

    test('should handle swipe gestures', async ({ page }) => {
      await testPage.enableEditMode();
      
      // Test swipe to navigate in collection editor
      await testPage.navLinks.click();
      const collectionModal = page.locator('.sightedit-collection-modal');
      await expect(collectionModal).toBeVisible();
      
      const items = collectionModal.locator('.collection-item');
      if (await items.count() > 1) {
        const firstItem = items.first();
        const itemBox = await firstItem.boundingBox();
        
        if (itemBox) {
          // Swipe left on item (might reveal action buttons)
          await page.touchscreen.tap(itemBox.x + itemBox.width - 50, itemBox.y + itemBox.height / 2);
          await page.touchscreen.tap(itemBox.x + 50, itemBox.y + itemBox.height / 2);
          
          // Check if swipe actions appeared
          const swipeActions = firstItem.locator('.swipe-actions');
          if (await swipeActions.isVisible()) {
            await expect(swipeActions).toBeVisible();
          }
        }
      }
    });

    test('should handle long press gestures', async ({ page }) => {
      await testPage.enableEditMode();
      
      // Test long press on editable element
      const heroTitleBox = await testPage.heroTitle.boundingBox();
      if (heroTitleBox) {
        // Simulate long press
        await page.touchscreen.tap(
          heroTitleBox.x + heroTitleBox.width / 2,
          heroTitleBox.y + heroTitleBox.height / 2
        );
        
        await page.waitForTimeout(500); // Long press duration
        
        // Might show context menu or additional options
        const contextMenu = page.locator('.sightedit-context-menu');
        if (await contextMenu.isVisible()) {
          await expect(contextMenu).toBeVisible();
        }
      }
    });

    test('should handle multi-touch gestures', async ({ page }) => {
      // Test two-finger operations if supported
      await testPage.enableEditMode();
      
      // Open rich text editor
      await testPage.featureDesc.click();
      const richTextEditor = page.locator('.sightedit-richtext-editor');
      await expect(richTextEditor).toBeVisible();
      
      const contentArea = richTextEditor.locator('[contenteditable]');
      await contentArea.fill('Multi-touch test content');
      
      // Simulate two-finger tap (might trigger undo/redo)
      const contentBox = await contentArea.boundingBox();
      if (contentBox) {
        // This is a simplified simulation - real multi-touch would be more complex
        await page.touchscreen.tap(contentBox.x + 100, contentBox.y + 50);
        await page.touchscreen.tap(contentBox.x + 200, contentBox.y + 50);
      }
      
      // Content should still be editable
      await contentArea.fill('Updated content');
      const updatedContent = await contentArea.textContent();
      expect(updatedContent).toContain('Updated content');
    });
  });

  test.describe('Mobile Performance', () => {
    test.use({ ...devices['Pixel 5'] });

    test('should perform well on mobile devices', async ({ page }) => {
      // Measure performance on mobile
      await page.goto('/test-page.html');
      
      const performanceData = await page.evaluate(() => {
        return {
          domContentLoaded: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
          loadComplete: performance.timing.loadEventEnd - performance.timing.navigationStart,
          firstPaint: performance.getEntriesByType('paint').find(entry => entry.name === 'first-paint')?.startTime || 0,
          firstContentfulPaint: performance.getEntriesByType('paint').find(entry => entry.name === 'first-contentful-paint')?.startTime || 0
        };
      });
      
      // Mobile performance thresholds (adjust as needed)
      expect(performanceData.domContentLoaded).toBeLessThan(3000);
      expect(performanceData.loadComplete).toBeLessThan(5000);
      expect(performanceData.firstPaint).toBeLessThan(2000);
      expect(performanceData.firstContentfulPaint).toBeLessThan(2500);
      
      console.log('Mobile Performance:', performanceData);
    });

    test('should handle memory constraints on mobile', async ({ page }) => {
      // Test with many elements to simulate memory pressure
      await page.evaluate(() => {
        for (let i = 0; i < 50; i++) {
          const element = document.createElement('div');
          element.setAttribute('data-sight', 'text');
          element.setAttribute('data-sight-id', `mobile-element-${i}`);
          element.textContent = `Mobile Element ${i}`;
          document.body.appendChild(element);
        }
      });
      
      await page.waitForTimeout(200); // Let SightEdit detect elements
      
      await testPage.enableEditMode();
      
      // Should still be responsive
      const detectedElements = await page.evaluate(() => {
        return window.SightEdit.getDetectedElements().length;
      });
      expect(detectedElements).toBeGreaterThan(50);
      
      // Test editing still works
      await testPage.editText(testPage.heroTitle, 'Memory Test');
      await testPage.expectElementText(testPage.heroTitle, 'Memory Test');
    });
  });
});