import { describe, it, expect } from 'vitest';
import { parseArgs } from '../src/cli.js';
import {
  isGitRepository,
  getRepoRoot,
  getRelativeCwd,
  getGitStatus,
  getDiffInfo,
  hasStagedChanges,
  getLatestCommitInfo,
  getBranchSyncStatus,
} from '../src/git.js';
import { checkBridgeHealth } from '../src/modelhitch.js';
import { getGhCliStatus } from '../src/gh.js';

describe('CLI Argument Parser', () => {
  it('parses help flags', () => {
    expect(parseArgs(['node', 'diffnote', '--help']).help).toBe(true);
    expect(parseArgs(['node', 'diffnote', '-h']).help).toBe(true);
    expect(parseArgs(['node', 'diffnote', 'help']).help).toBe(true);
  });

  it('parses arg-help flags', () => {
    expect(parseArgs(['node', 'diffnote', '--arg-help']).argHelp).toBe(true);
    expect(parseArgs(['node', 'diffnote', 'help', 'args']).argHelp).toBe(true);
    expect(parseArgs(['node', 'diffnote', 'help', '--args']).argHelp).toBe(true);
  });

  it('parses execution flags', () => {
    const opts = parseArgs([
      'node',
      'diffnote',
      '--all',
      '--push',
      '--dry-run',
      '--raw',
      '--yes',
    ]);
    expect(opts.all).toBe(true);
    expect(opts.push).toBe(true);
    expect(opts.dryRun).toBe(true);
    expect(opts.raw).toBe(true);
    expect(opts.yes).toBe(true);
  });

  it('parses model and bridge flags', () => {
    const opts = parseArgs([
      'node',
      'diffnote',
      '--model',
      'big-pickle',
      '--bridge',
      'http://127.0.0.1:3939/v1',
      '--hint',
      'fix typo in docs',
    ]);
    expect(opts.model).toBe('big-pickle');
    expect(opts.bridge).toBe('http://127.0.0.1:3939/v1');
    expect(opts.hint).toBe('fix typo in docs');
  });

  it('parses equals syntax for options', () => {
    const opts = parseArgs([
      'node',
      'diffnote',
      '--model=qwen3.5-plus',
      '--bridge=http://localhost:3939/v1',
      '--hint=test message',
      '--cwd=.',
    ]);
    expect(opts.model).toBe('qwen3.5-plus');
    expect(opts.bridge).toBe('http://localhost:3939/v1');
    expect(opts.hint).toBe('test message');
  });

  it('parses amend, recent, and allow-empty flags', () => {
    const opts = parseArgs(['node', 'diffnote', '--amend', '--recent', '--allow-empty']);
    expect(opts.amend).toBe(true);
    expect(opts.recent).toBe(true);
    expect(opts.allowEmpty).toBe(true);

    const optsLast = parseArgs(['node', 'diffnote', '--last']);
    expect(optsLast.recent).toBe(true);
  });
});

describe('Git Scoped Utilities', () => {
  it('detects git repository', () => {
    expect(isGitRepository()).toBe(true);
  });

  it('identifies repo root and relative cwd', () => {
    const root = getRepoRoot();
    expect(root).toBeDefined();
    expect(root.length).toBeGreaterThan(0);

    const rel = getRelativeCwd();
    expect(rel).toBe('.');
  });

  it('gets git status scoped to CWD', () => {
    const status = getGitStatus();
    expect(status.isRepo).toBe(true);
    expect(status.branch).toBeDefined();
    expect(Array.isArray(status.stagedFiles)).toBe(true);
    expect(Array.isArray(status.unstagedFiles)).toBe(true);
  });

  it('gets diff info scoped to CWD', () => {
    const diff = getDiffInfo();
    expect(diff).toBeDefined();
    expect(typeof diff.activeDiff).toBe('string');
    expect(typeof diff.insertions).toBe('number');
    expect(typeof diff.deletions).toBe('number');
  });

  it('checks staged changes status', () => {
    const staged = hasStagedChanges();
    expect(typeof staged).toBe('boolean');
  });

  it('retrieves latest commit info', () => {
    const info = getLatestCommitInfo();
    expect(info).not.toBeNull();
    if (info) {
      expect(typeof info.hash).toBe('string');
      expect(typeof info.subject).toBe('string');
      expect(typeof info.author).toBe('string');
    }
  });

  it('checks branch sync status', () => {
    const sync = getBranchSyncStatus();
    expect(typeof sync.ahead).toBe('number');
    expect(typeof sync.behind).toBe('number');
    expect(typeof sync.hasUpstream).toBe('boolean');
  });
});

describe('ModelHitch Bridge Connectivity', () => {
  it('checks bridge health on localhost:3939', async () => {
    const health = await checkBridgeHealth('http://127.0.0.1:3939/v1');
    expect(health).toBeDefined();
    expect(typeof health.online).toBe('boolean');
    if (health.online) {
      expect(health.models.length).toBeGreaterThan(0);
      expect(health.defaultModel).toBeDefined();
    }
  });
});

describe('GitHub CLI Integration', () => {
  it('inspects gh CLI installation and status', () => {
    const status = getGhCliStatus();
    expect(typeof status.installed).toBe('boolean');
    if (status.installed) {
      expect(typeof status.version).toBe('string');
      expect(typeof status.authenticated).toBe('boolean');
    }
  });
});
