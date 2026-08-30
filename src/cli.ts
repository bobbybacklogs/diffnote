#!/usr/bin/env node
import path from 'node:path';
import pc from 'picocolors';
import { input, select, confirm } from '@inquirer/prompts';
import {
  commitChanges,
  getBranchSyncStatus,
  getDiffInfo,
  getGitStatus,
  getLatestCommitInfo,
  hasStagedChanges,
  isGitRepository,
  stageAllInCwd,
} from './git.js';
import { checkBridgeHealth, generateCommitSuggestion } from './modelhitch.js';
import { getGhCliStatus, pushToGitHub } from './gh.js';
import {
  VERSION,
  printArgHelp,
  printBanner,
  printCommitBox,
  printHelp,
  printRepoContext,
  printStatusDashboard,
} from './ui.js';
import type { CliOptions, CommitSuggestion } from './types.js';

/** Parse command line arguments */
export function parseArgs(rawArgs: string[]): CliOptions {
  const args = rawArgs.slice(2);
  const options: CliOptions = {
    help: false,
    argHelp: false,
    version: false,
    status: false,
    cwd: process.cwd(),
    staged: false,
    all: false,
    push: false,
    dryRun: false,
    raw: false,
    yes: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--arg-help') {
      options.argHelp = true;
    } else if (arg === 'help') {
      const next = args[i + 1];
      if (next === 'args' || next === '--args') {
        options.argHelp = true;
        i++;
      } else {
        options.help = true;
      }
    } else if (arg === '--version' || arg === '-v') {
      options.version = true;
    } else if (arg === 'status' || arg === '--status') {
      options.status = true;
    } else if (arg === 'review') {
      options.dryRun = true;
    } else if (arg === 'commit') {
      options.command = 'commit';
    } else if (arg === 'push') {
      options.push = true;
    } else if (arg === '--all' || arg === '-a') {
      options.all = true;
    } else if (arg === '--staged' || arg === '-s') {
      options.staged = true;
    } else if (arg === '--push' || arg === '-p') {
      options.push = true;
    } else if (arg === '--dry-run' || arg === '-d') {
      options.dryRun = true;
    } else if (arg === '--raw' || arg === '-r') {
      options.raw = true;
    } else if (arg === '--yes' || arg === '-y') {
      options.yes = true;
    } else if (arg === '--amend') {
      options.amend = true;
    } else if (arg === '--recent' || arg === '--last') {
      options.recent = true;
    } else if (arg === '--allow-empty') {
      options.allowEmpty = true;
    } else if (arg === '--model' || arg === '-m') {
      options.model = args[++i];
    } else if (arg.startsWith('--model=')) {
      options.model = arg.slice(8);
    } else if (arg === '--bridge' || arg === '-b') {
      options.bridge = args[++i];
    } else if (arg.startsWith('--bridge=')) {
      options.bridge = arg.slice(9);
    } else if (arg === '--provider') {
      options.provider = args[++i];
    } else if (arg.startsWith('--provider=')) {
      options.provider = arg.slice(11);
    } else if (arg === '--hint') {
      options.hint = args[++i];
    } else if (arg.startsWith('--hint=')) {
      options.hint = arg.slice(7);
    } else if (arg === '--cwd' || arg === '-C') {
      const targetPath = args[++i];
      if (targetPath) options.cwd = path.resolve(process.cwd(), targetPath);
    } else if (arg.startsWith('--cwd=')) {
      options.cwd = path.resolve(process.cwd(), arg.slice(6));
    }
  }

  return options;
}

