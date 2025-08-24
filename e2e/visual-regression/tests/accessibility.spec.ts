import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';

test.describe('Accessibility Visual Regression', () => {
  test('edit mode focus indicators', async ({ page }) => {
    await page.goto('/examples/vanilla-html/');
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(500);

    // Tab through elements
    await page.keyboard.press('Tab');
    await expect(page).toHaveScreenshot('a11y-focus-1.png');

    await page.keyboard.press('Tab');
    await expect(page).toHaveScreenshot('a11y-focus-2.png');

    await page.keyboard.press('Tab');
    await expect(page).toHaveScreenshot('a11y-focus-3.png');
  });

  test('high contrast mode', async ({ page }) => {
    await page.goto('/examples/vanilla-html/');
    
    // Enable high contrast
    await page.evaluate(() => {
      document.documentElement.style.filter = 'contrast(2)';
    });

    await page.keyboard.press('Control+e');
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('a11y-high-contrast.png', {
      fullPage: true
    });
  });

  test('reduced motion', async ({ page }) => {
    await page.goto('/examples/vanilla-html/');
    
    // Enable reduced motion
    await page.emulateMedia({ reducedMotion: 'reduce' });
    
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(500);

    const element = page.locator('[data-sight]').first();
    await element.click();

    await expect(page).toHaveScreenshot('a11y-reduced-motion.png', {
      animations: 'disabled'
    });
  });

  test('keyboard navigation indicators', async ({ page }) => {
    await page.goto('/examples/vanilla-html/');
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(500);

    // Navigate with arrow keys
    await page.keyboard.press('ArrowDown');
    await expect(page).toHaveScreenshot('a11y-keyboard-nav-down.png');

    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveScreenshot('a11y-keyboard-nav-right.png');

    await page.keyboard.press('Enter');
    await expect(page).toHaveScreenshot('a11y-keyboard-nav-enter.png');
  });

  test('screen reader announcements visual', async ({ page }) => {
    await page.goto('/examples/vanilla-html/');
    
    // Make live region visible for testing
    await page.evaluate(() => {
      const liveRegion = document.querySelector('[aria-live]');
      if (liveRegion) {
        (liveRegion as HTMLElement).style.position = 'fixed';
        (liveRegion as HTMLElement).style.top = '10px';
        (liveRegion as HTMLElement).style.right = '10px';
        (liveRegion as HTMLElement).style.background = 'yellow';
        (liveRegion as HTMLElement).style.padding = '10px';
        (liveRegion as HTMLElement).style.border = '2px solid black';
        (liveRegion as HTMLElement).style.zIndex = '9999';
      }
    });

    await page.keyboard.press('Control+e');
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('a11y-live-region.png', {
      clip: {
        x: 800,
        y: 0,
        width: 400,
        height: 100
      }
    });
  });

  test('color contrast in edit mode', async ({ page }) => {
    await page.goto('/examples/vanilla-html/');
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(500);

    // Test different color combinations
    const elements = await page.locator('[data-sight]').all();
    
    for (let i = 0; i < Math.min(3, elements.length); i++) {
      await elements[i].scrollIntoViewIfNeeded();
      await expect(elements[i]).toHaveScreenshot(`a11y-contrast-${i}.png`);
    }
  });

  test('focus trap in modal editor', async ({ page }) => {
    await page.goto('/examples/vanilla-html/');
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(500);

    // Click element that opens modal editor
    const element = page.locator('[data-sight-type="richtext"]').first();
    await element.click();
    await page.waitForTimeout(500);

    // Tab through modal
    await page.keyboard.press('Tab');
    await expect(page).toHaveScreenshot('a11y-modal-focus-1.png');

    await page.keyboard.press('Tab');
    await expect(page).toHaveScreenshot('a11y-modal-focus-2.png');

    // Should trap focus in modal
    await page.keyboard.press('Shift+Tab');
    await expect(page).toHaveScreenshot('a11y-modal-focus-trap.png');
  });
});

test.describe('Accessibility Compliance', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/examples/vanilla-html/');
    await injectAxe(page);
  });

  test('view mode accessibility', async ({ page }) => {
    const violations = await checkA11y(page, null, {
      detailedReport: true,
      detailedReportOptions: {
        html: true
      }
    });

    // Take screenshot of any violations
    if (violations) {
      await expect(page).toHaveScreenshot('a11y-violations-view.png', {
        fullPage: true
      });
    }
  });

  test('edit mode accessibility', async ({ page }) => {
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(500);

    const violations = await checkA11y(page, null, {
      detailedReport: true,
      detailedReportOptions: {
        html: true
      }
    });

    if (violations) {
      await expect(page).toHaveScreenshot('a11y-violations-edit.png', {
        fullPage: true
      });
    }
  });
});