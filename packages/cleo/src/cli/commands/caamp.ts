/**
 * CLI caamp command group — CAAMP injection management.
 *
 * Subcommands:
 *   caamp dedupe [--file <path>]  — remove duplicate CAAMP injection blocks
 *
 * @task T1939
 * @epic T1929
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { defineCommand } from 'citty';
import { isSubCommandDispatch } from '../lib/subcommand-guard.js';
import { cliOutput, humanLine } from '../renderers/index.js';

/** cleo caamp dedupe — deduplicate accumulated CAAMP injection blocks */
const dedupeCommand = defineCommand({
  meta: {
    name: 'dedupe',
    description: 'Remove duplicate CAAMP injection blocks from AGENTS.md files',
  },
  args: {
    file: {
      type: 'string',
      description:
        'Path to a specific AGENTS.md file to deduplicate (default: all standard locations)',
    },
    'dry-run': {
      type: 'boolean',
      description: 'Preview what would be changed without writing',
      default: false,
    },
    json: {
      type: 'boolean',
      description: 'Output as JSON',
      default: false,
    },
  },
  async run({ args }) {
    const { dedupeFiles } = await import('@cleocode/caamp');

    // Resolve the list of files to process
    let filePaths: string[];

    if (args.file) {
      filePaths = [args.file];
    } else {
      // Default: cascade of standard AGENTS.md locations
      const home = homedir();
      filePaths = [
        join(home, '.agents', 'AGENTS.md'),
        // project-level AGENTS.md in cwd
        join(process.cwd(), 'AGENTS.md'),
      ];
    }

    if (args['dry-run']) {
      // Dry-run: parse and report without writing
      const { parseCaampBlocks } = await import('@cleocode/caamp');
      const { existsSync } = await import('node:fs');
      const { readFile } = await import('node:fs/promises');

      const dryResults: Array<{
        filePath: string;
        exists: boolean;
        blockCount: number;
        wouldRemove: number;
      }> = [];

      for (const filePath of filePaths) {
        if (!existsSync(filePath)) {
          dryResults.push({ filePath, exists: false, blockCount: 0, wouldRemove: 0 });
          continue;
        }
        const content = await readFile(filePath, 'utf-8');
        const blocks = parseCaampBlocks(content);
        const uniqueContents = new Set(blocks.map((b) => b.content));
        const wouldRemove = blocks.length - uniqueContents.size;
        dryResults.push({ filePath, exists: true, blockCount: blocks.length, wouldRemove });
      }

      cliOutput(
        { dryRun: true, files: dryResults },
        { command: 'caamp', operation: 'caamp.dedupe' },
      );
      return;
    }

    // Live run
    const results = await dedupeFiles(filePaths);

    const totalRemoved = results.reduce((n, r) => n + r.removed, 0);
    const filesModified = results.filter((r) => r.modified).length;

    cliOutput(
      {
        dryRun: false,
        filesProcessed: results.length,
        filesModified,
        totalRemoved,
        files: results,
      },
      { command: 'caamp', operation: 'caamp.dedupe' },
    );
  },
});

/**
 * `cleo caamp repair` — heal damaged CAAMP markers and collapse duplicate blocks
 * across the whole instruction-file cascade.
 *
 * This is the repair `cleo doctor` prescribes when it reports unbalanced or
 * damaged markers. Unlike `dedupe`, it covers the global hub
 * `~/.agents/AGENTS.md` and every detected provider's global instruction file,
 * not just the project — and it heals markers whose delimiters were damaged,
 * which the strict block pattern cannot even see.
 *
 * @task T12051
 */
const repairCommand = defineCommand({
  meta: {
    name: 'repair',
    description:
      'Heal damaged CAAMP markers and remove duplicate blocks across all instruction files',
  },
  args: {
    'dry-run': {
      type: 'boolean',
      description: 'Report what would change without writing',
      default: false,
    },
  },
  async run({ args }) {
    const { getInstalledProviders, instructionFileCascade, normalizeMarkers, parseBlocks } =
      await import('@cleocode/caamp');
    const { existsSync } = await import('node:fs');
    const { readFile } = await import('node:fs/promises');

    const providers = getInstalledProviders();
    const paths = instructionFileCascade(process.cwd(), providers).filter((p) => existsSync(p));

    if (args['dry-run']) {
      const preview: Array<{
        filePath: string;
        blocks: number;
        damagedMarkers: number;
        duplicateBlocks: number;
      }> = [];

      for (const filePath of paths) {
        const raw = await readFile(filePath, 'utf-8');
        const { content, repaired } = normalizeMarkers(raw);
        const blocks = parseBlocks(content);
        const distinct = new Set(blocks.map((b) => b.content)).size;
        preview.push({
          filePath,
          blocks: blocks.length,
          damagedMarkers: repaired,
          duplicateBlocks: blocks.length - distinct,
        });
      }

      cliOutput(
        {
          dryRun: true,
          filesScanned: preview.length,
          needsRepair: preview.filter((p) => p.damagedMarkers > 0 || p.duplicateBlocks > 0).length,
          files: preview,
        },
        { command: 'caamp', operation: 'caamp.repair' },
      );
      return;
    }

    const { repairInstructionFiles } = await import('@cleocode/caamp');
    const result = await repairInstructionFiles(process.cwd(), providers);

    cliOutput(
      {
        dryRun: false,
        filesScanned: result.files.length,
        filesModified: result.filesModified,
        markersHealed: result.repaired,
        duplicatesRemoved: result.removed,
        files: result.files,
      },
      { command: 'caamp', operation: 'caamp.repair' },
    );
  },
});

/**
 * Root caamp command group — CAAMP injection management.
 *
 * Provides utilities for managing CAAMP injection blocks in
 * provider instruction files (AGENTS.md, CLAUDE.md, etc.).
 *
 * @example
 * ```bash
 * cleo caamp repair
 * cleo caamp repair --dry-run
 * cleo caamp dedupe --file /home/user/.agents/AGENTS.md
 * ```
 *
 * @public
 */
export const caampCommand = defineCommand({
  meta: {
    name: 'caamp',
    description: 'CAAMP injection management: repair markers, deduplicate blocks',
  },
  subCommands: {
    dedupe: dedupeCommand,
    repair: repairCommand,
  },
  async run({ cmd, rawArgs }) {
    if (isSubCommandDispatch(rawArgs, cmd.subCommands)) return;
    // Default: show help
    humanLine('Usage: cleo caamp <subcommand>');
    humanLine('');
    humanLine('Subcommands:');
    humanLine('  repair   Heal damaged CAAMP markers and remove duplicate blocks');
    humanLine('  dedupe   Remove duplicate CAAMP injection blocks from AGENTS.md files');
  },
});
