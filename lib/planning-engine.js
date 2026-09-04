// lib/planning-engine.js
// core planning engine logic for ARB Bearings

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

/**
 * Get sequence of N completed months before the startMonth/startYear
 */
export function getBaselineMonths(startMonth, startYear, N) {
  const months = [];
  let curM = startMonth - 1;
  let curY = startYear;
  if (curM <= 0) {
    curM = 12;
    curY -= 1;
  }

  for (let i = 0; i < N; i++) {
    months.push({
      monthNum: curM,
      monthName: MONTH_NAMES[curM - 1],
      year: curY
    });
    curM--;
    if (curM <= 0) {
      curM = 12;
      curY -= 1;
    }
  }
  return months.reverse(); // Chronological order
}

/**
 * Legacy helper for completed months ending at currentMonth
 */
export function getRecentMonths(currentMonth, currentYear, N) {
  const months = [];
  let curM = currentMonth;
  let curY = currentYear;

  for (let i = 0; i < N; i++) {
    if (curM <= 0) {
      curM = 12;
      curY -= 1;
    }
    months.push({
      monthNum: curM,
      monthName: MONTH_NAMES[curM - 1],
      year: curY
    });
    curM--;
  }
  return months.reverse(); // Chronological order
}

/**
 * Calculate the rolling baseline comparison between recent N months and corresponding prev year N months
 */
export function calculateRollingBaseline(records, startMonth, startYear, N, growthRate, isStartMonth = true) {
  const recent = isStartMonth 
    ? getBaselineMonths(startMonth, startYear, N) 
    : getRecentMonths(startMonth, startYear, N);
  
  // Previous N months is same month index but year - 1
  const previous = recent.map(r => ({
    ...r,
    year: r.year - 1
  }));

  const filterByPeriod = (periodMonths) => {
    return records.filter(r => 
      periodMonths.some(p => p.monthName === r.month && p.year === r.year)
    );
  };

  let recentRecords = filterByPeriod(recent);
  let previousRecords = filterByPeriod(previous);

  const missingRecentMonths = recent.filter(p => !records.some(r => r.month === p.monthName && r.year === p.year));
  const missingPreviousMonths = previous.filter(p => !records.some(r => r.month === p.monthName && r.year === p.year));
  const recentMonthsWithData = recent.filter(p => records.some(r => r.month === p.monthName && r.year === p.year));
  const previousMonthsWithData = previous.filter(p => records.some(r => r.month === p.monthName && r.year === p.year));

  // If no data exists at all for both recent and previous baseline periods, return clear error
  if (recentRecords.length === 0 && previousRecords.length === 0) {
    const recentPeriodStr = `${recent[0]?.monthName} ${recent[0]?.year} – ${recent[recent.length - 1]?.monthName} ${recent[recent.length - 1]?.year}`;
    const prevPeriodStr = `${previous[0]?.monthName} ${previous[0]?.year} – ${previous[previous.length - 1]?.monthName} ${previous[previous.length - 1]?.year}`;
    
    const availablePeriods = [...new Set(records.map(r => `${r.month.substring(0,3)} ${r.year}`))].slice(0, 12);
    const availablePeriodsStr = availablePeriods.length > 0 ? availablePeriods.join(', ') : 'None';

    return {
      success: false,
      error: `Production Data Incomplete: No actual production records were found in the uploaded sheets for the required baseline period (${recentPeriodStr} or ${prevPeriodStr}). Database currently contains records for: [${availablePeriodsStr}]. Please select a valid start month matching your uploaded data, or upload the required monthly production sheets in the Data Ingestion tab.`,
      missingRecent: missingRecentMonths.map(m => `${m.monthName} ${m.year}`),
      missingPrevious: missingPreviousMonths.map(m => `${m.monthName} ${m.year}`),
      recentMonths: recent,
      previousMonths: previous,
      baselineItems: [],
      recentTotal: 0,
      previousTotal: 0
    };
  }

  const recentTotal = recentRecords.reduce((sum, r) => sum + r.quantity, 0);
  const previousTotal = previousRecords.reduce((sum, r) => sum + r.quantity, 0);

  const isRecentStronger = recentTotal >= previousTotal;
  const selectedRecords = isRecentStronger ? recentRecords : previousRecords;

  // Group by Unit | Bearing | Category
  const recentSums = {};
  recentRecords.forEach(r => {
    const key = `${r.unit}|${r.bearingNo}|${r.category}`;
    recentSums[key] = (recentSums[key] || 0) + r.quantity;
  });

  const previousSums = {};
  previousRecords.forEach(r => {
    const key = `${r.unit}|${r.bearingNo}|${r.category}`;
    previousSums[key] = (previousSums[key] || 0) + r.quantity;
  });

  const allKeys = new Set([...Object.keys(recentSums), ...Object.keys(previousSums)]);
  const baselineItems = [];

  allKeys.forEach(key => {
    const [unit, bearingNo, category] = key.split("|");
    const qtyRecent = recentSums[key] || 0;
    const qtyPrevious = previousSums[key] || 0;
    const qtyBase = Math.max(qtyRecent, qtyPrevious);

    // Apply Growth Uplift
    const targetQty = Math.round(qtyBase * (1 + growthRate / 100));

    baselineItems.push({
      unit,
      bearingNo,
      category,
      qtyRecent,
      qtyPrevious,
      qtyBase,
      targetQty
    });
  });

  let dataWarning = null;
  if (missingRecentMonths.length > 0 && missingPreviousMonths.length > 0) {
    dataWarning = `Partial baseline notice: Historical data exists for ${recentMonthsWithData.length}/${N} recent months and ${previousMonthsWithData.length}/${N} previous year months.`;
  }

  return {
    success: true,
    recentTotal,
    previousTotal,
    isRecentStronger,
    recentMonths: recent,
    previousMonths: previous,
    missingRecent: missingRecentMonths.map(m => `${m.monthName} ${m.year}`),
    missingPrevious: missingPreviousMonths.map(m => `${m.monthName} ${m.year}`),
    dataWarning,
    baselineItems
  };
}

