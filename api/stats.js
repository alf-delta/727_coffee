import { kv } from '../src/server/kv.js';

const MIN_USERS_PER_VARIANT = 50;

function meanVar(values) {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  return { n, mean, variance };
}

// Abramowitz & Stegun 7.1.26 erf approximation -> normal CDF. Valid here
// because the comparison is gated at n>=50/variant, where the t-distribution
// is already very close to normal (df will be well above 30).
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}
function normalCdf(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function welch(a, b) {
  const A = meanVar(a);
  const B = meanVar(b);
  const se = Math.sqrt(A.variance / A.n + B.variance / B.n) || 1e-9;
  const t = (A.mean - B.mean) / se;
  const df = (A.variance / A.n + B.variance / B.n) ** 2
    / ((A.variance / A.n) ** 2 / (A.n - 1) + (B.variance / B.n) ** 2 / (B.n - 1));
  const pValue = 2 * (1 - normalCdf(Math.abs(t)));
  return { meanFlappy: A.mean, meanTap: B.mean, nFlappy: A.n, nTap: B.n, t: Number(t.toFixed(4)), df: Number(df.toFixed(1)), pValue: Number(pValue.toFixed(4)) };
}

export default async function handler(req, res) {
  const key = req.query?.key;
  if (!process.env.STATS_ACCESS_KEY || key !== process.env.STATS_ACCESS_KEY) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const keys = await kv.keys('stats:*');
  const records = [];
  for (const k of keys) {
    const r = await kv.get(k);
    if (r) records.push(r);
  }

  const groups = { flappy: [], tap: [] };
  for (const r of records) {
    if (!groups[r.variant]) continue;
    groups[r.variant].push({
      plays: r.plays,
      avgScore: r.plays ? r.sumScore / r.plays : 0,
      avgDurationMs: r.plays ? r.totalDurationMs / r.plays : 0,
    });
  }

  const nFlappy = groups.flappy.length;
  const nTap = groups.tap.length;
  if (nFlappy < MIN_USERS_PER_VARIANT || nTap < MIN_USERS_PER_VARIANT) {
    return res.status(200).json({
      ready: false,
      n: { flappy: nFlappy, tap: nTap },
      message: `Need ${MIN_USERS_PER_VARIANT} unique users per variant before comparing (no peeking before then) — currently flappy=${nFlappy}, tap=${nTap}.`,
    });
  }

  return res.status(200).json({
    ready: true,
    n: { flappy: nFlappy, tap: nTap },
    plays: welch(groups.flappy.map((g) => g.plays), groups.tap.map((g) => g.plays)),
    avgScore: welch(groups.flappy.map((g) => g.avgScore), groups.tap.map((g) => g.avgScore)),
    avgDurationMs: welch(groups.flappy.map((g) => g.avgDurationMs), groups.tap.map((g) => g.avgDurationMs)),
  });
}
