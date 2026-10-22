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
export function calculateRollingBaseline(records, pendings = [], startMonth, startYear, N, growthRate, isStartMonth = true) {
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

  // If no data exists at all for both recent and previous baseline periods (and no pendings), return clear error
  if (recentRecords.length === 0 && previousRecords.length === 0 && (!pendings || pendings.length === 0)) {
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

  // Map pendings by unit|bearingNo and by bearingNo
  const pendingByUnitBearing = {};
  const pendingByBearing = {};
  (pendings || []).forEach(p => {
    const bNo = String(p.bearingNo || '').trim().toUpperCase();
    const qty = parseInt(p.quantity, 10) || 0;
    if (!bNo || qty <= 0) return;
    if (p.unit) {
      const uKey = `${p.unit.trim()}|${bNo}`;
      pendingByUnitBearing[uKey] = (pendingByUnitBearing[uKey] || 0) + qty;
    } else {
      pendingByBearing[bNo] = (pendingByBearing[bNo] || 0) + qty;
    }
  });

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

  // Also include any pending items that are not in historical records
  (pendings || []).forEach(p => {
    const bNo = String(p.bearingNo || '').trim().toUpperCase();
    if (!bNo) return;
    const hasMatch = Array.from(allKeys).some(k => k.split("|")[1] === bNo);
    if (!hasMatch) {
      const u = p.unit || (records[0]?.unit || 'Unit 1');
      allKeys.add(`${u}|${bNo}|General`);
    }
  });

  const baselineItems = [];

  // Count how many baseline items exist per bearingNo (to split global pending if needed)
  const bearingItemCounts = {};
  allKeys.forEach(key => {
    const bNo = key.split("|")[1];
    bearingItemCounts[bNo] = (bearingItemCounts[bNo] || 0) + 1;
  });

  // Track allocated pending per bearing to preserve exact pending total sum across units
  const pendingAllocatedMap = {};
  const pendingDoneCountMap = {};

  allKeys.forEach(key => {
    const [unit, bearingNo, category] = key.split("|");
    const qtyRecent = recentSums[key] || 0;
    const qtyPrevious = previousSums[key] || 0;
    const qtyBase = Math.max(qtyRecent, qtyPrevious);

    // Calculate Pending Quantity without rounding drift across units
    let qtyPending = 0;
    const uKey = `${unit}|${bearingNo}`;
    if (pendingByUnitBearing[uKey] !== undefined) {
      qtyPending = pendingByUnitBearing[uKey];
    } else if (pendingByBearing[bearingNo] !== undefined) {
      const totalGlobal = pendingByBearing[bearingNo];
      const itemCnt = bearingItemCounts[bearingNo] || 1;
      const doneCount = (pendingDoneCountMap[bearingNo] || 0) + 1;
      pendingDoneCountMap[bearingNo] = doneCount;

      if (doneCount === itemCnt) {
        qtyPending = totalGlobal - (pendingAllocatedMap[bearingNo] || 0);
      } else {
        qtyPending = Math.floor(totalGlobal / itemCnt);
        pendingAllocatedMap[bearingNo] = (pendingAllocatedMap[bearingNo] || 0) + qtyPending;
      }
    }

    // Apply Growth Uplift + Pending Order Quantity (Max of recent vs prev year + growth rate % + pending orders)
    const parsedGrowth = typeof growthRate === 'number' ? growthRate : (parseFloat(growthRate) || 0);
    const targetQty = Math.round(qtyBase * (1 + parsedGrowth / 100)) + qtyPending;

    baselineItems.push({
      unit,
      bearingNo,
      category,
      qtyRecent,
      qtyPrevious,
      qtyBase,
      qtyPending,
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
 * Cyclically allocate `count` months across horizon `N` with `gap` months interval.
 * Resolves collisions by finding the next empty month cyclically without overwriting.
 */
export function getCyclicActiveIndices(N, count, gap) {
  if (count <= 1 || N <= 1) return [0];
  if (count >= N) return Array.from({ length: N }, (_, i) => i);

  const defaultGap = Math.floor(N / 2) + 1;
  const parsedGap = (gap !== null && gap !== undefined && !isNaN(parseInt(gap, 10))) 
    ? parseInt(gap, 10) 
    : defaultGap;
  const step = Math.max(1, parsedGap + 1);

  const selected = [];
  let curr = 0;

  for (let i = 0; i < count; i++) {
    if (!selected.includes(curr)) {
      selected.push(curr);
      curr = (curr + step) % N;
    } else {
      // Collision: find next empty month cyclically starting from curr
      let nextEmpty = (curr + 1) % N;
      while (selected.includes(nextEmpty) && nextEmpty !== curr) {
        nextEmpty = (nextEmpty + 1) % N;
      }
      if (!selected.includes(nextEmpty)) {
        selected.push(nextEmpty);
        curr = (nextEmpty + step) % N;
      } else {
        break;
      }
    }
  }

  return selected.sort((a, b) => a - b);
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

  // Exactly 3 Min thresholds: [Min 1, Min 2, Min 3]
  const rawMinThresholds = Array.isArray(rules.minThresholds) ? rules.minThresholds : [];
  const minThresholds = [
    Math.max(0, parseInt(rawMinThresholds[0], 10) || 0),
    Math.max(0, parseInt(rawMinThresholds[1], 10) || 0),
    Math.max(0, parseInt(rawMinThresholds[2], 10) || 0)
  ];
  const gapMonth = rules.gapMonth !== undefined && rules.gapMonth !== null ? rules.gapMonth : null;
  const dividingRatios = rules.dividingRatios || [];
  const itemsList = [];

  // Active positive thresholds sorted ascending
  const activeThresholds = minThresholds
    .filter(val => typeof val === 'number' && val > 0)
    .sort((a, b) => a - b);
  const M = activeThresholds.length;

  // Calculate total target planned quantity per bearing style across ALL units
  const bearingGrandTotals = {};
  baselineItems.forEach((item) => {
    bearingGrandTotals[item.bearingNo] = (bearingGrandTotals[item.bearingNo] || 0) + (item.targetQty || 0);
  });

  const bearingConfigs = {};
  Object.keys(bearingGrandTotals).forEach((bNo) => {
    const totalPlanned = bearingGrandTotals[bNo];
    let distMonths = 1;
    let useDividingRatios = false;

    if (M === 0) {
      distMonths = N;
      useDividingRatios = true;
    } else if (M === 1) {
      if (totalPlanned < activeThresholds[0]) {
        distMonths = 1;
      } else {
        distMonths = Math.min(2, N);
        if (distMonths === N) useDividingRatios = true;
      }
    } else if (M === 2) {
      if (totalPlanned < activeThresholds[0]) {
        distMonths = 1;
      } else if (totalPlanned < activeThresholds[1]) {
        distMonths = Math.min(2, N);
      } else {
        distMonths = Math.min(3, N);
        if (distMonths === N) useDividingRatios = true;
      }
    } else {
      // 3 thresholds: Min 1, Min 2, Min 3
      if (totalPlanned < activeThresholds[0]) {
        distMonths = 1;
      } else if (totalPlanned < activeThresholds[1]) {
        distMonths = Math.min(2, N);
      } else if (totalPlanned < activeThresholds[2]) {
        distMonths = Math.min(3, N);
      } else {
        distMonths = N;
        useDividingRatios = true;
      }
    }

    let activeIndices = [];
    if (distMonths === 1) {
      activeIndices = [0];
    } else if (distMonths >= N) {
      activeIndices = Array.from({ length: N }, (_, i) => i);
    } else {
      activeIndices = getCyclicActiveIndices(N, distMonths, gapMonth);
    }

    bearingConfigs[bNo] = {
      distMonths,
      useDividingRatios,
      activeIndices
    };
  });

  baselineItems.forEach((item) => {
    const totalPlanned = item.targetQty;
    const bConfig = bearingConfigs[item.bearingNo] || {
      distMonths: 1,
      useDividingRatios: false,
      activeIndices: [0]
    };
    const distMonths = bConfig.distMonths;
    const useDividingRatios = bConfig.useDividingRatios;
    const activeIndices = bConfig.activeIndices;

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
        // Equal split across selected cyclic active months
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
        qtyPending: item.qtyPending || 0,
        isManuallyEdited: false
      });
    });
  });

  return { planMonths, itemsList };
}
