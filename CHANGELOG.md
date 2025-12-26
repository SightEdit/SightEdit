# Changelog

All notable changes to SightEdit will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.0-alpha.1] - 2025-12-26

### 🎉 Major Release - Complete Visual Editing Ecosystem

This is a transformative release that evolves SightEdit from a basic inline editing library into a complete, world-class visual editing ecosystem.

### ✨ Added

#### New Packages

- **@sightedit/admin** (5,000+ lines)
  - Visual Builder / Admin Panel
  - Schema Configuration Builder for 12 element types
  - Theme Builder with live preview
  - Attribute Code Generator (4 formats)
  - Live Preview System with device emulation
  - Standalone and embedded modes

- **@sightedit/cms-adapters** (4,000+ lines)
  - Contentful adapter (Delivery + Management API)
  - Strapi adapter (v4 and v5 support)
  - Sanity adapter (GROQ queries, real-time)
  - WordPress adapter (REST API, custom post types)
  - Unified interface for all platforms

- **@sightedit/graphql-server** (2,000+ lines)
  - Complete GraphQL schema (13 queries, 11 mutations, 6 subscriptions)
  - Apollo Server integration
  - WebSocket subscriptions for real-time updates
  - Type-safe resolvers

- **@sightedit/server-sdk** (1,500+ lines)
  - Custom backend adapter builder
  - Fluent API for adapter creation
  - RESTAdapterHelper, ValidationHelper, ErrorHelper
  - 5 example adapters

#### Core Package Enhancements (+10,000 lines)

- **Advanced Theme System**
  - CSS-in-JS with Emotion
  - 5 preset themes (light, dark, ocean, forest, sunset)
  - Design token system (colors, typography, spacing, effects)
  - Runtime theme switching
  - Component-level overrides
  - Dark mode support
  - Auto-migration from v1 themes

- **Data Transformation Pipeline**
  - 12 built-in transforms (sanitizer, markdown, imageOptimize, etc.)
  - Computed fields with dependency tracking
  - Priority-based execution
  - Transform chaining

- **Component Override API**
  - 11 customizable components (toolbar, modal, buttons, etc.)
  - Priority-based rendering
  - Default styled renderers
  - React component wrappers

- **Extended Hook System**
  - 40+ lifecycle events across 10 categories
  - Sequential, parallel, and sync execution modes
  - Priority-based hooks
  - Once-only hooks

- **Developer Tools**
  - Debug Panel (Ctrl+Shift+D)
  - Performance Monitor
  - Event logging
  - State inspection
  - Network request viewer

#### React Package Enhancements (+500 lines)

- Component override wrappers for all 11 component types
- Enhanced hooks with full v2 feature access
- Type-safe integration

#### Documentation

- Complete installation guide (INSTALLATION.md)
- Migration guide v1→v2 (MIGRATION.md)
- Release notes (RELEASE_NOTES.md)
- Implementation summary (FINAL_SUMMARY.md)
- Completion report (V2_COMPLETION_REPORT.md)
- Package-specific READMEs for all new packages

### 🔧 Changed

- **package.json**: Updated to v2.0.0-alpha.1, added new scripts
- **lerna.json**: Updated version and configuration
- **README.md**: Complete rewrite highlighting v2.0 features

### 📊 Statistics

- New Packages: 4
- Enhanced Packages: 2
- Total Files Created: 50+
- Total Lines of Code: 25,000+
- TypeScript Interfaces: 120+
- React Components: 25+
- GraphQL Types: 30+

### 🔄 Backward Compatibility

- 100% backward compatible with v1.x
- Auto-migration for old theme configs
- Legacy data attributes supported with deprecation warnings
- All v1.x APIs continue to work

### 🐛 Known Issues (Alpha)

- Admin panel Backend Config tab is placeholder
- GraphQL server uses in-memory storage only
- WordPress schema updates require plugins
- Large schemas (>100 fields) may be slow in admin panel
- Debug panel event log limited to 1000 events

### 📚 Documentation

All packages now have comprehensive documentation:
- Installation guides
- API references
- Usage examples
- Migration guides

---

## [1.0.0] - 2024-XX-XX

### Initial Release

- Basic inline editing for 12 element types
- React and Vue integrations
- Node.js and PHP server implementations
- Simple theme configuration
- Basic hook system (4 events)
- Plugin system (image crop, markdown)

---

## Upcoming Releases

### [2.0.0-beta.1] - Q1 2026 (Planned)

- Community feedback integration
- Bug fixes from alpha testing
- Unit test suite (80%+ coverage)
- Additional CMS adapters (Prismic, Directus)
- Database storage for GraphQL server
- Performance optimizations

### [2.0.0-beta.2] - Q2 2026 (Planned)

- Integration tests
- E2E test suite
- Documentation improvements
- Video tutorials
- Storybook integration

### [2.0.0] - Q3 2026 (Planned)

- Production testing complete
- Security audit
- Performance benchmarks
- Stable release

---

## Release Types

- **Major** (X.0.0): Breaking changes, major new features
- **Minor** (x.X.0): New features, backward compatible
- **Patch** (x.x.X): Bug fixes, backward compatible
- **Alpha** (x.x.x-alpha.x): Early testing, unstable
- **Beta** (x.x.x-beta.x): Feature complete, testing phase
- **RC** (x.x.x-rc.x): Release candidate, final testing

---

## How to Upgrade

See [MIGRATION.md](./MIGRATION.md) for detailed upgrade instructions.

### From v1.x to v2.0

```bash
# Update packages
npm update @sightedit/core @sightedit/react @sightedit/vue

# Install new packages (optional)
npm install @sightedit/admin @sightedit/cms-adapters

# Test your application
npm run dev
```

---

## Links

- [Documentation](./README.md)
- [Installation Guide](./INSTALLATION.md)
- [Migration Guide](./MIGRATION.md)
- [Release Notes](./RELEASE_NOTES.md)
- [Contributing](./CONTRIBUTING.md)

---

[2.0.0-alpha.1]: https://github.com/sightedit/sightedit/releases/tag/v2.0.0-alpha.1
[1.0.0]: https://github.com/sightedit/sightedit/releases/tag/v1.0.0
