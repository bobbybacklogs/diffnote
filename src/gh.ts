import { execSync, spawnSync } from 'node:child_process';
import type { GhCliStatus } from './types.js';

/** Check if GitHub CLI (gh) is available on PATH and authenticated */
export function getGhCliStatus(cwd: string = process.cwd()): GhCliStatus {
  let installed = false;
  let version: string | undefined;
  let authenticated = false;
  let account: string | undefined;
  let repoUrl: string | undefined;

  try {
    const versionOutput = execSync('gh --version', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    installed = true;
    const match = versionOutput.match(/gh version ([\d.]+)/);
    version = match ? match[1] : undefined;
  } catch {
    return { installed: false, authenticated: false };
  }

  try {
    const authOutput = execSync('gh auth status', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    authenticated = true;
    const userMatch = authOutput.match(/Logged in to [^\s]+ account ([^\s(]+)/);
    if (userMatch) account = userMatch[1];
  } catch (error: any) {
    const combined = (error.stdout?.toString() || '') + (error.stderr?.toString() || '');
    if (combined.includes('Logged in to')) {
      authenticated = true;
      const userMatch = combined.match(/Logged in to [^\s]+ account ([^\s(]+)/);
      if (userMatch) account = userMatch[1];
    } else {
      authenticated = false;
    }
  }

  try {
    const repoOutput = execSync('gh repo view --json url', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(repoOutput.trim());
    if (parsed.url) repoUrl = parsed.url;
  } catch {
    // Not fatal if repo view fails
  }

  return {
    installed,
    version,
    authenticated,
    account,
    repoUrl,
  };
}

/** Push changes using Git & GitHub CLI helpers */
export function pushToGitHub(
  cwd: string = process.cwd(),
  branch: string = 'main',
  setUpstream: boolean = false
): { success: boolean; output: string; commitUrl?: string } {
  try {
    const args = ['push'];
    if (setUpstream) {
      args.push('-u', 'origin', branch);
    }

    const pushResult = execSync(`git ${args.join(' ')}`, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let commitUrl: string | undefined;
    try {
      const ghInfo = getGhCliStatus(cwd);
      if (ghInfo.repoUrl) {
        const hash = execSync('git rev-parse HEAD', { cwd, encoding: 'utf8' }).trim();
        commitUrl = `${ghInfo.repoUrl}/commit/${hash}`;
      }
    } catch {
      // Ignore URL computation failure
    }

    return {
      success: true,
      output: pushResult.trim() || 'Pushed successfully',
      commitUrl,
    };
  } catch (error: any) {
    const err = error.stderr?.toString() || error.message || 'Push failed';
    return {
      success: false,
      output: err.trim(),
    };
  }
}

/** Create a GitHub Pull Request using gh pr create */
export function createPullRequest(
  title: string,
  body: string,
  cwd: string = process.cwd()
): { success: boolean; url?: string; error?: string } {
  try {
    const res = spawnSync('gh', ['pr', 'create', '--title', title, '--body', body], {
      cwd,
      encoding: 'utf8',
    });

    if (res.status === 0) {
      const output = res.stdout.trim();
      return { success: true, url: output };
    } else {
      return { success: false, error: res.stderr || res.stdout || 'PR creation failed' };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
