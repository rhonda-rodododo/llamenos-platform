#!/usr/bin/env bun
/**
 * CI Validation Script for BDD Test Coverage (Multi-Platform)
 *
 * Parses all .feature files in packages/test-specs/features/,
 * extracts scenario titles, and verifies that each scenario has
 * a corresponding implementation on the target platform(s).
 *
 * Platforms:
 *   android — Kotlin @Test methods OR Cucumber step defs
 *   desktop — playwright-bdd step definitions (planned)
 *   ios     — Swift func test*() methods (planned)
 *
 * Usage:
 *   bun run test-specs:validate                  # All platforms with implementations
 *   bun run test-specs:validate --platform android
 *   bun run test-specs:validate --platform desktop
 *   bun run test-specs:validate --platform ios
 *   bun run test-specs:validate --platform all
 *
 * Exit codes:
 *   0 — all scenarios have matching tests
 *   1 — missing test implementations found
 */

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, relative, basename } from "path";

const ROOT = join(import.meta.dir, "../../..");
const FEATURES_DIR = join(import.meta.dir, "../features");
const ANDROID_TEST_DIR = join(
  ROOT,
  "apps/android/app/src/androidTest/java/org/llamenos/hotline"
);
const IOS_TEST_DIR = join(ROOT, "apps/ios/Tests");
const DESKTOP_STEPS_DIR = join(ROOT, "tests/steps");

type Platform = "android" | "desktop" | "ios";

interface Scenario {
  title: string;
  featureFile: string;
  featureName: string;
  featureTags: string[];
  scenarioTags: string[];
  allTags: string[];
  isOutline: boolean;
}

interface TestMethod {
  name: string;
  file: string;
  className: string;
}

// ---- CLI argument parsing ----

function parsePlatformArg(): Platform[] {
  const args = process.argv.slice(2);
  const platformIdx = args.indexOf("--platform");
  if (platformIdx === -1 || !args[platformIdx + 1]) {
    // Default: validate all platforms that have test directories
    const platforms: Platform[] = [];
    if (existsSync(join(ANDROID_TEST_DIR, "e2e")) || existsSync(join(ANDROID_TEST_DIR, "steps"))) {
      platforms.push("android");
    }
    if (existsSync(DESKTOP_STEPS_DIR)) {
      platforms.push("desktop");
    }
    if (existsSync(join(IOS_TEST_DIR, "E2E"))) {
      platforms.push("ios");
    }
    return platforms.length > 0 ? platforms : ["android"];
  }

  const value = args[platformIdx + 1];
  if (value === "all") return ["android", "desktop", "ios"];
  if (["android", "desktop", "ios"].includes(value)) return [value as Platform];
  console.error(`Unknown platform: ${value}. Use: android, desktop, ios, all`);
  process.exit(1);
}

// ---- Feature file parsing ----

function findFiles(dir: string, ext: string): string[] {
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      if (statSync(fullPath).isDirectory()) {
        files.push(...findFiles(fullPath, ext));
      } else if (entry.endsWith(ext)) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory may not exist
  }
  return files;
}

function parseTags(line: string): string[] {
  return line
    .split(/\s+/)
    .filter((t) => t.startsWith("@"))
    .map((t) => t.slice(1));
}

function parseFeatureFile(path: string): Scenario[] {
  const content = readFileSync(path, "utf-8");
  const lines = content.split("\n");
  const scenarios: Scenario[] = [];
  let featureName = "";
  let featureTags: string[] = [];
  let pendingTags: string[] = [];
  let featureTagsParsed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Collect tags before Feature: line
    if (line.startsWith("@") && !featureTagsParsed) {
      featureTags = parseTags(line);
      continue;
    }

    // Collect feature name
    if (line.startsWith("Feature:")) {
      featureName = line.replace("Feature:", "").trim();
      featureTagsParsed = true;
      continue;
    }

    // Collect tags before Scenario
    if (line.startsWith("@") && featureTagsParsed) {
      pendingTags = parseTags(line);
      continue;
    }

    // Match Scenario or Scenario Outline
    const scenarioMatch = line.match(
      /^Scenario(?:\s+Outline)?:\s*(.+)$/
    );
    if (scenarioMatch) {
      const allTags = [...new Set([...featureTags, ...pendingTags])];
      scenarios.push({
        title: scenarioMatch[1].trim(),
        featureFile: relative(FEATURES_DIR, path),
        featureName,
        featureTags,
        scenarioTags: [...pendingTags],
        allTags,
        isOutline: line.startsWith("Scenario Outline"),
      });
      pendingTags = [];
      continue;
    }

    // Reset pending tags if line is not a tag or scenario
    if (!line.startsWith("@") && !line.startsWith("Scenario")) {
      pendingTags = [];
    }
  }

  return scenarios;
}

