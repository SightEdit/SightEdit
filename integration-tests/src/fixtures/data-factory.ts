import { faker } from '@faker-js/faker';

export interface TestUser {
  id?: number;
  email: string;
  password?: string;
  passwordHash?: string;
  role: 'admin' | 'editor' | 'user';
  createdAt?: Date;
}

export interface TestContent {
  id?: number;
  sight: string;
  value: any;
  context: {
    url: string;
    selector: string;
    elementType: string;
    timestamp: number;
    metadata?: Record<string, any>;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TestSession {
  id: string;
  userId: number;
  expiresAt: Date;
  data: Record<string, any>;
}

export interface TestCollaborationEvent {
  id: string;
  userId: number;
  sight: string;
  action: 'edit' | 'save' | 'lock' | 'unlock';
  data: any;
  timestamp: number;
}

/**
 * Factory for generating test data
 */
export class DataFactory {
  
  /**
   * Generate a test user
   */
  static createUser(overrides: Partial<TestUser> = {}): TestUser {
    return {
      email: faker.internet.email(),
      password: 'Test123!@#',
      passwordHash: '$2b$10$example.hash.for.testing.purposes.only',
      role: faker.helpers.arrayElement(['admin', 'editor', 'user']),
      createdAt: faker.date.recent(),
      ...overrides
    };
  }

  /**
   * Generate multiple test users
   */
  static createUsers(count: number, overrides: Partial<TestUser> = {}): TestUser[] {
    return Array.from({ length: count }, () => this.createUser(overrides));
  }

  /**
   * Generate test content
   */
  static createContent(overrides: Partial<TestContent> = {}): TestContent {
    const elementType = faker.helpers.arrayElement([
      'text', 'richtext', 'image', 'link', 'date', 'number', 'select', 'color', 'json'
    ]);

    const value = this.generateValueForType(elementType);
    
    return {
      sight: faker.string.alphanumeric(12),
      value,
      context: {
        url: faker.internet.url(),
        selector: `[data-sight="${faker.string.alphanumeric(12)}"]`,
        elementType,
        timestamp: Date.now(),
        metadata: {
          userAgent: faker.internet.userAgent(),
          viewport: {
            width: faker.number.int({ min: 320, max: 1920 }),
            height: faker.number.int({ min: 240, max: 1080 })
          }
        }
      },
      createdAt: faker.date.recent(),
      updatedAt: faker.date.recent(),
      ...overrides
    };
  }

  /**
   * Generate multiple test content items
   */
  static createContentItems(count: number, overrides: Partial<TestContent> = {}): TestContent[] {
    return Array.from({ length: count }, () => this.createContent(overrides));
  }

  /**
   * Generate test session
   */
  static createSession(overrides: Partial<TestSession> = {}): TestSession {
    return {
      id: faker.string.uuid(),
      userId: faker.number.int({ min: 1, max: 1000 }),
      expiresAt: faker.date.future(),
      data: {
        loginTime: Date.now(),
        lastActivity: Date.now(),
        ipAddress: faker.internet.ip(),
        userAgent: faker.internet.userAgent()
      },
      ...overrides
    };
  }

  /**
   * Generate collaboration event
   */
  static createCollaborationEvent(overrides: Partial<TestCollaborationEvent> = {}): TestCollaborationEvent {
    const action = faker.helpers.arrayElement(['edit', 'save', 'lock', 'unlock']);
    
    return {
      id: faker.string.uuid(),
      userId: faker.number.int({ min: 1, max: 1000 }),
      sight: faker.string.alphanumeric(12),
      action,
      data: this.generateCollaborationData(action),
      timestamp: Date.now(),
      ...overrides
    };
  }

  /**
   * Generate value based on element type
   */
  private static generateValueForType(elementType: string): any {
    switch (elementType) {
      case 'text':
        return faker.lorem.sentence();
      
      case 'richtext':
        return `<p>${faker.lorem.paragraph()}</p><ul><li>${faker.lorem.sentence()}</li></ul>`;
      
      case 'image':
        return {
          src: faker.image.url(),
          alt: faker.lorem.words(3),
          width: faker.number.int({ min: 100, max: 800 }),
          height: faker.number.int({ min: 100, max: 600 })
        };
      
      case 'link':
        return {
          href: faker.internet.url(),
          text: faker.lorem.words(2),
          target: faker.helpers.arrayElement(['_self', '_blank'])
        };
      
      case 'date':
        return faker.date.future().toISOString();
      
      case 'number':
        return faker.number.float({ min: 0, max: 1000, precision: 2 });
      
      case 'select':
        return faker.helpers.arrayElement(['option1', 'option2', 'option3']);
      
      case 'color':
        return faker.internet.color();
      
      case 'json':
        return {
          title: faker.lorem.words(3),
          description: faker.lorem.sentence(),
          tags: faker.lorem.words(5).split(' '),
          settings: {
            enabled: faker.datatype.boolean(),
            priority: faker.number.int({ min: 1, max: 10 })
          }
        };
      
      default:
        return faker.lorem.sentence();
    }
  }

  /**
   * Generate collaboration-specific data
   */
  private static generateCollaborationData(action: string): any {
    switch (action) {
      case 'edit':
        return {
          oldValue: faker.lorem.sentence(),
          newValue: faker.lorem.sentence(),
          cursor: faker.number.int({ min: 0, max: 100 })
        };
      
      case 'save':
        return {
          value: faker.lorem.sentence(),
          success: true
        };
      
      case 'lock':
      case 'unlock':
        return {
          lockId: faker.string.uuid(),
          expires: Date.now() + (5 * 60 * 1000) // 5 minutes
        };
      
      default:
        return {};
    }
  }

  /**
   * Generate batch of related test data for a complete scenario
   */
  static createScenario(name: string) {
    const scenarios = {
      'user-registration-workflow': () => ({
        users: [
          this.createUser({ email: 'test-admin@example.com', role: 'admin' }),
          this.createUser({ email: 'test-editor@example.com', role: 'editor' }),
          this.createUser({ email: 'test-user@example.com', role: 'user' })
        ],
        content: this.createContentItems(10)
      }),

      'content-editing-session': () => {
        const sight = faker.string.alphanumeric(12);
        return {
          user: this.createUser({ role: 'editor' }),
          content: this.createContent({ sight }),
          collaborationEvents: Array.from({ length: 5 }, () => 
            this.createCollaborationEvent({ sight })
          )
        };
      },

      'multi-user-collaboration': () => {
        const sight = faker.string.alphanumeric(12);
        const users = this.createUsers(3, { role: 'editor' });
        
        return {
          users,
          content: this.createContent({ sight }),
          collaborationEvents: users.flatMap(user => 
            Array.from({ length: 3 }, () => 
              this.createCollaborationEvent({ 
                sight, 
                userId: user.id || faker.number.int({ min: 1, max: 1000 })
              })
            )
          )
        };
      },

      'security-test-data': () => ({
        maliciousInputs: [
          '<script>alert("xss")</script>',
          '"; DROP TABLE users; --',
          '../../../etc/passwd',
          '<img src=x onerror=alert(1)>',
          'javascript:alert("xss")',
          '{{7*7}}',
          '${7*7}',
          '<iframe src="javascript:alert(1)"></iframe>'
        ],
        validInputs: [
          'Normal text content',
          'Text with <em>safe HTML</em>',
          'Unicode content: 你好世界 🌍',
          'Email: user@example.com',
          'URL: https://example.com/path?param=value'
        ]
      }),

      'performance-test-data': () => ({
        largeContent: this.createContent({
          value: faker.lorem.paragraphs(100),
          context: {
            ...this.createContent().context,
            metadata: {
              fileSize: faker.number.int({ min: 1024, max: 1024 * 1024 }),
              processingTime: faker.number.int({ min: 100, max: 5000 })
            }
          }
        }),
        bulkContent: this.createContentItems(1000)
      })
    };

    const scenario = scenarios[name as keyof typeof scenarios];
    return scenario ? scenario() : null;
  }
}