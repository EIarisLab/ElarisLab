/**
 * Detect volume‐based patterns in a series of activity amounts.
 */
export interface PatternMatch {
  index: number
  window: number
  average: number
}

export function detectVolumePatterns(
  volumes: number[],
  windowSize: number,
  threshold: number
): PatternMatch[] {
  const matches: PatternMatch[] = []
  for (let i = 0; i + windowSize <= volumes.length; i++) {
    const slice = volumes.slice(i, i + windowSize)
    const avg = slice.reduce((a, b) => a + b, 0) / windowSize
    if (avg >= threshold) {
      matches.push({ index: i, window: windowSize, average: avg })
    }
  }
  return matches
}
