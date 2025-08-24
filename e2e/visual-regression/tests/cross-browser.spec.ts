import { test, expect, devices } from '@playwright/test';

const browsers = [
  { name: 'Chrome', device: devices['Desktop Chrome'] },
  { name: 'Firefox', device: devices['Desktop Firefox'] },
  { name: 'Safari', device: devices['Desktop Safari'] },
  { name: 'Edge', device: devices['Desktop Edge'] },
];

test.describe('Cross-Browser Visual Regression', () => {
  browsers.forEach(browser => {
    test.describe(`${browser.name} Rendering`, () => {
      test.use(browser.device);

      test(`edit mode in ${browser.name}`, async ({ page }) => {
        await page.goto('/examples/vanilla-html/');
        await page.waitForLoadState('networkidle');
        
        await page.keyboard.press('Control+e');
        await page.waitForTimeout(500);

        await expect(page).toHaveScreenshot(`browser-${browser.name.toLowerCase()}-edit.png`, {
          fullPage: true
        });
      });

      test(`text editor in ${browser.name}`, async ({ page }) => {
        await page.goto('/examples/vanilla-html/');
        await page.keyboard.press('Control+e');
        await page.waitForTimeout(500);

        const textElement = page.locator('[data-sight-type="text"]').first();
        await textElement.click();
        await page.waitForTimeout(500);

        await expect(page).toHaveScreenshot(`browser-${browser.name.toLowerCase()}-text-editor.png`, {
          clip: {
            x: 100,
            y: 100,
            width: 800,
            height: 400
          }
        });
      });

      test(`richtext editor in ${browser.name}`, async ({ page }) => {
        await page.goto('/examples/vanilla-html/');
        await page.keyboard.press('Control+e');
        await page.waitForTimeout(500);

        const richtextElement = page.locator('[data-sight-type="richtext"]').first();
        await richtextElement.click();
        await page.waitForTimeout(500);

        await expect(page).toHaveScreenshot(`browser-${browser.name.toLowerCase()}-richtext-editor.png`, {
          clip: {
            x: 100,
            y: 100,
            width: 800,
            height: 500
          }
        });
      });

      test(`hover effects in ${browser.name}`, async ({ page }) => {
        await page.goto('/examples/vanilla-html/');
        await page.keyboard.press('Control+e');
        await page.waitForTimeout(500);

        const element = page.locator('[data-sight]').first();
        await element.hover();
        await page.waitForTimeout(200);

        await expect(element).toHaveScreenshot(`browser-${browser.name.toLowerCase()}-hover.png`);
      });
    });
  });
});

test.describe('Mobile Browser Visual Regression', () => {
  const mobileDevices = [
    { name: 'iPhone-12', device: devices['iPhone 12'] },
    { name: 'iPhone-SE', device: devices['iPhone SE'] },
    { name: 'Pixel-5', device: devices['Pixel 5'] },
    { name: 'Galaxy-S9', device: devices['Galaxy S9+'] },
  ];

  mobileDevices.forEach(mobile => {
    test.describe(`${mobile.name} Rendering`, () => {
      test.use(mobile.device);

      test(`mobile layout on ${mobile.name}`, async ({ page }) => {
        await page.goto('/examples/vanilla-html/');
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveScreenshot(`mobile-${mobile.name.toLowerCase()}-layout.png`, {
          fullPage: true
        });
      });

      test(`mobile edit mode on ${mobile.name}`, async ({ page }) => {
        await page.goto('/examples/vanilla-html/');
        
        // Mobile touch to enter edit mode
        const toggleButton = page.locator('#edit-toggle button');
        await toggleButton.tap();
        await page.waitForTimeout(500);

        await expect(page).toHaveScreenshot(`mobile-${mobile.name.toLowerCase()}-edit.png`, {
          fullPage: true
        });
      });

      test(`mobile touch interactions on ${mobile.name}`, async ({ page }) => {
        await page.goto('/examples/vanilla-html/');
        
        const toggleButton = page.locator('#edit-toggle button');
        await toggleButton.tap();
        await page.waitForTimeout(500);

        const element = page.locator('[data-sight]').first();
        await element.tap();
        await page.waitForTimeout(500);

        await expect(page).toHaveScreenshot(`mobile-${mobile.name.toLowerCase()}-touch.png`, {
          fullPage: false,
          clip: {
            x: 0,
            y: 100,
            width: mobile.device.viewport.width,
            height: 400
          }
        });
      });
    });
  });
});

test.describe('Tablet Browser Visual Regression', () => {
  const tablets = [
    { name: 'iPad', device: devices['iPad (gen 7)'] },
    { name: 'iPad-Mini', device: devices['iPad Mini'] },
    { name: 'Surface', device: { viewport: { width: 912, height: 1368 } } },
  ];

  tablets.forEach(tablet => {
    test.describe(`${tablet.name} Rendering`, () => {
      test.use(tablet.device);

      test(`tablet layout on ${tablet.name}`, async ({ page }) => {
        await page.goto('/examples/vanilla-html/');
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveScreenshot(`tablet-${tablet.name.toLowerCase()}-layout.png`, {
          fullPage: true
        });
      });

      test(`tablet edit mode on ${tablet.name}`, async ({ page }) => {
        await page.goto('/examples/vanilla-html/');
        
        // Try keyboard shortcut or button
        try {
          await page.keyboard.press('Control+e');
        } catch {
          const toggleButton = page.locator('#edit-toggle button');
          await toggleButton.click();
        }
        await page.waitForTimeout(500);

        await expect(page).toHaveScreenshot(`tablet-${tablet.name.toLowerCase()}-edit.png`, {
          fullPage: true
        });
      });
    });
  });
});

test.describe('Browser Feature Support', () => {
  test('CSS Grid support', async ({ page, browserName }) => {
    await page.goto('/examples/vue-ecommerce/');
    await page.waitForLoadState('networkidle');

    const productGrid = page.locator('.product-grid');
    await expect(productGrid).toHaveScreenshot(`grid-${browserName}.png`);
  });

  test('Flexbox support', async ({ page, browserName }) => {
    await page.goto('/examples/react-portfolio/');
    await page.waitForLoadState('networkidle');

    const flexContainer = page.locator('.flex').first();
    await expect(flexContainer).toHaveScreenshot(`flex-${browserName}.png`);
  });

  test('Shadow DOM support', async ({ page, browserName }) => {
    await page.goto('/examples/vanilla-html/');
    
    // Check if shadow DOM elements render correctly
    await page.evaluate(() => {
      const host = document.createElement('div');
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = `
        <style>
          :host {
            display: block;
            padding: 20px;
            background: #f0f0f0;
          }
        </style>
        <div>Shadow DOM Content</div>
      `;
      document.body.appendChild(host);
    });

    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot(`shadow-dom-${browserName}.png`, {
      fullPage: true
    });
  });

  test('Custom scrollbar styling', async ({ page, browserName }) => {
    await page.goto('/examples/markdown-docs/');
    await page.waitForLoadState('networkidle');

    // Show editor with scrollbar
    await page.getByRole('button', { name: 'Show Markdown Editor' }).click();
    await page.waitForTimeout(500);

    const editor = page.locator('#markdown-editor');
    await expect(editor).toHaveScreenshot(`scrollbar-${browserName}.png`);
  });
});