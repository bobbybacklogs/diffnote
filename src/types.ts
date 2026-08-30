export interface GitStatusResult {
  isRepo: boolean;
  repoRoot?: string;
  cwd: string;
  relativeCwd: string;
  branch: string;
  hasUpstream: boolean;
  upstreamBranch?: string;
  stagedFiles: string[];
  unstagedFiles: string[];
  untrackedFiles: string[];
  isClean: boolean;
  error?: string;
}

export interface GitDiffInfo {
  stagedDiff: string;
  unstagedDiff: string;
  activeDiff: string;
  diffType: 'staged' | 'unstaged' | 'recent';
  filesChanged: string[];
  insertions: number;
  deletions: number;
  truncated: boolean;
  originalSize: number;
}

export interface CommitSuggestion {
  title: string;
  body: string;
  fullMessage: string;
  type?: string;
  scope?: string;
}

export interface BridgeHealth {
  online: boolean;
  url: string;
  models: string[];
  defaultModel?: string;
  error?: string;
}

export interface GhCliStatus {
  installed: boolean;
  version?: string;
  authenticated: boolean;
  account?: string;
  repoUrl?: string;
}

export interface CliOptions {
  help: boolean;
  argHelp: boolean;
  version: boolean;
  status: boolean;
  cwd: string;
  staged: boolean;
  all: boolean;
  push: boolean;
  dryRun: boolean;
  raw: boolean;
  yes: boolean;
  recent?: boolean;
  amend?: boolean;
  allowEmpty?: boolean;
  model?: string;
  bridge?: string;
  provider?: string;
  hint?: string;
  command?: 'review' | 'commit' | 'push' | 'status' | 'help';
  subcommand?: string;
}
