import { test, expect } from '@playwright/test';
import { TestPage } from '../pages/TestPage';

test.describe('SightEdit Editor Types', () => {
  let testPage: TestPage;

  test.beforeEach(async ({ page }) => {
    testPage = new TestPage(page);
    await testPage.goto();
    await testPage.resetTestData();
  });

  test.describe('Text Editor', () => {
    test('should edit text content inline', async ({ page }) => {
      const newText = 'Updated Hero Title';
      
      await testPage.editText(testPage.heroTitle, newText);
      await testPage.expectElementText(testPage.heroTitle, newText);
    });

    test('should handle empty text', async ({ page }) => {
      await testPage.editText(testPage.heroTitle, '');
      await testPage.expectElementText(testPage.heroTitle, '');
    });

    test('should handle special characters', async ({ page }) => {
      const specialText = 'Text with "quotes" & symbols <test>';
      
      await testPage.editText(testPage.heroTitle, specialText);
      await testPage.expectElementText(testPage.heroTitle, specialText);
    });

    test('should save on Enter key', async ({ page }) => {
      await testPage.enableEditMode();
      await testPage.heroTitle.click();
      
      const textEditor = page.locator('.sightedit-text-editor');
      await expect(textEditor).toBeVisible();
      
      await textEditor.fill('Enter Key Test');
      await textEditor.press('Enter');
      
      await expect(textEditor).not.toBeVisible();
      await testPage.expectElementText(testPage.heroTitle, 'Enter Key Test');
    });

    test('should cancel on Escape key', async ({ page }) => {
      const originalText = await testPage.heroTitle.textContent();
      
      await testPage.enableEditMode();
      await testPage.heroTitle.click();
      
      const textEditor = page.locator('.sightedit-text-editor');
      await textEditor.fill('Cancelled Text');
      await textEditor.press('Escape');
      
      await expect(textEditor).not.toBeVisible();
      await testPage.expectElementText(testPage.heroTitle, originalText!);
    });
  });

  test.describe('Rich Text Editor', () => {
    test('should edit rich text content', async ({ page }) => {
      const newText = 'Updated feature description with <strong>bold</strong> text';
      
      await testPage.editRichText(testPage.featureDesc, newText);
      
      // Check that rich text is preserved
      const content = await testPage.featureDesc.innerHTML();
      expect(content).toContain('<strong>bold</strong>');
    });

    test('should handle rich text formatting', async ({ page }) => {
      await testPage.enableEditMode();
      await testPage.featureDesc.click();
      
      const richTextEditor = page.locator('.sightedit-richtext-editor');
      await expect(richTextEditor).toBeVisible();
      
      // Use formatting buttons
      const boldButton = richTextEditor.locator('[data-action="bold"]');
      const italicButton = richTextEditor.locator('[data-action="italic"]');
      
      const contentArea = richTextEditor.locator('[contenteditable]');
      await contentArea.fill('Formatted text');
      
      // Select text and apply formatting
      await contentArea.selectText();
      await boldButton.click();
      await italicButton.click();
      
      const saveButton = richTextEditor.locator('[data-action="save"]');
      await saveButton.click();
      
      // Check formatting was applied
      const content = await testPage.featureDesc.innerHTML();
      expect(content).toContain('<strong>');
      expect(content).toContain('<em>');
    });
  });

  test.describe('Image Editor', () => {
    test('should edit image URL', async ({ page }) => {
      const newImageUrl = 'https://picsum.photos/300/200?random=999';
      
      await testPage.editImage(testPage.galleryImages.first(), newImageUrl);
      await testPage.expectElementAttribute(testPage.galleryImages.first(), 'src', newImageUrl);
    });

    test('should edit image alt text', async ({ page }) => {
      await testPage.enableEditMode();
      await testPage.galleryImages.first().click();
      
      const imageEditor = page.locator('.sightedit-image-modal');
      await expect(imageEditor).toBeVisible();
      
      const altInput = imageEditor.locator('input[placeholder*="Alt"]');
      await altInput.fill('New alt text');
      
      const saveButton = imageEditor.locator('[data-action="save"]');
      await saveButton.click();
      
      await testPage.expectElementAttribute(testPage.galleryImages.first(), 'alt', 'New alt text');
    });

    test('should handle image upload', async ({ page }) => {
      await testPage.enableEditMode();
      await testPage.galleryImages.first().click();
      
      const imageEditor = page.locator('.sightedit-image-modal');
      const fileInput = imageEditor.locator('input[type="file"]');
      
      // Create a test image file
      const testImage = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(0, 0, 100, 100);
        return canvas.toDataURL();
      });
      
      // Simulate file upload (this would need actual file in real test)
      await fileInput.setInputFiles({
        name: 'test-image.png',
        mimeType: 'image/png',
        buffer: Buffer.from(testImage.split(',')[1], 'base64')
      });
      
      const saveButton = imageEditor.locator('[data-action="save"]');
      await saveButton.click();
      
      // Check that image was uploaded and URL updated
      const newSrc = await testPage.galleryImages.first().getAttribute('src');
      expect(newSrc).toContain('/uploads/');
    });
  });

  test.describe('Color Editor', () => {
    test('should edit color value', async ({ page }) => {
      const newColor = '#ff5722';
      
      await testPage.editColor(testPage.colorInput, newColor);
      await testPage.expectElementValue(testPage.colorInput, newColor);
    });

    test('should use color presets', async ({ page }) => {
      await testPage.enableEditMode();
      await testPage.colorInput.click();
      
      const colorPicker = page.locator('.sightedit-color-picker');
      await expect(colorPicker).toBeVisible();
      
      // Click a preset color
      const preset = colorPicker.locator('.color-preset').first();
      await preset.click();
      
      const saveButton = colorPicker.locator('[data-action="save"]');
      await saveButton.click();
      
      // Verify color was applied
      const colorValue = await testPage.colorInput.inputValue();
      expect(colorValue).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  test.describe('Date Editor', () => {
    test('should edit date value', async ({ page }) => {
      const newDate = '2024-12-31';
      
      await testPage.editDate(testPage.dateInput, newDate);
      await testPage.expectElementValue(testPage.dateInput, newDate);
    });

    test('should handle date picker interaction', async ({ page }) => {
      await testPage.enableEditMode();
      await testPage.dateInput.click();
      
      const datePicker = page.locator('.sightedit-date-picker');
      await expect(datePicker).toBeVisible();
      
      // Navigate calendar (if calendar widget is used)
      const calendarWidget = datePicker.locator('.calendar-widget');
      if (await calendarWidget.isVisible()) {
        const dayButton = calendarWidget.locator('button').filter({ hasText: '15' }).first();
        await dayButton.click();
      }
      
      const saveButton = datePicker.locator('[data-action="save"]');
      await saveButton.click();
      
      // Verify date was selected
      const dateValue = await testPage.dateInput.inputValue();
      expect(dateValue).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  test.describe('Number Editor', () => {
    test('should edit number value', async ({ page }) => {
      const newNumber = 5000;
      
      await testPage.editNumber(testPage.numberInput, newNumber);
      await testPage.expectElementValue(testPage.numberInput, newNumber.toString());
    });

    test('should handle number validation', async ({ page }) => {
      await testPage.enableEditMode();
      await testPage.numberInput.click();
      
      const numberEditor = page.locator('.sightedit-number-editor');
      const numberInput = numberEditor.locator('input[type="number"]');
      
      // Try to enter invalid number (exceeding max)
      await numberInput.fill('15000'); // Assuming max is 10000
      
      const saveButton = numberEditor.locator('[data-action="save"]');
      await saveButton.click();
      
      // Should show validation error
      const errorMessage = numberEditor.locator('.error-message');
      await expect(errorMessage).toBeVisible();
    });

    test('should handle increment/decrement buttons', async ({ page }) => {
      await testPage.enableEditMode();
      await testPage.numberInput.click();
      
      const numberEditor = page.locator('.sightedit-number-editor');
      const incrementButton = numberEditor.locator('[data-action="increment"]');
      const decrementButton = numberEditor.locator('[data-action="decrement"]');
      
      const originalValue = await numberEditor.locator('input[type="number"]').inputValue();
      const originalNumber = parseInt(originalValue);
      
      await incrementButton.click();
      const incrementedValue = await numberEditor.locator('input[type="number"]').inputValue();
      expect(parseInt(incrementedValue)).toBe(originalNumber + 1);
      
      await decrementButton.click();
      const decrementedValue = await numberEditor.locator('input[type="number"]').inputValue();
      expect(parseInt(decrementedValue)).toBe(originalNumber);
    });
  });

  test.describe('Select Editor', () => {
    test('should edit select value', async ({ page }) => {
      const newStatus = 'maintenance';
      
      await testPage.editSelect(testPage.selectInput, newStatus);
      await testPage.expectElementValue(testPage.selectInput, newStatus);
    });

    test('should handle custom options', async ({ page }) => {
      await testPage.enableEditMode();
      await testPage.selectInput.click();
      
      const selectEditor = page.locator('.sightedit-select-editor');
      await expect(selectEditor).toBeVisible();
      
      // Add custom option if supported
      const addOptionButton = selectEditor.locator('[data-action="add-option"]');
      if (await addOptionButton.isVisible()) {
        await addOptionButton.click();
        
        const optionInput = selectEditor.locator('input[placeholder*="option"]');
        await optionInput.fill('custom-status');
        
        const confirmButton = selectEditor.locator('[data-action="confirm-add"]');
        await confirmButton.click();
      }
      
      const saveButton = selectEditor.locator('[data-action="save"]');
      await saveButton.click();
    });
  });

  test.describe('JSON Editor', () => {
    test('should edit JSON content', async ({ page }) => {
      const newJSON = JSON.stringify({
        baseUrl: 'https://api.updated.com',
        timeout: 10000,
        retries: 5
      }, null, 2);
      
      await testPage.editJSON(testPage.jsonEditor, newJSON);
      
      // Verify JSON was formatted and saved
      const content = await testPage.jsonEditor.textContent();
      expect(content).toContain('api.updated.com');
      expect(content).toContain('10000');
    });

    test('should validate JSON syntax', async ({ page }) => {
      await testPage.enableEditMode();
      await testPage.jsonEditor.click();
      
      const jsonEditor = page.locator('.sightedit-json-modal');
      const textArea = jsonEditor.locator('textarea');
      
      // Enter invalid JSON
      await textArea.fill('{ invalid json }');
      
      const saveButton = jsonEditor.locator('[data-action="save"]');
      await saveButton.click();
      
      // Should show syntax error
      const errorMessage = jsonEditor.locator('.syntax-error');
      await expect(errorMessage).toBeVisible();
      await expect(errorMessage).toContainText('Invalid JSON');
    });

    test('should format JSON automatically', async ({ page }) => {
      await testPage.enableEditMode();
      await testPage.jsonEditor.click();
      
      const jsonEditor = page.locator('.sightedit-json-modal');
      const textArea = jsonEditor.locator('textarea');
      
      // Enter minified JSON
      const minifiedJSON = '{"test":true,"value":123}';
      await textArea.fill(minifiedJSON);
      
      // Click format button
      const formatButton = jsonEditor.locator('[data-action="format"]');
      await formatButton.click();
      
      // Check that JSON was formatted
      const formattedContent = await textArea.inputValue();
      expect(formattedContent).toContain('  "test": true');
      expect(formattedContent).toContain('  "value": 123');
    });
  });
});