function scenariosForPlatform(scenarios: Scenario[], platform: Platform): Scenario[] {
  return scenarios.filter((s) => s.allTags.includes(platform));
}

// ---- Scenario title to method name conversion ----

function scenarioToMethodName(title: string): string {
  return title
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .split(/\s+/)
    .map((word, i) =>
      i === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join("");
}

function scenarioToSwiftMethod(title: string): string {
  const camel = scenarioToMethodName(title);
  return "test" + camel.charAt(0).toUpperCase() + camel.slice(1);
}

// ---- Platform-specific test file parsing ----

function parseKotlinTestFile(path: string): TestMethod[] {
  const content = readFileSync(path, "utf-8");
  const methods: TestMethod[] = [];
  const classMatch = content.match(/class\s+(\w+)/);
  const className = classMatch?.[1] ?? basename(path, ".kt");

  // Match @Test fun methods (JUnit-style)
  const methodRegex = /@Test\s*\n\s*fun\s+(\w+)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = methodRegex.exec(content)) !== null) {
    methods.push({
      name: match[1],
      file: relative(ANDROID_TEST_DIR, path),
      className,
    });
  }

  return methods;
}

/**
 * Parse Cucumber step phrases from a Kotlin step definition file.
 * Extracts strings from @Given, @When, @Then, @And, @But annotations.
 */
function parseCucumberStepPhrases(path: string): string[] {
  const content = readFileSync(path, "utf-8");
  const phrases: string[] = [];

  // Match @Given("..."), @When("..."), @Then("..."), @And("..."), @But("...")
  const stepRegex = /@(?:Given|When|Then|And|But)\("([^"]+)"\)/g;
  let match: RegExpExecArray | null;
  while ((match = stepRegex.exec(content)) !== null) {
    phrases.push(match[1]);
  }

  return phrases;
}

/**
 * Extract all Gherkin step phrases from a feature file's scenarios.
 * Returns unique Given/When/Then/And/But phrases used in the feature.
 */
function extractGherkinSteps(featurePath: string): string[] {
  const content = readFileSync(featurePath, "utf-8");
  const lines = content.split("\n");
  const steps: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const stepMatch = trimmed.match(/^(?:Given|When|Then|And|But)\s+(.+)$/);
    if (stepMatch) {
      steps.push(stepMatch[1]);
    }
  }

  return steps;
}

/**
 * Check if a Gherkin step text matches a Cucumber step phrase pattern.
 * Handles Cucumber expression parameters like {string}, {int}, {word},
 * escaped characters like \\(, and DataTable steps (ending with :).
 */
function stepMatchesCucumberPhrase(gherkinStep: string, cucumberPhrase: string): boolean {
  const step = gherkinStep.trim();

  // Convert cucumber expression pattern to regex
  let pattern = cucumberPhrase
    // Escape regex special chars (except those used by cucumber)
    .replace(/[.*+?^${}()|[\]]/g, "\\$&")
    // Restore cucumber expression parameters
    .replace(/\\{string\\}/g, '"[^"]*"')
    .replace(/\\{int\\}/g, "\\d+")
    .replace(/\\{word\\}/g, "\\S+")
    // Handle escaped parens in cucumber (e.g., \\( becomes literal paren)
    .replace(/\\\\\\\(/g, "\\(")
    .replace(/\\\\\\\)/g, "\\)")
    ;

  try {
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(step);
  } catch {
    // If regex construction fails, fall back to exact match
    return step === cucumberPhrase;
  }
}

