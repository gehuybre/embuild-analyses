/**
 * Script to verify migration from old data locations to new split repo system
 *
 * Old system: Data files embedded in analyses repo at embuild-analyses/analyses/*/results/
 * New system: Data files fetched from external data repo
 *
 * Usage: npx ts-node scripts/check-data-migration.ts
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ANALYSES_ROOT = path.resolve(PROJECT_ROOT, 'embuild-analyses');

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string[];
}

const results: CheckResult[] = [];

function log(message: string, type: 'info' | 'error' | 'success' | 'warn' = 'info') {
  const colors = {
    info: '\x1b[36m',
    error: '\x1b[31m',
    success: '\x1b[32m',
    warn: '\x1b[33m',
    reset: '\x1b[0m',
  };
  console.log(`${colors[type]}${message}${colors.reset}`);
}

function getSourceFiles(): string[] {
  try {
    const files = execSync(
      `find ${ANALYSES_ROOT}/src -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \\) ! -path "*/node_modules/*" ! -path "*/.next/*"`,
      { encoding: 'utf-8' }
    )
      .trim()
      .split('\n')
      .filter((f) => f.length > 0);
    return files;
  } catch {
    return [];
  }
}

function checkNoDirectImportsFromResults(): CheckResult {
  const sourceFiles = getSourceFiles();
  const offendingFiles: { file: string; matches: string[] }[] = [];

  sourceFiles.forEach((file) => {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const matches = content.match(
        /import\s+.*from\s+['"].*\/analyses\/\w+\/results\/.*\.json['"]/g
      );

      if (matches) {
        offendingFiles.push({
          file: path.relative(PROJECT_ROOT, file),
          matches,
        });
      }
    } catch {
      // Skip files that can't be read
    }
  });

  return {
    name: 'No direct imports from analyses/*/results/',
    passed: offendingFiles.length === 0,
    message:
      offendingFiles.length === 0
        ? 'No direct JSON imports found'
        : `Found ${offendingFiles.length} files with direct imports`,
    details: offendingFiles.map(
      (f) => `  ${f.file}: ${f.matches?.join(', ')}`
    ),
  };
}

function checkNoFsReadFileSync(): CheckResult {
  const sourceFiles = getSourceFiles();
  const offendingFiles: { file: string; matches: string[] }[] = [];

  sourceFiles.forEach((file) => {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const matches = content.match(/fs\.readFileSync\([^)]*\/analyses\/\w+\/results\/[^)]*\)/g);

      if (matches) {
        offendingFiles.push({
          file: path.relative(PROJECT_ROOT, file),
          matches,
        });
      }
    } catch {
      // Skip files that can't be read
    }
  });

  return {
    name: 'No fs.readFileSync for results files',
    passed: offendingFiles.length === 0,
    message:
      offendingFiles.length === 0
        ? 'No filesystem reads for results'
        : `Found ${offendingFiles.length} files with fs.readFileSync`,
    details: offendingFiles.map((f) => `  ${f.file}`),
  };
}

function checkNoHardcodedEmbuildPaths(): CheckResult {
  const sourceFiles = getSourceFiles();
  const offendingFiles: { file: string; matches: string[] }[] = [];

  sourceFiles.forEach((file) => {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const matches = content.match(/embuild-analyses\/analyses\/\w+\/results\//g);

      if (matches) {
        offendingFiles.push({
          file: path.relative(PROJECT_ROOT, file),
          matches,
        });
      }
    } catch {
      // Skip files that can't be read
    }
  });

  return {
    name: 'No hardcoded embuild-analyses paths',
    passed: offendingFiles.length === 0,
    message:
      offendingFiles.length === 0
        ? 'No hardcoded embuild paths found'
        : `Found ${offendingFiles.length} files with hardcoded paths`,
    details: offendingFiles.map((f) => `  ${f.file}`),
  };
}

