import { test, expect } from '@playwright/test';

test.describe('React Integration Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/examples/react-portfolio/');
    await page.waitForLoadState('networkidle');
  });

  test('React component editing', async ({ page }) => {
    // Enter edit mode
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('react-edit-mode.png', {
      fullPage: true
    });
  });

  test('React portfolio sections', async ({ page }) => {
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(500);

    // Hero section
    const heroSection = page.locator('header.gradient-bg');
    await expect(heroSection).toHaveScreenshot('react-hero-section.png');

    // Skills section
    const skillsSection = page.locator('section').filter({ hasText: 'Skills & Expertise' });
    await skillsSection.scrollIntoViewIfNeeded();
    await expect(skillsSection).toHaveScreenshot('react-skills-section.png');

    // Projects section
    const projectsSection = page.locator('#projects');
    await projectsSection.scrollIntoViewIfNeeded();
    await expect(projectsSection).toHaveScreenshot('react-projects-section.png');
  });

  test('React component hover effects', async ({ page }) => {
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(500);

    const projectCard = page.locator('.bg-white.rounded-lg.shadow-md').first();
    
    // Normal state
    await expect(projectCard).toHaveScreenshot('react-card-normal.png');

    // Hover state
    await projectCard.hover();
    await page.waitForTimeout(200);
    await expect(projectCard).toHaveScreenshot('react-card-hover.png');
  });
});

test.describe('Vue Integration Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/examples/vue-ecommerce/');
    await page.waitForLoadState('networkidle');
  });

  test('Vue component editing', async ({ page }) => {
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('vue-edit-mode.png', {
      fullPage: true
    });
  });

  test('Vue product grid', async ({ page }) => {
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(500);

    const productGrid = page.locator('.product-grid');
    await expect(productGrid).toHaveScreenshot('vue-product-grid.png');
  });

  test('Vue category filters', async ({ page }) => {
    const filterSection = page.locator('section').filter({ hasText: 'Featured Products' });
    
    // All products
    await expect(filterSection).toHaveScreenshot('vue-filter-all.png');

    // Click Electronics filter
    await page.getByRole('button', { name: 'Electronics' }).click();
    await page.waitForTimeout(300);
    await expect(filterSection).toHaveScreenshot('vue-filter-electronics.png');

    // Click Accessories filter
    await page.getByRole('button', { name: 'Accessories' }).click();
    await page.waitForTimeout(300);
    await expect(filterSection).toHaveScreenshot('vue-filter-accessories.png');
  });

  test('Vue product card states', async ({ page }) => {
    const productCard = page.locator('.bg-white.rounded-lg.shadow-md').first();
    
    // Normal state
    await expect(productCard).toHaveScreenshot('vue-product-normal.png');

    // Hover state
    await productCard.hover();
    await page.waitForTimeout(200);
    await expect(productCard).toHaveScreenshot('vue-product-hover.png');

    // With edit mode
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(500);
    await expect(productCard).toHaveScreenshot('vue-product-edit.png');
  });
});

test.describe('Blog Demo Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/examples/blog/');
    await page.waitForLoadState('networkidle');
  });

  test('blog layout', async ({ page }) => {
    await expect(page).toHaveScreenshot('blog-layout.png', {
      fullPage: true
    });
  });

  test('blog edit mode', async ({ page }) => {
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('blog-edit-mode.png', {
      fullPage: true
    });
  });

  test('blog hero section', async ({ page }) => {
    const heroSection = page.locator('section.bg-gradient-to-r');
    await expect(heroSection).toHaveScreenshot('blog-hero.png');

    // With edit mode
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(500);
    await expect(heroSection).toHaveScreenshot('blog-hero-edit.png');
  });

  test('blog post cards', async ({ page }) => {
    const postCard = page.locator('article.bg-white').first();
    
    await expect(postCard).toHaveScreenshot('blog-post-card.png');

    // Edit mode
    await page.keyboard.press('Control+e');
    await page.waitForTimeout(500);
    await expect(postCard).toHaveScreenshot('blog-post-card-edit.png');
  });
});

test.describe('Markdown Editor Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/examples/markdown-docs/');
    await page.waitForLoadState('networkidle');
  });

  test('markdown documentation layout', async ({ page }) => {
    await expect(page).toHaveScreenshot('markdown-docs-layout.png', {
      fullPage: true
    });
  });

  test('markdown editor panel', async ({ page }) => {
    // Show markdown editor
    await page.getByRole('button', { name: 'Show Markdown Editor' }).click();
    await page.waitForTimeout(500);

    const editorPanel = page.locator('#editor-panel');
    await expect(editorPanel).toHaveScreenshot('markdown-editor-panel.png');
  });

  test('markdown live preview', async ({ page }) => {
    await page.getByRole('button', { name: 'Show Markdown Editor' }).click();
    await page.waitForTimeout(500);

    // Type in editor
    const editor = page.locator('#markdown-editor');
    await editor.click();
    await editor.press('Control+a');
    await editor.type('# Test Heading\n\nThis is a **test** paragraph with *emphasis*.\n\n```javascript\nconst test = "code";\n```');
    
    await page.waitForTimeout(500);

    const previewPanel = page.locator('#preview-panel');
    await expect(previewPanel).toHaveScreenshot('markdown-preview.png');
  });

  test('markdown syntax highlighting', async ({ page }) => {
    const codeBlock = page.locator('pre code').first();
    await codeBlock.scrollIntoViewIfNeeded();
    await expect(codeBlock).toHaveScreenshot('markdown-syntax-highlight.png');
  });

  test('markdown sidebar navigation', async ({ page }) => {
    const sidebar = page.locator('aside');
    await expect(sidebar).toHaveScreenshot('markdown-sidebar.png');

    // Click different nav items
    await page.locator('.sidebar-link').nth(1).click();
    await page.waitForTimeout(200);
    await expect(sidebar).toHaveScreenshot('markdown-sidebar-active.png');
  });
});