# Visual Regression Testing

Comprehensive visual regression tests for SightEdit using Playwright.

## Setup

```bash
cd e2e/visual-regression
npm install
npx playwright install --with-deps
```

## Running Tests

### Run all visual regression tests
```bash
npm test
```

### Update baseline screenshots
```bash
npm run test:update
```

### Run tests in specific browser
```bash
npm run test:chrome
npm run test:firefox
npm run test:webkit
```

### Run mobile tests
```bash
npm run test:mobile
```

### Debug tests
```bash
npm run test:debug
npm run test:ui
```

### View test report
```bash
npm run test:report
```

## Test Categories

### 1. Core Elements (`core-elements.spec.ts`)
- Text editor appearance
- Richtext editor appearance  
- Image editor appearance
- Edit mode visual indicators
- Hover states
- Focus states
- Loading states
- Error states

### 2. Framework Integration (`framework-integration.spec.ts`)
- React component editing
- Vue component editing
- Blog demo visuals
- Markdown editor visuals
- Framework-specific interactions

### 3. Accessibility (`accessibility.spec.ts`)
- Focus indicators
- High contrast mode
- Reduced motion
- Keyboard navigation
- Screen reader announcements
- Color contrast
- Focus trapping
- WCAG compliance

### 4. Cross-Browser (`cross-browser.spec.ts`)
- Chrome rendering
- Firefox rendering
- Safari rendering
- Edge rendering
- Mobile browsers (iOS Safari, Chrome)
- Tablet browsers
- Feature support testing

## Responsive Testing

Tests run across multiple viewport sizes:
- Mobile: 375×667
- Tablet: 768×1024  
- Desktop: 1920×1080

## Visual Regression Strategy

### Baseline Management
- Baseline screenshots stored in `tests/*.spec.ts-snapshots/`
- Platform-specific baselines for OS differences
- Browser-specific baselines for rendering differences

### Comparison Settings
- `maxDiffPixels`: 100 - Maximum pixel difference allowed
- `threshold`: 0.2 - Percentage threshold for pixel comparison
- `animations`: 'disabled' - Disables animations for consistent screenshots

### Update Process
1. Review failed tests to identify intentional changes
2. Run `npm run test:update` to update baselines
3. Commit updated baselines with clear message
4. Review changes in pull request

## CI/CD Integration

### GitHub Actions Workflow
```yaml
- name: Run visual regression tests
  run: |
    cd e2e/visual-regression
    npm install
    npx playwright install --with-deps
    npm test
    
- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: visual-regression-results
    path: |
      e2e/visual-regression/test-results/
      e2e/visual-regression/playwright-report/
```

### Handling Failures
1. Download artifacts from CI
2. Review visual differences
3. Update baselines locally if changes are intentional
4. Push updated baselines

## Best Practices

### Screenshot Stability
- Wait for network idle before screenshots
- Use explicit waits for animations
- Disable animations when possible
- Use consistent viewport sizes

### Test Organization
- Group related visual tests
- Use descriptive test names
- Add comments for complex scenarios
- Keep tests focused and isolated

### Performance
- Run tests in parallel when possible
- Use selective test runs for development
- Cache browser installations
- Optimize image sizes

## Troubleshooting

### Flaky Screenshots
- Add explicit waits: `await page.waitForTimeout(500)`
- Wait for specific elements: `await element.waitFor()`
- Check for animations: Set `animations: 'disabled'`
- Verify network stability: `await page.waitForLoadState('networkidle')`

### Platform Differences
- Use platform-specific baselines
- Run tests in Docker for consistency
- Document expected differences
- Use tolerance thresholds appropriately

### Large Diffs
- Check viewport size consistency
- Verify font loading
- Check for dynamic content
- Review browser version changes

## Debugging

### Local Debugging
```bash
# Run with headed browser
npm run test:headed

# Run with Playwright UI
npm run test:ui

# Debug specific test
npx playwright test core-elements.spec.ts --debug
```

### Screenshot Comparison
- Use Playwright's HTML report
- Compare images side-by-side
- Check diff highlights
- Review actual vs expected

## Maintenance

### Regular Tasks
- Update Playwright version quarterly
- Review and clean old baselines
- Update browser versions
- Monitor test execution time

### Baseline Rotation
- Archive old baselines before major updates
- Document visual changes in changelog
- Tag baseline versions in git
- Maintain baseline history

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Visual Testing Best Practices](https://playwright.dev/docs/test-snapshots)
- [Accessibility Testing](https://playwright.dev/docs/accessibility-testing)
- [CI/CD Integration](https://playwright.dev/docs/ci)