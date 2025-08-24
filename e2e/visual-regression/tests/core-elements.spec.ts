import { test, expect, Page } from '@playwright/test';

test.describe('Core Elements Visual Regression', () => {
  let page: Page;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    await page.goto('/examples/vanilla-html/');
    await page.waitForLoadState('networkidle');
  });

  test('text editor appearance', async () => {
    // Enter edit mode
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(500);

    // Click on a text element
    const textElement = page.locator('[data-sight="hero-title"]').first();
    await textElement.click();
    await page.waitForTimeout(500);

    // Take screenshot of text editor
    await expect(page).toHaveScreenshot('text-editor.png', {
      clip: {
        x: 100,
        y: 100,
        width: 800,
        height: 400
      }
    });
  });

  test('richtext editor appearance', async () => {
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(500);

    const richtextElement = page.locator('[data-sight-type="richtext"]').first();
    await richtextElement.click();
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('richtext-editor.png', {
      clip: {
        x: 100,
        y: 100,
        width: 800,
        height: 500
      }
    });
  });

  test('image editor appearance', async () => {
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(500);

    const imageElement = page.locator('[data-sight-type="image"]').first();
    await imageElement.click();
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('image-editor.png', {
      fullPage: false,
      clip: {
        x: 100,
        y: 100,
        width: 800,
        height: 600
      }
    });
  });

  test('edit mode visual indicators', async () => {
    // View mode
    await expect(page).toHaveScreenshot('view-mode.png', {
      fullPage: true
    });

    // Enter edit mode
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(500);

    // Edit mode with outlines
    await expect(page).toHaveScreenshot('edit-mode-outlines.png', {
      fullPage: true
    });
  });

  test('hover states', async () => {
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(500);

    const element = page.locator('[data-sight]').first();
    
    // Normal state
    await expect(element).toHaveScreenshot('element-normal.png');

    // Hover state
    await element.hover();
    await page.waitForTimeout(200);
    await expect(element).toHaveScreenshot('element-hover.png');
  });

  test('focus states', async () => {
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(500);

    const element = page.locator('[data-sight]').first();
    
    // Click to focus
    await element.click();
    await page.waitForTimeout(200);
    await expect(element).toHaveScreenshot('element-focused.png');
  });

  test('loading states', async () => {
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(500);

    // Trigger a save operation
    const element = page.locator('[data-sight="hero-title"]').first();
    await element.click();
    await page.waitForTimeout(200);

    // Type to trigger save
    await page.keyboard.type('Updated Title');
    
    // Capture loading state
    await expect(page).toHaveScreenshot('loading-state.png', {
      animations: 'disabled',
      clip: {
        x: 100,
        y: 100,
        width: 800,
        height: 300
      }
    });
  });

  test('error states', async () => {
    // Simulate network error
    await page.route('**/api/sightedit/**', route => {
      route.abort('failed');
    });

    await page.keyboard.press('Control+e');
    await page.waitForTimeout(500);

    const element = page.locator('[data-sight]').first();
    await element.click();
    await page.keyboard.type('Test');
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('error-state.png', {
      clip: {
        x: 100,
        y: 100,
        width: 800,
        height: 400
      }
    });
  });
});

test.describe('Responsive Visual Regression', () => {
  const viewports = [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1920, height: 1080 },
  ];

  viewports.forEach(viewport => {
    test(`edit mode at ${viewport.name} resolution`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/examples/vanilla-html/');
      await page.waitForLoadState('networkidle');

      // Enter edit mode
      await page.keyboard.press('Control+e');
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot(`edit-mode-${viewport.name}.png`, {
        fullPage: true
      });
    });
  });
});

test.describe('Dark Mode Visual Regression', () => {
  test('dark mode editor appearance', async ({ page }) => {
    await page.goto('/examples/vanilla-html/');
    
    // Enable dark mode
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });
    
    await page.waitForTimeout(500);
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('dark-mode-edit.png', {
      fullPage: true
    });
  });

  test('dark mode editor overlays', async ({ page }) => {
    await page.goto('/examples/vanilla-html/');
    
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });
    
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(500);

    const element = page.locator('[data-sight]').first();
    await element.click();
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('dark-mode-editor-overlay.png', {
      clip: {
        x: 100,
        y: 100,
        width: 800,
        height: 500
      }
    });
  });
});