/**
 * Apply category threshold redistribution and final month edge case rules
 */
export function applyBatchRedistribution(baselineItems, N, startMonth, startYear, rules = {}, isStartMonth = true) {
  // Calculate planning months horizon starting from startMonth / startYear
  const planMonths = [];
  let m = isStartMonth ? startMonth : startMonth + 1;
  let y = startYear;
  if (m > 12) {
    m = 1;
    y += 1;
  }

  for (let i = 0; i < N; i++) {
    if (m > 12) {
      m = 1;
      y += 1;
    }
    planMonths.push({
      monthNum: m,
      monthName: MONTH_NAMES[m - 1],
      year: y
    });
    m++;
  }

  const minThresholds = rules.minThresholds || [];
  const gapMonth = rules.gapMonth !== undefined && rules.gapMonth !== null ? rules.gapMonth : null;
  const dividingRatios = rules.dividingRatios || [];
  const itemsList = [];

  // Find active positive threshold values and sort them
  const activeThresholds = minThresholds
    .filter(val => typeof val === 'number' && val > 0)
    .sort((a, b) => a - b);
  const M = activeThresholds.length;

  baselineItems.forEach((item) => {
    const totalPlanned = item.targetQty;

    // Determine split months and whether to use dividing ratios based on thresholds
    let distMonths = N;
    let useDividingRatios = false;

    if (M === 0) {
      distMonths = N;
      useDividingRatios = true;
    } else if (M === 1) {
      if (totalPlanned < activeThresholds[0]) {
        distMonths = 1;
      } else {
        distMonths = 2;
      }
    } else {
      if (totalPlanned < activeThresholds[0]) {
        distMonths = 1;
      } else if (totalPlanned >= activeThresholds[M - 1]) {
        distMonths = N;
        useDividingRatios = true;
      } else {
        // Find which intermediate threshold interval the quantity falls into
        for (let i = 1; i < M; i++) {
          if (activeThresholds[i - 1] <= totalPlanned && totalPlanned < activeThresholds[i]) {
            distMonths = i + 1;
            break;
          }
        }
      }
    }

    // Determine target active month indices
    let activeIndices = [];
    if (distMonths === 1) {
      activeIndices = [0];
    } else if (distMonths === 2) {
      const defaultGap = Math.floor(N / 2) + 1;
      const gap = gapMonth !== null ? gapMonth : defaultGap;
      const safeGap = Math.max(2, Math.min(N, gap));
      activeIndices = [0, safeGap - 1];
    } else {
      activeIndices = Array.from({ length: distMonths }, (_, i) => i);
    }

    // Distribute totalPlanned over the activeIndices
    const A = Array(N).fill(0);
    if (distMonths > 0) {
      if (useDividingRatios) {
        const ratioSum = dividingRatios.reduce((s, r) => s + r, 0);
        if (ratioSum > 0) {
          // Calculate sum of ratios for active months
          const activeRatioSum = activeIndices.reduce((sum, idx) => sum + (dividingRatios[idx] || 0), 0);
          if (activeRatioSum > 0) {
            let allocated = 0;
            const shares = activeIndices.map(idx => {
              const ratio = dividingRatios[idx] || 0;
              const share = Math.floor(totalPlanned * ratio / activeRatioSum);
              allocated += share;
              return { idx, share, remainder: (totalPlanned * ratio / activeRatioSum) - share };
            });

            // Standard largest remainder method to allocate rounding remainder
            let remainder = totalPlanned - allocated;
            shares.sort((a, b) => b.remainder - a.remainder);
            let remIdx = 0;
            while (remainder > 0) {
              shares[remIdx % shares.length].share += 1;
              remainder--;
              remIdx++;
            }

            shares.forEach(s => {
              A[s.idx] = s.share;
            });
          } else {
            // Fallback to equal split
            const baseShare = Math.floor(totalPlanned / distMonths);
            const remainder = totalPlanned % distMonths;
            activeIndices.forEach((idx, i) => {
              A[idx] = baseShare + (i < remainder ? 1 : 0);
            });
          }
        } else {
          // Fallback to equal split
          const baseShare = Math.floor(totalPlanned / distMonths);
          const remainder = totalPlanned % distMonths;
          activeIndices.forEach((idx, i) => {
            A[idx] = baseShare + (i < remainder ? 1 : 0);
          });
        }
      } else {
        // Equal split (bypassing dividing ratios)
        const baseShare = Math.floor(totalPlanned / distMonths);
        const remainder = totalPlanned % distMonths;
        activeIndices.forEach((idx, i) => {
          A[idx] = baseShare + (i < remainder ? 1 : 0);
        });
      }
    }

    // Map monthly quantities to target periods
    planMonths.forEach((m, idx) => {
      itemsList.push({
        unitName: item.unit,
        bearingNo: item.bearingNo,
        category: item.category,
        targetMonth: m.monthNum,
        targetYear: m.year,
        originalQuantity: A[idx],
        plannedQuantity: A[idx],
        qtyRecent: item.qtyRecent || 0,
        qtyPrevious: item.qtyPrevious || 0,
        isManuallyEdited: false
      });
    });
  });

  return { planMonths, itemsList };
}
