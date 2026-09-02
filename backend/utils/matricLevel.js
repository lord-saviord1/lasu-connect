// ── Derive academic Level from a LASU matric number ──────────────
//
// LASU matric numbers encode admission year in their first two digits
// (e.g. "240822032" -> admitted 2024). Level is derived from how many
// academic sessions have passed since admission.
//
// Academic session runs September -> August. The session "rolls over"
// on September 1st: everyone's level bumps up by one at that point.
//
// Formula: given the current session's starting calendar year S,
//   level = (S - admissionYear + 1) * 100
//
// Confirmed against ground truth: as of Sept 2026 (2026/2027 session),
// a student admitted in 2024 is 300 Level.
//   - session 2024/2025 (1st) = 100L
//   - session 2025/2026 (2nd) = 200L
//   - session 2026/2027 (3rd) = 300L  ✓
//
// Anything beyond a normal 4-year run (100L-400L then graduate at 500L)
// is capped rather than guessed further, since some courses (engineering
// ~6yr, medicine ~7yr) and carryovers legitimately run longer.

function currentSessionStartYear(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed; 8 = September
  return month >= 8 ? year : year - 1;
}

/**
 * Derives the display-string Level from a matric number, matching the
 * exact option strings used in register.html's Level dropdown
 * ("100 Level", ..., "500 Level", or the Extended fallback).
 *
 * @param {string} matricNumber - e.g. "240822032"
 * @param {Date} [now] - override for testing; defaults to current time
 * @returns {string|null} the derived level string, or null if the
 *   matric number doesn't look like a valid LASU format (can't derive)
 */
function deriveLevelFromMatric(matricNumber, now = new Date()) {
  if (!matricNumber || typeof matricNumber !== 'string') return null;
  const digits = matricNumber.trim();
  const yearPrefix = digits.slice(0, 2);
  if (!/^\d{2}$/.test(yearPrefix)) return null;

  const admissionYear = 2000 + parseInt(yearPrefix, 10);
  const sessionStartYear = currentSessionStartYear(now);
  const yearsIn = sessionStartYear - admissionYear + 1;

  if (yearsIn <= 0) return null; // matric implies admission hasn't happened yet — suspicious/invalid
  if (yearsIn > 5) return '500 Level / Extended';
  return `${yearsIn * 100} Level`;
}

module.exports = { deriveLevelFromMatric, currentSessionStartYear };
