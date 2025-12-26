# Contributing to SightEdit

Thank you for your interest in contributing to SightEdit! We welcome contributions from the community and are grateful for any help you can provide.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please be respectful and welcoming to all contributors.

## How to Contribute

### Reporting Issues

1. Check if the issue already exists in our [issue tracker](https://github.com/sightedit/sightedit/issues)
2. If not, create a new issue with:
   - Clear, descriptive title
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, browser, SightEdit version)
   - Screenshots or code examples if applicable

### Suggesting Features

1. Check existing [feature requests](https://github.com/sightedit/sightedit/issues?q=is%3Aissue+label%3Aenhancement)
2. Open a new issue with the "enhancement" label
3. Describe the feature and its use case
4. Explain why it would benefit SightEdit users

### Contributing Code

#### Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/sightedit/sightedit.git
   cd sightedit
   ```
3. Install dependencies:
   ```bash
   npm install
   npm run bootstrap
   ```
4. Create a branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

#### Development

1. Make your changes
2. Write/update tests
3. Update documentation if needed
4. Run tests:
   ```bash
   npm test
   ```
5. Run linter:
   ```bash
   npm run lint
   ```
6. Build packages:
   ```bash
   npm run build
   ```

#### Commit Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, semicolons, etc)
- `refactor:` Code refactoring
- `test:` Test additions or corrections
- `chore:` Maintenance tasks

Examples:
```
feat: add markdown editor support
fix: resolve image upload issue in Safari
docs: update API reference for batch operations
```

#### Pull Request Process

1. Push your branch to your fork
2. Open a Pull Request against `main`
3. Fill out the PR template
4. Ensure all checks pass
5. Wait for review

### Code Style

- TypeScript for all new code
- Follow existing code style
- Use meaningful variable names
- Add comments for complex logic
- Keep functions small and focused

### Testing

- Write unit tests for new features
- Update tests when changing existing code
- Aim for high test coverage
- Test in multiple browsers

### Documentation

- Update README if needed
- Add JSDoc comments to public APIs
- Update docs/ for user-facing changes
- Include examples for new features

## Project Structure (v2.0)

```
sightedit/
├── packages/
│   ├── core/              # Core library + theme + hooks + transforms
│   ├── react/             # React integration + component overrides
│   ├── vue/               # Vue 3 integration
│   ├── admin/             # Visual Builder / Admin Panel (NEW in v2.0)
│   ├── cms-adapters/      # CMS integrations (NEW in v2.0)
│   ├── graphql-server/    # GraphQL API (NEW in v2.0)
│   ├── server-sdk/        # Custom backend SDK (NEW in v2.0)
│   ├── server/node/       # Node.js server (legacy)
│   ├── server/php/        # PHP server (legacy)
│   └── plugin-*/          # Plugins
├── examples/              # Example implementations
├── docs/                  # Documentation
├── e2e/                   # End-to-end tests
└── website/               # Documentation website
```

## Development Workflow

### 1. Core Package (Enhanced in v2.0)

```bash
cd packages/core
npm run dev
```

**Features to work on:**
- Inline editing (12 element types)
- Theme system (CSS-in-JS)
- Hook system (40+ events)
- Transform pipeline
- Component overrides
- Developer tools

### 2. Visual Builder (NEW in v2.0)

```bash
cd packages/admin
npm install
npm run dev
# Opens at http://localhost:5173
```

**Features to work on:**
- Schema Configuration Builder
- Theme Builder
- Attribute Generator
- Live Preview

### 3. GraphQL Server (NEW in v2.0)

```bash
cd packages/graphql-server
npm install
npm start
# HTTP: http://localhost:4000/graphql
# WS: ws://localhost:4000/graphql
```

**Features to work on:**
- GraphQL schema
- Resolvers
- Subscriptions
- Storage adapters

### 4. CMS Adapters (NEW in v2.0)

```bash
cd packages/cms-adapters
npm run build
```

**Adapters:**
- Contentful
- Strapi
- Sanity
- WordPress

### 5. Run Everything

```bash
# Run all packages in parallel
npm run dev:all
```

### 6. Testing

```bash
npm test            # All tests
npm run test:unit   # Unit tests only
npm run test:e2e    # E2E tests only
npm run typecheck   # TypeScript checks
npm run lint        # Linting
npm run build:all   # Build all packages
```

## Getting Help

- Join our [Discord server](https://discord.gg/sightedit)
- Check the [documentation](https://sightedit.com/docs)
- Ask questions in [GitHub Discussions](https://github.com/sightedit/sightedit/discussions)

## Recognition

Contributors will be:
- Listed in our README
- Mentioned in release notes
- Given credit in commit messages

Thank you for helping make SightEdit better!