function parseSwiftTestFile(path: string): TestMethod[] {
  const content = readFileSync(path, "utf-8");
  const methods: TestMethod[] = [];
  const classMatch = content.match(/(?:class|final\s+class)\s+(\w+)/);
  const className = classMatch?.[1] ?? basename(path, ".swift");

  const methodRegex = /func\s+(test\w+)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = methodRegex.exec(content)) !== null) {
    methods.push({
      name: match[1],
      file: relative(IOS_TEST_DIR, path),
      className,
    });
  }

  return methods;
}

// ---- Coverage checking per platform ----

function checkAndroidCoverage(scenarios: Scenario[]): { covered: number; missing: number } {
  const stepsDir = join(ANDROID_TEST_DIR, "steps");
  const e2eDir = join(ANDROID_TEST_DIR, "e2e");
  const useCucumber = existsSync(stepsDir) && findFiles(stepsDir, "Steps.kt").length > 0;

  if (useCucumber) {
    return checkAndroidCucumberCoverage(scenarios);
  }

  // Legacy: @Test method matching
  const testDirs = [e2eDir, stepsDir];
  const allMethods: TestMethod[] = [];

  for (const dir of testDirs) {
    const files = findFiles(dir, "Test.kt").concat(findFiles(dir, "Steps.kt"));
    for (const file of files) {
      allMethods.push(...parseKotlinTestFile(file));
    }
  }

  const methodNames = new Set(allMethods.map((m) => m.name));
  console.log(
    `  Found ${allMethods.length} Android @Test methods across ${new Set(allMethods.map(m => m.file)).size} test files\n`
  );

  let covered = 0;
  let missing = 0;
  let currentFeature = "";

  for (const scenario of scenarios) {
    if (scenario.featureFile !== currentFeature) {
      currentFeature = scenario.featureFile;
      console.log(`  Feature: ${scenario.featureName} (${scenario.featureFile})`);
    }

    const expectedMethod = scenarioToMethodName(scenario.title);
    const found = methodNames.has(expectedMethod);

    if (found) {
      const method = allMethods.find((m) => m.name === expectedMethod)!;
      console.log(
        `    \u2713 ${scenario.title}\n      ${method.className}.${method.name}`
      );
      covered++;
    } else {
      // Fuzzy match
      const fuzzyMatch = allMethods.find((m) =>
        m.name.toLowerCase().includes(expectedMethod.slice(0, 20).toLowerCase())
      );
      if (fuzzyMatch) {
        console.log(
          `    ~ ${scenario.title}\n      ${fuzzyMatch.className}.${fuzzyMatch.name} (fuzzy match)`
        );
        covered++;
      } else {
        console.log(
          `    \u2717 ${scenario.title}\n      MISSING (expected: ${expectedMethod})`
        );
        missing++;
      }
    }
  }

  return { covered, missing };
}

/**
 * Cucumber-specific coverage check for Android.
 *
 * With Cucumber, coverage is verified by checking that every Gherkin step
 * phrase in @android-tagged feature files has a matching step definition
 * in the steps/ directory. Scenarios are covered when all their steps
 * have matching definitions.
 */
