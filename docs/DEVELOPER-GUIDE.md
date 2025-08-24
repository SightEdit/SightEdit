# SightEdit Developer Guide

This guide covers the internal architecture, development patterns, and extending SightEdit with custom editors and plugins.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Core Components](#core-components)
- [Development Setup](#development-setup)
- [Creating Custom Editors](#creating-custom-editors)
- [Plugin Development](#plugin-development)
- [Testing Strategy](#testing-strategy)
- [Performance Considerations](#performance-considerations)
- [Security Guidelines](#security-guidelines)
- [Contributing](#contributing)

## Architecture Overview

SightEdit follows a modular architecture with clear separation of concerns:

```
┌─────────────────┐
│   Client Side   │
├─────────────────┤
│ SightEditCore   │ ← Main orchestrator
│ ElementDetector │ ← Scans DOM for editables
│ Editor System   │ ← Manages individual editors
│ API Layer       │ ← Handles backend communication
│ UI Components   │ ← Visual interface elements
└─────────────────┘
         ↕
┌─────────────────┐
│   Server Side   │
├─────────────────┤
│ Request Handler │ ← Processes API requests
│ Storage Layer   │ ← Manages data persistence
│ Security Layer  │ ← Validates and sanitizes
│ Cache Layer     │ ← Performance optimization
└─────────────────┘
```

### Design Patterns

- **Singleton Pattern**: One SightEdit instance per page
- **Factory Pattern**: Editor creation based on element types
- **Observer Pattern**: Event-driven communication
- **Strategy Pattern**: Pluggable storage and validation
- **Command Pattern**: Undo/redo functionality

## Core Components

### SightEditCore (`src/index.ts`)

The main orchestrator class that manages the entire editing system:

```typescript
class SightEditCore extends EventEmitter {
    private static instance: SightEditCore | null = null;
    private config: SightEditConfig;
    private detector: ElementDetector;
    private api: SightEditAPI;
    private editors: Map<string, Editor>;
    private isEditMode: boolean = false;

    static init(config: SightEditConfig): SightEditCore {
        if (!SightEditCore.instance) {
            SightEditCore.instance = new SightEditCore(config);
        }
        return SightEditCore.instance;
    }

    async enterEditMode(): Promise<void> {
        this.isEditMode = true;
        await this.detector.scanForElements();
        this.emit('editModeEntered');
    }

    async exitEditMode(): Promise<void> {
        this.isEditMode = false;
        await this.saveAllPendingChanges();
        this.emit('editModeExited');
    }
}
```

Key responsibilities:
- Managing edit mode state
- Coordinating between components
- Handling global keyboard shortcuts
- Managing plugin lifecycle

### ElementDetector (`src/detector.ts`)

Scans the DOM for editable elements and creates appropriate editors:

```typescript
class ElementDetector {
    private observer: MutationObserver;
    private sightEdit: SightEditCore;

    constructor(sightEdit: SightEditCore) {
        this.sightEdit = sightEdit;
        this.setupMutationObserver();
    }

    async scanForElements(): Promise<void> {
        const elements = document.querySelectorAll('[data-sight]');
        
        for (const element of elements) {
            await this.processElement(element as HTMLElement);
        }
    }

    private async processElement(element: HTMLElement): Promise<void> {
        const sight = element.dataset.sight;
        const type = this.detectElementType(element);
        const context = this.extractElementContext(element);
        
        const editor = await this.sightEdit.createEditor(element, type);
        editor.setContext(context);
    }

    private detectElementType(element: HTMLElement): ElementType {
        // Auto-detect based on element type and content
        if (element.tagName === 'IMG') return 'image';
        if (element.contentEditable === 'true') return 'richtext';
        if (element.dataset.type) return element.dataset.type as ElementType;
        return 'text';
    }
}
```

### Editor System (`src/editors/`)

Base class for all editors with common functionality:

```typescript
abstract class BaseEditor extends EventEmitter {
    protected element: HTMLElement;
    protected sight: string;
    protected value: any;
    protected originalValue: any;
    protected isDirty: boolean = false;

    constructor(element: HTMLElement, sight: string) {
        super();
        this.element = element;
        this.sight = sight;
        this.originalValue = this.extractValue();
        this.value = this.originalValue;
    }

    // Abstract methods that must be implemented
    abstract getType(): ElementType;
    abstract render(): void;
    abstract extractValue(): any;
    abstract applyValue(value: any): void;

    // Common functionality
    validate(value?: any): boolean | string | ValidationResult {
        // Basic validation logic
        return true;
    }

    async save(): Promise<void> {
        const validation = this.validate();
        if (validation !== true) {
            throw new Error('Validation failed');
        }

        await this.sightEdit.save({
            sight: this.sight,
            value: this.value,
            type: this.getType(),
            previous: this.originalValue
        });

        this.originalValue = this.value;
        this.isDirty = false;
        this.emit('saved', this.value);
    }
}
```

### API Layer (`src/api.ts`)

Handles all backend communication with resilience patterns:

```typescript
class SightEditAPI {
    private config: SightEditConfig;
    private offlineQueue: SaveData[] = [];
    private retryManager: RetryManager;

    async save(data: SaveData): Promise<void> {
        try {
            await this.makeRequest('/save', 'POST', data);
        } catch (error) {
            if (this.isOffline(error)) {
                this.queueForLater(data);
            } else {
                throw error;
            }
        }
    }

    async batch(operations: BatchOperation[]): Promise<void> {
        return this.makeRequest('/batch', 'POST', { operations });
    }

    private async makeRequest(endpoint: string, method: string, data?: any): Promise<any> {
        return this.retryManager.execute(async () => {
            const response = await fetch(`${this.config.endpoint}${endpoint}`, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': this.config.apiKey ? `Bearer ${this.config.apiKey}` : ''
                },
                body: data ? JSON.stringify(data) : undefined
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return response.json();
        });
    }
}
```

## Development Setup

### Prerequisites

```bash
# Required tools
node -v    # >= 16.0.0
npm -v     # >= 8.0.0
git --version

# Optional but recommended
docker --version
```

### Initial Setup

```bash
# Clone repository
git clone https://github.com/sightedit/sightedit.git
cd sightedit

# Install dependencies for all packages
npm install

# Bootstrap monorepo with Lerna
npm run bootstrap

# Build all packages
npm run build

# Start development mode (watch mode)
npm run dev
```

### Development Workflow

```bash
# Make changes to core package
cd packages/core
npm run dev  # Watch mode

# Test changes in examples
cd ../../examples/vanilla-html
python -m http.server 8000  # Simple server
# Open http://localhost:8000

# Run tests
npm run test

# Lint code
npm run lint
```

### Data Attribute Format

SightEdit now supports a cleaner, more concise data attribute format:

```html
<!-- Simple format -->
<div data-sightedit="text">Editable text</div>

<!-- With ID -->
<div data-sightedit="text#hero-title">Hero Title</div>

<!-- With properties (short syntax) -->
<div data-sightedit="text#title[required,maxLength:100,placeholder:'Enter title']">
  Title
</div>

<!-- JSON format for complex configurations -->
<div data-sightedit='{"type":"richtext","id":"content","toolbar":["bold","italic","link"],"maxLength":500}'>
  Rich content
</div>
```

The parser (`src/parser.ts`) handles multiple formats:
- Simple: `"text"`
- With ID: `"text#id"`
- With properties: `"text#id[prop1,prop2:value]"`
- JSON: Full configuration object

Legacy `data-sight` attributes are still supported for backward compatibility.

## Creating Custom Editors

### Basic Editor Structure

```typescript
import { BaseEditor, ElementType, ValidationResult } from '@sightedit/core';

export class CustomEditor extends BaseEditor {
    private inputElement: HTMLInputElement;

    getType(): ElementType {
        return 'custom';
    }

    render(): void {
        // Create editing interface
        this.inputElement = document.createElement('input');
        this.inputElement.type = 'text';
        this.inputElement.value = this.value;
        
        // Handle changes
        this.inputElement.addEventListener('input', () => {
            this.setValue(this.inputElement.value);
        });

        // Replace original element during edit mode
        this.element.style.display = 'none';
        this.element.parentNode?.insertBefore(this.inputElement, this.element);
    }

    extractValue(): string {
        return this.element.textContent || '';
    }

    applyValue(value: string): void {
        this.element.textContent = value;
        this.value = value;
    }

    validate(value?: string): ValidationResult {
        const val = value ?? this.value;
        
        if (!val || val.trim().length === 0) {
            return {
                isValid: false,
                errors: ['Value is required']
            };
        }

        if (val.length > 100) {
            return {
                isValid: false,
                errors: ['Value must be 100 characters or less']
            };
        }

        return {
            isValid: true,
            errors: []
        };
    }

    destroy(): void {
        if (this.inputElement) {
            this.inputElement.remove();
        }
        this.element.style.display = '';
        super.destroy();
    }
}

// Register the editor
SightEdit.registerEditor('custom', CustomEditor);
```

### Advanced Editor Features

```typescript
export class AdvancedEditor extends BaseEditor {
    private modal: HTMLElement;
    private toolbar: HTMLElement;

    getType(): ElementType {
        return 'advanced';
    }

    render(): void {
        // Create modal interface
        this.createModal();
        this.createToolbar();
        this.setupKeyboardShortcuts();
        this.setupAutoSave();
    }

    private createModal(): void {
        this.modal = document.createElement('div');
        this.modal.className = 'sightedit-modal';
        this.modal.innerHTML = `
            <div class="sightedit-modal-backdrop">
                <div class="sightedit-modal-content">
                    <div class="sightedit-modal-header">
                        <h3>Edit Content</h3>
                        <button class="sightedit-modal-close">&times;</button>
                    </div>
                    <div class="sightedit-modal-body">
                        <textarea class="sightedit-editor-textarea"></textarea>
                    </div>
                    <div class="sightedit-modal-footer">
                        <button class="sightedit-btn sightedit-btn-primary">Save</button>
                        <button class="sightedit-btn sightedit-btn-secondary">Cancel</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.modal);
        this.setupModalEvents();
    }

    private setupAutoSave(): void {
        let saveTimer: NodeJS.Timeout;
        
        this.on('change', () => {
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                this.save().catch(console.error);
            }, 1000);
        });
    }

    private setupKeyboardShortcuts(): void {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.save();
            }
            
            if (e.key === 'Escape') {
                this.cancel();
            }
        });
    }
}
```

## Plugin Development

### Plugin Structure

```typescript
interface SightEditPlugin {
    name: string;
    version: string;
    init(sightEdit: SightEditCore): void;
    destroy?(): void;
}

