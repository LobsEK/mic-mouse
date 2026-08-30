import type { Verdict } from "@/lib/types";

/**
 * Real Anthropic list pricing for the model we run, in USD per 1M tokens.
 * Kept in one place so every cost number the user sees comes from the same
 * source of truth rather than a guess sprinkled through the UI.
 */
export const PRICING = {
  inputPerMTokUsd: 3,
  outputPerMTokUsd: 15,
  usdToEur: 0.92,
};

export function costEur(inputTokens: number, outputTokens: number): number {
  const usd =
    (inputTokens / 1_000_000) * PRICING.inputPerMTokUsd +
    (outputTokens / 1_000_000) * PRICING.outputPerMTokUsd;
  return Math.round(usd * PRICING.usdToEur * 10000) / 10000;
}

/** Rough forward estimate used when *proposing* a step nobody has run yet. */
export function estimateCostEur(estTokens: number): number {
  // assume ~70/30 input/output split for a typical agent step
  return costEur(Math.round(estTokens * 0.7), Math.round(estTokens * 0.3));
}

export function formatEur(v: number): string {
  if (v < 0.01) return `${(v * 100).toFixed(2)} centa`;
  return `${v.toFixed(2)} €`;
}

/**
 * The performance-vs-cost rule the user asked for: never burn time and tokens
 * on something whose likely payoff does not justify it. Impact and effort are
 * 1-5 scores the model assigns; we turn them into a deterministic verdict here
 * rather than trusting the model to be consistent about it.
 */
export function decideVerdict(input: {
  impact: number;
  effort: number;
  estCostEur: number;
  /** e.g. how many times we already tried this target with no reply */
  priorFailedAttempts?: number;
  /** true when the target is small / low value, so a long chase is not worth it */
  lowValueTarget?: boolean;
}): { verdict: Verdict; reason: string } {
  const { impact, effort, estCostEur } = input;
  const failed = input.priorFailedAttempts ?? 0;

  if (failed >= 3) {
    return {
      verdict: "not_worth",
      reason: `Už ${failed}× bez reakcie — ďalší pokus má klesajúcu šancu na úspech. Lepšie presunúť čas na iný cieľ alebo zmeniť kanál.`,
    };
  }
  if (input.lowValueTarget && failed >= 2) {
    return {
      verdict: "not_worth",
      reason: `Malá firma, ktorá už ${failed}× neodpovedala — očakávaný výnos nepokryje ďalší čas ani tokeny.`,
    };
  }
  if (impact <= 2 && estCostEur > 0.05) {
    return {
      verdict: "not_worth",
      reason: `Nízky očakávaný dopad (${impact}/5) pri odhadovanej cene ${formatEur(estCostEur)} — neoplatí sa.`,
    };
  }

  const ratio = impact / Math.max(1, effort);
  if (ratio >= 1.5 && impact >= 3) {
    return {
      verdict: "worth",
      reason: `Dopad ${impact}/5 pri námahe ${effort}/5 a cene ${formatEur(estCostEur)} — pomer výkon/náklad sedí.`,
    };
  }
  if (ratio >= 1) {
    return {
      verdict: "borderline",
      reason: `Dopad ${impact}/5 vs. námaha ${effort}/5 — vyplatí sa len ak nemáš rozbehnutý dôležitejší cieľ.`,
    };
  }
  return {
    verdict: "not_worth",
    reason: `Námaha ${effort}/5 prevyšuje očakávaný dopad ${impact}/5 — radšej zvoľ inú stratégiu.`,
  };
}
