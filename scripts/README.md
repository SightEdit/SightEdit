# SightEdit Release Scripts

This directory contains scripts for managing SightEdit releases and versions.

## Scripts

### release.js
Interactive release script for creating production releases.

```bash
npm run release
# or
node scripts/release.js
```

Features:
- Interactive version selection
- Automatic testing and building
- Changelog generation
- NPM publishing via Lerna
- GitHub release creation
- Git tagging and pushing
- Dry run support

### dev-release.js
Script for creating development and pre-release versions.

```bash
# Canary release (automatic versioning)
npm run release:canary
# or
node scripts/dev-release.js canary

# Alpha release
npm run release:alpha

# Beta release
npm run release:beta

# RC release
node scripts/dev-release.js rc

# Dev release (branch-based)
node scripts/dev-release.js dev

# Experimental release
node scripts/dev-release.js experimental
```

Version formats:
- Canary: `1.0.0-canary.2024-01-01T12-00-00.abc123`
- Alpha/Beta/RC: `1.0.0-alpha.0`, `1.0.0-beta.1`, `1.0.0-rc.2`
- Dev: `1.0.0-dev.feature-branch.abc123`
- Experimental: `1.0.0-experimental.abc123`

### version-check.js
Utility for checking version status across packages.

```bash
# Basic version check
npm run version:check

# Show all published versions
node scripts/version-check.js --all

# Check CDN availability
node scripts/version-check.js --cdn
```

## Release Process

### Production Release
1. Ensure you're on the main branch
2. Run `npm run release`
3. Choose version type (patch/minor/major)
4. Confirm release details
5. Script will:
   - Run tests
   - Build all packages
   - Update versions
   - Generate changelog
   - Publish to NPM
   - Create GitHub release
   - Deploy to CDN

### Pre-release (Alpha/Beta/RC)
1. Run `npm run release:alpha` (or beta/rc)
2. Script will auto-increment the pre-release number
3. Publishes with `next` tag on NPM

### Canary Release
- Automatically triggered on every push to main
- Can be manually run with `npm run release:canary`
- Published with `canary` tag on NPM
- Includes timestamp and commit hash in version

## NPM Tags

- `latest`: Production releases
- `next`: Pre-releases (alpha, beta, rc)
- `canary`: Automatic builds from main
- `dev`: Development builds
- `experimental`: Experimental features

## Environment Variables

For CI/CD:
- `NPM_TOKEN`: NPM authentication token
- `GITHUB_TOKEN`: GitHub authentication token
- `AWS_ACCESS_KEY_ID`: AWS credentials for CDN
- `AWS_SECRET_ACCESS_KEY`: AWS credentials for CDN
- `CLOUDFRONT_DISTRIBUTION_ID`: CloudFront distribution ID
- `DISCORD_WEBHOOK`: Discord webhook for notifications

## Version Management

### Sync versions across packages
```bash
npm run version:sync
```

### Check for version inconsistencies
```bash
npm run version:check
```

## Troubleshooting

### Failed publish
1. Check NPM authentication: `npm whoami`
2. Ensure you have publish permissions
3. Check for version conflicts

### Git issues
1. Ensure working directory is clean
2. Check you're on the correct branch
3. Verify you have push permissions

### Build failures
1. Run `npm run clean` and `npm install`
2. Check for TypeScript errors: `npm run build`
3. Ensure all tests pass: `npm test`