export class MarkdownPlugin implements SightEditPlugin {
    name = 'markdown';
    version = '1.0.0';

    init(sightEdit: SightEditCore): void {
        // Register markdown editor
        sightEdit.registerEditor('markdown', MarkdownEditor);
        
        // Add toolbar buttons
        sightEdit.addToolbarButton({
            id: 'markdown-preview',
            text: 'Preview',
            icon: '👁️',
            onClick: this.togglePreview.bind(this)
        });

        // Listen to events
        sightEdit.on('editModeEntered', this.onEditModeEntered.bind(this));
    }

    private togglePreview(): void {
        // Toggle markdown preview
    }

    private onEditModeEntered(): void {
        // Initialize markdown-specific features
    }
}

// Usage
SightEdit.use(new MarkdownPlugin());
```

### Plugin API

```typescript
class PluginManager {
    private plugins: Map<string, SightEditPlugin> = new Map();

    register(plugin: SightEditPlugin): void {
        this.plugins.set(plugin.name, plugin);
        plugin.init(this.sightEdit);
    }

    unregister(name: string): void {
        const plugin = this.plugins.get(name);
        if (plugin) {
            plugin.destroy?.();
            this.plugins.delete(name);
        }
    }

    getPlugin(name: string): SightEditPlugin | undefined {
        return this.plugins.get(name);
    }
}
```

## Testing Strategy

### Unit Tests

```typescript
// src/__tests__/editor.test.ts
import { TextEditor } from '../editors/text';

