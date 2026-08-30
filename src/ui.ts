import pc from 'picocolors';
import type { BridgeHealth, CommitSuggestion, GhCliStatus, GitDiffInfo, GitStatusResult } from './types.js';

export const VERSION = '1.0.0';

export function printBanner(): void {
  console.log();
  console.log(
    pc.cyan(pc.bold('  diffnote')) +
    pc.dim(` v${VERSION}`) +
    pc.dim('  —  AI Git Commit & Push ') +
    pc.magenta('(ModelHitch)')
  );
  console.log(pc.dim('  ' + '─'.repeat(54)));
}

export function printRepoContext(status: GitStatusResult, diffInfo: GitDiffInfo): void {
  console.log();
  const dirLabel = status.relativeCwd === '.' ? 'repo root' : status.relativeCwd;
  console.log(pc.bold('  Scoped Directory : ') + pc.cyan(`./${status.relativeCwd}`) + pc.dim(` (${dirLabel})`));
  console.log(pc.bold('  Active Branch    : ') + pc.green(status.branch) + (status.hasUpstream ? pc.dim(` → ${status.upstreamBranch}`) : pc.yellow(' (no upstream)')));

  const filesCount = diffInfo.filesChanged.length;
  const insertLabel = pc.green(`+${diffInfo.insertions}`);
  const deleteLabel = pc.red(`-${diffInfo.deletions}`);
  const typeLabel = diffInfo.diffType === 'staged' ? pc.green('staged') : diffInfo.diffType === 'unstaged' ? pc.yellow('unstaged') : pc.cyan('recent commit');

  console.log(
    pc.bold('  Detected Changes : ') +
    pc.bold(`${filesCount} file${filesCount === 1 ? '' : 's'}`) +
    pc.dim(' (') + insertLabel + pc.dim(', ') + deleteLabel + pc.dim(')') +
    pc.dim(' [') + typeLabel + pc.dim(']')
  );

  if (diffInfo.filesChanged.length > 0) {
    console.log();
    for (const file of diffInfo.filesChanged.slice(0, 8)) {
      console.log(pc.dim('    • ') + pc.white(file));
    }
    if (diffInfo.filesChanged.length > 8) {
      console.log(pc.dim(`    ... and ${diffInfo.filesChanged.length - 8} more files`));
    }
  }
}

export function printCommitBox(suggestion: CommitSuggestion): void {
  console.log();
  console.log(pc.cyan('  ┌─ Proposed Conventional Commit ────────────────────────────┐'));
  console.log(pc.cyan('  │'));
  console.log(pc.cyan('  │  ') + pc.bold(pc.white(suggestion.title)));

  if (suggestion.body) {
    console.log(pc.cyan('  │'));
    const bodyLines = suggestion.body.split('\n');
    for (const line of bodyLines) {
      console.log(pc.cyan('  │  ') + pc.dim(line));
    }
  }

  console.log(pc.cyan('  │'));
  console.log(pc.cyan('  └───────────────────────────────────────────────────────────┘'));
  console.log();
}

export function printHelp(): void {
  printBanner();
  console.log(`
${pc.bold('USAGE')}
  ${pc.cyan('$ diffnote')} ${pc.dim('[options]')}
  ${pc.cyan('$ diffnote')} ${pc.yellow('<command>')} ${pc.dim('[options]')}

${pc.bold('COMMANDS')}
  ${pc.yellow('review')}            Review scoped diff and generate commit message without committing
  ${pc.yellow('commit')}            Generate commit message and commit staged/unstaged changes
  ${pc.yellow('push')}              Generate commit message, commit, and push via GitHub CLI
  ${pc.yellow('status')}            Inspect Git repository, ModelHitch bridge, and GitHub CLI status
  ${pc.yellow('help')}              Show this general help or argument reference (${pc.cyan('diffnote help args')})

${pc.bold('KEY OPTIONS')}
  ${pc.cyan('-a, --all')}           Stage all changes in current working directory before committing
  ${pc.cyan('-s, --staged')}        Only inspect staged changes in current working directory
  ${pc.cyan('-p, --push')}          Automatically push to GitHub using GH CLI after committing
  ${pc.cyan('-d, --dry-run')}       Preview generated title & message without committing or pushing
  ${pc.cyan('-r, --raw')}           Output only the title & message (ideal for ${pc.dim('git commit -m "$(diffnote -r)"')})
  ${pc.cyan('-m, --model <name>')}  ModelHitch model name ${pc.dim('(default: bridge active model / big-pickle)')}
  ${pc.cyan('-b, --bridge <url>')}  ModelHitch bridge URL ${pc.dim('(default: http://127.0.0.1:3939/v1)')}
  ${pc.cyan('--cwd <path>')}        Target directory to scope changes ${pc.dim('(default: .)')}
  ${pc.cyan('--hint <text>')}       Provide custom guidance or intent to the AI
  ${pc.cyan('--arg-help')}          Display comprehensive deep-dive argument documentation
  ${pc.cyan('-h, --help')}          Display this help menu
  ${pc.cyan('-v, --version')}       Display version

${pc.bold('EXAMPLES')}
  ${pc.dim('# Interactive commit workflow for current directory:')}
  ${pc.cyan('$ diffnote')}

  ${pc.dim('# Stage all current directory changes and push via GitHub CLI:')}
  ${pc.cyan('$ diffnote --all --push')}

  ${pc.dim('# Preview AI-suggested commit message with a hint:')}
  ${pc.cyan('$ diffnote --dry-run --hint "refactor error handling in bridge client"')}

  ${pc.dim('# Check health of Git, ModelHitch bridge, and GitHub CLI:')}
  ${pc.cyan('$ diffnote status')}

  ${pc.dim('# View detailed argument reference:')}
  ${pc.cyan('$ diffnote --arg-help')}
`);
}

