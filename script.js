// script.js - Main UI logic

// Global chart instance
let probChart = null;

// Load static data
let gameData = {};
let bannerData = {};

async function loadData() {
  try {
    gameData = await fetch('data.json').then(r => r.json());
    bannerData = await fetch('banners.json').then(r => r.json());

    // Populate current banner
    document.getElementById('bannerName').textContent = bannerData.current.name;
    document.getElementById('bannerEnd').textContent = `Ends ${new Date(bannerData.current.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    updateMaxPulls();
  } catch (err) {
    console.error('Failed to load data:', err);
  }
}

loadData();

// Update displayed values when sliders move
const pitySlider = document.getElementById('pity');
const pityValue = document.getElementById('pityValue');
pitySlider.addEventListener('input', () => {
  pityValue.textContent = pitySlider.value;
  updateMaxPulls();
  updateWarning();
});

const sparkSlider = document.getElementById('spark');
const sparkValue = document.getElementById('sparkValue');
sparkSlider.addEventListener('input', () => {
  sparkValue.textContent = sparkSlider.value;
  updateMaxPulls();
  updateWarning();
});

const oroInput = document.getElementById('oroberryl');
oroInput.addEventListener('input', () => {
  document.getElementById('oroValue').textContent = oroInput.value.toLocaleString();
  updateMaxPulls();
  updateWarning();
});

function updateMaxPulls() {
  const oro = parseInt(oroInput.value) || 0;
  const maxPulls = Math.floor(oro / gameData.oroPerPull);
  document.getElementById('maxPulls').textContent = maxPulls.toLocaleString();
  
  const pity = parseInt(pitySlider.value);
  const neededForHard = 80 - pity;
  const neededForSpark = 120 - parseInt(sparkSlider.value);
  let text = '';
  if (maxPulls < neededForHard) {
    text = `(${neededForHard - maxPulls} short of hard pity)`;
  } else if (maxPulls < neededForSpark) {
    text = `(${neededForSpark - maxPulls} short of spark)`;
  }
  document.getElementById('oroNeeded').textContent = text;
}

function updateWarning() {
  const pity = parseInt(pitySlider.value);
  const spark = parseInt(sparkSlider.value);
  const oro = parseInt(oroInput.value) || 0;
  const maxPulls = Math.floor(oro / gameData.oroPerPull);
  const totalPossible = spark + maxPulls;

  const warningBox = document.getElementById('warningBox');
  const warningText = document.getElementById('warningText');

  if (totalPossible < 120) {
    warningBox.classList.remove('hidden');
    warningText.textContent = `You can only reach ~${totalPossible} pulls on this banner. Spark DOES NOT carry over — very risky unless you plan to farm more Oroberyl fast!`;
  } else {
    warningBox.classList.add('hidden');
  }
}

// Single pull simulation (fun mode)
function doSinglePull() {
  const pity = parseInt(pitySlider.value);
  const spark = parseInt(sparkSlider.value);

  let is6Star = false;
  let isFeatured = false;

  // Spark check first
  if (spark + 1 >= gameData.sparkGuarantee) {
    is6Star = true;
    isFeatured = true;
  } else {
    let rate = get6StarRate(pity);
    if (Math.random() < rate) {
      is6Star = true;
      if (Math.random() < gameData.featuredRateOn6Star) {
        isFeatured = true;
      }
    }
  }

  // Update counters (simulate pull happened)
  pitySlider.value = is6Star ? 0 : pity + 1;
  sparkSlider.value = spark + 1;
  pityValue.textContent = pitySlider.value;
  sparkValue.textContent = sparkSlider.value;

  // Confetti on win
  if (is6Star) {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  }

  // Show in history
  const history = document.getElementById('historyList');
  const entry = document.createElement('div');
  entry.textContent = `Pull: ${is6Star ? (isFeatured ? 'FEATURED 6★ !!!' : '6★ (off-banner)') : 'No 6★'} | Pity now: ${pitySlider.value} | Spark: ${sparkSlider.value}`;
  history.prepend(entry);
  document.getElementById('pullHistory').classList.remove('hidden');

  updateMaxPulls();
  updateWarning();
}

document.getElementById('singlePullBtn').addEventListener('click', doSinglePull);
document.getElementById('tenPullBtn').addEventListener('click', () => {
  for (let i = 0; i < 10; i++) {
    doSinglePull();
  }
});

// Mass simulation
document.getElementById('simulateBtn').addEventListener('click', () => {
  const pity = parseInt(pitySlider.value);
  const spark = parseInt(sparkSlider.value);
  const oro = parseInt(oroInput.value) || 0;
  const maxPulls = Math.floor(oro / gameData.oroPerPull);

  const simCount = 50000; // can make configurable later

  const worker = new Worker('worker.js');
  worker.postMessage({ pity, spark, maxPulls, simCount, gameData });

  worker.onmessage = (e) => {
    const { avgToFeatured, successRate, histo, pullsToFeatured } = e.data;

    // Show results
    document.getElementById('resultsPanel').classList.remove('hidden');

    // Stats grid
    const grid = document.getElementById('statsGrid');
    grid.innerHTML = `
      <div class="bg-[#0f3460] p-4 rounded-xl text-center">
        <div class="text-xs text-gray-400">Avg pulls to featured</div>
        <div id="avgPullsDisplay" class="text-3xl font-bold text-[#e94560]">${avgToFeatured.toFixed(1)}</div>
      </div>
      <div class="bg-[#0f3460] p-4 rounded-xl text-center">
        <div class="text-xs text-gray-400">% success within budget</div>
        <div class="text-3xl font-bold text-[#e94560]">${successRate.toFixed(1)}%</div>
      </div>
      <div class="bg-[#0f3460] p-4 rounded-xl text-center">
        <div class="text-xs text-gray-400">Worst case (95th %)</div>
        <div class="text-3xl font-bold text-[#e94560]">${pullsToFeatured[Math.floor(pullsToFeatured.length * 0.95)] || 'N/A'}</div>
      </div>
    `;

    // Chart
    const ctx = document.getElementById('probChart').getContext('2d');
    if (probChart) probChart.destroy();
    probChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: histo.map((_, i) => i + 1),
        datasets: [{
          label: 'Frequency',
          data: histo,
          backgroundColor: '#e94560',
          borderColor: '#ff5e7a',
          borderWidth: 1
        }]
      },
      options: {
        scales: {
          y: { beginAtZero: true },
          x: { title: { display: true, text: 'Pulls to get featured 6★' } }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  };

  worker.onerror = (err) => console.error('Worker error:', err);
});