function checkDataLoadingHooks(): CheckResult {
  const sourceFiles = getSourceFiles();
  const hookFiles = sourceFiles.filter((file) =>
    /use-\w+-data|embed.*hook/i.test(path.basename(file))
  );

  if (hookFiles.length === 0) {
    return {
      name: 'Data loading hooks usage',
      passed: true,
      message: 'No custom hooks found (components may use inline data loading)',
    };
  }

  const hooksUsingNewSystem: string[] = [];

  hookFiles.forEach((file) => {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('useJsonBundle') || content.includes('useEmbedData')) {
        hooksUsingNewSystem.push(path.relative(PROJECT_ROOT, file));
      }
    } catch {
      // Skip files that can't be read
    }
  });

  return {
    name: 'Data hooks use new system',
    passed: hooksUsingNewSystem.length === hookFiles.length,
    message:
      hooksUsingNewSystem.length === hookFiles.length
        ? `All ${hookFiles.length} hooks use new system`
        : `${hooksUsingNewSystem.length}/${hookFiles.length} hooks migrated`,
    details: hookFiles.map((f) => {
      const isUsing = hooksUsingNewSystem.includes(path.relative(PROJECT_ROOT, f));
      return `  ${isUsing ? '✓' : '✗'} ${path.relative(PROJECT_ROOT, f)}`;
    }),
  };
}

function checkPathUtilsExists(): CheckResult {
  const pathUtilsFile = path.resolve(ANALYSES_ROOT, 'src/lib/path-utils.ts');
  const exists = fs.existsSync(pathUtilsFile);

  if (exists) {
    const content = fs.readFileSync(pathUtilsFile, 'utf-8');
    const hasGetDataPath = content.includes('getDataPath');
    const hasGetDataBaseUrl = content.includes('getDataBaseUrl');
    const hasEnvVar = content.includes('NEXT_PUBLIC_DATA_BASE_URL');

    return {
      name: 'path-utils.ts centralized data loading',
      passed: hasGetDataPath && hasGetDataBaseUrl && hasEnvVar,
      message: exists ? 'path-utils.ts found with required functions' : 'path-utils.ts not found',
      details: [
        `  ${hasGetDataPath ? '✓' : '✗'} getDataPath function`,
        `  ${hasGetDataBaseUrl ? '✓' : '✗'} getDataBaseUrl function`,
        `  ${hasEnvVar ? '✓' : '✗'} NEXT_PUBLIC_DATA_BASE_URL reference`,
      ],
    };
  }

  return {
    name: 'path-utils.ts centralized data loading',
    passed: false,
    message: 'path-utils.ts not found',
  };
}

function checkEnvironmentVariables(): CheckResult {
  const envLocalFile = path.resolve(ANALYSES_ROOT, '.env.local');
  const envExampleFile = path.resolve(ANALYSES_ROOT, '.env.example');

  let hasEnvLocal = false;
  let hasEnvExample = false;

  if (fs.existsSync(envLocalFile)) {
    const content = fs.readFileSync(envLocalFile, 'utf-8');
    hasEnvLocal = content.includes('NEXT_PUBLIC_DATA_BASE_URL');
  }

  if (fs.existsSync(envExampleFile)) {
    const content = fs.readFileSync(envExampleFile, 'utf-8');
    hasEnvExample = content.includes('NEXT_PUBLIC_DATA_BASE_URL');
  }

  return {
    name: 'Environment variables configured',
    passed: hasEnvLocal || hasEnvExample,
    message: `NEXT_PUBLIC_DATA_BASE_URL ${hasEnvLocal ? 'in .env.local' : hasEnvExample ? 'in .env.example' : 'not found'}`,
    details: [
      `  ${hasEnvLocal ? '✓' : '✗'} .env.local`,
      `  ${hasEnvExample ? '✓' : '✗'} .env.example`,
    ],
  };
}

