import { test, expect } from '@playwright/test';
import { DataFactory } from '../../src/fixtures/data-factory.js';

test.describe('Visual Regression Tests', () => {
  
  test.beforeEach(async ({ page }) => {
    // Reset test data and setup clean state
    await page.request.post('/test/reset');
  });

  test.describe('Core UI Components', () => {
    test('should match baseline screenshot for edit mode toggle', async ({ page }) => {
      await page.goto('/');
      
      // Setup test page with SightEdit content
      await page.setContent(`
        <html>
        <body>
          <div data-sight="title">Sample Title</div>
          <div data-sight="description">Sample Description</div>
          <script>
            // Mock SightEdit initialization
            window.mockEditMode = false;
            window.toggleEditMode = () => {
              window.mockEditMode = !window.mockEditMode;
              document.body.classList.toggle('sight-edit-mode', window.mockEditMode);
            };
          </script>
        </body>
        </html>
      `);
      
      // Take screenshot in view mode
      await expect(page).toHaveScreenshot('view-mode.png');
      
      // Toggle to edit mode
      await page.evaluate(() => window.toggleEditMode());
      await page.waitForTimeout(500); // Allow for transitions
      
      // Take screenshot in edit mode
      await expect(page).toHaveScreenshot('edit-mode.png');
    });

    test('should match baseline for different editor types', async ({ page }) => {
      const editorTypes = [
        { type: 'text', content: 'Sample text content' },
        { type: 'richtext', content: '<p>Rich <strong>text</strong> content</p>' },
        { type: 'number', content: '42' },
        { type: 'date', content: '2024-01-15' },
        { type: 'color', content: '#ff0000' }
      ];

      for (const editor of editorTypes) {
        await page.setContent(`
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; }
              [data-sight] { 
                border: 1px solid #ccc; 
                padding: 10px; 
                margin: 10px 0; 
                border-radius: 4px;
              }
              .sight-edit-mode [data-sight] {
                border: 2px solid #007cba;
                position: relative;
              }
              .sight-edit-mode [data-sight]:hover {
                background-color: #f0f8ff;
              }
            </style>
          </head>
          <body class="sight-edit-mode">
            <div data-sight="test-${editor.type}" data-type="${editor.type}">
              ${editor.content}
            </div>
          </body>
          </html>
        `);
        
        await expect(page).toHaveScreenshot(`editor-${editor.type}.png`);
      }
    });

    test('should match baseline for responsive breakpoints', async ({ page }) => {
      const testContent = `
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; }
            .container { padding: 20px; }
            [data-sight] { 
              border: 1px solid #ddd; 
              padding: 15px; 
              margin: 10px 0;
              border-radius: 6px;
            }
            @media (max-width: 768px) {
              .container { padding: 10px; }
              [data-sight] { padding: 10px; margin: 5px 0; }
            }
            @media (max-width: 480px) {
              .container { padding: 5px; }
              [data-sight] { padding: 8px; margin: 3px 0; font-size: 14px; }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1 data-sight="main-title">Main Title</h1>
            <p data-sight="intro-text">This is an introduction paragraph that should adapt to different screen sizes.</p>
            <div data-sight="content-block">
              <h2>Content Block</h2>
              <p>Additional content that demonstrates responsive behavior.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const viewports = [
        { name: 'desktop', width: 1200, height: 800 },
        { name: 'tablet', width: 768, height: 1024 },
        { name: 'mobile', width: 375, height: 667 }
      ];

      for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.setContent(testContent);
        
        await expect(page).toHaveScreenshot(`responsive-${viewport.name}.png`);
      }
    });
  });

  test.describe('Theme and Styling Variations', () => {
    test('should match baseline for dark theme', async ({ page }) => {
      await page.setContent(`
        <html>
        <head>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              background-color: #1a1a1a; 
              color: #ffffff; 
              margin: 0; 
              padding: 20px;
            }
            [data-sight] { 
              border: 1px solid #444; 
              padding: 15px; 
              margin: 10px 0;
              border-radius: 6px;
              background-color: #2a2a2a;
            }
            .sight-edit-mode [data-sight] {
              border: 2px solid #66b3ff;
              box-shadow: 0 0 10px rgba(102, 179, 255, 0.3);
            }
          </style>
        </head>
        <body class="sight-edit-mode dark-theme">
          <h1 data-sight="title">Dark Theme Title</h1>
          <p data-sight="description">This content is displayed in dark theme mode.</p>
          <div data-sight="content">Additional content block for dark theme testing.</div>
        </body>
        </html>
      `);
      
      await expect(page).toHaveScreenshot('dark-theme.png');
    });

    test('should match baseline for high contrast mode', async ({ page }) => {
      await page.setContent(`
        <html>
        <head>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              background-color: #ffffff; 
              color: #000000; 
              margin: 0; 
              padding: 20px;
              font-weight: bold;
            }
            [data-sight] { 
              border: 3px solid #000000; 
              padding: 15px; 
              margin: 10px 0;
              background-color: #ffffff;
            }
            .sight-edit-mode [data-sight] {
              border: 3px solid #ff0000;
              background-color: #ffff00;
              color: #000000;
            }
          </style>
        </head>
        <body class="sight-edit-mode high-contrast">
          <h1 data-sight="title">High Contrast Title</h1>
          <p data-sight="description">This content is displayed in high contrast mode for accessibility.</p>
          <div data-sight="content">Additional content block for accessibility testing.</div>
        </body>
        </html>
      `);
      
      await expect(page).toHaveScreenshot('high-contrast.png');
    });
  });

  test.describe('Interactive States', () => {
    test('should match baseline for hover states', async ({ page }) => {
      await page.setContent(`
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            [data-sight] { 
              border: 1px solid #ddd; 
              padding: 15px; 
              margin: 10px 0;
              border-radius: 6px;
              transition: all 0.2s ease;
            }
            [data-sight]:hover {
              border-color: #007cba;
              background-color: #f0f8ff;
              box-shadow: 0 2px 8px rgba(0, 124, 186, 0.2);
            }
          </style>
        </head>
        <body>
          <div data-sight="hover-test">Hover over this element</div>
        </body>
        </html>
      `);
      
      // Take screenshot without hover
      await expect(page).toHaveScreenshot('element-normal.png');
      
      // Hover over element and take screenshot
      await page.locator('[data-sight="hover-test"]').hover();
      await expect(page).toHaveScreenshot('element-hover.png');
    });

    test('should match baseline for focus states', async ({ page }) => {
      await page.setContent(`
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            [data-sight] { 
              border: 1px solid #ddd; 
              padding: 15px; 
              margin: 10px 0;
              border-radius: 6px;
            }
            [data-sight]:focus {
              outline: 2px solid #005a9c;
              outline-offset: 2px;
            }
            button {
              padding: 10px 20px;
              border: 1px solid #ddd;
              border-radius: 4px;
              background: white;
              cursor: pointer;
            }
            button:focus {
              outline: 2px solid #005a9c;
              outline-offset: 2px;
            }
          </style>
        </head>
        <body>
          <div data-sight="focus-test" tabindex="0">Focusable content element</div>
          <button data-sight="button-test">Focusable button</button>
        </body>
        </html>
      `);
      
      // Focus on first element
      await page.locator('[data-sight="focus-test"]').focus();
      await expect(page).toHaveScreenshot('element-focus.png');
      
      // Focus on button
      await page.locator('button[data-sight="button-test"]').focus();
      await expect(page).toHaveScreenshot('button-focus.png');
    });
  });

  test.describe('Complex Layout Scenarios', () => {
    test('should match baseline for nested content structure', async ({ page }) => {
      await page.setContent(`
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
            .header { background: #f8f9fa; padding: 20px; border-bottom: 1px solid #dee2e6; }
            .main { display: flex; gap: 20px; padding: 20px 0; }
            .sidebar { flex: 0 0 250px; }
            .content { flex: 1; }
            .card { border: 1px solid #dee2e6; border-radius: 8px; padding: 15px; margin: 10px 0; }
            [data-sight] { 
              position: relative;
              border: 2px dashed transparent;
              transition: all 0.2s ease;
            }
            .sight-edit-mode [data-sight] {
              border-color: #007cba;
            }
          </style>
        </head>
        <body class="sight-edit-mode">
          <header class="header">
            <h1 data-sight="page-title">Complex Layout Example</h1>
            <p data-sight="page-subtitle">Demonstrating nested editable content</p>
          </header>
          <div class="main">
            <aside class="sidebar">
              <div class="card">
                <h3 data-sight="sidebar-title">Sidebar</h3>
                <ul>
                  <li data-sight="nav-item-1">Navigation Item 1</li>
                  <li data-sight="nav-item-2">Navigation Item 2</li>
                  <li data-sight="nav-item-3">Navigation Item 3</li>
                </ul>
              </div>
            </aside>
            <main class="content">
              <div class="card">
                <h2 data-sight="article-title">Main Article</h2>
                <p data-sight="article-intro">This is the introduction paragraph of the main article.</p>
                <div data-sight="article-content">
                  <p>Main content goes here with multiple paragraphs and sections.</p>
                  <h3 data-sight="section-title">Section Title</h3>
                  <p data-sight="section-content">Section content with more detailed information.</p>
                </div>
              </div>
            </main>
          </div>
        </body>
        </html>
      `);
      
      await expect(page).toHaveScreenshot('complex-layout.png', { fullPage: true });
    });

    test('should match baseline for grid layout', async ({ page }) => {
      await page.setContent(`
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
            .grid { 
              display: grid; 
              grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); 
              gap: 20px; 
            }
            .card { 
              border: 1px solid #dee2e6; 
              border-radius: 8px; 
              padding: 20px; 
              background: white;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            [data-sight] { 
              border: 2px dashed transparent;
              transition: all 0.2s ease;
            }
            .sight-edit-mode [data-sight] {
              border-color: #007cba;
            }
          </style>
        </head>
        <body class="sight-edit-mode">
          <h1 data-sight="grid-title">Grid Layout Example</h1>
          <div class="grid">
            <div class="card">
              <h3 data-sight="card-1-title">Card 1 Title</h3>
              <p data-sight="card-1-content">Content for the first card in the grid layout.</p>
            </div>
            <div class="card">
              <h3 data-sight="card-2-title">Card 2 Title</h3>
              <p data-sight="card-2-content">Content for the second card in the grid layout.</p>
            </div>
            <div class="card">
              <h3 data-sight="card-3-title">Card 3 Title</h3>
              <p data-sight="card-3-content">Content for the third card in the grid layout.</p>
            </div>
            <div class="card">
              <h3 data-sight="card-4-title">Card 4 Title</h3>
              <p data-sight="card-4-content">Content for the fourth card in the grid layout.</p>
            </div>
          </div>
        </body>
        </html>
      `);
      
      await expect(page).toHaveScreenshot('grid-layout.png', { fullPage: true });
    });
  });

  test.describe('Error States and Edge Cases', () => {
    test('should match baseline for error states', async ({ page }) => {
      await page.setContent(`
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .error { 
              border: 2px solid #dc3545; 
              background-color: #f8d7da; 
              color: #721c24; 
              padding: 15px; 
              margin: 10px 0;
              border-radius: 6px;
            }
            .warning { 
              border: 2px solid #ffc107; 
              background-color: #fff3cd; 
              color: #856404; 
              padding: 15px; 
              margin: 10px 0;
              border-radius: 6px;
            }
            .success { 
              border: 2px solid #28a745; 
              background-color: #d4edda; 
              color: #155724; 
              padding: 15px; 
              margin: 10px 0;
              border-radius: 6px;
            }
          </style>
        </head>
        <body>
          <div class="error" data-sight="error-message">
            <strong>Error:</strong> This content could not be saved.
          </div>
          <div class="warning" data-sight="warning-message">
            <strong>Warning:</strong> This content has unsaved changes.
          </div>
          <div class="success" data-sight="success-message">
            <strong>Success:</strong> Content saved successfully.
          </div>
        </body>
        </html>
      `);
      
      await expect(page).toHaveScreenshot('error-states.png');
    });

    test('should match baseline for long content overflow', async ({ page }) => {
      const longContent = 'This is a very long piece of content that should test how the system handles text overflow and wrapping. '.repeat(20);
      
      await page.setContent(`
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .container { max-width: 600px; }
            [data-sight] { 
              border: 1px solid #ddd; 
              padding: 15px; 
              margin: 10px 0;
              border-radius: 6px;
            }
            .truncated { 
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
            .scrollable { 
              max-height: 100px;
              overflow-y: auto;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div data-sight="long-content-normal">${longContent}</div>
            <div data-sight="long-content-truncated" class="truncated">${longContent}</div>
            <div data-sight="long-content-scrollable" class="scrollable">${longContent}</div>
          </div>
        </body>
        </html>
      `);
      
      await expect(page).toHaveScreenshot('content-overflow.png');
    });
  });

  test.describe('Animation and Transition States', () => {
    test('should match baseline for loading states', async ({ page }) => {
      await page.setContent(`
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .loading { 
              border: 1px solid #ddd; 
              padding: 20px; 
              margin: 10px 0;
              border-radius: 6px;
              position: relative;
            }
            .loading::after {
              content: '';
              position: absolute;
              top: 50%;
              left: 50%;
              width: 20px;
              height: 20px;
              margin: -10px 0 0 -10px;
              border: 2px solid #f3f3f3;
              border-top: 2px solid #007cba;
              border-radius: 50%;
              animation: spin 1s linear infinite;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            .skeleton {
              background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
              background-size: 200% 100%;
              animation: loading 1.5s infinite;
            }
            @keyframes loading {
              0% { background-position: 200% 0; }
              100% { background-position: -200% 0; }
            }
          </style>
        </head>
        <body>
          <div class="loading" data-sight="loading-content">
            Loading content...
          </div>
          <div class="skeleton" data-sight="skeleton-content" style="height: 60px; border-radius: 6px;">
          </div>
        </body>
        </html>
      `);
      
      // Wait for animation to start
      await page.waitForTimeout(500);
      await expect(page).toHaveScreenshot('loading-states.png');
    });
  });
});