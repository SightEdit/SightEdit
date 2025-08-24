#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

const exec = (command, options = {}) => {
  console.log(`> ${command}`);
  try {
    return execSync(command, { stdio: 'inherit', ...options });
  } catch (error) {
    console.error(`Failed to execute: ${command}`);
    process.exit(1);
  }
};

const checkGitStatus = () => {
  const status = execSync('git status --porcelain', { encoding: 'utf8' });
  if (status.trim()) {
    console.error('Working directory is not clean. Please commit or stash changes.');
    process.exit(1);
  }
};

const getCurrentBranch = () => {
  return execSync('git branch --show-current', { encoding: 'utf8' }).trim();
};

const getPackageVersion = () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  return pkg.version;
};

const validateVersion = (version) => {
  const semverRegex = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
  return semverRegex.test(version);
};

async function main() {
  console.log('🚀 SightEdit Release Script\n');

  // Check prerequisites
  console.log('Checking prerequisites...');
  checkGitStatus();

  const currentBranch = getCurrentBranch();
  if (currentBranch !== 'main' && currentBranch !== 'master') {
    const proceed = await question(`Warning: You are on branch '${currentBranch}'. Continue? (y/N) `);
    if (proceed.toLowerCase() !== 'y') {
      console.log('Release cancelled.');
      process.exit(0);
    }
  }

  // Get current version
  const currentVersion = getPackageVersion();
  console.log(`Current version: ${currentVersion}`);

  // Ask for new version
  const newVersion = await question('Enter new version (or press enter for patch increment): ');
  
  let targetVersion;
  if (!newVersion) {
    // Auto increment patch version
    const [major, minor, patch] = currentVersion.split('.').map(Number);
    targetVersion = `${major}.${minor}.${patch + 1}`;
  } else if (!validateVersion(newVersion)) {
    console.error('Invalid version format. Use semver format (e.g., 1.2.3)');
    process.exit(1);
  } else {
    targetVersion = newVersion;
  }

  console.log(`\nRelease version: ${targetVersion}`);

  // Confirm release
  const releaseType = await question('\nRelease type:\n1. Standard release\n2. Pre-release (beta/alpha)\n3. Dry run (no publish)\n\nSelect (1-3): ');
  
  const isDryRun = releaseType === '3';
  const isPrerelease = releaseType === '2';

  if (isPrerelease) {
    const prereleaseSuffix = await question('Pre-release suffix (e.g., beta.1, alpha.0): ');
    targetVersion = `${targetVersion}-${prereleaseSuffix}`;
  }

  // Final confirmation
  console.log('\nRelease Summary:');
  console.log(`  Version: ${currentVersion} → ${targetVersion}`);
  console.log(`  Branch: ${currentBranch}`);
  console.log(`  Type: ${isDryRun ? 'Dry run' : (isPrerelease ? 'Pre-release' : 'Standard release')}`);
  
  const confirm = await question('\nProceed with release? (y/N) ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('Release cancelled.');
    process.exit(0);
  }

  console.log('\n📦 Starting release process...\n');

  // Run tests
  console.log('Running tests...');
  exec('npm test');

  // Build packages
  console.log('\nBuilding packages...');
  exec('npm run build');

  // Update versions
  console.log('\nUpdating versions...');
  if (!isDryRun) {
    exec(`lerna version ${targetVersion} --no-push --no-git-tag-version --yes`);
    exec(`npm version ${targetVersion} --no-git-tag-version`);
  } else {
    console.log('(Dry run - skipping version update)');
  }

  // Generate changelog
  console.log('\nGenerating changelog...');
  const changelog = execSync(
    `git log v${currentVersion}..HEAD --pretty=format:"- %s (%h)" --no-merges`,
    { encoding: 'utf8' }
  );
  
  const changelogPath = path.join(__dirname, '../CHANGELOG.md');
  const existingChangelog = fs.existsSync(changelogPath) 
    ? fs.readFileSync(changelogPath, 'utf8') 
    : '# Changelog\n\n';
  
  const newChangelog = `# Changelog\n\n## [${targetVersion}] - ${new Date().toISOString().split('T')[0]}\n\n${changelog}\n\n${existingChangelog.replace('# Changelog\n\n', '')}`;
  
  if (!isDryRun) {
    fs.writeFileSync(changelogPath, newChangelog);
  } else {
    console.log('(Dry run - changelog preview:)');
    console.log(changelog);
  }

  // Commit changes
  if (!isDryRun) {
    console.log('\nCommitting changes...');
    exec('git add -A');
    exec(`git commit -m "chore(release): ${targetVersion}"`);
  }

  // Create tag
  if (!isDryRun) {
    console.log('\nCreating tag...');
    exec(`git tag -a v${targetVersion} -m "Release v${targetVersion}"`);
  }

  // Publish packages
  console.log('\nPublishing packages...');
  if (!isDryRun) {
    const publishCmd = isPrerelease 
      ? 'lerna publish from-package --yes --no-verify-access --dist-tag next'
      : 'lerna publish from-package --yes --no-verify-access';
    
    exec(publishCmd);
  } else {
    console.log('(Dry run - skipping publish)');
  }

  // Push to remote
  if (!isDryRun) {
    console.log('\nPushing to remote...');
    exec('git push origin HEAD');
    exec('git push origin --tags');
  }

  // Create GitHub release
  if (!isDryRun) {
    console.log('\nCreating GitHub release...');
    const releaseNotes = `
## What's New in v${targetVersion}

${changelog}

## Installation

\`\`\`bash
npm install @sightedit/core@${targetVersion}
\`\`\`

### Framework Adapters
\`\`\`bash
npm install @sightedit/react@${targetVersion}
npm install @sightedit/vue@${targetVersion}
\`\`\`

### Backend Handlers
\`\`\`bash
npm install @sightedit/server-node@${targetVersion}
\`\`\`

## CDN

\`\`\`html
<script src="https://cdn.sightedit.com/v${targetVersion}/sightedit.min.js"></script>
\`\`\`
`;

    fs.writeFileSync('release-notes.md', releaseNotes);
    
    try {
      exec(`gh release create v${targetVersion} --title "v${targetVersion}" --notes-file release-notes.md ${isPrerelease ? '--prerelease' : ''}`);
      fs.unlinkSync('release-notes.md');
    } catch (error) {
      console.error('Failed to create GitHub release. You can create it manually.');
    }
  }

  console.log('\n✅ Release completed successfully!');
  console.log(`\nVersion ${targetVersion} has been released.`);
  
  if (!isDryRun) {
    console.log('\nNext steps:');
    console.log('1. Check the GitHub release page');
    console.log('2. Verify NPM packages are published');
    console.log('3. Test CDN deployment');
    console.log('4. Update documentation if needed');
  }

  rl.close();
}

main().catch((error) => {
  console.error('Release failed:', error);
  rl.close();
  process.exit(1);
});