import {
  ModelHitch,
  createOpenAICompatibleProvider,
  defaultProviders,
} from 'modelhitch';
import type { BridgeHealth, CommitSuggestion, GitDiffInfo } from './types.js';

export const DEFAULT_BRIDGE_URL =
  process.env.DIFFNOTE_BRIDGE_URL ||
  process.env.MODELHITCH_BRIDGE_URL ||
  'http://127.0.0.1:3939/v1';

export const DEFAULT_MODEL =
  process.env.DIFFNOTE_MODEL ||
  'big-pickle';

/** Check if the local or configured ModelHitch bridge is accessible */
export async function checkBridgeHealth(bridgeUrl: string = DEFAULT_BRIDGE_URL): Promise<BridgeHealth> {
  const normalizedUrl = bridgeUrl.replace(/\/+$/, '');
  const baseUrl = normalizedUrl.endsWith('/v1') ? normalizedUrl : `${normalizedUrl}/v1`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(`${baseUrl}/models`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data: any = await res.json();
      const models = Array.isArray(data?.data)
        ? data.data.map((m: any) => m.id)
        : [];
      return {
        online: true,
        url: baseUrl,
        models,
        defaultModel: models.find((m: string) => m.includes('big-pickle')) || models[0] || DEFAULT_MODEL,
      };
    }

    return {
      online: false,
      url: baseUrl,
      models: [],
      error: `Bridge responded with status ${res.status}`,
    };
  } catch (err: any) {
    return {
      online: false,
      url: baseUrl,
      models: [],
      error: err.message || 'Unable to connect to bridge',
    };
  }
}

/** Parse JSON or markdown codeblocks safely */
function extractCommitJson(raw: string): { title: string; body: string; type?: string; scope?: string } {
  let cleaned = raw.trim();

  // Try extracting from markdown ```json block
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (jsonMatch) {
    cleaned = jsonMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed.title && typeof parsed.title === 'string') {
      return {
        title: parsed.title.trim(),
        body: (parsed.body || '').trim(),
        type: parsed.type,
        scope: parsed.scope,
      };
    }
  } catch {
    // Fall back to heuristic line parsing
  }

  // Fallback: first line is title, remainder is body
  const lines = raw.replace(/```[a-z]*\n?/g, '').trim().split('\n');
  const title = (lines[0] || 'chore: update project changes').replace(/^#+\s*/, '').trim();
  const body = lines.slice(1).join('\n').trim();

  return { title, body };
}

/** Generate commit title and message using ModelHitch */
export async function generateCommitSuggestion({
  diffInfo,
  relativeCwd,
  hint,
  bridgeUrl = DEFAULT_BRIDGE_URL,
  model,
  provider,
}: {
  diffInfo: GitDiffInfo;
  relativeCwd: string;
  hint?: string;
  bridgeUrl?: string;
  model?: string;
  provider?: string;
}): Promise<CommitSuggestion> {
  const bridge = await checkBridgeHealth(bridgeUrl);

  let hitch: ModelHitch;
  let targetProvider = provider || 'bridge';
  let targetModel = model || bridge.defaultModel || DEFAULT_MODEL;

  if (targetProvider === 'bridge') {
    if (!bridge.online) {
      throw new Error(
        `ModelHitch bridge is offline at ${bridgeUrl}.\n` +
        `Start it in the background with:\n` +
        `  npx modelhitch bridge --background\n\n` +
        `Or specify a direct provider with --provider (e.g. --provider openai / anthropic) or configure DIFFNOTE_BRIDGE_URL.`
      );
    }

    const bridgeProvider = createOpenAICompatibleProvider({
      id: 'bridge',
      name: 'ModelHitch Bridge',
      baseUrl: bridge.url,
      defaultModel: targetModel,
      requiresKey: false,
    });

    hitch = new ModelHitch({
      providers: [bridgeProvider],
    });
  } else {
    // Using built-in ModelHitch provider
    hitch = new ModelHitch({
      providers: defaultProviders,
    });
  }

  const systemPrompt = `You are diffnote, a high-precision Git commit message generator.
Analyze the provided git diff and changes strictly scoped to the working directory: "${relativeCwd}".
Follow the Conventional Commits specification strictly:
Format: <type>(<scope>): <short imperative description>

Types:
- feat: A new feature
- fix: A bug fix
- refactor: Code change that neither fixes a bug nor adds a feature
- docs: Documentation changes
- style: Formatting, missing semi colons, etc
- perf: Performance improvement
- test: Adding or refactoring tests
- chore: Maintenance, tooling, configs, dependencies

Rules:
1. Title must be strictly <= 72 characters, lowercase type, imperative mood ("add", not "added" or "adds"), no trailing period.
2. Scope is optional but recommended if changes are confined to a component (e.g., cli, git, bridge, ui).
3. The body should explain WHY the change was made and WHAT changed with concise bullet points.
4. Output MUST be valid JSON with this exact structure:
{
  "type": "<type>",
  "scope": "<scope or empty>",
  "title": "<type>(<scope>): <summary>",
  "body": "- <bullet point 1>\\n- <bullet point 2>"
}`;

  const userContent = [
    `Current working directory: ${relativeCwd}`,
    `Files changed (${diffInfo.filesChanged.length}): ${diffInfo.filesChanged.join(', ')}`,
    `Diff stats: +${diffInfo.insertions} insertions, -${diffInfo.deletions} deletions (${diffInfo.diffType})`,
    hint ? `User guidance / hint: "${hint}"` : '',
    '',
    'Git Diff (scoped to current working directory):',
    '```diff',
    diffInfo.activeDiff,
    '```',
  ]
    .filter(Boolean)
    .join('\n');

  const response = await hitch.chat({
    provider: targetProvider,
    model: targetModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
  });

  const contentRaw = response.message.content;
  const contentStr =
    typeof contentRaw === 'string'
      ? contentRaw
      : Array.isArray(contentRaw)
        ? (contentRaw as any[]).map((p) => (typeof p === 'string' ? p : p?.text || '')).join('')
        : String(contentRaw || '');
  const raw = contentStr.trim();
  const parsed = extractCommitJson(raw);

  const fullMessage = parsed.body
    ? `${parsed.title}\n\n${parsed.body}`
    : parsed.title;

  return {
    title: parsed.title,
    body: parsed.body,
    fullMessage,
    type: parsed.type,
    scope: parsed.scope,
  };
}
