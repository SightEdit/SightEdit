import { test, expect } from '@playwright/test';
import { TestPage } from '../pages/TestPage';

test.describe('Collection Editor', () => {
  let testPage: TestPage;

  test.beforeEach(async ({ page }) => {
    testPage = new TestPage(page);
    await testPage.goto();
    await testPage.resetTestData();
  });

  test('should open collection editor modal', async ({ page }) => {
    await testPage.enableEditMode();
    await testPage.navLinks.click();
    
    const collectionModal = page.locator('.sightedit-collection-modal');
    await expect(collectionModal).toBeVisible();
    
    // Check modal title
    const modalTitle = collectionModal.locator('.modal-title');
    await expect(modalTitle).toContainText('Edit Collection');
  });

  test('should display existing collection items', async ({ page }) => {
    await testPage.enableEditMode();
    await testPage.navLinks.click();
    
    const collectionModal = page.locator('.sightedit-collection-modal');
    await expect(collectionModal).toBeVisible();
    
    // Check that existing items are shown
    const items = collectionModal.locator('.collection-item');
    const itemCount = await items.count();
    expect(itemCount).toBe(3); // Home, Features, Docs
    
    // Check item contents
    await expect(items.nth(0)).toContainText('Home');
    await expect(items.nth(1)).toContainText('Features');
    await expect(items.nth(2)).toContainText('Docs');
  });

  test('should add new collection item', async ({ page }) => {
    await testPage.addCollectionItem(testPage.navLinks, {
      text: 'About',
      url: '/about',
      target: '_self'
    });
    
    // Verify item was added to the page
    const navItems = await testPage.navLinks.locator('a').count();
    expect(navItems).toBe(4);
    
    // Check the new item exists
    const aboutLink = testPage.navLinks.locator('a').filter({ hasText: 'About' });
    await expect(aboutLink).toBeVisible();
    await expect(aboutLink).toHaveAttribute('href', '/about');
    await expect(aboutLink).toHaveAttribute('target', '_self');
  });

  test('should edit existing collection item', async ({ page }) => {
    await testPage.enableEditMode();
    await testPage.navLinks.click();
    
    const collectionModal = page.locator('.sightedit-collection-modal');
    
    // Click edit button on first item
    const firstItem = collectionModal.locator('.collection-item').first();
    const editButton = firstItem.locator('[data-action="edit"]');
    await editButton.click();
    
    // Edit the item
    const itemForm = firstItem.locator('.item-edit-form');
    await expect(itemForm).toBeVisible();
    
    const textInput = itemForm.locator('input[name="text"]');
    const urlInput = itemForm.locator('input[name="url"]');
    
    await textInput.clear();
    await textInput.fill('Homepage');
    await urlInput.clear();
    await urlInput.fill('/home');
    
    // Save item
    const saveItemButton = itemForm.locator('[data-action="save-item"]');
    await saveItemButton.click();
    
    // Save collection
    const saveButton = collectionModal.locator('[data-action="save"]');
    await saveButton.click();
    
    // Verify changes
    const homeLink = testPage.navLinks.locator('a').first();
    await expect(homeLink).toHaveText('Homepage');
    await expect(homeLink).toHaveAttribute('href', '/home');
  });

  test('should delete collection item', async ({ page }) => {
    await testPage.enableEditMode();
    await testPage.navLinks.click();
    
    const collectionModal = page.locator('.sightedit-collection-modal');
    
    // Delete the second item (Features)
    const secondItem = collectionModal.locator('.collection-item').nth(1);
    const deleteButton = secondItem.locator('[data-action="delete"]');
    
    await deleteButton.click();
    
    // Confirm deletion if confirmation dialog appears
    const confirmButton = page.locator('[data-action="confirm-delete"]');
    if (await confirmButton.isVisible()) {
      await confirmButton.click();
    }
    
    // Check item is removed from modal
    const items = collectionModal.locator('.collection-item');
    const itemCount = await items.count();
    expect(itemCount).toBe(2);
    
    // Save collection
    const saveButton = collectionModal.locator('[data-action="save"]');
    await saveButton.click();
    
    // Verify item was removed from page
    const navItems = await testPage.navLinks.locator('a').count();
    expect(navItems).toBe(2);
    
    // Verify Features link is gone
    const featuresLink = testPage.navLinks.locator('a').filter({ hasText: 'Features' });
    await expect(featuresLink).not.toBeVisible();
  });

  test('should reorder collection items', async ({ page }) => {
    await testPage.enableEditMode();
    await testPage.navLinks.click();
    
    const collectionModal = page.locator('.sightedit-collection-modal');
    
    // Get initial order
    const items = collectionModal.locator('.collection-item');
    const firstItemText = await items.nth(0).locator('.item-text').textContent();
    const secondItemText = await items.nth(1).locator('.item-text').textContent();
    
    // Move second item up
    const secondItem = items.nth(1);
    const moveUpButton = secondItem.locator('[data-action="move-up"]');
    await moveUpButton.click();
    
    // Check order changed in modal
    const reorderedFirstText = await items.nth(0).locator('.item-text').textContent();
    const reorderedSecondText = await items.nth(1).locator('.item-text').textContent();
    
    expect(reorderedFirstText).toBe(secondItemText);
    expect(reorderedSecondText).toBe(firstItemText);
    
    // Save collection
    const saveButton = collectionModal.locator('[data-action="save"]');
    await saveButton.click();
    
    // Verify order changed on page
    const navLinks = testPage.navLinks.locator('a');
    const pageFirstText = await navLinks.nth(0).textContent();
    const pageSecondText = await navLinks.nth(1).textContent();
    
    expect(pageFirstText).toBe(secondItemText);
    expect(pageSecondText).toBe(firstItemText);
  });

  test('should handle drag and drop reordering', async ({ page }) => {
    await testPage.enableEditMode();
    await testPage.navLinks.click();
    
    const collectionModal = page.locator('.sightedit-collection-modal');
    
    // Get items for drag and drop
    const firstItem = collectionModal.locator('.collection-item').nth(0);
    const thirdItem = collectionModal.locator('.collection-item').nth(2);
    
    // Get initial text
    const firstItemText = await firstItem.locator('.item-text').textContent();
    const thirdItemText = await thirdItem.locator('.item-text').textContent();
    
    // Drag first item to third position
    await firstItem.dragTo(thirdItem);
    
    // Check new order
    const items = collectionModal.locator('.collection-item');
    const newThirdText = await items.nth(2).locator('.item-text').textContent();
    
    expect(newThirdText).toBe(firstItemText);
    
    // Save changes
    const saveButton = collectionModal.locator('[data-action="save"]');
    await saveButton.click();
    
    // Verify on page
    const navLinks = testPage.navLinks.locator('a');
    const pageThirdText = await navLinks.nth(2).textContent();
    expect(pageThirdText).toBe(firstItemText);
  });

  test('should validate collection item data', async ({ page }) => {
    await testPage.enableEditMode();
    await testPage.navLinks.click();
    
    const collectionModal = page.locator('.sightedit-collection-modal');
    
    // Try to add item with missing required fields
    const addButton = collectionModal.locator('[data-action="add-item"]');
    await addButton.click();
    
    const newItem = collectionModal.locator('.collection-item').last();
    const itemForm = newItem.locator('.item-edit-form');
    
    // Leave text empty but fill URL
    const urlInput = itemForm.locator('input[name="url"]');
    await urlInput.fill('/test');
    
    // Try to save item
    const saveItemButton = itemForm.locator('[data-action="save-item"]');
    await saveItemButton.click();
    
    // Should show validation error
    const errorMessage = itemForm.locator('.validation-error');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText('Text is required');
  });

  test('should handle empty collection', async ({ page }) => {
    // First, delete all items
    await testPage.enableEditMode();
    await testPage.navLinks.click();
    
    const collectionModal = page.locator('.sightedit-collection-modal');
    
    // Delete all items
    const items = collectionModal.locator('.collection-item');
    const itemCount = await items.count();
    
    for (let i = 0; i < itemCount; i++) {
      const deleteButton = items.first().locator('[data-action="delete"]');
      await deleteButton.click();
      
      // Confirm if needed
      const confirmButton = page.locator('[data-action="confirm-delete"]');
      if (await confirmButton.isVisible()) {
        await confirmButton.click();
      }
    }
    
    // Check empty state
    const emptyMessage = collectionModal.locator('.empty-collection-message');
    await expect(emptyMessage).toBeVisible();
    await expect(emptyMessage).toContainText('No items in collection');
    
    // Save empty collection
    const saveButton = collectionModal.locator('[data-action="save"]');
    await saveButton.click();
    
    // Verify collection is empty on page
    const navItems = await testPage.navLinks.locator('a').count();
    expect(navItems).toBe(0);
  });

  test('should handle collection with different item templates', async ({ page }) => {
    // Test with a different collection type (if multiple templates exist)
    // This would depend on having different collection types in the test page
    
    // Add a product collection to the test page
    await page.evaluate(() => {
      const productSection = document.createElement('section');
      productSection.innerHTML = `
        <div class="products" data-sight="collection" data-sight-id="products" data-sight-template="product">
          <div class="product">
            <h3>Product 1</h3>
            <p>$99.99</p>
          </div>
          <div class="product">
            <h3>Product 2</h3>
            <p>$149.99</p>
          </div>
        </div>
      `;
      document.body.appendChild(productSection);
    });
    
    // Wait for SightEdit to detect the new collection
    await page.waitForTimeout(100);
    
    await testPage.enableEditMode();
    
    const productCollection = page.locator('[data-sight-id="products"]');
    await productCollection.click();
    
    const collectionModal = page.locator('.sightedit-collection-modal');
    await expect(collectionModal).toBeVisible();
    
    // Should show product-specific fields
    const items = collectionModal.locator('.collection-item');
    const firstItem = items.first();
    
    await firstItem.locator('[data-action="edit"]').click();
    
    const itemForm = firstItem.locator('.item-edit-form');
    
    // Should have product-specific fields
    const nameInput = itemForm.locator('input[name="name"]');
    const priceInput = itemForm.locator('input[name="price"]');
    
    await expect(nameInput).toBeVisible();
    await expect(priceInput).toBeVisible();
  });

  test('should handle collection nesting and complex data structures', async ({ page }) => {
    // Test nested collections or complex item structures
    await testPage.enableEditMode();
    await testPage.navLinks.click();
    
    const collectionModal = page.locator('.sightedit-collection-modal');
    
    // Add item with nested data
    const addButton = collectionModal.locator('[data-action="add-item"]');
    await addButton.click();
    
    const newItem = collectionModal.locator('.collection-item').last();
    const itemForm = newItem.locator('.item-edit-form');
    
    // Fill in complex data if the editor supports it
    const textInput = itemForm.locator('input[name="text"]');
    const urlInput = itemForm.locator('input[name="url"]');
    const targetSelect = itemForm.locator('select[name="target"]');
    
    await textInput.fill('Complex Link');
    await urlInput.fill('https://external.com/path?param=value');
    await targetSelect.selectOption('_blank');
    
    // Add additional attributes if supported
    const addAttributeButton = itemForm.locator('[data-action="add-attribute"]');
    if (await addAttributeButton.isVisible()) {
      await addAttributeButton.click();
      
      const attrNameInput = itemForm.locator('input[name="attr-name"]');
      const attrValueInput = itemForm.locator('input[name="attr-value"]');
      
      await attrNameInput.fill('data-analytics');
      await attrValueInput.fill('nav-link-complex');
    }
    
    // Save item and collection
    const saveItemButton = itemForm.locator('[data-action="save-item"]');
    await saveItemButton.click();
    
    const saveButton = collectionModal.locator('[data-action="save"]');
    await saveButton.click();
    
    // Verify complex data was saved
    const complexLink = testPage.navLinks.locator('a').filter({ hasText: 'Complex Link' });
    await expect(complexLink).toBeVisible();
    await expect(complexLink).toHaveAttribute('href', 'https://external.com/path?param=value');
    await expect(complexLink).toHaveAttribute('target', '_blank');
  });
});