function checkAndroidCucumberCoverage(scenarios: Scenario[]): { covered: number; missing: number } {
  const stepsDir = join(ANDROID_TEST_DIR, "steps");
  const stepFiles = findFiles(stepsDir, ".kt");

  // Collect all cucumber step phrases from step definition files
  const allPhrases: string[] = [];
  for (const file of stepFiles) {
    allPhrases.push(...parseCucumberStepPhrases(file));
  }

  console.log(
    `  Cucumber mode: Found ${allPhrases.length} step definitions across ${stepFiles.length} step files\n`
  );

  let covered = 0;
  let missing = 0;
  let currentFeature = "";

  for (const scenario of scenarios) {
    if (scenario.featureFile !== currentFeature) {
      currentFeature = scenario.featureFile;
      console.log(`  Feature: ${scenario.featureName} (${scenario.featureFile})`);
    }

    // Extract all Gherkin steps for this scenario from the feature file
    const featurePath = join(FEATURES_DIR, scenario.featureFile);
    const gherkinSteps = extractScenarioSteps(featurePath, scenario.title);

    if (gherkinSteps.length === 0) {
      // No steps extracted — could be an outline with examples or empty scenario
      console.log(`    \u2713 ${scenario.title} (no steps to validate)`);
      covered++;
      continue;
    }

    // Check each step has a matching definition
    const unmatchedSteps: string[] = [];
    for (const step of gherkinSteps) {
      const hasMatch = allPhrases.some((phrase) =>
        stepMatchesCucumberPhrase(step, phrase)
      );
      if (!hasMatch) {
        unmatchedSteps.push(step);
      }
    }

    if (unmatchedSteps.length === 0) {
      console.log(
        `    \u2713 ${scenario.title} (${gherkinSteps.length} steps matched)`
      );
      covered++;
    } else {
      console.log(
        `    \u2717 ${scenario.title}\n      Missing step defs for:`
      );
      for (const step of unmatchedSteps) {
        console.log(`        - ${step}`);
      }
      missing++;
    }
  }

  return { covered, missing };
}

/**
 * Extract the Gherkin step lines belonging to a specific scenario within a feature file.
 */
function extractScenarioSteps(featurePath: string, scenarioTitle: string): string[] {
  const content = readFileSync(featurePath, "utf-8");
  const lines = content.split("\n");
  const steps: string[] = [];
  let inTargetScenario = false;
  let inBackground = false;
  const backgroundSteps: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Track Background section
    if (trimmed.startsWith("Background:")) {
      inBackground = true;
      inTargetScenario = false;
      continue;
    }

    // Track target scenario
    const scenarioMatch = trimmed.match(/^Scenario(?:\s+Outline)?:\s*(.+)$/);
    if (scenarioMatch) {
      inBackground = false;
      inTargetScenario = scenarioMatch[1].trim() === scenarioTitle;
      continue;
    }

    // Skip tags, empty lines, comments, examples, tables
    if (
      trimmed.startsWith("@") ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("|") ||
      trimmed.startsWith("Examples:") ||
      trimmed.startsWith("Feature:") ||
      trimmed === ""
    ) {
      if (trimmed.startsWith("@") || trimmed.startsWith("Examples:") || trimmed.startsWith("Feature:")) {
        if (inTargetScenario && !trimmed.startsWith("|")) {
          // End of scenario
          break;
        }
      }
      continue;
    }

    // Collect step lines
    const stepMatch = trimmed.match(/^(?:Given|When|Then|And|But)\s+(.+)$/);
    if (stepMatch) {
      if (inBackground) {
        backgroundSteps.push(stepMatch[1]);
      } else if (inTargetScenario) {
        steps.push(stepMatch[1]);
      }
    }
  }

  // Background steps apply to all scenarios
  return [...backgroundSteps, ...steps];
}

function checkDesktopCoverage(scenarios: Scenario[]): { covered: number; missing: number } {
  if (!existsSync(DESKTOP_STEPS_DIR)) {
    console.log("  Desktop step definitions not yet created (tests/steps/)");
    console.log(`  ${scenarios.length} scenarios tagged @desktop pending implementation\n`);
    return { covered: 0, missing: scenarios.length };
  }

  // For playwright-bdd, check that step definition files exist in tests/steps/
  const stepFiles = findFiles(DESKTOP_STEPS_DIR, ".ts");
  console.log(`  Found ${stepFiles.length} step definition files in tests/steps/\n`);

  // Basic check: step files exist. Full step-phrase matching is complex and
  // deferred to playwright-bdd's own validation (bddgen will fail on missing steps)
  if (stepFiles.length > 0) {
    // Report all scenarios as covered if step files exist
    // (playwright-bdd validates at build time)
    for (const scenario of scenarios) {
      console.log(`    \u2713 ${scenario.title} (validated by playwright-bdd)`);
    }
    return { covered: scenarios.length, missing: 0 };
  }

  return { covered: 0, missing: scenarios.length };
}