export function printArgHelp(): void {
  printBanner();
  console.log(`
${pc.bold(pc.yellow('ARGUMENT & CONFIGURATION REFERENCE'))}
${pc.dim('Detailed developer guide for every option, flag, and environment variable in diffnote.')}

${pc.bold('DIRECTORY SCOPING')}
  ${pc.cyan('--cwd <path>, -C <path>')}
    ${pc.bold('Type:')} string  |  ${pc.bold('Default:')} ${pc.dim('process.cwd()')}
    Specifies the directory to scope Git changes to. Diffnote restricts all status
    checks, diff calculations, staging, and commits to this directory path.
    ${pc.dim('Example: diffnote --cwd packages/cli')}

${pc.bold('GIT STAGING & DIFF SELECTION')}
  ${pc.cyan('-a, --all')}
    ${pc.bold('Type:')} boolean  |  ${pc.bold('Default:')} ${pc.dim('false')}
    Automatically stages all modified and untracked files strictly inside the
    current working directory (${pc.dim('git add .')}) prior to generating the commit message.
    ${pc.dim('Example: diffnote -a')}

  ${pc.cyan('-s, --staged')}
    ${pc.bold('Type:')} boolean  |  ${pc.bold('Default:')} ${pc.dim('false')}
    Restricts diffnote to only inspect changes that are already staged inside
    the current working directory (${pc.dim('git diff --cached -- .')}).
    ${pc.dim('Example: diffnote --staged')}

${pc.bold('EXECUTION & AUTOMATION')}
  ${pc.cyan('-p, --push')}
    ${pc.bold('Type:')} boolean  |  ${pc.bold('Default:')} ${pc.dim('false')}
    After a successful commit, automatically invokes the GitHub CLI (${pc.dim('gh')}) and
    Git to push the current branch to GitHub. If the branch has no upstream remote,
    diffnote configures ${pc.dim('-u origin <branch>')} automatically.
    ${pc.dim('Example: diffnote -a -p')}

  ${pc.cyan('-d, --dry-run')}
    ${pc.bold('Type:')} boolean  |  ${pc.bold('Default:')} ${pc.dim('false')}
    Runs the full ModelHitch analysis and displays the proposed commit title and body,
    without staging any files, making any Git commits, or performing any pushes.
    ${pc.dim('Example: diffnote --dry-run')}

  ${pc.cyan('-r, --raw')}
    ${pc.bold('Type:')} boolean  |  ${pc.bold('Default:')} ${pc.dim('false')}
    Suppresses all decorative banners, boxes, and interactive menus, printing
    only the plain-text commit title and body.
    ${pc.dim('Example: git commit -m "$(diffnote --raw)"')}

  ${pc.cyan('-y, --yes')}
    ${pc.bold('Type:')} boolean  |  ${pc.bold('Default:')} ${pc.dim('false')}
    Automatically confirms the commit prompt non-interactively. Useful in CI/CD
    or custom developer automation scripts.
    ${pc.dim('Example: diffnote -a -y')}

${pc.bold('MODELHITCH & AI ROUTING')}
  ${pc.cyan('-b, --bridge <url>')}
    ${pc.bold('Type:')} string  |  ${pc.bold('Default:')} ${pc.dim('http://127.0.0.1:3939/v1')}
    ${pc.bold('Env:')}  ${pc.dim('DIFFNOTE_BRIDGE_URL')}, ${pc.dim('MODELHITCH_BRIDGE_URL')}
    URL of the ModelHitch bridge. Diffnote routes all LLM requests through the local
    bridge by default, taking advantage of local routing, zero-cost keys, and failover.
    ${pc.dim('Example: diffnote --bridge http://127.0.0.1:3939/v1')}

  ${pc.cyan('-m, --model <name>')}
    ${pc.bold('Type:')} string  |  ${pc.bold('Default:')} ${pc.dim('bridge default (e.g. big-pickle)')}
    ${pc.bold('Env:')}  ${pc.dim('DIFFNOTE_MODEL')}
    Specifies the model ID to route through ModelHitch. Compatible with any model
    advertised by your ModelHitch bridge or providers.
    ${pc.dim('Example: diffnote -m big-pickle')}

  ${pc.cyan('--provider <name>')}
    ${pc.bold('Type:')} string  |  ${pc.bold('Default:')} ${pc.dim('bridge')}
    Direct ModelHitch provider override (${pc.dim('opencode-zen')}, ${pc.dim('openai')}, ${pc.dim('anthropic')}, ${pc.dim('openrouter')}).
    ${pc.dim('Example: diffnote --provider opencode-zen -m big-pickle')}

  ${pc.cyan('--hint <text>')}
    ${pc.bold('Type:')} string
    Adds user context, intent, or issue reference to guide the AI commit drafting.
    ${pc.dim('Example: diffnote --hint "closes issue #42, refactored token caching"')}

${pc.bold('DIAGNOSTICS & HELP')}
  ${pc.cyan('--status')}
    Runs an interactive health audit on:
      1. Git repo root, scoped directory, branch, and status
      2. ModelHitch bridge connectivity and model catalog
      3. GitHub CLI (${pc.dim('gh')}) installation and authentication
    ${pc.dim('Example: diffnote --status')}

  ${pc.cyan('--arg-help')}
    Displays this detailed argument and flag reference manual.

  ${pc.cyan('-h, --help')}
    Displays the standard command overview and quickstart examples.
`);
}

