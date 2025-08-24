#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const exec = (command, options = {}) => {
  console.log(`> ${command}`);
  try {
    return execSync(command, { stdio: 'inherit', ...options });
  } catch (error) {
    console.error(`Failed to execute: ${command}`);
    process.exit(1);
  }
};

const getCommitHash = () => {
  return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
};

const getCurrentBranch = () => {
  return execSync('git branch --show-current', { encoding: 'utf8' }).trim();
};

const getPackageVersion = () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  return pkg.version;
};

async function main() {
  const args = process.argv.slice(2);
  const releaseType = args[0] || 'canary';
  
  console.log(`🚀 SightEdit Development Release (${releaseType})\n`);

  // Validate release type
  const validTypes = ['canary', 'alpha', 'beta', 'rc', 'dev', 'experimental'];
  if (!validTypes.includes(releaseType)) {
    console.error(`Invalid release type. Valid types: ${validTypes.join(', ')}`);
    process.exit(1);
  }

  // Get version info
  const baseVersion = getPackageVersion();
  const commitHash = getCommitHash();
  const branch = getCurrentBranch();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  
  // Generate version based on type
  let version;
  switch (releaseType) {
    case 'canary':
      version = `${baseVersion}-canary.${timestamp}.${commitHash}`;
      break;
    case 'dev':
      version = `${baseVersion}-dev.${branch.replace(/[^a-zA-Z0-9]/g, '-')}.${commitHash}`;
      break;
    case 'experimental':
      version = `${baseVersion}-experimental.${commitHash}`;
      break;
    default:
      // For alpha, beta, rc - use incrementing numbers
      const existingTags = execSync(`git tag -l "v${baseVersion}-${releaseType}.*"`, { encoding: 'utf8' })
        .split('\n')
        .filter(Boolean)
        .map(tag => {
          const match = tag.match(new RegExp(`v${baseVersion}-${releaseType}\\.(\\d+)`));
          return match ? parseInt(match[1]) : 0;
        });
      
      const nextNumber = existingTags.length > 0 ? Math.max(...existingTags) + 1 : 0;
      version = `${baseVersion}-${releaseType}.${nextNumber}`;
  }

  console.log('Release Info:');
  console.log(`  Type: ${releaseType}`);
  console.log(`  Version: ${version}`);
  console.log(`  Branch: ${branch}`);
  console.log(`  Commit: ${commitHash}`);
  console.log();

  // Run minimal tests
  console.log('Running quick tests...');
  exec('npm run test:unit -- --passWithNoTests || true');

  // Build packages
  console.log('\nBuilding packages...');
  exec('npm run build');

  // Update versions
  console.log('\nUpdating versions...');
  exec(`lerna version ${version} --no-push --no-git-tag-version --yes`);
  exec(`npm version ${version} --no-git-tag-version`);

  // Publish to NPM with appropriate tag
  console.log('\nPublishing packages...');
  let npmTag;
  switch (releaseType) {
    case 'canary':
      npmTag = 'canary';
      break;
    case 'alpha':
    case 'beta':
    case 'rc':
      npmTag = 'next';
      break;
    case 'dev':
    case 'experimental':
      npmTag = releaseType;
      break;
    default:
      npmTag = 'latest';
  }

  exec(`lerna publish from-package --yes --no-verify-access --dist-tag ${npmTag}`);

  // Create lightweight tag for canary/dev builds
  if (['canary', 'dev', 'experimental'].includes(releaseType)) {
    console.log('\nCreating git tag...');
    exec(`git tag dev-${version}`);
    
    // Optionally push tag
    console.log('\nPush tag to remote? This is optional for dev releases.');
    console.log('Run: git push origin dev-' + version);
  } else {
    // For pre-releases, create annotated tag
    console.log('\nCreating annotated tag...');
    exec(`git tag -a v${version} -m "Pre-release v${version}"`);
    exec('git push origin HEAD');
    exec(`git push origin v${version}`);
  }

  console.log('\n✅ Development release completed!');
  console.log(`\nPublished ${version} to NPM with tag: ${npmTag}`);
  console.log('\nInstall with:');
  console.log(`  npm install @sightedit/core@${npmTag}`);
  console.log(`  npm install @sightedit/core@${version}`);
  
  if (releaseType === 'canary') {
    console.log('\nNote: Canary builds are automatically created and may be unstable.');
    console.log('They are useful for testing the latest changes.');
  }
}

// Support for CI environments
if (process.env.CI) {
  console.log('Running in CI mode...');
  // Auto-accept prompts and use appropriate settings
}

main().catch((error) => {
  console.error('Development release failed:', error);
  process.exit(1);
});