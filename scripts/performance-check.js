#!/usr/bin/env node

/**
 * Performance Budget Check Script
 * Analyzes bundle sizes, performance metrics, and generates reports
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const gzipSize = require('gzip-size');
const chalk = require('chalk');

// Performance budgets (in bytes)
const PERFORMANCE_BUDGETS = {
  // Core library budgets
  'packages/core/dist/sightedit.min.js': {
    size: 150000,    // 150KB max
    gzipSize: 50000  // 50KB max gzipped
  },
  
  // React adapter budgets
  'packages/react/dist/index.js': {
    size: 100000,    // 100KB max
    gzipSize: 30000  // 30KB max gzipped
  },
  
  // Vue adapter budgets
  'packages/vue/dist/index.js': {
    size: 100000,    // 100KB max
    gzipSize: 30000  // 30KB max gzipped
  },
  
  // Plugin budgets
  'packages/plugin-markdown/dist/index.js': {
    size: 80000,     // 80KB max
    gzipSize: 25000  // 25KB max gzipped
  },
  
  'packages/plugin-image-crop/dist/index.js': {
    size: 120000,    // 120KB max
    gzipSize: 40000  // 40KB max gzipped
  }
};

// Performance thresholds
const PERFORMANCE_THRESHOLDS = {
  firstContentfulPaint: 1500,      // 1.5s
  largestContentfulPaint: 2500,    // 2.5s
  firstInputDelay: 100,            // 100ms
  cumulativeLayoutShift: 0.1,      // 0.1
  timeToInteractive: 3500,         // 3.5s
  speedIndex: 2000                 // 2s
};

class PerformanceChecker {
  constructor() {
    this.results = {
      budgets: {
        passed: [],
        warnings: [],
        failures: []
      },
      lighthouse: null,
      webVitals: null,
      summary: {
        passed: 0,
        warnings: 0,
        failures: 0
      }
    };
  }

  /**
   * Check bundle size budgets
   */
  async checkBundleSizes() {
    console.log(chalk.blue('\n📦 Checking bundle size budgets...\n'));

    for (const [filePath, budget] of Object.entries(PERFORMANCE_BUDGETS)) {
      const fullPath = path.resolve(process.cwd(), filePath);
      
      if (!fs.existsSync(fullPath)) {
        console.log(chalk.yellow(`⚠️  File not found: ${filePath}`));
        this.results.budgets.warnings.push({
          file: filePath,
          message: `File not found: ${filePath}`,
          type: 'missing-file'
        });
        continue;
      }

      const stats = fs.statSync(fullPath);
      const actualSize = stats.size;
      const actualGzipSize = await gzipSize.file(fullPath);

      // Check size budget
      const sizeStatus = actualSize <= budget.size;
      const gzipStatus = actualGzipSize <= budget.gzipSize;

      const result = {
        file: filePath,
        actualSize,
        budgetSize: budget.size,
        actualGzipSize,
        budgetGzipSize: budget.gzipSize,
        sizeStatus,
        gzipStatus,
        sizeDiff: actualSize - budget.size,
        gzipDiff: actualGzipSize - budget.gzipSize
      };

      if (sizeStatus && gzipStatus) {
        this.results.budgets.passed.push({
          ...result,
          message: `✅ ${filePath}: ${this.formatSize(actualSize)} (${this.formatSize(actualGzipSize)} gzipped)`
        });
        console.log(chalk.green(`✅ ${filePath}`));
        console.log(`   Size: ${this.formatSize(actualSize)} / ${this.formatSize(budget.size)} (${this.formatPercentage(actualSize / budget.size)})`);
        console.log(`   Gzipped: ${this.formatSize(actualGzipSize)} / ${this.formatSize(budget.gzipSize)} (${this.formatPercentage(actualGzipSize / budget.gzipSize)})`);
      } else {
        const isFailure = actualSize > budget.size * 1.1 || actualGzipSize > budget.gzipSize * 1.1;
        
        if (isFailure) {
          this.results.budgets.failures.push({
            ...result,
            message: `❌ ${filePath}: Size budget exceeded significantly`
          });
          console.log(chalk.red(`❌ ${filePath} - BUDGET EXCEEDED`));
        } else {
          this.results.budgets.warnings.push({
            ...result,
            message: `⚠️  ${filePath}: Size budget exceeded (warning threshold)`
          });
          console.log(chalk.yellow(`⚠️  ${filePath} - Budget warning`));
        }
        
        if (!sizeStatus) {
          console.log(`   Size: ${this.formatSize(actualSize)} / ${this.formatSize(budget.size)} (+${this.formatSize(result.sizeDiff)})`);
        }
        if (!gzipStatus) {
          console.log(`   Gzipped: ${this.formatSize(actualGzipSize)} / ${this.formatSize(budget.gzipSize)} (+${this.formatSize(result.gzipDiff)})`);
        }
      }
      console.log('');
    }
  }

  /**
   * Run Lighthouse performance audit
   */
  async runLighthouseAudit() {
    console.log(chalk.blue('\n🚦 Running Lighthouse performance audit...\n'));

    try {
      // Check if lighthouse is available
      execSync('lighthouse --version', { stdio: 'ignore' });
    } catch (error) {
      console.log(chalk.yellow('⚠️  Lighthouse not found, skipping audit'));
      return;
    }

    try {
      // Run lighthouse on local build
      const lighthouseResult = execSync(
        'lighthouse --output=json --output-path=lighthouse-report.json --chrome-flags="--headless" --only-categories=performance http://localhost:8080',
        { encoding: 'utf8', timeout: 60000 }
      );

      if (fs.existsSync('lighthouse-report.json')) {
        const report = JSON.parse(fs.readFileSync('lighthouse-report.json', 'utf8'));
        this.results.lighthouse = this.parseLighthouseReport(report);
        
        console.log(chalk.green('✅ Lighthouse audit completed'));
        this.displayLighthouseResults();
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Lighthouse audit failed: ${error.message}`));
    }
  }

  /**
   * Parse Lighthouse report
   */
  parseLighthouseReport(report) {
    const audits = report.lhr.audits;
    const categories = report.lhr.categories;

    return {
      score: Math.round(categories.performance.score * 100),
      metrics: {
        firstContentfulPaint: audits['first-contentful-paint'].numericValue,
        largestContentfulPaint: audits['largest-contentful-paint'].numericValue,
        firstInputDelay: audits['max-potential-fid'].numericValue,
        cumulativeLayoutShift: audits['cumulative-layout-shift'].numericValue,
        timeToInteractive: audits.interactive.numericValue,
        speedIndex: audits['speed-index'].numericValue
      },
      opportunities: audits['opportunities'] || [],
      diagnostics: audits['diagnostics'] || []
    };
  }

  /**
   * Display Lighthouse results
   */
  displayLighthouseResults() {
    const { lighthouse } = this.results;
    
    console.log(`\n📊 Performance Score: ${lighthouse.score}/100`);
    console.log('\n📈 Core Web Vitals:');
    
    Object.entries(lighthouse.metrics).forEach(([metric, value]) => {
      const threshold = PERFORMANCE_THRESHOLDS[metric];
      if (threshold) {
        const status = value <= threshold;
        const icon = status ? '✅' : '❌';
        const color = status ? chalk.green : chalk.red;
        console.log(color(`${icon} ${this.formatMetricName(metric)}: ${this.formatMetricValue(metric, value)} (threshold: ${this.formatMetricValue(metric, threshold)})`));
        
        if (status) {
          this.results.budgets.passed.push({
            metric,
            value,
            threshold,
            message: `${metric}: ${this.formatMetricValue(metric, value)}`
          });
        } else {
          this.results.budgets.failures.push({
            metric,
            value,
            threshold,
            message: `${metric}: ${this.formatMetricValue(metric, value)} exceeds threshold`
          });
        }
      }
    });
  }

  /**
   * Analyze bundle composition
   */
  async analyzeBundleComposition() {
    console.log(chalk.blue('\n🔍 Analyzing bundle composition...\n'));

    try {
      // Use webpack-bundle-analyzer if available
      const analyzerPath = path.resolve(process.cwd(), 'node_modules/.bin/webpack-bundle-analyzer');
      
      if (fs.existsSync(analyzerPath)) {
        // Generate bundle analysis
        execSync(
          'npx webpack-bundle-analyzer packages/core/dist/sightedit.min.js --mode static --report bundle-analysis.html --no-open',
          { stdio: 'inherit' }
        );
        
        console.log(chalk.green('✅ Bundle analysis generated: bundle-analysis.html'));
      } else {
        console.log(chalk.yellow('⚠️  webpack-bundle-analyzer not found, skipping detailed analysis'));
      }

      // Basic dependency analysis
      await this.analyzeDependencies();
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Bundle analysis failed: ${error.message}`));
    }
  }

  /**
   * Analyze dependencies impact on bundle size
   */
  async analyzeDependencies() {
    try {
      const packageJsonPath = path.resolve(process.cwd(), 'packages/core/package.json');
      
      if (!fs.existsSync(packageJsonPath)) {
        return;
      }

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const dependencies = { ...packageJson.dependencies, ...packageJson.peerDependencies };

      console.log('📋 Dependencies impact analysis:');
      
      // Analyze each dependency (simplified)
      Object.keys(dependencies).forEach(dep => {
        console.log(`   • ${dep}: ${dependencies[dep]}`);
      });

    } catch (error) {
      console.log(chalk.yellow(`⚠️  Dependency analysis failed: ${error.message}`));
    }
  }

  /**
   * Generate performance report
   */
  generateReport() {
    console.log(chalk.blue('\n📋 Generating performance report...\n'));

    // Calculate summary
    this.results.summary.passed = this.results.budgets.passed.length;
    this.results.summary.warnings = this.results.budgets.warnings.length;
    this.results.summary.failures = this.results.budgets.failures.length;

    // Generate JSON report
    const report = {
      timestamp: new Date().toISOString(),
      summary: this.results.summary,
      budgets: this.results.budgets,
      lighthouse: this.results.lighthouse,
      violations: this.results.budgets.failures.map(f => f.message),
      warnings: this.results.budgets.warnings.map(w => w.message),
      passes: this.results.budgets.passed.map(p => p.message)
    };

    fs.writeFileSync('performance-report.json', JSON.stringify(report, null, 2));
    console.log(chalk.green('✅ Performance report saved: performance-report.json'));

    // Display summary
    this.displaySummary();

    // Exit with appropriate code
    const hasFailures = this.results.summary.failures > 0;
    if (hasFailures) {
      console.log(chalk.red('\n❌ Performance budget check failed!'));
      process.exit(1);
    } else {
      console.log(chalk.green('\n✅ All performance budgets passed!'));
      process.exit(0);
    }
  }

  /**
   * Display summary
   */
  displaySummary() {
    const { summary } = this.results;
    
    console.log('\n📊 Performance Budget Summary:');
    console.log(chalk.green(`✅ Passed: ${summary.passed}`));
    console.log(chalk.yellow(`⚠️  Warnings: ${summary.warnings}`));
    console.log(chalk.red(`❌ Failures: ${summary.failures}`));
    
    const total = summary.passed + summary.warnings + summary.failures;
    const successRate = total > 0 ? ((summary.passed / total) * 100).toFixed(1) : 0;
    console.log(`\n📈 Success Rate: ${successRate}%`);
  }

  /**
   * Utility methods
   */
  formatSize(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  formatPercentage(ratio) {
    return `${Math.round(ratio * 100)}%`;
  }

  formatMetricName(metric) {
    return metric.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  }

  formatMetricValue(metric, value) {
    if (metric.includes('Paint') || metric.includes('Interactive') || metric === 'speedIndex') {
      return `${Math.round(value)}ms`;
    }
    if (metric === 'firstInputDelay') {
      return `${Math.round(value)}ms`;
    }
    if (metric === 'cumulativeLayoutShift') {
      return value.toFixed(3);
    }
    return value.toString();
  }

  /**
   * Run all performance checks
   */
  async run() {
    console.log(chalk.bold.blue('🚀 Starting Performance Budget Check\n'));
    
    try {
      await this.checkBundleSizes();
      await this.runLighthouseAudit();
      await this.analyzeBundleComposition();
      this.generateReport();
    } catch (error) {
      console.error(chalk.red(`❌ Performance check failed: ${error.message}`));
      process.exit(1);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const checker = new PerformanceChecker();
  checker.run().catch(console.error);
}

module.exports = PerformanceChecker;