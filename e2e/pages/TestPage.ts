import { Page, Locator, expect } from '@playwright/test';

export class TestPage {
  readonly page: Page;
  readonly editModeToggle: Locator;
  readonly heroTitle: Locator;
  readonly heroSubtitle: Locator;
  readonly featureTitle: Locator;
  readonly featureDesc: Locator;
  readonly navLinks: Locator;
  readonly galleryImages: Locator;
  readonly colorInput: Locator;
  readonly dateInput: Locator;
  readonly numberInput: Locator;
  readonly selectInput: Locator;
  readonly jsonEditor: Locator;
  readonly markdownEditor: Locator;

  constructor(page: Page) {
    this.page = page;
    
    // SightEdit UI elements
    this.editModeToggle = page.locator('[data-sightedit-toggle]');
    
    // Editable elements
    this.heroTitle = page.locator('[data-sight-id="hero-title"]');
    this.heroSubtitle = page.locator('[data-sight-id="hero-subtitle"]');
    this.featureTitle = page.locator('[data-sight-id="feature-1-title"]');
    this.featureDesc = page.locator('[data-sight-id="feature-1-desc"]');
    this.navLinks = page.locator('[data-sight="collection"]');
    this.galleryImages = page.locator('[data-sight="image"]');
    this.colorInput = page.locator('[data-sight-id="theme-color"]');
    this.dateInput = page.locator('[data-sight-id="launch-date"]');
    this.numberInput = page.locator('[data-sight-id="max-users"]');
    this.selectInput = page.locator('[data-sight-id="site-status"]');
    this.jsonEditor = page.locator('[data-sight-id="api-config"]');
    this.markdownEditor = page.locator('[data-sight-id="docs-content"]');
  }

  async goto() {
    await this.page.goto('/test-page.html');
    
    // Wait for SightEdit to initialize
    await this.page.waitForFunction(() => {
      return typeof window.SightEdit !== 'undefined' && window.SightEdit.isInitialized();
    });
  }

  async enableEditMode() {
    // Use keyboard shortcut to toggle edit mode
    await this.page.keyboard.press('Control+e');
    
    // Wait for edit mode to be active
    await this.page.waitForFunction(() => {
      return window.SightEdit.isEditMode();
    });
  }

  async disableEditMode() {
    await this.page.keyboard.press('Control+e');
    
    // Wait for edit mode to be disabled
    await this.page.waitForFunction(() => {
      return !window.SightEdit.isEditMode();
    });
  }

  async waitForSave() {
    // Wait for any pending saves to complete
    await this.page.waitForFunction(() => {
      return !window.SightEdit.isSaving();
    });
  }

  async editText(locator: Locator, newText: string) {
    await this.enableEditMode();
    await locator.click();
    
    // Wait for text editor to appear
    const textEditor = this.page.locator('.sightedit-text-editor');
    await expect(textEditor).toBeVisible();
    
    // Clear and type new text
    await textEditor.clear();
    await textEditor.fill(newText);
    
    // Save by pressing Enter or clicking save
    await textEditor.press('Enter');
    
    // Wait for editor to close
    await expect(textEditor).not.toBeVisible();
    await this.waitForSave();
  }

  async editRichText(locator: Locator, newText: string) {
    await this.enableEditMode();
    await locator.click();
    
    // Wait for rich text editor to appear
    const richTextEditor = this.page.locator('.sightedit-richtext-editor');
    await expect(richTextEditor).toBeVisible();
    
    // Clear and type new text
    const contentArea = richTextEditor.locator('[contenteditable]');
    await contentArea.clear();
    await contentArea.fill(newText);
    
    // Save
    const saveButton = richTextEditor.locator('[data-action="save"]');
    await saveButton.click();
    
    await expect(richTextEditor).not.toBeVisible();
    await this.waitForSave();
  }

  async editImage(locator: Locator, imageUrl: string) {
    await this.enableEditMode();
    await locator.click();
    
    // Wait for image editor modal
    const imageEditor = this.page.locator('.sightedit-image-modal');
    await expect(imageEditor).toBeVisible();
    
    // Enter new URL
    const urlInput = imageEditor.locator('input[placeholder*="URL"]');
    await urlInput.clear();
    await urlInput.fill(imageUrl);
    
    // Save
    const saveButton = imageEditor.locator('[data-action="save"]');
    await saveButton.click();
    
    await expect(imageEditor).not.toBeVisible();
    await this.waitForSave();
  }

  async editColor(locator: Locator, color: string) {
    await this.enableEditMode();
    await locator.click();
    
    // Wait for color picker
    const colorPicker = this.page.locator('.sightedit-color-picker');
    await expect(colorPicker).toBeVisible();
    
    // Enter hex value
    const hexInput = colorPicker.locator('input[type="text"]');
    await hexInput.clear();
    await hexInput.fill(color);
    
    // Save
    const saveButton = colorPicker.locator('[data-action="save"]');
    await saveButton.click();
    
    await expect(colorPicker).not.toBeVisible();
    await this.waitForSave();
  }

