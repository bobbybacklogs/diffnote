import { execSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import type { GitDiffInfo, GitStatusResult } from './types.js';

/** Max characters of git diff to send to LLM to prevent context bloat */
const MAX_DIFF_CHARS = 28000;

/** Execute git command with stdout captured */
function runGit(args: string[], cwd: string): string {
  try {
    const result = execSync(`git ${args.join(' ')}`, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    });
    return result.trim();
  } catch (error: any) {
    const stderr = error.stderr?.toString() || error.message || '';
    throw new Error(stderr.trim() || 'Git execution failed');
  }
}

/** Check if current directory is inside a git repository */
export function isGitRepository(cwd: string = process.cwd()): boolean {
  try {
    const res = runGit(['rev-parse', '--is-inside-work-tree'], cwd);
    return res === 'true';
  } catch {
    return false;
  }
}

/** Get top-level repository root directory */
export function getRepoRoot(cwd: string = process.cwd()): string {
  return runGit(['rev-parse', '--show-toplevel'], cwd);
}

/** Get the relative path of cwd from repository root */
export function getRelativeCwd(cwd: string = process.cwd()): string {
  try {
    const root = getRepoRoot(cwd);
    const rel = path.relative(root, cwd);
    return rel === '' ? '.' : rel.split(path.sep).join('/');
  } catch {
    return '.';
  }
}

/** Get git status strictly scoped to the current working directory */
export function getGitStatus(cwd: string = process.cwd()): GitStatusResult {
  if (!isGitRepository(cwd)) {
    return {
      isRepo: false,
      cwd,
      relativeCwd: '.',
      branch: '',
      hasUpstream: false,
      stagedFiles: [],
      unstagedFiles: [],
      untrackedFiles: [],
      isClean: true,
      error: 'Not a git repository (or any parent up to mount point)',
    };
  }

  const repoRoot = getRepoRoot(cwd);
  const relativeCwd = getRelativeCwd(cwd);

  let branch = '';
  try {
    branch = runGit(['branch', '--show-current'], cwd) || runGit(['rev-parse', '--short', 'HEAD'], cwd);
  } catch {
    branch = 'main';
  }

  let hasUpstream = false;
  let upstreamBranch: string | undefined;
  try {
    upstreamBranch = runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], cwd);
    hasUpstream = !!upstreamBranch;
  } catch {
    hasUpstream = false;
  }

  // Scoped porcelain status strictly inside current working directory: git status --porcelain -u .
  let porcelain = '';
  try {
    porcelain = runGit(['status', '--porcelain', '-u', '.'], cwd);
  } catch {
    porcelain = '';
  }

  const stagedFiles: string[] = [];
  const unstagedFiles: string[] = [];
  const untrackedFiles: string[] = [];

  if (porcelain) {
    const lines = porcelain.split('\n');
    for (const line of lines) {
      if (!line) continue;
      const x = line[0];
      const y = line[1];
      const filePath = line.slice(3).trim();

      if (x === '?' && y === '?') {
        untrackedFiles.push(filePath);
      } else {
        if (x !== ' ' && x !== '?') {
          stagedFiles.push(filePath);
        }
        if (y !== ' ' && y !== '?') {
          unstagedFiles.push(filePath);
        }
      }
    }
  }

  const isClean = stagedFiles.length === 0 && unstagedFiles.length === 0 && untrackedFiles.length === 0;

  return {
    isRepo: true,
    repoRoot,
    cwd,
    relativeCwd,
    branch,
    hasUpstream,
    upstreamBranch,
    stagedFiles,
    unstagedFiles,
    untrackedFiles,
    isClean,
  };
}