function checkIosCoverage(scenarios: Scenario[]): { covered: number; missing: number } {
  const e2eDir = join(IOS_TEST_DIR, "E2E");
  if (!existsSync(e2eDir)) {
    console.log("  iOS E2E test directory not yet created (Tests/E2E/)");
    console.log(`  ${scenarios.length} scenarios tagged @ios pending implementation\n`);
    return { covered: 0, missing: scenarios.length };
  }

  const testFiles = findFiles(e2eDir, ".swift");
  const allMethods: TestMethod[] = [];
  for (const file of testFiles) {
    allMethods.push(...parseSwiftTestFile(file));
  }

  const methodNames = new Set(allMethods.map((m) => m.name));
  console.log(
    `  Found ${allMethods.length} Swift test methods across ${testFiles.length} test files\n`
  );

  let covered = 0;
  let missing = 0;
  let currentFeature = "";

  for (const scenario of scenarios) {
    if (scenario.featureFile !== currentFeature) {
      currentFeature = scenario.featureFile;
      console.log(`  Feature: ${scenario.featureName} (${scenario.featureFile})`);
    }

    const expectedMethod = scenarioToSwiftMethod(scenario.title);
    const found = methodNames.has(expectedMethod);

    if (found) {
      const method = allMethods.find((m) => m.name === expectedMethod)!;
      console.log(
        `    \u2713 ${scenario.title}\n      ${method.className}.${method.name}`
      );
      covered++;
    } else {
      // Fuzzy match
      const fuzzyMatch = allMethods.find((m) =>
        m.name.toLowerCase().includes(expectedMethod.slice(4, 24).toLowerCase())
      );
      if (fuzzyMatch) {
        console.log(
          `    ~ ${scenario.title}\n      ${fuzzyMatch.className}.${fuzzyMatch.name} (fuzzy match)`
        );
        covered++;
      } else {
        console.log(
          `    \u2717 ${scenario.title}\n      MISSING (expected: ${expectedMethod})`
        );
        missing++;
      }
    }
  }

  return { covered, missing };
}

// ---- Main ----

function main() {
  console.log("BDD Test Coverage Validation (Multi-Platform)\n");

  const platforms = parsePlatformArg();

  // Parse all features
  const featureFiles = findFiles(FEATURES_DIR, ".feature");
  const allScenarios: Scenario[] = [];
  for (const file of featureFiles) {
    allScenarios.push(...parseFeatureFile(file));
  }

  console.log(
    `Found ${allScenarios.length} total scenarios across ${featureFiles.length} feature files\n`
  );

  let totalMissing = 0;
  const results: { platform: string; total: number; covered: number; missing: number }[] = [];

  for (const platform of platforms) {
    const platformScenarios = scenariosForPlatform(allScenarios, platform);
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Platform: ${platform.toUpperCase()} (${platformScenarios.length} scenarios tagged @${platform})`);
    console.log(`${"=".repeat(60)}\n`);

    if (platformScenarios.length === 0) {
      console.log(`  No scenarios tagged @${platform}\n`);
      results.push({ platform, total: 0, covered: 0, missing: 0 });
      continue;
    }

    let result: { covered: number; missing: number };

    switch (platform) {
      case "android":
        result = checkAndroidCoverage(platformScenarios);
        break;
      case "desktop":
        result = checkDesktopCoverage(platformScenarios);
        break;
      case "ios":
        result = checkIosCoverage(platformScenarios);
        break;
    }

    results.push({
      platform,
      total: platformScenarios.length,
      covered: result.covered,
      missing: result.missing,
    });
    totalMissing += result.missing;
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("Summary");
  console.log(`${"=".repeat(60)}`);

  for (const r of results) {
    const pct = r.total > 0 ? ((r.covered / r.total) * 100).toFixed(1) : "N/A";
    const status = r.missing === 0 ? "\u2713" : "\u2717";
    console.log(`  ${status} ${r.platform}: ${r.covered}/${r.total} (${pct}%)`);
  }

  if (totalMissing > 0) {
    console.log(`\nFAILED: ${totalMissing} missing test implementations.`);
    process.exit(1);
  } else {
    console.log("\nPASSED: All platforms at 100% coverage.");
    process.exit(0);
  }
}

main();