  async editDate(locator: Locator, date: string) {
    await this.enableEditMode();
    await locator.click();
    
    // Wait for date picker
    const datePicker = this.page.locator('.sightedit-date-picker');
    await expect(datePicker).toBeVisible();
    
    // Set date
    const dateInput = datePicker.locator('input[type="date"]');
    await dateInput.fill(date);
    
    // Save
    const saveButton = datePicker.locator('[data-action="save"]');
    await saveButton.click();
    
    await expect(datePicker).not.toBeVisible();
    await this.waitForSave();
  }

  async editNumber(locator: Locator, value: number) {
    await this.enableEditMode();
    await locator.click();
    
    // Wait for number editor
    const numberEditor = this.page.locator('.sightedit-number-editor');
    await expect(numberEditor).toBeVisible();
    
    // Set value
    const numberInput = numberEditor.locator('input[type="number"]');
    await numberInput.clear();
    await numberInput.fill(value.toString());
    
    // Save
    const saveButton = numberEditor.locator('[data-action="save"]');
    await saveButton.click();
    
    await expect(numberEditor).not.toBeVisible();
    await this.waitForSave();
  }

  async editSelect(locator: Locator, value: string) {
    await this.enableEditMode();
    await locator.click();
    
    // Wait for select editor
    const selectEditor = this.page.locator('.sightedit-select-editor');
    await expect(selectEditor).toBeVisible();
    
    // Select value
    const selectInput = selectEditor.locator('select');
    await selectInput.selectOption(value);
    
    // Save
    const saveButton = selectEditor.locator('[data-action="save"]');
    await saveButton.click();
    
    await expect(selectEditor).not.toBeVisible();
    await this.waitForSave();
  }

  async editJSON(locator: Locator, jsonString: string) {
    await this.enableEditMode();
    await locator.click();
    
    // Wait for JSON editor modal
    const jsonEditor = this.page.locator('.sightedit-json-modal');
    await expect(jsonEditor).toBeVisible();
    
    // Clear and enter new JSON
    const textArea = jsonEditor.locator('textarea');
    await textArea.clear();
    await textArea.fill(jsonString);
    
    // Save
    const saveButton = jsonEditor.locator('[data-action="save"]');
    await saveButton.click();
    
    await expect(jsonEditor).not.toBeVisible();
    await this.waitForSave();
  }

  async editMarkdown(locator: Locator, markdown: string) {
    await this.enableEditMode();
    await locator.click();
    
    // Wait for markdown editor modal
    const markdownEditor = this.page.locator('.sightedit-markdown-modal');
    await expect(markdownEditor).toBeVisible();
    
    // Clear and enter new markdown
    const textArea = markdownEditor.locator('.cm-editor');
    await textArea.clear();
    await textArea.fill(markdown);
    
    // Save
    const saveButton = markdownEditor.locator('[data-action="save"]');
    await saveButton.click();
    
    await expect(markdownEditor).not.toBeVisible();
    await this.waitForSave();
  }

  async addCollectionItem(locator: Locator, itemData: any) {
    await this.enableEditMode();
    await locator.click();
    
    // Wait for collection editor modal
    const collectionEditor = this.page.locator('.sightedit-collection-modal');
    await expect(collectionEditor).toBeVisible();
    
    // Click add item button
    const addButton = collectionEditor.locator('[data-action="add-item"]');
    await addButton.click();
    
    // Fill in the new item form
    // This would depend on the specific item template
    const itemForm = collectionEditor.locator('.collection-item-form').last();
    
    if (itemData.text) {
      await itemForm.locator('input[name="text"]').fill(itemData.text);
    }
    if (itemData.url) {
      await itemForm.locator('input[name="url"]').fill(itemData.url);
    }
    if (itemData.target) {
      await itemForm.locator('select[name="target"]').selectOption(itemData.target);
    }
    
    // Save
    const saveButton = collectionEditor.locator('[data-action="save"]');
    await saveButton.click();
    
    await expect(collectionEditor).not.toBeVisible();
    await this.waitForSave();
  }

  async resetTestData() {
    await this.page.request.post('/api/test/reset');
  }

  async expectElementText(locator: Locator, expectedText: string) {
    await expect(locator).toHaveText(expectedText);
  }

  async expectElementAttribute(locator: Locator, attribute: string, expectedValue: string) {
    await expect(locator).toHaveAttribute(attribute, expectedValue);
  }

  async expectElementValue(locator: Locator, expectedValue: string) {
    await expect(locator).toHaveValue(expectedValue);
  }
}