/** Get git diff scoped strictly to the current working directory */
export function getDiffInfo(cwd: string = process.cwd(), forceStaged = false): GitDiffInfo {
  // Staged diff strictly inside cwd: git diff --cached -- .
  let stagedDiff = '';
  try {
    stagedDiff = runGit(['diff', '--cached', '--', '.'], cwd);
  } catch {
    stagedDiff = '';
  }

  // Unstaged diff strictly inside cwd: git diff -- .
  let unstagedDiff = '';
  try {
    unstagedDiff = runGit(['diff', '--', '.'], cwd);
  } catch {
    unstagedDiff = '';
  }

  let activeDiff = '';
  let diffType: 'staged' | 'unstaged' | 'recent' = 'staged';

  if (forceStaged) {
    activeDiff = stagedDiff;
    diffType = 'staged';
  } else if (stagedDiff.trim().length > 0) {
    activeDiff = stagedDiff;
    diffType = 'staged';
  } else if (unstagedDiff.trim().length > 0) {
    activeDiff = unstagedDiff;
    diffType = 'unstaged';
  } else {
    // If working tree has no diff, check recent commit changes scoped to cwd
    try {
      const recent = runGit(['diff', 'HEAD~1..HEAD', '--', '.'], cwd);
      if (recent.trim().length > 0) {
        activeDiff = recent;
        diffType = 'recent';
      }
    } catch {
      activeDiff = '';
    }
  }

  // Also include content of small untracked text files if unstaged
  if (diffType === 'unstaged' || stagedDiff.trim().length === 0) {
    try {
      const untracked = runGit(['ls-files', '--others', '--exclude-standard', '--', '.'], cwd);
      if (untracked.trim().length > 0) {
        const files = untracked.split('\n').filter(Boolean);
        const untrackedDiffs: string[] = [];
        for (const file of files.slice(0, 10)) {
          const fullPath = path.resolve(cwd, file);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isFile() && stat.size < 50000) {
              const content = fs.readFileSync(fullPath, 'utf8');
              untrackedDiffs.push(`--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${content.split('\n').length} @@\n${content.split('\n').map(l => `+${l}`).join('\n')}`);
            } else if (stat.isFile()) {
              untrackedDiffs.push(`--- /dev/null\n+++ b/${file} [New large file: ${stat.size} bytes]`);
            }
          } catch {
            // Ignore unreadable or binary file
          }
        }
        if (untrackedDiffs.length > 0) {
          activeDiff = activeDiff ? `${activeDiff}\n\n${untrackedDiffs.join('\n\n')}` : untrackedDiffs.join('\n\n');
        }
      }
    } catch {
      // Ignore untracked detection error
    }
  }

  // Collect files changed and stat summary
  const filesChangedSet = new Set<string>();
  let insertions = 0;
  let deletions = 0;

  const lines = activeDiff.split('\n');
  for (const line of lines) {
    if (line.startsWith('+++ b/')) {
      const f = line.slice(6).trim();
      if (f && f !== 'dev/null') filesChangedSet.add(f);
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      insertions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
    }
  }

  const originalSize = activeDiff.length;
  let truncated = false;

  if (activeDiff.length > MAX_DIFF_CHARS) {
    activeDiff = activeDiff.slice(0, MAX_DIFF_CHARS) + `\n\n... [Diff truncated: total ${originalSize} characters across ${filesChangedSet.size} files in current directory]`;
    truncated = true;
  }

  return {
    stagedDiff,
    unstagedDiff,
    activeDiff,
    diffType,
    filesChanged: Array.from(filesChangedSet),
    insertions,
    deletions,
    truncated,
    originalSize,
  };
}

/** Stage all changes strictly inside current working directory */
export function stageAllInCwd(cwd: string = process.cwd()): void {
  runGit(['add', '.'], cwd);
}

/** Stage specific files in cwd */
export function stageFilesInCwd(files: string[], cwd: string = process.cwd()): void {
  if (files.length === 0) return;
  runGit(['add', '--', ...files], cwd);
}

/** Create git commit */
export function commitChanges(message: string, cwd: string = process.cwd()): { success: boolean; hash?: string; error?: string } {
  try {
    // Write message to temporary file or pass via -m
    const res = spawnSync('git', ['commit', '-m', message], {
      cwd,
      encoding: 'utf8',
    });

    if (res.status === 0) {
      const hash = runGit(['rev-parse', '--short', 'HEAD'], cwd);
      return { success: true, hash };
    } else {
      return { success: false, error: res.stderr || res.stdout || 'Commit failed' };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/** Push current branch using git */
export function gitPush(cwd: string = process.cwd(), setUpstream = false): { success: boolean; output: string } {
  try {
    const branch = runGit(['branch', '--show-current'], cwd);
    const args = ['push'];
    if (setUpstream) {
      args.push('-u', 'origin', branch);
    }
    const result = execSync(`git ${args.join(' ')}`, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { success: true, output: result.trim() };
  } catch (error: any) {
    const err = error.stderr?.toString() || error.message || 'Push failed';
    return { success: false, output: err.trim() };
  }
}
