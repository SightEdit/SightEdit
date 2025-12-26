# Developer Tools

Visual debugging and performance monitoring for SightEdit applications.

## Features

- 🐛 **Debug Panel** - Visual debugging interface (Ctrl+Shift+D)
- 📊 **Performance Monitor** - Track operation timing and metrics
- 📝 **Event Logging** - All SightEdit events logged
- 🔍 **State Inspector** - Inspect current state
- 🌐 **Network Viewer** - Monitor API calls

## Quick Start

### Debug Panel

```typescript
import { enableDebugMode } from '@sightedit/core';

// Enable debug panel
enableDebugMode({
  position: 'bottom-right',
  defaultOpen: true
});

// Or toggle manually
// Press Ctrl+Shift+D
```

### Performance Monitoring

```typescript
import { measurePerformance, getPerformanceReport } from '@sightedit/core';

// Measure operation
await measurePerformance('saveContent', async () => {
  await api.save(data);
});

// Get report
const report = getPerformanceReport('saveContent');
console.log('Average duration:', report.averageDuration);
console.log('p95:', report.percentiles.p95);
console.log('Slowest operations:', report.slowestOperations);
```

## Debug Panel Features

### 1. Events Tab
- Real-time event logging
- Event type filtering
- Timestamp tracking
- Duration measurement
- Clear events button

### 2. Performance Tab
- Page load time
- DOM content loaded
- Memory usage
- Total events count
- Auto-refresh metrics

### 3. State Tab
- Current edit mode
- Active editors count
- Changed elements count
- Full state inspection

### 4. Network Tab
- Save operations
- Fetch requests
- Response times
- Error tracking

## Performance Monitor API

```typescript
import { performanceMonitor } from '@sightedit/core';

// Start measuring
const id = performanceMonitor.start('myOperation', {
  type: 'save',
  sight: 'product.title'
});

// End measuring
const duration = performanceMonitor.end(id);

// Get summary
const summary = performanceMonitor.getSummary();
console.log('Total operations:', summary.total);
console.log('Average:', summary.average);
console.log('p50:', summary.percentiles.p50);
console.log('p95:', summary.percentiles.p95);
console.log('p99:', summary.percentiles.p99);

// Get slow operations
const slowOps = performanceMonitor.getSlowOperations(100); // >100ms

// Export metrics
const json = performanceMonitor.exportMetrics();
localStorage.setItem('performance-metrics', json);

// Import metrics
performanceMonitor.importMetrics(json);

// Clear all
performanceMonitor.clear();
```

## Hotkeys

- **Ctrl+Shift+D** - Toggle debug panel
- Panel opens at configured position (default: bottom-right)
- Minimize/maximize with − button
- Close with × button

## Configuration

```typescript
import { DebugPanel } from '@sightedit/core';

const panel = DebugPanel.getInstance({
  position: 'bottom-right',  // or 'top-left', 'top-right', 'bottom-left'
  hotkey: 'Ctrl+Shift+D',
  defaultOpen: false,
  enableEventLog: true,
  enablePerformance: true,
  enableStateInspector: true
});

panel.open();
```

## Files

- `DebugPanel.ts` - Visual debug panel (600+ lines)
- `PerformanceMonitor.ts` - Performance tracking (400+ lines)

## Documentation

See [Core Package README](../../README.md#developer-tools) for full documentation.
