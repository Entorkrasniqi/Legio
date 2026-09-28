/**
 * The one editable place for model IDs and prices (CLAUDE.md: never hard-code
 * these in logic, never guess them). Every value here must be checked against
 * the live docs before it's changed:
 *   - models:  https://platform.claude.com/docs/en/models/overview
 *   - pricing: https://platform.claude.com/docs/en/about-claude/pricing
 *
 * Last verified against both pages: 2026-09-28.
 *
 * Prices are USD per million tokens, Claude API (first-party), global
 * inference, no batch discount. `cacheWrite5mPerMTok` / `cacheWrite1hPerMTok`
 * are the 5-minute and 1-hour prompt-cache write prices; `cacheReadPerMTok`
 * is a cache hit. Not modelled yet (add here, not in logic, when a feature
 * uses them): batch discount, US-only inference multiplier, fast mode.
 */
export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheWrite5mPerMTok: number;
  cacheWrite1hPerMTok: number;
  cacheReadPerMTok: number;
}

export interface ModelConfig {
  id: string;
  displayName: string;
  pricing: ModelPricing;
  /** Earliest retirement date Anthropic has committed to, from the models page. */
  retiresNotBefore: string;
}

export const MODELS = {
  fable51: {
    id: 'claude-fable-5-1',
    displayName: 'Claude Fable 5.1',
    pricing: {
      inputPerMTok: 10,
      outputPerMTok: 50,
      cacheWrite5mPerMTok: 12.5,
      cacheWrite1hPerMTok: 20,
      cacheReadPerMTok: 0.25,
    },
    retiresNotBefore: '2027-09-01',
  },
  opus55: {
    id: 'claude-opus-5-5',
    displayName: 'Claude Opus 5.5',
    pricing: {
      inputPerMTok: 4,
      outputPerMTok: 20,
      cacheWrite5mPerMTok: 5,
      cacheWrite1hPerMTok: 8,
      cacheReadPerMTok: 0.2,
    },
    retiresNotBefore: '2027-09-22',
  },
  sonnet5: {
    id: 'claude-sonnet-5',
    displayName: 'Claude Sonnet 5',
    pricing: {
      inputPerMTok: 2,
      outputPerMTok: 10,
      cacheWrite5mPerMTok: 2.5,
      cacheWrite1hPerMTok: 4,
      cacheReadPerMTok: 0.2,
    },
    retiresNotBefore: '2027-06-30',
  },
  haiku45: {
    id: 'claude-haiku-4-5-20251001',
    displayName: 'Claude Haiku 4.5',
    pricing: {
      inputPerMTok: 1,
      outputPerMTok: 5,
      cacheWrite5mPerMTok: 1.25,
      cacheWrite1hPerMTok: 2,
      cacheReadPerMTok: 0.1,
    },
    retiresNotBefore: '2026-10-15',
  },
} as const satisfies Record<string, ModelConfig>;

/**
 * Model used for the Settings "Test connection" call. Haiku 4.5 is cheaper
 * but may retire as early as 2026-10-15, which would silently break this
 * check; Sonnet 5 is the cheapest current model with a long runway. With an
 * 8-token output cap the call costs a small fraction of a cent either way.
 */
export const CONNECTION_TEST_MODEL: ModelConfig = MODELS.sonnet5;
export const CONNECTION_TEST_MAX_TOKENS = 8;