export function printStatusDashboard(
  status: GitStatusResult,
  diffInfo: GitDiffInfo,
  bridge: BridgeHealth,
  gh: GhCliStatus
): void {
  printBanner();
  console.log(pc.bold(pc.white('\n  SYSTEM & INTEGRATION HEALTH DASHBOARD')));
  console.log(pc.dim('  ' + '─'.repeat(54)));

  // Git section
  console.log(pc.bold('\n  [1] Git Repository Status'));
  if (status.isRepo) {
    console.log(pc.green('    ✓ Repository Root   : ') + pc.white(status.repoRoot || ''));
    console.log(pc.green('    ✓ Scoped Directory  : ') + pc.cyan(status.relativeCwd === '.' ? './ (root)' : `./${status.relativeCwd}`));
    console.log(pc.green('    ✓ Current Branch    : ') + pc.white(status.branch) + (status.hasUpstream ? pc.dim(` (upstream: ${status.upstreamBranch})`) : pc.yellow(' (no upstream)')));
    console.log(pc.green('    ✓ Scoped Changes    : ') + pc.white(`${diffInfo.filesChanged.length} file(s) `) + pc.dim(`(+${diffInfo.insertions}, -${diffInfo.deletions})`));
  } else {
    console.log(pc.red('    ✗ Not inside a Git repository!'));
  }

  // ModelHitch section
  console.log(pc.bold('\n  [2] ModelHitch AI Bridge'));
  if (bridge.online) {
    console.log(pc.green('    ✓ Bridge Connection : ') + pc.green('ONLINE') + pc.dim(` at ${bridge.url}`));
    console.log(pc.green('    ✓ Active Model      : ') + pc.cyan(bridge.defaultModel || 'big-pickle'));
    console.log(pc.green('    ✓ Available Models  : ') + pc.white(`${bridge.models.length} model(s) advertised`));
  } else {
    console.log(pc.red('    ✗ Bridge Connection : ') + pc.red('OFFLINE') + pc.dim(` (${bridge.url})`));
    console.log(pc.yellow('      Start bridge with : ') + pc.cyan('npx modelhitch bridge --background'));
  }

  // GitHub CLI section
  console.log(pc.bold('\n  [3] GitHub CLI (gh) Integration'));
  if (gh.installed) {
    console.log(pc.green('    ✓ GitHub CLI (gh)   : ') + pc.white(`Installed (v${gh.version || 'unknown'})`));
    if (gh.authenticated) {
      console.log(pc.green('    ✓ GH Auth Status    : ') + pc.green(`Logged in as ${gh.account || 'authorized user'}`));
    } else {
      console.log(pc.yellow('    ! GH Auth Status    : ') + pc.yellow('Not logged in (run "gh auth login")'));
    }
    if (gh.repoUrl) {
      console.log(pc.green('    ✓ GitHub Repo       : ') + pc.cyan(gh.repoUrl));
    }
  } else {
    console.log(pc.yellow('    ! GitHub CLI (gh)   : ') + pc.yellow('Not found on PATH (git push fallback active)'));
  }
  console.log();
}
