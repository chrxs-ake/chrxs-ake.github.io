// worker.js - Monte Carlo simulation in background

self.onmessage = function(e) {
  const { pity: startPity, spark: startSpark, maxPulls, simCount, gameData } = e.data;

  const pullsToFeatured = [];

  for (let i = 0; i < simCount; i++) {
    const result = simulateOneRun(startPity, startSpark, maxPulls, gameData);
    if (result !== Infinity) {
      pullsToFeatured.push(result);
    }
  }

  // Stats
  if (pullsToFeatured.length === 0) {
    self.postMessage({ avgToFeatured: Infinity, successRate: 0, histo: [], pullsToFeatured: [] });
    return;
  }

  const sum = pullsToFeatured.reduce((a, b) => a + b, 0);
  const avg = sum / pullsToFeatured.length;

  const sorted = [...pullsToFeatured].sort((a, b) => a - b);
  const success = pullsToFeatured.filter(p => p <= maxPulls).length;
  const successRate = (success / simCount) * 100;

  // Simple histogram (bins 1 to 120+)
  const histo = new Array(121).fill(0);
  pullsToFeatured.forEach(p => {
    if (p <= 120) histo[p]++;
    else histo[120]++;
  });

  self.postMessage({
    avgToFeatured: avg,
    successRate,
    histo,
    pullsToFeatured: sorted
  });
};

function simulateOneRun(startPity, startSpark, maxPulls, data) {
  let pity = startPity;
  let spark = startSpark;
  let pulls = 0;

  while (pulls < maxPulls) {
    pulls++;
    spark++;

    // Spark guarantee at exactly 120
    if (spark >= data.sparkGuarantee) {
      return pulls; // Featured!
    }

    // Normal roll
    const rate = get6StarRate(pity, data);
    if (Math.random() < rate) {
      pity = 0; // Reset pity

      // 50/50
      if (Math.random() < data.featuredRateOn6Star) {
        return pulls; // Featured!
      }
      // Lost 50/50 → continue, spark still counts
    } else {
      pity++;
    }
  }

  return Infinity; // Failed to get featured within budget
}

function get6StarRate(pity, data) {
  if (pity < data.softPityStart) {
    return data.base6StarRate;
  }
  const extra = (pity - (data.softPityStart - 1)) * data.softPityIncrement;
  return Math.min(1, data.base6StarRate + extra);
}
