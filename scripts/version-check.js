#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const packages = [
  '@sightedit/core',
  '@sightedit/react',
  '@sightedit/vue',
  '@sightedit/server-node',
  '@sightedit/server-php'
];

const exec = (command) => {
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch (error) {
    return null;
  }
};

const getLocalVersion = (packageName) => {
  const packagePath = packageName.replace('@sightedit/', '');
  const pkgJsonPath = path.join(__dirname, `../packages/${packagePath}/package.json`);
  
  if (fs.existsSync(pkgJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    return pkg.version;
  }
  return null;
};

const getNpmVersion = (packageName, tag = 'latest') => {
  const result = exec(`npm view ${packageName}@${tag} version 2>/dev/null`);
  return result || 'Not published';
};

const getNpmTags = (packageName) => {
  const result = exec(`npm view ${packageName} dist-tags --json 2>/dev/null`);
  if (result) {
    try {
      return JSON.parse(result);
    } catch {
      return {};
    }
  }
  return {};
};

const getUnpkgSize = async (packageName, version) => {
  return new Promise((resolve) => {
    const url = `https://unpkg.com/${packageName}@${version}/dist/`;
    https.get(url, (res) => {
      if (res.statusCode === 200) {
        resolve('Available');
      } else {
        resolve('Not available');
      }
    }).on('error', () => {
      resolve('Error');
    });
  });
};

async function main() {
  console.log('📦 SightEdit Version Check\n');
  
  const args = process.argv.slice(2);
  const showAll = args.includes('--all');
  const checkCdn = args.includes('--cdn');
  
  console.log('Local vs NPM Versions:\n');
  console.log('Package'.padEnd(30) + 'Local'.padEnd(15) + 'Latest'.padEnd(15) + 'Next'.padEnd(15) + 'Canary');
  console.log('-'.repeat(90));
  
  for (const pkg of packages) {
    const local = getLocalVersion(pkg);
    const tags = getNpmTags(pkg);
    
    const row = [
      pkg.padEnd(30),
      (local || 'N/A').padEnd(15),
      (tags.latest || 'Not published').padEnd(15),
      (tags.next || '-').padEnd(15),
      tags.canary || '-'
    ];
    
    console.log(row.join(''));
  }
  
  if (showAll) {
    console.log('\n\nAll Published Versions:\n');
    
    for (const pkg of packages) {
      console.log(`\n${pkg}:`);
      const versions = exec(`npm view ${pkg} versions --json 2>/dev/null`);
      if (versions) {
        try {
          const versionList = JSON.parse(versions);
          console.log(`  Total versions: ${versionList.length}`);
          console.log(`  Latest 5: ${versionList.slice(-5).join(', ')}`);
        } catch {
          console.log('  No versions found');
        }
      }
    }
  }
  
  if (checkCdn) {
    console.log('\n\nCDN Availability Check:\n');
    const coreVersion = getLocalVersion('@sightedit/core');
    if (coreVersion) {
      console.log('Checking CDN endpoints...');
      
      const endpoints = [
        `https://unpkg.com/@sightedit/core@${coreVersion}`,
        `https://cdn.jsdelivr.net/npm/@sightedit/core@${coreVersion}`,
        `https://cdn.sightedit.com/v${coreVersion}/sightedit.min.js`
      ];
      
      for (const endpoint of endpoints) {
        const status = await new Promise((resolve) => {
          https.get(endpoint, (res) => {
            resolve(res.statusCode === 200 ? '✅ Available' : '❌ Not available');
          }).on('error', () => {
            resolve('❌ Error');
          });
        });
        console.log(`  ${endpoint}: ${status}`);
      }
    }
  }
  
  // Check for version mismatches
  console.log('\n\nVersion Consistency Check:');
  const versions = new Set();
  let inconsistent = false;
  
  for (const pkg of packages) {
    const version = getLocalVersion(pkg);
    if (version) {
      versions.add(version);
    }
  }
  
  if (versions.size > 1) {
    console.log('⚠️  Warning: Local packages have different versions!');
    console.log(`   Versions found: ${Array.from(versions).join(', ')}`);
    inconsistent = true;
  } else if (versions.size === 1) {
    console.log('✅ All local packages have the same version:', Array.from(versions)[0]);
  }
  
  // Check if local is ahead of NPM
  console.log('\n\nRelease Status:');
  for (const pkg of packages) {
    const local = getLocalVersion(pkg);
    const npm = getNpmVersion(pkg);
    
    if (local && npm !== 'Not published') {
      const localParts = local.split('.').map(Number);
      const npmParts = npm.split('.').map(Number);
      
      let comparison = 'same';
      for (let i = 0; i < 3; i++) {
        if (localParts[i] > npmParts[i]) {
          comparison = 'ahead';
          break;
        } else if (localParts[i] < npmParts[i]) {
          comparison = 'behind';
          break;
        }
      }
      
      if (comparison === 'ahead') {
        console.log(`  ${pkg}: Local (${local}) is ahead of NPM (${npm}) - Ready to publish`);
      } else if (comparison === 'behind') {
        console.log(`  ${pkg}: Local (${local}) is behind NPM (${npm}) - Consider updating`);
      }
    }
  }
  
  // Provide commands
  console.log('\n\nUseful Commands:');
  console.log('  View all versions:     node scripts/version-check.js --all');
  console.log('  Check CDN:             node scripts/version-check.js --cdn');
  console.log('  Publish canary:        node scripts/dev-release.js canary');
  console.log('  Publish release:       node scripts/release.js');
  
  process.exit(inconsistent ? 1 : 0);
}

main().catch((error) => {
  console.error('Version check failed:', error);
  process.exit(1);
});