export async function runCli(): Promise<void> {
  const options = parseArgs(process.argv);

  if (options.version) {
    console.log(`diffnote v${VERSION}`);
    return;
  }

  if (options.argHelp) {
    printArgHelp();
    return;
  }

  if (options.help) {
    printHelp();
    return;
  }

  const cwd = options.cwd;

  if (!isGitRepository(cwd)) {
    console.error(pc.red('\n  Error: Not inside a Git repository!'));
    console.error(pc.dim(`  Current target directory: ${cwd}`));
    console.error(pc.yellow('  Run "git init" or navigate to an initialized git project.\n'));
    process.exit(1);
  }

  const gitStatus = getGitStatus(cwd);

  if (options.status) {
    const diffInfo = getDiffInfo(cwd, options.staged, true);
    const bridgeHealth = await checkBridgeHealth(options.bridge);
    const ghStatus = getGhCliStatus(cwd);
    printStatusDashboard(gitStatus, diffInfo, bridgeHealth, ghStatus);
    return;
  }

  // If working tree is clean and user didn't request --recent or --amend
  if (gitStatus.isClean && !options.recent && !options.amend) {
    if (options.command === 'push' || options.push) {
      const sync = getBranchSyncStatus(cwd);
      if (sync.ahead > 0) {
        if (!options.raw) {
          printBanner();
          console.log(pc.cyan(`\n  ⏳ Pushing ${sync.ahead} unpushed commit(s) on ${gitStatus.branch} to GitHub...`));
        }
        const pushResult = pushToGitHub(cwd, gitStatus.branch, !gitStatus.hasUpstream);
        if (pushResult.success) {
          console.log(pc.green('  ✓ Pushed successfully to GitHub!'));
          if (pushResult.commitUrl) {
            console.log(pc.bold('    Commit URL : ') + pc.cyan(pushResult.commitUrl));
          }
        } else {
          console.error(pc.red(`  ✗ Push failed:\n    ${pushResult.output}`));
        }
        return;
      } else {
        if (!options.raw) {
          printBanner();
          console.log(pc.green(`\n  ✓ Working directory is clean and up to date on ${gitStatus.branch}.`));
          console.log(pc.dim('  No uncommitted changes and no unpushed commits.\n'));
        }
        return;
      }
    }

    if (!options.raw) {
      printBanner();
      const latest = getLatestCommitInfo(cwd);
      console.log(pc.green(`\n  ✓ Working tree is clean in ./${gitStatus.relativeCwd} (no uncommitted changes).`));
      if (latest) {
        console.log(pc.dim(`  Latest commit : `) + pc.cyan(latest.hash) + pc.dim(` — ${latest.subject} (${latest.author})`));
      }
      const sync = getBranchSyncStatus(cwd);
      if (sync.ahead > 0) {
        console.log(pc.yellow(`  Branch status : ${sync.ahead} commit(s) ahead of remote (run "diffnote push" to push).`));
      }

      console.log(pc.bold('\n  Options:'));
      console.log(pc.dim('  • Make changes to files in this directory to draft a new commit.'));
      console.log(pc.dim('  • Run ') + pc.cyan('diffnote review --recent') + pc.dim(' to inspect your latest commit.'));
      console.log(pc.dim('  • Run ') + pc.cyan('diffnote --amend') + pc.dim(' to regenerate or amend the latest commit.'));
      console.log(pc.dim('  • Run ') + pc.cyan('diffnote push') + pc.dim(' to push commits to GitHub.'));
      console.log(pc.dim('  • Run ') + pc.cyan('diffnote status') + pc.dim(' for full diagnostics.\n'));
    }
    return;
  }

  let diffInfo = getDiffInfo(cwd, options.staged, options.recent || options.amend);

  // Handle stage all flag
  if (options.all) {
    stageAllInCwd(cwd);
    diffInfo = getDiffInfo(cwd, true, options.recent || options.amend);
  }

  // Check if working tree inside cwd has any changes
  if (diffInfo.filesChanged.length === 0 && diffInfo.activeDiff.length === 0) {
    if (!options.raw) {
      printBanner();
      console.log(pc.yellow('\n  No changes detected in current working directory.'));
      console.log(pc.dim(`  Scoped path: ./${gitStatus.relativeCwd}`));
      console.log(pc.dim('  Edit some files or run "git status" to inspect your repository.\n'));
    }
    return;
  }

  // If unstaged changes exist and nothing is staged, ask user interactively if they want to stage all
  if (
    !options.raw &&
    !options.staged &&
    !options.all &&
    gitStatus.stagedFiles.length === 0 &&
    (gitStatus.unstagedFiles.length > 0 || gitStatus.untrackedFiles.length > 0)
  ) {
    if (!options.yes && !options.dryRun) {
      printBanner();
      printRepoContext(gitStatus, diffInfo);

      try {
        const action = await select({
          message: 'No staged changes found. What would you like to do?',
          choices: [
            {
              name: `Stage all changes in this directory (${pc.dim('git add .')}) and draft commit`,
              value: 'stage_all',
            },
            {
              name: `Inspect unstaged changes without staging yet`,
              value: 'inspect_unstaged',
            },
            {
              name: 'Cancel',
              value: 'cancel',
            },
          ],
        });

        if (action === 'cancel') {
          console.log(pc.dim('Operation cancelled.\n'));
          return;
        }

        if (action === 'stage_all') {
          stageAllInCwd(cwd);
          diffInfo = getDiffInfo(cwd, true);
          options.staged = true;
        }
      } catch {
        // Prompt cancelled
        return;
      }
    }
  }

  if (!options.raw) {
    if (!gitStatus.stagedFiles.length && !options.all) {
      // Printed earlier if prompt was shown, otherwise print context
      printBanner();
      printRepoContext(gitStatus, diffInfo);
    }
    process.stdout.write(pc.cyan('  ⏳ Drafting commit title and message with ModelHitch...'));
  }

  let suggestion: CommitSuggestion;
  try {
    suggestion = await generateCommitSuggestion({
      diffInfo,
      relativeCwd: gitStatus.relativeCwd,
      hint: options.hint,
      bridgeUrl: options.bridge,
      model: options.model,
      provider: options.provider,
    });
    if (!options.raw) {
      process.stdout.write('\r' + ' '.repeat(65) + '\r');
    }
  } catch (error: any) {
    if (!options.raw) {
      process.stdout.write('\r' + ' '.repeat(65) + '\r');
    }
    console.error(pc.red(`\n  ModelHitch Error: ${error.message}\n`));
    process.exit(1);
  }

  // Raw output mode for scripting / shell usage
  if (options.raw) {
    console.log(suggestion.fullMessage);
    return;
  }

  // Display the generated commit box
  printCommitBox(suggestion);

  // If dry-run, stop here
  if (options.dryRun) {
    console.log(pc.dim('  [Dry run active — no changes staged, committed, or pushed.]\n'));
    return;
  }

  // If -y/--yes was passed, commit immediately
  let doCommit = options.yes;
  let finalTitle = suggestion.title;
  let finalBody = suggestion.body;

  while (!doCommit) {
    try {
      const isAmendMode = options.amend || diffInfo.diffType === 'recent';
      const choice = await select({
        message: 'How would you like to proceed?',
        choices: [
          {
            name: isAmendMode
              ? `Amend latest commit with this message (${pc.dim('git commit --amend')})`
              : `Commit changes with this message`,
            value: 'commit',
          },
          {
            name: `Edit commit title and body`,
            value: 'edit',
          },
          {
            name: `Regenerate with additional guidance / hint`,
            value: 'regenerate',
          },
          {
            name: `View scoped diff`,
            value: 'diff',
          },
          {
            name: `Cancel and exit`,
            value: 'cancel',
          },
        ],
      });

      if (choice === 'commit') {
        if (isAmendMode) {
          options.amend = true;
        }
        doCommit = true;
        break;
      }

      if (choice === 'cancel') {
        console.log(pc.dim('\n  Commit aborted.\n'));
        return;
      }

      if (choice === 'diff') {
        console.log(pc.dim('\n  ─── Scoped Git Diff ──────────────────────────────────────'));
        console.log(diffInfo.activeDiff);
        console.log(pc.dim('  ──────────────────────────────────────────────────────────\n'));
        printCommitBox({ title: finalTitle, body: finalBody, fullMessage: `${finalTitle}\n\n${finalBody}` });
        continue;
      }

      if (choice === 'edit') {
        finalTitle = await input({
          message: 'Commit title:',
          default: finalTitle,
        });

        finalBody = await input({
          message: 'Commit body (optional):',
          default: finalBody,
        });

        suggestion = {
          title: finalTitle,
          body: finalBody,
          fullMessage: finalBody ? `${finalTitle}\n\n${finalBody}` : finalTitle,
        };
        printCommitBox(suggestion);
        continue;
      }

      if (choice === 'regenerate') {
        const extraHint = await input({
          message: 'Enter guidance or intent for the next draft:',
          default: options.hint || '',
        });

        process.stdout.write(pc.cyan('  ⏳ Regenerating with ModelHitch...'));
        suggestion = await generateCommitSuggestion({
          diffInfo,
          relativeCwd: gitStatus.relativeCwd,
          hint: extraHint,
          bridgeUrl: options.bridge,
          model: options.model,
          provider: options.provider,
        });
        process.stdout.write('\r' + ' '.repeat(45) + '\r');
        finalTitle = suggestion.title;
        finalBody = suggestion.body;
        printCommitBox(suggestion);
        continue;
      }
    } catch {
      console.log(pc.dim('\n  Interrupted.\n'));
      return;
    }
  }

  // Ensure changes are staged before committing
  if (!options.amend && !hasStagedChanges(cwd)) {
    stageAllInCwd(cwd);
  }

  // Guard against committing when nothing is staged
  if (!options.amend && !options.allowEmpty && !hasStagedChanges(cwd)) {
    console.log(pc.yellow('\n  Notice: No staged changes found in this directory to commit.'));
    console.log(pc.dim('  Ensure your modified files are inside this directory and not ignored by .gitignore.\n'));
    return;
  }

  const commitMsg = finalBody ? `${finalTitle}\n\n${finalBody}` : finalTitle;
  const commitResult = commitChanges(commitMsg, cwd, {
    amend: options.amend,
    allowEmpty: options.allowEmpty,
  });

  if (!commitResult.success) {
    console.error(pc.red(`\n  Commit failed: ${commitResult.error}\n`));
    process.exit(1);
  }

  console.log(
    pc.green(options.amend ? '  ✓ Amended successfully: ' : '  ✓ Committed successfully: ') +
    pc.cyan(commitResult.hash || 'HEAD') +
    pc.dim(` "${finalTitle}"`)
  );

  // Push flow: either auto-push via --push or ask interactively
  let doPush = options.push;

  if (!doPush) {
    const ghInfo = getGhCliStatus(cwd);
    const ghLabel = ghInfo.installed ? 'GH CLI / Git' : 'Git';
    try {
      doPush = await confirm({
        message: `Would you like to push this commit to GitHub using ${ghLabel}?`,
        default: true,
      });
    } catch {
      doPush = false;
    }
  }

  if (doPush) {
    process.stdout.write(pc.cyan('  ⏳ Pushing branch to GitHub...'));
    const pushResult = pushToGitHub(cwd, gitStatus.branch, !gitStatus.hasUpstream);
    process.stdout.write('\r' + ' '.repeat(45) + '\r');

    if (pushResult.success) {
      console.log(pc.green('  ✓ Pushed successfully to GitHub!'));
      if (pushResult.commitUrl) {
        console.log(pc.bold('    Commit URL : ') + pc.cyan(pushResult.commitUrl));
      }
    } else {
      console.error(pc.red(`  ✗ Push failed:\n    ${pushResult.output}`));
      console.log(pc.yellow('\n  You can manually push using: ') + pc.cyan(`git push origin ${gitStatus.branch}`));
    }
  } else {
    console.log(pc.dim(`\n  Ready to push when you are: git push origin ${gitStatus.branch}`));
  }

  console.log();
}

// Direct execution guard
const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('diffnote') ||
  process.argv[1]?.endsWith('cli.js') ||
  process.argv[1]?.endsWith('cli.ts');

if (isDirectRun) {
  runCli().catch((err) => {
    console.error(pc.red(`Unexpected error: ${err.message}`));
    process.exit(1);
  });
}