describe('TextEditor', () => {
    let element: HTMLElement;
    let editor: TextEditor;

    beforeEach(() => {
        element = document.createElement('div');
        element.textContent = 'Test content';
        editor = new TextEditor(element, 'test-sight');
    });

    test('should extract text content', () => {
        expect(editor.extractValue()).toBe('Test content');
    });

    test('should apply new value', () => {
        editor.applyValue('New content');
        expect(element.textContent).toBe('New content');
    });

    test('should validate required fields', () => {
        const result = editor.validate('');
        expect(result).toBe(false);
    });
});
```

### Integration Tests

```typescript
// src/__tests__/integration.test.ts
import SightEdit from '../index';

describe('SightEdit Integration', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div data-sight="text">Test content</div>
            <img data-sight="image" src="test.jpg" alt="Test">
        `;
    });

    test('should initialize and detect elements', async () => {
        const sightEdit = SightEdit.init({
            endpoint: '/test-api'
        });

        await sightEdit.enterEditMode();
        
        const editors = sightEdit.getActiveEditors();
        expect(editors).toHaveLength(2);
    });

    test('should save changes', async () => {
        const mockFetch = jest.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ success: true })
        });
        global.fetch = mockFetch;

        const sightEdit = SightEdit.init({
            endpoint: '/test-api'
        });

        await sightEdit.save({
            sight: 'test',
            value: 'New value',
            type: 'text'
        });

        expect(mockFetch).toHaveBeenCalledWith('/test-api/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': ''
            },
            body: JSON.stringify({
                sight: 'test',
                value: 'New value',
                type: 'text'
            })
        });
    });
});
```

### E2E Tests

```typescript
// e2e/editing.spec.ts
import { test, expect } from '@playwright/test';

test('should enable edit mode and edit content', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Enter edit mode
    await page.keyboard.press('Control+e');

    // Wait for edit mode to activate
    await expect(page.locator('[data-sight="title"]')).toBeVisible();

    // Click to edit title
    await page.click('[data-sight="title"]');

    // Type new content
    await page.fill('input', 'New Title');

    // Save changes
    await page.keyboard.press('Enter');

    // Verify content was updated
    await expect(page.locator('[data-sight="title"]')).toHaveText('New Title');
});
```

## Performance Considerations

### Bundle Optimization

```typescript
// Dynamic imports for large editors
class EditorFactory {
    static async createEditor(type: ElementType): Promise<Editor> {
        switch (type) {
            case 'richtext':
                const { RichTextEditor } = await import('./editors/richtext');
                return new RichTextEditor();
                
            case 'code':
                const { CodeEditor } = await import('./editors/code');
                return new CodeEditor();
                
            default:
                const { TextEditor } = await import('./editors/text');
                return new TextEditor();
        }
    }
}
```

### Memory Management

```typescript
class EditorManager {
    private editors: Map<string, Editor> = new Map();
    private observer: IntersectionObserver;

    constructor() {
        // Clean up editors that are no longer visible
        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) {
                    const sight = entry.target.getAttribute('data-sight');
                    if (sight) {
                        this.destroyEditor(sight);
                    }
                }
            });
        });
    }

    createEditor(element: HTMLElement, type: ElementType): Editor {
        const sight = element.dataset.sight!;
        
        // Clean up existing editor
        if (this.editors.has(sight)) {
            this.destroyEditor(sight);
        }

        const editor = EditorFactory.createEditor(type);
        this.editors.set(sight, editor);
        
        // Track for cleanup
        this.observer.observe(element);
        
        return editor;
    }

    destroyEditor(sight: string): void {
        const editor = this.editors.get(sight);
        if (editor) {
            editor.destroy();
            this.editors.delete(sight);
        }
    }
}
```

## Security Guidelines

### Input Sanitization

```typescript
import DOMPurify from 'isomorphic-dompurify';

class SecurityManager {
    sanitizeHTML(html: string): string {
        return DOMPurify.sanitize(html, {
            ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a'],
            ALLOWED_ATTR: ['href', 'target'],
            FORBID_SCRIPT: true,
            FORBID_TAGS: ['script', 'object', 'embed', 'form']
        });
    }

    validateInput(input: any, schema: ValidationSchema): ValidationResult {
        // Implement comprehensive validation
        if (typeof input === 'string' && input.length > schema.maxLength) {
            return {
                isValid: false,
                errors: [`Input exceeds maximum length of ${schema.maxLength}`]
            };
        }

        // Check for malicious patterns
        const maliciousPatterns = [
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            /javascript:/gi,
            /on\w+=/gi
        ];

        for (const pattern of maliciousPatterns) {
            if (pattern.test(input)) {
                return {
                    isValid: false,
                    errors: ['Potentially malicious content detected']
                };
            }
        }

        return { isValid: true, errors: [] };
    }
}
```

### CSRF Protection

```typescript
class CSRFManager {
    private token: string | null = null;

    async getToken(): Promise<string> {
        if (!this.token) {
            this.token = await this.fetchCSRFToken();
        }
        return this.token;
    }

    private async fetchCSRFToken(): Promise<string> {
        const response = await fetch('/api/csrf-token');
        const data = await response.json();
        return data.token;
    }

    async makeSecureRequest(url: string, options: RequestInit = {}): Promise<Response> {
        const token = await this.getToken();
        
        return fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                'X-CSRF-Token': token
            }
        });
    }
}
```

## Contributing

### Code Style

```typescript
// Use TypeScript strict mode
// tsconfig.json
{
    "compilerOptions": {
        "strict": true,
        "noImplicitAny": true,
        "noImplicitReturns": true,
        "noUnusedLocals": true,
        "noUnusedParameters": true
    }
}

// Naming conventions
class MyClass {}           // PascalCase for classes
const MY_CONSTANT = 1;     // UPPER_SNAKE_CASE for constants
let myVariable = 1;        // camelCase for variables
function myFunction() {}   // camelCase for functions

// Use explicit return types
function processData(input: string): ProcessedData {
    // Implementation
}
```

### Pull Request Guidelines

1. Create feature branch from `main`
2. Make changes with tests
3. Run full test suite
4. Update documentation
5. Submit pull request

### Commit Messages

```
type(scope): description

feat(editor): add markdown support
fix(api): handle network errors properly
docs(readme): update installation guide
test(editor): add validation tests
refactor(core): simplify event handling
```

This developer guide provides comprehensive information for contributing to and extending SightEdit.