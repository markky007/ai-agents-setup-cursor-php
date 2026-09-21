#!/usr/bin/env node
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `Install this Cursor AI workspace pack into the current directory.

Copies only .cursor/ (rules, agents, skills, commands). Does not copy this
repo's package.json, installer, or README.

Usage:
  npx --yes github:markky007/ai-agents-setup-cursor-php
  npx --yes github:markky007/ai-agents-setup-cursor-php -- --force
  npx --yes github:markky007/ai-agents-setup-cursor-php -- --dry-run

Options:
  --force     Overwrite files that already exist under .cursor/
  --dry-run   Print what would be copied; write nothing
  --help      Show this message

Default: merge. Existing destination files are skipped unless --force is set.
`;

function parseArgs(argv) {
  let force = false;
  let dryRun = false;
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--force") {
      force = true;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    throw new Error(`Unknown option: ${arg}\n\n${USAGE}`);
  }
  return { help: false, force, dryRun };
}

function assertInside(root, target) {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  const prefix = resolvedRoot.endsWith(sep) ? resolvedRoot : resolvedRoot + sep;
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(prefix)) {
    throw new Error(`Refusing path outside destination: ${target}`);
  }
}

async function listFiles(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(full, base)));
      continue;
    }
    if (entry.isFile()) files.push(relative(base, full));
  }
  return files;
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (err) {
    if (err && err.code === "ENOENT") return false;
    throw err;
  }
}

function printNextSteps(destCursor) {
  console.log(`
Next steps:
  1. Open ${destCursor} parent folder as a Cursor workspace (reload if already open).
  2. Disable any Cursor User Rule that duplicates Implementation Core
     (the long "Software Implementation Skill Rule").
  3. Optional: in the Laravel app, composer require laravel/boost --dev
     then php artisan boost:install (select Cursor).
  4. If the app has graphify-out/graph.json, keep the Graphify CLI on PATH.
`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(USAGE);
    return;
  }

  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const sourceCursor = join(packageRoot, ".cursor");
  const destCursor = join(process.cwd(), ".cursor");

  if (!(await pathExists(sourceCursor))) {
    throw new Error(`Pack is missing .cursor/ at ${sourceCursor}`);
  }

  if (resolve(sourceCursor) === resolve(destCursor)) {
    console.log("Already inside this setup repo; nothing to copy.");
    return;
  }

  const relFiles = await listFiles(sourceCursor);
  if (relFiles.length === 0) {
    throw new Error(`No files found under ${sourceCursor}`);
  }

  let copied = 0;
  let skipped = 0;

  for (const rel of relFiles) {
    const from = join(sourceCursor, rel);
    const to = join(destCursor, rel);
    assertInside(sourceCursor, from);
    assertInside(destCursor, to);

    const exists = await pathExists(to);
    if (exists && !opts.force) {
      skipped += 1;
      if (opts.dryRun) console.log(`skip  ${rel}`);
      continue;
    }

    if (opts.dryRun) {
      console.log(`${exists ? "overwrite" : "copy"}  ${rel}`);
      copied += 1;
      continue;
    }

    await mkdir(dirname(to), { recursive: true });
    await copyFile(from, to);
    copied += 1;
  }

  const verb = opts.dryRun ? "Would copy" : "Copied";
  console.log(
    `${verb} ${copied} file(s) into ${destCursor}` +
      (skipped ? `; skipped ${skipped} existing file(s)` : "") +
      (opts.force && !opts.dryRun ? " (--force)" : "") +
      (opts.dryRun ? " (--dry-run)" : "") +
      ".",
  );

  if (!opts.dryRun) printNextSteps(destCursor);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
