import { describe, beforeAll, afterAll, beforeEach, test, expect } from '@jest/globals';
import { chromium, Browser, Page } from 'playwright';
// @ts-ignore
import { injectAxe, checkA11y, configureAxe } from 'axe-playwright';

describe('Accessibility Integration Tests', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
    
    // Inject axe-core for accessibility testing
    await injectAxe(page);
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    // Configure axe for each test
    await configureAxe(page, {
      rules: {
        // Enable additional rules for comprehensive testing
        'color-contrast': { enabled: true },
        'keyboard-accessible': { enabled: true },
        'focus-visible': { enabled: true },
        'landmarks': { enabled: true },
        'heading-order': { enabled: true }
      }
    });
  });

  describe('WCAG 2.1 AA Compliance', () => {
    test('should meet WCAG standards for basic content structure', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <title>SightEdit Accessibility Test</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body>
          <header role="banner">
            <h1>SightEdit Content Management</h1>
            <nav role="navigation" aria-label="Main navigation">
              <ul>
                <li><a href="#main">Main Content</a></li>
                <li><a href="#sidebar">Sidebar</a></li>
              </ul>
            </nav>
          </header>
          
          <main id="main" role="main">
            <h2>Editable Content</h2>
            <p data-sight="intro-text">
              This is editable content that should be accessible to screen readers and keyboard users.
            </p>
            <div data-sight="content-block" role="region" aria-label="Editable content block">
              <h3>Section Title</h3>
              <p>Content within this section can be edited when in edit mode.</p>
            </div>
          </main>
          
          <aside id="sidebar" role="complementary" aria-label="Additional information">
            <h2>Sidebar Content</h2>
            <p data-sight="sidebar-text">Additional editable content in the sidebar.</p>
          </aside>
          
          <footer role="contentinfo">
            <p>&copy; 2024 SightEdit. All rights reserved.</p>
          </footer>
        </body>
        </html>
      `);

      await checkA11y(page, null, {
        detailedReport: true,
        detailedReportOptions: { html: true }
      });
    });

    test('should maintain accessibility in edit mode', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <title>SightEdit Edit Mode</title>
          <meta charset="utf-8">
          <style>
            .sight-edit-mode [data-sight] {
              border: 2px solid #007cba;
              position: relative;
              outline: none;
            }
            .sight-edit-mode [data-sight]:focus {
              border-color: #005a9c;
              box-shadow: 0 0 0 2px rgba(0, 124, 186, 0.3);
            }
            .edit-indicator {
              position: absolute;
              top: -8px;
              left: -8px;
              background: #007cba;
              color: white;
              font-size: 12px;
              padding: 2px 6px;
              border-radius: 3px;
            }
          </style>
        </head>
        <body class="sight-edit-mode">
          <main role="main">
            <h1>Edit Mode Active</h1>
            <div 
              data-sight="editable-heading" 
              role="heading" 
              aria-level="2"
              tabindex="0"
              aria-label="Editable heading - press Enter to edit"
              aria-describedby="edit-instructions"
            >
              <span class="edit-indicator" aria-hidden="true">EDIT</span>
              Editable Heading
            </div>
            
            <div 
              data-sight="editable-paragraph" 
              role="textbox"
              tabindex="0"
              aria-multiline="true"
              aria-label="Editable paragraph - press Enter to edit"
              aria-describedby="edit-instructions"
            >
              <span class="edit-indicator" aria-hidden="true">EDIT</span>
              This is an editable paragraph that can be modified when selected.
            </div>
            
            <p id="edit-instructions" class="sr-only">
              Press Enter or Space to start editing. Use Escape to cancel editing.
            </p>
          </main>
        </body>
        </html>
      `);

      await checkA11y(page, null, {
        detailedReport: true,
        detailedReportOptions: { html: true }
      });
    });

    test('should handle keyboard navigation correctly', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <title>Keyboard Navigation Test</title>
          <meta charset="utf-8">
          <style>
            [data-sight] {
              border: 2px solid transparent;
              padding: 10px;
              margin: 5px 0;
              border-radius: 4px;
            }
            [data-sight]:focus {
              border-color: #007cba;
              outline: 2px solid #005a9c;
              outline-offset: 2px;
            }
            .skip-link {
              position: absolute;
              top: -40px;
              left: 6px;
              background: #000;
              color: #fff;
              padding: 8px;
              text-decoration: none;
              border-radius: 4px;
            }
            .skip-link:focus {
              top: 6px;
            }
          </style>
        </head>
        <body>
          <a class="skip-link" href="#main">Skip to main content</a>
          
          <nav role="navigation" aria-label="Main navigation">
            <ul>
              <li><a href="#section1">Section 1</a></li>
              <li><a href="#section2">Section 2</a></li>
            </ul>
          </nav>
          
          <main id="main" role="main">
            <h1>Keyboard Navigation</h1>
            
            <section id="section1">
              <h2>Section 1</h2>
              <div data-sight="text1" tabindex="0" role="textbox" aria-label="Editable text 1">
                First editable content
              </div>
              <div data-sight="text2" tabindex="0" role="textbox" aria-label="Editable text 2">
                Second editable content
              </div>
            </section>
            
            <section id="section2">
              <h2>Section 2</h2>
              <div data-sight="text3" tabindex="0" role="textbox" aria-label="Editable text 3">
                Third editable content
              </div>
            </section>
          </main>
        </body>
        </html>
      `);

      // Test keyboard navigation
      await page.keyboard.press('Tab'); // Skip link
      await page.keyboard.press('Tab'); // First nav link
      await page.keyboard.press('Tab'); // Second nav link
      await page.keyboard.press('Tab'); // First editable element
      
      const focusedElement = await page.evaluate(() => document.activeElement?.getAttribute('data-sight'));
      expect(focusedElement).toBe('text1');

      await checkA11y(page, null, {
        detailedReport: true,
        detailedReportOptions: { html: true }
      });
    });

    test('should provide appropriate ARIA labels and descriptions', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <title>ARIA Labels Test</title>
          <meta charset="utf-8">
        </head>
        <body>
          <main role="main">
            <h1>ARIA Labels and Descriptions</h1>
            
            <section aria-labelledby="form-heading">
              <h2 id="form-heading">Editable Form Content</h2>
              
              <div 
                data-sight="user-name"
                role="textbox"
                tabindex="0"
                aria-label="User name"
                aria-describedby="name-help"
              >
                John Doe
              </div>
              <p id="name-help">Enter the user's full name</p>
              
              <div 
                data-sight="user-email"
                role="textbox"
                tabindex="0"
                aria-label="Email address"
                aria-describedby="email-help"
                aria-invalid="false"
              >
                john@example.com
              </div>
              <p id="email-help">Enter a valid email address</p>
              
              <div 
                data-sight="user-bio"
                role="textbox"
                tabindex="0"
                aria-label="User biography"
                aria-describedby="bio-help"
                aria-multiline="true"
              >
                User biography content goes here. This can be multiple lines.
              </div>
              <p id="bio-help">Enter a brief biography (optional)</p>
            </section>
            
            <section aria-labelledby="status-heading">
              <h2 id="status-heading">Status Indicators</h2>
              
              <div 
                data-sight="status-message"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                Content saved successfully
              </div>
              
              <div 
                data-sight="error-message"
                role="alert"
                aria-live="assertive"
                aria-atomic="true"
                style="display: none;"
              >
                Error: Failed to save content
              </div>
            </section>
          </main>
        </body>
        </html>
      `);

      await checkA11y(page, null, {
        detailedReport: true,
        detailedReportOptions: { html: true }
      });
    });
  });

  describe('Color Contrast and Visual Accessibility', () => {
    test('should meet color contrast requirements', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <title>Color Contrast Test</title>
          <meta charset="utf-8">
          <style>
            body { 
              font-family: Arial, sans-serif; 
              line-height: 1.5;
            }
            .normal-text { 
              color: #333333; 
              background: #ffffff; 
            }
            .highlighted-text { 
              color: #ffffff; 
              background: #007cba; 
              padding: 5px;
            }
            .warning-text { 
              color: #856404; 
              background: #fff3cd; 
              padding: 5px;
              border: 1px solid #ffeaa7;
            }
            .error-text { 
              color: #721c24; 
              background: #f8d7da; 
              padding: 5px;
              border: 1px solid #f1b0b7;
            }
            .success-text { 
              color: #155724; 
              background: #d4edda; 
              padding: 5px;
              border: 1px solid #9ae6b4;
            }
            [data-sight]:focus {
              outline: 2px solid #005a9c;
              outline-offset: 2px;
            }
          </style>
        </head>
        <body>
          <main role="main">
            <h1>Color Contrast Examples</h1>
            
            <p class="normal-text" data-sight="normal-content" tabindex="0">
              This is normal text with sufficient contrast ratio.
            </p>
            
            <p class="highlighted-text" data-sight="highlighted-content" tabindex="0">
              This is highlighted text with high contrast.
            </p>
            
            <div class="warning-text" data-sight="warning-content" tabindex="0">
              This is a warning message with appropriate contrast.
            </div>
            
            <div class="error-text" data-sight="error-content" tabindex="0">
              This is an error message with appropriate contrast.
            </div>
            
            <div class="success-text" data-sight="success-content" tabindex="0">
              This is a success message with appropriate contrast.
            </div>
          </main>
        </body>
        </html>
      `);

      await checkA11y(page, null, {
        detailedReport: true,
        detailedReportOptions: { html: true }
      });
    });

    test('should be accessible in high contrast mode', async () => {
      // Simulate high contrast mode
      await page.emulateMedia({ colorScheme: 'dark' });
      
      await page.setContent(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <title>High Contrast Mode</title>
          <meta charset="utf-8">
          <style>
            @media (prefers-contrast: high) {
              body { 
                background: black !important; 
                color: white !important; 
              }
              [data-sight] {
                border: 2px solid white !important;
                background: black !important;
                color: white !important;
              }
              [data-sight]:focus {
                border-color: yellow !important;
                outline: 2px solid yellow !important;
              }
            }
          </style>
        </head>
        <body>
          <main role="main">
            <h1>High Contrast Mode</h1>
            <div data-sight="hc-content" tabindex="0">
              Content should be visible in high contrast mode
            </div>
          </main>
        </body>
        </html>
      `);

      await checkA11y(page, null, {
        detailedReport: true,
        detailedReportOptions: { html: true }
      });
    });
  });

  describe('Screen Reader Compatibility', () => {
    test('should provide meaningful content for screen readers', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <title>Screen Reader Test</title>
          <meta charset="utf-8">
        </head>
        <body>
          <main role="main">
            <h1>Screen Reader Content</h1>
            
            <section>
              <h2>Article Content</h2>
              
              <article>
                <header>
                  <h3 data-sight="article-title" tabindex="0">
                    Accessible Article Title
                  </h3>
                  <p>
                    <time datetime="2024-01-15" data-sight="article-date" tabindex="0">
                      January 15, 2024
                    </time>
                  </p>
                </header>
                
                <div data-sight="article-content" tabindex="0" role="region" aria-label="Article body">
                  <p>This is the main article content that screen readers should announce properly.</p>
                  <p>Multiple paragraphs should be navigable and understandable.</p>
                </div>
                
                <footer>
                  <p data-sight="article-author" tabindex="0">
                    <span class="sr-only">Author: </span>John Smith
                  </p>
                </footer>
              </article>
            </section>
            
            <section>
              <h2>Data Table</h2>
              <table role="table" aria-label="User information">
                <caption>Editable User Data</caption>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Email</th>
                    <th scope="col">Role</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td data-sight="user1-name" tabindex="0" role="gridcell">John Doe</td>
                    <td data-sight="user1-email" tabindex="0" role="gridcell">john@example.com</td>
                    <td data-sight="user1-role" tabindex="0" role="gridcell">Admin</td>
                  </tr>
                </tbody>
              </table>
            </section>
          </main>
          
          <div class="sr-only" aria-live="polite" aria-atomic="true" id="announcements">
            <!-- Live announcements for screen readers -->
          </div>
        </body>
        </html>
      `);

      await checkA11y(page, null, {
        detailedReport: true,
        detailedReportOptions: { html: true }
      });
    });

    test('should announce dynamic content changes', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <title>Dynamic Content Test</title>
          <meta charset="utf-8">
          <script>
            function updateContent() {
              const element = document.getElementById('dynamic-content');
              element.textContent = 'Content has been updated at ' + new Date().toLocaleTimeString();
              
              const announcer = document.getElementById('announcements');
              announcer.textContent = 'Content updated successfully';
            }
            
            function showError() {
              const error = document.getElementById('error-message');
              error.style.display = 'block';
              error.textContent = 'Error occurred while saving content';
            }
          </script>
        </head>
        <body>
          <main role="main">
            <h1>Dynamic Content Updates</h1>
            
            <button onclick="updateContent()" aria-describedby="update-help">
              Update Content
            </button>
            <p id="update-help">Updates the content below and announces the change</p>
            
            <div 
              id="dynamic-content" 
              data-sight="dynamic-text" 
              tabindex="0"
              aria-live="polite"
              aria-atomic="true"
            >
              Original content
            </div>
            
            <button onclick="showError()" aria-describedby="error-help">
              Trigger Error
            </button>
            <p id="error-help">Shows an error message</p>
            
            <div 
              id="error-message" 
              role="alert" 
              aria-live="assertive"
              style="display: none;"
            >
              <!-- Error will be inserted here -->
            </div>
          </main>
          
          <div id="announcements" aria-live="polite" aria-atomic="true" class="sr-only">
            <!-- Announcements for screen readers -->
          </div>
        </body>
        </html>
      `);

      await checkA11y(page, null, {
        detailedReport: true,
        detailedReportOptions: { html: true }
      });
    });
  });

  describe('Touch and Mobile Accessibility', () => {
    test('should be accessible on mobile devices', async () => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      
      await page.setContent(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <title>Mobile Accessibility</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { 
              font-family: Arial, sans-serif; 
              font-size: 16px;
              line-height: 1.5;
              margin: 0;
              padding: 10px;
            }
            [data-sight] {
              min-height: 44px; /* Minimum touch target size */
              padding: 12px;
              margin: 8px 0;
              border: 2px solid #ddd;
              border-radius: 6px;
              display: block;
            }
            [data-sight]:focus {
              border-color: #007cba;
              outline: 2px solid #005a9c;
              outline-offset: 2px;
            }
            .touch-friendly {
              min-height: 48px;
              font-size: 18px;
            }
          </style>
        </head>
        <body>
          <main role="main">
            <h1>Mobile Accessibility Test</h1>
            
            <div data-sight="mobile-title" tabindex="0" class="touch-friendly">
              Touch-friendly editable title
            </div>
            
            <div data-sight="mobile-content" tabindex="0" class="touch-friendly">
              This content is designed to be accessible on mobile devices with appropriate touch targets.
            </div>
            
            <div data-sight="mobile-description" tabindex="0" class="touch-friendly">
              Another piece of content with sufficient size for touch interaction.
            </div>
          </main>
        </body>
        </html>
      `);

      await checkA11y(page, null, {
        detailedReport: true,
        detailedReportOptions: { html: true }
      });
    });
  });

  describe('Focus Management', () => {
    test('should manage focus correctly during editing', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <title>Focus Management</title>
          <meta charset="utf-8">
          <style>
            [data-sight] {
              border: 2px solid transparent;
              padding: 10px;
              margin: 5px 0;
              border-radius: 4px;
            }
            [data-sight]:focus {
              border-color: #007cba;
              outline: 2px solid #005a9c;
              outline-offset: 2px;
            }
            .editing {
              border-color: #28a745 !important;
              background-color: #f8f9fa;
            }
          </style>
          <script>
            function enterEditMode(element) {
              element.classList.add('editing');
              element.setAttribute('contenteditable', 'true');
              element.focus();
              
              // Announce to screen readers
              const announcer = document.getElementById('announcements');
              announcer.textContent = 'Edit mode activated. Press Escape to cancel.';
            }
            
            function exitEditMode(element) {
              element.classList.remove('editing');
              element.removeAttribute('contenteditable');
              element.focus();
              
              // Announce to screen readers
              const announcer = document.getElementById('announcements');
              announcer.textContent = 'Edit mode deactivated. Changes saved.';
            }
            
            document.addEventListener('keydown', function(e) {
              if (e.key === 'Enter' && e.target.hasAttribute('data-sight') && !e.target.hasAttribute('contenteditable')) {
                e.preventDefault();
                enterEditMode(e.target);
              } else if (e.key === 'Escape' && e.target.hasAttribute('contenteditable')) {
                e.preventDefault();
                exitEditMode(e.target);
              }
            });
          </script>
        </head>
        <body>
          <main role="main">
            <h1>Focus Management Test</h1>
            <p>Press Enter on editable elements to start editing, Escape to finish.</p>
            
            <div 
              data-sight="focus-test-1" 
              tabindex="0"
              role="textbox"
              aria-label="Editable text 1 - Press Enter to edit"
            >
              First editable element
            </div>
            
            <div 
              data-sight="focus-test-2" 
              tabindex="0"
              role="textbox"
              aria-label="Editable text 2 - Press Enter to edit"
            >
              Second editable element
            </div>
            
            <div 
              data-sight="focus-test-3" 
              tabindex="0"
              role="textbox"
              aria-label="Editable text 3 - Press Enter to edit"
            >
              Third editable element
            </div>
          </main>
          
          <div id="announcements" aria-live="polite" aria-atomic="true" class="sr-only">
            <!-- Focus change announcements -->
          </div>
        </body>
        </html>
      `);

      await checkA11y(page, null, {
        detailedReport: true,
        detailedReportOptions: { html: true }
      });

      // Test focus management
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab'); // First editable element
      await page.keyboard.press('Enter'); // Enter edit mode
      
      // Check that element is now contenteditable
      const isContentEditable = await page.evaluate(() => {
        return document.activeElement?.getAttribute('contenteditable') === 'true';
      });
      expect(isContentEditable).toBe(true);

      await page.keyboard.press('Escape'); // Exit edit mode
      
      // Check that contenteditable is removed
      const isStillContentEditable = await page.evaluate(() => {
        return document.activeElement?.hasAttribute('contenteditable');
      });
      expect(isStillContentEditable).toBe(false);
    });
  });
});