function checkAnalysisComponentsStructure(): CheckResult {
  const analysisComponentsPath = path.resolve(ANALYSES_ROOT, 'src/components/analyses');

  if (!fs.existsSync(analysisComponentsPath)) {
    return {
      name: 'Analysis components structure',
      passed: true,
      message: 'analyses components directory not found (may not be needed)',
    };
  }

  const analysisDirectories = fs
    .readdirSync(analysisComponentsPath)
    .filter((f) => fs.statSync(path.join(analysisComponentsPath, f)).isDirectory());

  if (analysisDirectories.length === 0) {
    return {
      name: 'Analysis components structure',
      passed: true,
      message: 'No analysis components found',
    };
  }

  const details: string[] = [];
  let allMigrated = true;

  analysisDirectories.forEach((analysisDirName) => {
    const analysisDirPath = path.join(analysisComponentsPath, analysisDirName);
    const hookFile = path.join(analysisDirPath, `use-${analysisDirName}-data.ts`);
    const embedComponentFile = path.join(analysisDirPath, `${analysisDirName}Embed.tsx`);

    const hasHook = fs.existsSync(hookFile);
    const hasComponent = fs.existsSync(embedComponentFile);
    const hasEither = hasHook || hasComponent;

    if (hasEither) {
      let isMigrated = true;

      if (hasHook) {
        const content = fs.readFileSync(hookFile, 'utf-8');
        isMigrated =
          content.includes('useJsonBundle') || content.includes('getDataPath');
      }

      if (hasComponent) {
        const content = fs.readFileSync(embedComponentFile, 'utf-8');
        isMigrated =
          isMigrated &&
          (content.includes('useJsonBundle') ||
            content.includes('useEmbedData') ||
            content.includes('getDataPath') ||
            /fetch\(.*data.*\)/g.test(content));
      }

      if (!isMigrated) {
        allMigrated = false;
      }

      details.push(
        `  ${isMigrated ? '✓' : '✗'} ${analysisDirName} ${hasHook ? '(hook)' : ''} ${hasComponent ? '(component)' : ''}`
      );
    }
  });

  return {
    name: 'Analysis components migrated',
    passed: allMigrated,
    message: `${analysisDirectories.length} analysis directories checked`,
    details,
  };
}

function checkPublicDirectory(): CheckResult {
  const publicPath = path.resolve(ANALYSES_ROOT, 'public');

  if (!fs.existsSync(publicPath)) {
    return {
      name: 'No old data in public directory',
      passed: true,
      message: 'public directory not found',
    };
  }

  try {
    const resultsFiles = execSync(`find "${publicPath}" -path "*analyses*" -name "*.json" -type f`, {
      encoding: 'utf-8',
    })
      .trim()
      .split('\n')
      .filter((f) => f.length > 0);

    return {
      name: 'No old data in public directory',
      passed: resultsFiles.length === 0,
      message:
        resultsFiles.length === 0
          ? 'No old analysis results in public directory'
          : `Found ${resultsFiles.length} old result files in public`,
      details: resultsFiles.slice(0, 5),
    };
  } catch {
    return {
      name: 'No old data in public directory',
      passed: true,
      message: 'public directory checked',
    };
  }
}

async function main() {
  console.log('\n');
  log('═══════════════════════════════════════════════════════════════', 'info');
  log('  Data Migration Verification - Split Repo System', 'info');
  log('═══════════════════════════════════════════════════════════════\n', 'info');

  // Run all checks
  results.push(checkNoDirectImportsFromResults());
  results.push(checkNoFsReadFileSync());
  results.push(checkNoHardcodedEmbuildPaths());
  results.push(checkPathUtilsExists());
  results.push(checkDataLoadingHooks());
  results.push(checkEnvironmentVariables());
  results.push(checkAnalysisComponentsStructure());
  results.push(checkPublicDirectory());

  // Display results
  results.forEach((result) => {
    const icon = result.passed ? '✓' : '✗';
    const color = result.passed ? 'success' : 'error';
    log(`${icon} ${result.name}`, color);
    log(`  ${result.message}`, result.passed ? 'info' : 'warn');

    if (result.details && result.details.length > 0) {
      result.details.forEach((detail) => {
        log(detail, result.passed ? 'info' : 'warn');
      });
    }
  });

  // Summary
  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  const allPassed = passedCount === totalCount;

  console.log('\n');
  log('─────────────────────────────────────────────────────────────────', 'info');
  log(`Results: ${passedCount}/${totalCount} checks passed`, allPassed ? 'success' : 'error');
  log('─────────────────────────────────────────────────────────────────\n', 'info');

  if (allPassed) {
    log('✓ All blogs have been successfully migrated to the split repo system!', 'success');
  } else {
    log('✗ Some issues found. Please review the details above.', 'error');
    process.exit(1);
  }
}

main().catch((error) => {
  log(`Error: ${error.message}`, 'error');
  process.exit(1);
});
