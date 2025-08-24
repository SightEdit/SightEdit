import { test, expect } from '@playwright/test';
import { TestPage } from '../pages/TestPage';

test.describe('SightEdit Core Functionality', () => {
  let testPage: TestPage;

  test.beforeEach(async ({ page }) => {
    testPage = new TestPage(page);
    await testPage.goto();
    await testPage.resetTestData();
  });

  test('should initialize SightEdit correctly', async ({ page }) => {
    // Check that SightEdit is available globally
    const sightEditExists = await page.evaluate(() => {
      return typeof window.SightEdit !== 'undefined';
    });
    expect(sightEditExists).toBe(true);

    // Check that SightEdit is initialized
    const isInitialized = await page.evaluate(() => {
      return window.SightEdit.isInitialized();
    });
    expect(isInitialized).toBe(true);

    // Check that elements are detected
    const detectedElements = await page.evaluate(() => {
      return window.SightEdit.getDetectedElements();
    });
    expect(detectedElements.length).toBeGreaterThan(0);
  });

  test('should toggle edit mode with keyboard shortcut', async ({ page }) => {
    // Initially should be in view mode
    const initialEditMode = await page.evaluate(() => {
      return window.SightEdit.isEditMode();
    });
    expect(initialEditMode).toBe(false);

    // Toggle to edit mode
    await testPage.enableEditMode();
    
    const editModeEnabled = await page.evaluate(() => {
      return window.SightEdit.isEditMode();
    });
    expect(editModeEnabled).toBe(true);

    // Toggle back to view mode
    await testPage.disableEditMode();
    
    const editModeDisabled = await page.evaluate(() => {
      return window.SightEdit.isEditMode();
    });
    expect(editModeDisabled).toBe(false);
  });

  test('should highlight editable elements in edit mode', async ({ page }) => {
    await testPage.enableEditMode();

    // Check that editable elements have the highlight class
    const highlightedElements = await page.locator('.sightedit-highlight').count();
    expect(highlightedElements).toBeGreaterThan(0);

    // Check specific elements
    await expect(testPage.heroTitle).toHaveClass(/sightedit-highlight/);
    await expect(testPage.heroSubtitle).toHaveClass(/sightedit-highlight/);
    await expect(testPage.featureTitle).toHaveClass(/sightedit-highlight/);
  });

  test('should remove highlights when exiting edit mode', async ({ page }) => {
    await testPage.enableEditMode();
    
    // Verify highlights are present
    const highlightedElements = await page.locator('.sightedit-highlight').count();
    expect(highlightedElements).toBeGreaterThan(0);

    await testPage.disableEditMode();
    
    // Verify highlights are removed
    const remainingHighlights = await page.locator('.sightedit-highlight').count();
    expect(remainingHighlights).toBe(0);
  });

  test('should detect elements with data-sight attributes', async ({ page }) => {
    const detectedElements = await page.evaluate(() => {
      return window.SightEdit.getDetectedElements().map(el => ({
        id: el.id,
        type: el.type,
        sight: el.sight
      }));
    });

    // Check that specific elements are detected
    const heroTitle = detectedElements.find(el => el.sight === 'hero-title');
    expect(heroTitle).toBeDefined();
    expect(heroTitle?.type).toBe('text');

    const featureDesc = detectedElements.find(el => el.sight === 'feature-1-desc');
    expect(featureDesc).toBeDefined();
    expect(featureDesc?.type).toBe('richtext');

    const navLinks = detectedElements.find(el => el.type === 'collection');
    expect(navLinks).toBeDefined();
  });

  test('should handle element detection for dynamically added content', async ({ page }) => {
    // Add a new editable element to the page
    await page.evaluate(() => {
      const newElement = document.createElement('p');
      newElement.setAttribute('data-sight', 'text');
      newElement.setAttribute('data-sight-id', 'dynamic-element');
      newElement.textContent = 'Dynamic content';
      document.body.appendChild(newElement);
    });

    // Wait for mutation observer to detect the new element
    await page.waitForTimeout(100);

    // Check that the new element is detected
    const detectedElements = await page.evaluate(() => {
      return window.SightEdit.getDetectedElements().map(el => el.sight);
    });

    expect(detectedElements).toContain('dynamic-element');
  });

  test('should handle offline queue when API is unavailable', async ({ page }) => {
    // Mock network failure
    await page.route('/api/sightedit/**', route => {
      route.abort('failed');
    });

    await testPage.editText(testPage.heroTitle, 'Offline Test Title');

    // Check that the change is queued
    const queueSize = await page.evaluate(() => {
      return window.SightEdit.getOfflineQueueSize();
    });
    expect(queueSize).toBeGreaterThan(0);

    // Restore network
    await page.unroute('/api/sightedit/**');

    // Trigger queue processing
    await page.evaluate(() => {
      return window.SightEdit.processOfflineQueue();
    });

    // Wait for queue to be processed
    await page.waitForFunction(() => {
      return window.SightEdit.getOfflineQueueSize() === 0;
    });

    // Verify the change was applied
    await testPage.expectElementText(testPage.heroTitle, 'Offline Test Title');
  });

  test('should emit events during editing lifecycle', async ({ page }) => {
    const events: string[] = [];

    // Listen for SightEdit events
    await page.evaluate(() => {
      window.testEvents = [];
      
      window.SightEdit.on('editModeToggled', (data) => {
        window.testEvents.push(`editModeToggled:${data.enabled}`);
      });
      
      window.SightEdit.on('elementActivated', (data) => {
        window.testEvents.push(`elementActivated:${data.sight}:${data.type}`);
      });
      
      window.SightEdit.on('save', (data) => {
        window.testEvents.push(`save:${data.sight}`);
      });
    });

    // Trigger events
    await testPage.enableEditMode();
    await testPage.editText(testPage.heroTitle, 'Event Test Title');
    await testPage.disableEditMode();

    // Check events were fired
    const capturedEvents = await page.evaluate(() => window.testEvents);
    
    expect(capturedEvents).toContain('editModeToggled:true');
    expect(capturedEvents).toContain('elementActivated:hero-title:text');
    expect(capturedEvents).toContain('save:hero-title');
    expect(capturedEvents).toContain('editModeToggled:false');
  });

  test('should handle validation errors gracefully', async ({ page }) => {
    // Mock API to return validation error
    await page.route('/api/sightedit/save', route => {
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Validation failed: Text too long'
        })
      });
    });

    await testPage.enableEditMode();
    await testPage.heroTitle.click();

    // Wait for text editor
    const textEditor = page.locator('.sightedit-text-editor');
    await expect(textEditor).toBeVisible();

    // Enter invalid text and try to save
    await textEditor.fill('A'.repeat(200)); // Assuming max length is 100
    await textEditor.press('Enter');

    // Check that error is displayed
    const errorMessage = page.locator('.sightedit-error');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText('Validation failed');
  });

  test('should handle concurrent edits correctly', async ({ page }) => {
    // Simulate two users editing the same element
    await testPage.enableEditMode();
    
    // Start editing
    await testPage.heroTitle.click();
    const textEditor = page.locator('.sightedit-text-editor');
    await expect(textEditor).toBeVisible();

    // Simulate another user changing the same element via API
    await page.evaluate(() => {
      fetch('/api/sightedit/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sight: 'hero-title',
          value: 'Changed by another user',
          type: 'text'
        })
      });
    });

    // Complete the local edit
    await textEditor.fill('Local change');
    await textEditor.press('Enter');

    // Should detect conflict and handle appropriately
    // (Implementation depends on conflict resolution strategy)
    await expect(textEditor).not.toBeVisible();
  });
});