import { test, expect } from '@playwright/test';
import { TestPage } from '../pages/TestPage';

test.describe('Real-World Integration Scenarios', () => {
  let testPage: TestPage;

  test.beforeEach(async ({ page }) => {
    testPage = new TestPage(page);
    await testPage.goto();
    await testPage.resetTestData();
  });

  test.describe('CMS Integration Scenarios', () => {
    test('should handle WordPress-style content editing', async ({ page }) => {
      // Create WordPress-like structure
      await page.evaluate(() => {
        const post = document.createElement('article');
        post.className = 'wp-post';
        post.innerHTML = `
          <h1 class="wp-post-title" data-sight="text" data-sight-id="post-title">Sample Blog Post</h1>
          <div class="wp-post-meta">
            <span data-sight="date" data-sight-id="post-date">2024-01-15</span>
            <span data-sight="text" data-sight-id="post-author">John Doe</span>
          </div>
          <div class="wp-post-content" data-sight="richtext" data-sight-id="post-content">
            <p>This is the main content of the blog post.</p>
          </div>
          <div class="wp-post-tags" data-sight="collection" data-sight-id="post-tags" data-sight-template="tag">
            <span class="tag">JavaScript</span>
            <span class="tag">Web Development</span>
          </div>
          <img class="wp-featured-image" data-sight="image" data-sight-id="featured-image" src="https://picsum.photos/800/400" alt="Featured image">
        `;
        document.body.appendChild(post);
      });

      await testPage.enableEditMode();

      // Edit title
      const postTitle = page.locator('[data-sight-id="post-title"]');
      await testPage.editText(postTitle, 'Updated WordPress Post Title');

      // Edit date
      const postDate = page.locator('[data-sight-id="post-date"]');
      await testPage.editDate(postDate, '2024-02-15');

      // Edit content
      const postContent = page.locator('[data-sight-id="post-content"]');
      await testPage.editRichText(postContent, '<p>Updated blog post content with <strong>formatting</strong>.</p>');

      // Edit featured image
      const featuredImage = page.locator('[data-sight-id="featured-image"]');
      await testPage.editImage(featuredImage, 'https://picsum.photos/800/600');

      // Verify all changes
      await testPage.expectElementText(postTitle, 'Updated WordPress Post Title');
      await testPage.expectElementValue(postDate, '2024-02-15');
      await expect(postContent).toContainText('Updated blog post content');
      await testPage.expectElementAttribute(featuredImage, 'src', 'https://picsum.photos/800/600');
    });

    test('should handle Shopify-style product editing', async ({ page }) => {
      // Create e-commerce product structure
      await page.evaluate(() => {
        const product = document.createElement('div');
        product.className = 'product-card';
        product.innerHTML = `
          <div class="product-images" data-sight="collection" data-sight-id="product-images" data-sight-template="image">
            <img src="https://picsum.photos/300/300?random=1" alt="Product image 1">
            <img src="https://picsum.photos/300/300?random=2" alt="Product image 2">
          </div>
          <h2 class="product-title" data-sight="text" data-sight-id="product-title">Awesome Product</h2>
          <div class="product-price" data-sight="number" data-sight-id="product-price" data-min="0" data-step="0.01">99.99</div>
          <div class="product-description" data-sight="richtext" data-sight-id="product-description">
            <p>This is an amazing product that you'll love!</p>
          </div>
          <div class="product-specs" data-sight="json" data-sight-id="product-specs">
            {
              "dimensions": "10x5x3 inches",
              "weight": "2.5 lbs",
              "color": "Blue",
              "material": "Cotton"
            }
          </div>
          <select class="product-status" data-sight="select" data-sight-id="product-status">
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
        `;
        document.body.appendChild(product);
      });

      await testPage.enableEditMode();

      // Edit product details
      await testPage.editText(page.locator('[data-sight-id="product-title"]'), 'Super Awesome Product');
      await testPage.editNumber(page.locator('[data-sight-id="product-price"]'), 129.99);
      await testPage.editSelect(page.locator('[data-sight-id="product-status"]'), 'active');

      // Edit product specs (JSON)
      const productSpecs = page.locator('[data-sight-id="product-specs"]');
      await testPage.editJSON(productSpecs, JSON.stringify({
        dimensions: "12x6x4 inches",
        weight: "3.2 lbs",
        color: "Red",
        material: "Premium Cotton",
        warranty: "2 years"
      }, null, 2));

      // Verify e-commerce specific features
      await testPage.expectElementText(page.locator('[data-sight-id="product-title"]'), 'Super Awesome Product');
      await testPage.expectElementValue(page.locator('[data-sight-id="product-price"]'), '129.99');
      await testPage.expectElementValue(page.locator('[data-sight-id="product-status"]'), 'active');
    });

    test('should handle landing page builder scenario', async ({ page }) => {
      // Create landing page sections
      await page.evaluate(() => {
        const landingPage = document.createElement('div');
        landingPage.className = 'landing-page';
        landingPage.innerHTML = `
          <section class="hero-section">
            <h1 data-sight="text" data-sight-id="hero-headline">Transform Your Business Today</h1>
            <p data-sight="text" data-sight-id="hero-subheadline">Join thousands of satisfied customers</p>
            <button class="cta-button" data-sight="text" data-sight-id="cta-text">Get Started Now</button>
          </section>
          <section class="features-section" data-sight="collection" data-sight-id="features" data-sight-template="feature">
            <div class="feature">
              <h3>Fast</h3>
              <p>Lightning-fast performance</p>
            </div>
            <div class="feature">
              <h3>Secure</h3>
              <p>Bank-level security</p>
            </div>
            <div class="feature">
              <h3>Scalable</h3>
              <p>Grows with your business</p>
            </div>
          </section>
          <section class="testimonials">
            <div class="testimonial" data-sight="richtext" data-sight-id="testimonial-1">
              "<em>This product changed my life!</em>" - <strong>Jane Smith</strong>
            </div>
          </section>
        `;
        document.body.appendChild(landingPage);
      });

      await testPage.enableEditMode();

      // A/B test scenario - change headlines
      await testPage.editText(page.locator('[data-sight-id="hero-headline"]'), 'Revolutionize Your Workflow');
      await testPage.editText(page.locator('[data-sight-id="hero-subheadline"]'), 'Trusted by 10,000+ professionals worldwide');
      await testPage.editText(page.locator('[data-sight-id="cta-text"]'), 'Start Your Free Trial');

      // Edit testimonial
      await testPage.editRichText(
        page.locator('[data-sight-id="testimonial-1"]'),
        '"<em>Absolutely game-changing!</em>" - <strong>Michael Johnson, CEO</strong>'
      );

      // Verify marketing copy changes
      await testPage.expectElementText(page.locator('[data-sight-id="hero-headline"]'), 'Revolutionize Your Workflow');
      await testPage.expectElementText(page.locator('[data-sight-id="cta-text"]'), 'Start Your Free Trial');
    });
  });

  test.describe('Framework Integration Scenarios', () => {
    test('should handle React-like component updates', async ({ page }) => {
      // Simulate React component behavior
      await page.evaluate(() => {
        // Mock React-style state updates
        let componentState = {
          title: 'React Component',
          items: ['Item 1', 'Item 2'],
          isVisible: true
        };

        const updateComponent = (newState) => {
          componentState = { ...componentState, ...newState };
          renderComponent();
        };

        const renderComponent = () => {
          const existing = document.getElementById('react-component');
          if (existing) existing.remove();

          const component = document.createElement('div');
          component.id = 'react-component';
          component.innerHTML = `
            <h2 data-sight="text" data-sight-id="react-title">${componentState.title}</h2>
            <ul data-sight="collection" data-sight-id="react-items">
              ${componentState.items.map(item => `<li>${item}</li>`).join('')}
            </ul>
            <div style="display: ${componentState.isVisible ? 'block' : 'none'}">
              <p data-sight="text" data-sight-id="react-content">Dynamic content</p>
            </div>
          `;
          document.body.appendChild(component);
        };

        window.updateReactComponent = updateComponent;
        renderComponent();
      });

      await testPage.enableEditMode();

      // Edit the "React" component
      await testPage.editText(page.locator('[data-sight-id="react-title"]'), 'Updated React Component');

      // Simulate React state update
      await page.evaluate(() => {
        window.updateReactComponent({ 
          items: ['Updated Item 1', 'Updated Item 2', 'New Item 3'],
          isVisible: true
        });
      });

      // Should detect new elements after React re-render
      await page.waitForTimeout(100);
      
      const reactItems = page.locator('[data-sight-id="react-items"]');
      await expect(reactItems).toContainText('New Item 3');
    });

    test('should handle Vue-like reactive updates', async ({ page }) => {
      // Simulate Vue reactive system
      await page.evaluate(() => {
        let vueData = {
          message: 'Hello Vue!',
          todos: [
            { id: 1, text: 'Learn Vue', done: false },
            { id: 2, text: 'Build app', done: true }
          ]
        };

        const createVueProxy = (data) => {
          return new Proxy(data, {
            set(target, key, value) {
              target[key] = value;
              renderVueComponent();
              return true;
            }
          });
        };

        const renderVueComponent = () => {
          const existing = document.getElementById('vue-component');
          if (existing) existing.remove();

          const component = document.createElement('div');
          component.id = 'vue-component';
          component.innerHTML = `
            <h2 data-sight="text" data-sight-id="vue-message">${vueData.message}</h2>
            <div data-sight="collection" data-sight-id="vue-todos">
              ${vueData.todos.map(todo => `
                <div class="todo ${todo.done ? 'done' : ''}">
                  <span data-sight="text" data-sight-id="todo-${todo.id}">${todo.text}</span>
                </div>
              `).join('')}
            </div>
          `;
          document.body.appendChild(component);
        };

        const reactiveData = createVueProxy(vueData);
        window.vueData = reactiveData;
        renderVueComponent();
      });

      await testPage.enableEditMode();

      // Edit Vue reactive content
      await testPage.editText(page.locator('[data-sight-id="vue-message"]'), 'Hello from SightEdit!');

      // Simulate Vue reactivity
      await page.evaluate(() => {
        window.vueData.todos.push({ id: 3, text: 'Integrate SightEdit', done: false });
      });

      await page.waitForTimeout(100);

      // Should handle Vue's reactive updates
      const vueComponent = page.locator('#vue-component');
      await expect(vueComponent).toContainText('Integrate SightEdit');
    });

    test('should handle Angular-like change detection', async ({ page }) => {
      // Simulate Angular change detection
      await page.evaluate(() => {
        class AngularComponent {
          constructor() {
            this.title = 'Angular Component';
            this.users = [
              { name: 'Alice', email: 'alice@example.com' },
              { name: 'Bob', email: 'bob@example.com' }
            ];
          }

          detectChanges() {
            this.render();
          }

          render() {
            const existing = document.getElementById('angular-component');
            if (existing) existing.remove();

            const component = document.createElement('div');
            component.id = 'angular-component';
            component.innerHTML = `
              <h2 data-sight="text" data-sight-id="angular-title">${this.title}</h2>
              <div data-sight="collection" data-sight-id="angular-users">
                ${this.users.map((user, index) => `
                  <div class="user">
                    <span data-sight="text" data-sight-id="user-name-${index}">${user.name}</span>
                    <span data-sight="text" data-sight-id="user-email-${index}">${user.email}</span>
                  </div>
                `).join('')}
              </div>
            `;
            document.body.appendChild(component);
          }
        }

        const angularApp = new AngularComponent();
        angularApp.render();
        window.angularApp = angularApp;
      });

      await testPage.enableEditMode();

      // Edit Angular component content
      await testPage.editText(page.locator('[data-sight-id="angular-title"]'), 'Updated Angular Component');
      await testPage.editText(page.locator('[data-sight-id="user-name-0"]'), 'Alice Johnson');

      // Trigger Angular-style change detection
      await page.evaluate(() => {
        window.angularApp.users.push({ name: 'Charlie', email: 'charlie@example.com' });
        window.angularApp.detectChanges();
      });

      await page.waitForTimeout(100);

      // Should handle Angular's change detection cycle
      const angularComponent = page.locator('#angular-component');
      await expect(angularComponent).toContainText('Charlie');
    });
  });

  test.describe('Content Management Workflows', () => {
    test('should handle multi-step content creation workflow', async ({ page }) => {
      // Create multi-step form wizard
      await page.evaluate(() => {
        const wizard = document.createElement('div');
        wizard.className = 'content-wizard';
        wizard.innerHTML = `
          <div class="step step-1 active">
            <h3>Step 1: Basic Information</h3>
            <input type="text" data-sight="text" data-sight-id="content-title" placeholder="Content Title">
            <textarea data-sight="richtext" data-sight-id="content-summary" placeholder="Summary"></textarea>
          </div>
          <div class="step step-2">
            <h3>Step 2: Media</h3>
            <img data-sight="image" data-sight-id="hero-image" src="" alt="Hero Image">
            <div data-sight="collection" data-sight-id="gallery" data-sight-template="image">
              <img src="https://picsum.photos/200/200?random=1" alt="Gallery 1">
              <img src="https://picsum.photos/200/200?random=2" alt="Gallery 2">
            </div>
          </div>
          <div class="step step-3">
            <h3>Step 3: Configuration</h3>
            <select data-sight="select" data-sight-id="content-status">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="scheduled">Scheduled</option>
            </select>
            <input type="date" data-sight="date" data-sight-id="publish-date">
            <div data-sight="json" data-sight-id="seo-settings">{
              "title": "",
              "description": "",
              "keywords": []
            }</div>
          </div>
        `;
        document.body.appendChild(wizard);
      });

      await testPage.enableEditMode();

      // Step 1: Basic information
      await testPage.editText(page.locator('[data-sight-id="content-title"]'), 'My Amazing Article');
      await testPage.editRichText(page.locator('[data-sight-id="content-summary"]'), '<p>This article covers amazing topics.</p>');

      // Step 2: Media
      await testPage.editImage(page.locator('[data-sight-id="hero-image"]'), 'https://picsum.photos/800/400');

      // Step 3: Configuration
      await testPage.editSelect(page.locator('[data-sight-id="content-status"]'), 'published');
      await testPage.editDate(page.locator('[data-sight-id="publish-date"]'), '2024-03-01');
      
      const seoSettings = {
        title: 'My Amazing Article - SEO Title',
        description: 'An amazing article about amazing topics',
        keywords: ['amazing', 'article', 'topics']
      };
      await testPage.editJSON(page.locator('[data-sight-id="seo-settings"]'), JSON.stringify(seoSettings, null, 2));

      // Verify workflow completion
      await testPage.expectElementText(page.locator('[data-sight-id="content-title"]'), 'My Amazing Article');
      await testPage.expectElementValue(page.locator('[data-sight-id="content-status"]'), 'published');
      await testPage.expectElementAttribute(page.locator('[data-sight-id="hero-image"]'), 'src', 'https://picsum.photos/800/400');
    });

    test('should handle collaborative editing scenario', async ({ page }) => {
      // Simulate multiple users editing same content
      let collaboratorActions = [];

      await page.route('/api/sightedit/save', route => {
        const request = route.request();
        const postData = JSON.parse(request.postData() || '{}');
        
        collaboratorActions.push({
          timestamp: Date.now(),
          user: 'current-user',
          sight: postData.sight,
          value: postData.value
        });

        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            collaborators: [
              { user: 'user1', lastSeen: Date.now() - 5000 },
              { user: 'user2', lastSeen: Date.now() - 10000 }
            ]
          })
        });
      });

      await testPage.enableEditMode();

      // User 1 edits title
      await testPage.editText(testPage.heroTitle, 'Collaborative Document Title');

      // Simulate User 2 editing subtitle at the same time
      await page.evaluate(() => {
        setTimeout(() => {
          const subtitle = document.querySelector('[data-sight-id="hero-subtitle"]');
          if (subtitle) {
            subtitle.textContent = 'Updated by User 2';
          }
        }, 100);
      });

      await testPage.editText(testPage.heroSubtitle, 'Collaborative editing in progress');

      // Should handle concurrent edits gracefully
      expect(collaboratorActions.length).toBeGreaterThan(0);
      
      const titleEdit = collaboratorActions.find(action => action.sight === 'hero-title');
      const subtitleEdit = collaboratorActions.find(action => action.sight === 'hero-subtitle');
      
      expect(titleEdit).toBeTruthy();
      expect(subtitleEdit).toBeTruthy();
    });

    test('should handle content versioning scenario', async ({ page }) => {
      const versions = [];

      await page.route('/api/sightedit/save', route => {
        const request = route.request();
        const postData = JSON.parse(request.postData() || '{}');
        
        versions.push({
          id: versions.length + 1,
          timestamp: Date.now(),
          sight: postData.sight,
          value: postData.value,
          previousValue: postData.previousValue
        });

        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            versionId: versions.length,
            versions: versions.slice(-5) // Last 5 versions
          })
        });
      });

      // Make several edits to create versions
      await testPage.editText(testPage.heroTitle, 'Version 1 Title');
      await testPage.editText(testPage.heroTitle, 'Version 2 Title');
      await testPage.editText(testPage.heroTitle, 'Version 3 Title');
      await testPage.editText(testPage.heroTitle, 'Final Version Title');

      // Should have created version history
      expect(versions.length).toBeGreaterThanOrEqual(4);
      
      const latestVersion = versions[versions.length - 1];
      expect(latestVersion.value).toBe('Final Version Title');
    });
  });

  test.describe('Performance in Real-World Scenarios', () => {
    test('should handle large blog with many posts', async ({ page }) => {
      // Create a blog with 100 posts
      await page.evaluate(() => {
        const blog = document.createElement('div');
        blog.className = 'blog-container';
        
        for (let i = 1; i <= 100; i++) {
          const post = document.createElement('article');
          post.className = 'blog-post';
          post.innerHTML = `
            <h2 data-sight="text" data-sight-id="post-title-${i}">Blog Post ${i}</h2>
            <div class="post-meta">
              <span data-sight="date" data-sight-id="post-date-${i}">2024-01-${String(i % 30 + 1).padStart(2, '0')}</span>
              <span data-sight="text" data-sight-id="post-author-${i}">Author ${i % 5 + 1}</span>
            </div>
            <div data-sight="richtext" data-sight-id="post-excerpt-${i}">
              <p>This is the excerpt for blog post ${i}.</p>
            </div>
            <img data-sight="image" data-sight-id="post-image-${i}" src="https://picsum.photos/400/200?random=${i}" alt="Post ${i}">
          `;
          blog.appendChild(post);
        }
        
        document.body.appendChild(blog);
      });

      const startTime = Date.now();
      await testPage.enableEditMode();
      const enableTime = Date.now() - startTime;

      // Should enable edit mode quickly even with many elements
      expect(enableTime).toBeLessThan(1000);

      // Test editing performance
      const editStart = Date.now();
      await testPage.editText(page.locator('[data-sight-id="post-title-50"]'), 'Updated Post 50');
      const editTime = Date.now() - editStart;

      expect(editTime).toBeLessThan(500);
      await testPage.expectElementText(page.locator('[data-sight-id="post-title-50"]'), 'Updated Post 50');
    });

    test('should handle e-commerce catalog with many products', async ({ page }) => {
      // Create product catalog with 200 products
      await page.evaluate(() => {
        const catalog = document.createElement('div');
        catalog.className = 'product-catalog';
        
        for (let i = 1; i <= 200; i++) {
          const product = document.createElement('div');
          product.className = 'product-item';
          product.innerHTML = `
            <img data-sight="image" data-sight-id="product-image-${i}" src="https://picsum.photos/300/300?random=${i}" alt="Product ${i}">
            <h3 data-sight="text" data-sight-id="product-name-${i}">Product ${i}</h3>
            <div class="price" data-sight="number" data-sight-id="product-price-${i}">${(Math.random() * 100 + 10).toFixed(2)}</div>
            <div class="description" data-sight="richtext" data-sight-id="product-desc-${i}">
              <p>Description for product ${i}.</p>
            </div>
            <select data-sight="select" data-sight-id="product-category-${i}">
              <option value="electronics">Electronics</option>
              <option value="clothing">Clothing</option>
              <option value="home">Home & Garden</option>
            </select>
          `;
          catalog.appendChild(product);
        }
        
        document.body.appendChild(catalog);
      });

      const detectionStart = Date.now();
      await page.waitForFunction(() => {
        return window.SightEdit.getDetectedElements().length > 500;
      }, { timeout: 5000 });
      const detectionTime = Date.now() - detectionStart;

      // Should detect all elements within reasonable time
      expect(detectionTime).toBeLessThan(2000);

      await testPage.enableEditMode();

      // Test batch editing performance
      const batchStart = Date.now();
      
      // Edit multiple products quickly
      for (let i = 1; i <= 5; i++) {
        await testPage.editText(page.locator(`[data-sight-id="product-name-${i}"]`), `Updated Product ${i}`);
      }
      
      const batchTime = Date.now() - batchStart;
      expect(batchTime).toBeLessThan(3000);
    });
  });

  test.describe('Error Recovery Scenarios', () => {
    test('should recover from server maintenance', async ({ page }) => {
      let serverDown = false;
      
      await page.route('/api/sightedit/save', route => {
        if (serverDown) {
          route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'Service temporarily unavailable',
              retryAfter: 1000
            })
          });
        } else {
          route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ success: true })
          });
        }
      });

      // Server goes down
      serverDown = true;
      
      await testPage.editText(testPage.heroTitle, 'During server maintenance');
      
      // Should show maintenance message and queue edit
      const queueSize = await page.evaluate(() => {
        return window.SightEdit.getOfflineQueueSize();
      });
      expect(queueSize).toBeGreaterThan(0);

      // Server comes back online
      serverDown = false;
      
      // Process queued changes
      await page.evaluate(() => {
        return window.SightEdit.processOfflineQueue();
      });

      // Should complete the save
      await page.waitForFunction(() => {
        return window.SightEdit.getOfflineQueueSize() === 0;
      });

      await testPage.expectElementText(testPage.heroTitle, 'During server maintenance');
    });

    test('should handle API rate limiting with exponential backoff', async ({ page }) => {
      let requestCount = 0;
      
      await page.route('/api/sightedit/save', route => {
        requestCount++;
        
        if (requestCount <= 3) {
          route.fulfill({
            status: 429,
            contentType: 'application/json',
            headers: {
              'Retry-After': '1'
            },
            body: JSON.stringify({
              error: 'Rate limit exceeded',
              retryAfter: 1000
            })
          });
        } else {
          route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ success: true })
          });
        }
      });

      const startTime = Date.now();
      await testPage.editText(testPage.heroTitle, 'Rate limit test');
      const endTime = Date.now();

      // Should have retried with exponential backoff
      expect(requestCount).toBeGreaterThan(3);
      expect(endTime - startTime).toBeGreaterThan(1000); // Should have waited

      await testPage.expectElementText(testPage.heroTitle, 'Rate limit test');
    });
  });
});