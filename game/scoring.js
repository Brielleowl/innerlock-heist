// Scoring is deterministic and lives server-side: fewer hints = more stars.
export function starsFor(hintsUsed) {
  if (hintsUsed === 0) return 3;
  return hintsUsed <= 2 ? 2 : 1;
}

export function pointsFor(levelId, stars) {
  return levelId * 100 + stars * 300;
}
