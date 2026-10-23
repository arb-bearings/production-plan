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
 * Calculate the rolling baseline.
 *
 * NEW LOGIC (bearing-level aggregation):
 *   1. Sum CY quantities across ALL units for each bearing.
 *   2. Sum PY quantities across ALL units for each bearing.
 *   3. base = max(total_CY, total_PY)  ← single comparison at bearing level
 *   4. target = round((base + total_pending) × (1 + growth%))  ← add pending first, then apply growth
 *   5. Split target back to each unit proportionally by their share
 *      of the winning period (CY or PY), using largest-remainder rounding.
 */
export function calculateRollingBaseline(records, pendings = [], startMonth, startYear, N, growthRate, isStartMonth = true) {
  const recent = isStartMonth
    ? getBaselineMonths(startMonth, startYear, N)
    : getRecentMonths(startMonth, startYear, N);

  // Previous N months = same calendar months, prior year
  const previous = recent.map(r => ({ ...r, year: r.year - 1 }));

  const filterByPeriod = (periodMonths) =>
    records.filter(r =>
      periodMonths.some(p => p.monthName === r.month && p.year === r.year)
    );

  const recentRecords   = filterByPeriod(recent);
  const previousRecords = filterByPeriod(previous);

  const missingRecentMonths    = recent.filter(p => !records.some(r => r.month === p.monthName && r.year === p.year));
  const missingPreviousMonths  = previous.filter(p => !records.some(r => r.month === p.monthName && r.year === p.year));
  const recentMonthsWithData   = recent.filter(p => records.some(r => r.month === p.monthName && r.year === p.year));
  const previousMonthsWithData = previous.filter(p => records.some(r => r.month === p.monthName && r.year === p.year));

  // No data at all → clear error
  if (recentRecords.length === 0 && previousRecords.length === 0 && (!pendings || pendings.length === 0)) {
    const recentPeriodStr = `${recent[0]?.monthName} ${recent[0]?.year} – ${recent[recent.length - 1]?.monthName} ${recent[recent.length - 1]?.year}`;
    const prevPeriodStr   = `${previous[0]?.monthName} ${previous[0]?.year} – ${previous[previous.length - 1]?.monthName} ${previous[previous.length - 1]?.year}`;
    const availablePeriods    = [...new Set(records.map(r => `${r.month.substring(0, 3)} ${r.year}`))].slice(0, 12);
    const availablePeriodsStr = availablePeriods.length > 0 ? availablePeriods.join(', ') : 'None';

    return {
      success: false,
      error: `Production Data Incomplete: No actual production records were found in the uploaded sheets for the required baseline period (${recentPeriodStr} or ${prevPeriodStr}). Database currently contains records for: [${availablePeriodsStr}]. Please select a valid start month matching your uploaded data, or upload the required monthly production sheets in the Data Ingestion tab.`,
      missingRecent:   missingRecentMonths.map(m => `${m.monthName} ${m.year}`),
      missingPrevious: missingPreviousMonths.map(m => `${m.monthName} ${m.year}`),
      recentMonths:    recent,
      previousMonths:  previous,
      baselineItems:   [],
      recentTotal:     0,
      previousTotal:   0
    };
  }

  const recentTotal    = recentRecords.reduce((sum, r) => sum + r.quantity, 0);
  const previousTotal  = previousRecords.reduce((sum, r) => sum + r.quantity, 0);
  const isRecentStronger = recentTotal >= previousTotal;
  const parsedGrowth   = typeof growthRate === 'number' ? growthRate : (parseFloat(growthRate) || 0);

  // ── STEP 1: Per-unit sums (unit|bearingNo|category) ──────────────────────
  const recentSums   = {}; // key: "unit|bearingNo|category"
  const previousSums = {};

  recentRecords.forEach(r => {
    const key = `${r.unit}|${r.bearingNo}|${r.category}`;
    recentSums[key] = (recentSums[key] || 0) + r.quantity;
  });
  previousRecords.forEach(r => {
    const key = `${r.unit}|${r.bearingNo}|${r.category}`;
    previousSums[key] = (previousSums[key] || 0) + r.quantity;
  });

  const allUnitKeys = new Set([...Object.keys(recentSums), ...Object.keys(previousSums)]);

  // Include pending-only bearings not present in historical records
  (pendings || []).forEach(p => {
    const bNo = String(p.bearingNo || '').trim().toUpperCase();
    if (!bNo) return;
    const hasMatch = Array.from(allUnitKeys).some(k => k.split('|')[1] === bNo);
    if (!hasMatch) {
      const u = p.unit || (records[0]?.unit || 'Unit 1');
      allUnitKeys.add(`${u}|${bNo}|General`);
    }
  });

  // ── STEP 2: Aggregate to bearing level across all units ───────────────────
  // bearingKey = "bearingNo|category"
  const bearingRecentTotals   = {}; // bearingKey → sum CY
  const bearingPreviousTotals = {}; // bearingKey → sum PY
  const bearingUnits          = {}; // bearingKey → [{ unit, bearingNo, category, qtyRecent, qtyPrevious }]

  allUnitKeys.forEach(key => {
    const [unit, bearingNo, category] = key.split('|');
    const bKey  = `${bearingNo}|${category}`;
    const qR    = recentSums[key] || 0;
    const qP    = previousSums[key] || 0;

    bearingRecentTotals[bKey]   = (bearingRecentTotals[bKey] || 0) + qR;
    bearingPreviousTotals[bKey] = (bearingPreviousTotals[bKey] || 0) + qP;

    if (!bearingUnits[bKey]) bearingUnits[bKey] = [];
    bearingUnits[bKey].push({ unit, bearingNo, category, qtyRecent: qR, qtyPrevious: qP });
  });

  // ── STEP 3: Total pending per bearing (across all units) ──────────────────
  const pendingTotalByBearing = {}; // bearingNo → total pending
  const pendingByUnit         = {}; // "unit|bearingNo" → qty (unit-tagged pendings)

  (pendings || []).forEach(p => {
    const bNo = String(p.bearingNo || '').trim().toUpperCase();
    const qty = parseInt(p.quantity, 10) || 0;
    if (!bNo || qty <= 0) return;
    pendingTotalByBearing[bNo] = (pendingTotalByBearing[bNo] || 0) + qty;
    if (p.unit) {
      const uKey = `${p.unit.trim()}|${bNo}`;
      pendingByUnit[uKey] = (pendingByUnit[uKey] || 0) + qty;
    }
  });

  // ── STEP 4: Bearing-level target, then split to units ────────────────────
  const baselineItems = [];

  Object.keys(bearingUnits).forEach(bKey => {
    const units        = bearingUnits[bKey];
    const { bearingNo, category } = units[0];

    const totalCY      = bearingRecentTotals[bKey]   || 0;
    const totalPY      = bearingPreviousTotals[bKey] || 0;
    const bearingBase  = Math.max(totalCY, totalPY); // ← max at bearing level
    const cyWins       = totalCY >= totalPY;

    const totalPending  = pendingTotalByBearing[bearingNo] || 0;
    // Add pending first, then apply growth: (base + pending) * (1 + growth%)
    const bearingTarget = Math.round((bearingBase + totalPending) * (1 + parsedGrowth / 100));

    // Weights = unit quantities from the winning period
    const weights   = units.map(u => cyWins ? u.qtyRecent : u.qtyPrevious);
    const weightSum = weights.reduce((s, w) => s + w, 0);

    // Floor shares + largest-remainder to eliminate rounding drift
    let allocated = 0;
    const shares = units.map((u, i) => {
      const w     = weights[i];
      const exact = weightSum > 0
        ? bearingTarget * w / weightSum
        : bearingTarget / units.length;
      const floor = Math.floor(exact);
      allocated  += floor;
      return { u, share: floor, remainder: exact - floor };
    });

    let leftover = bearingTarget - allocated;
    shares.sort((a, b) => b.remainder - a.remainder);
    for (let i = 0; i < leftover; i++) {
      shares[i % shares.length].share += 1;
    }
    // Restore original order
    shares.sort((a, b) => {
      const ia = units.indexOf(a.u);
      const ib = units.indexOf(b.u);
      return ia - ib;
    });

    // Per-unit pending: use unit-tagged value if available, else proportional
    let unitTaggedTotal = 0;
    units.forEach(u => {
      const uKey = `${u.unit}|${bearingNo}`;
      unitTaggedTotal += pendingByUnit[uKey] || 0;
    });
    const untaggedPending = totalPending - unitTaggedTotal;

    shares.forEach(({ u, share }) => {
      const uKey       = `${u.unit}|${bearingNo}`;
      const taggedPend = pendingByUnit[uKey] || 0;
      // Proportional share of untagged pending
      const uWeight    = cyWins ? u.qtyRecent : u.qtyPrevious;
      const untaggedShare = untaggedPending > 0 && weightSum > 0
        ? Math.round(untaggedPending * uWeight / weightSum)
        : (untaggedPending > 0 ? Math.round(untaggedPending / units.length) : 0);
      const uPending   = taggedPend + untaggedShare;

      baselineItems.push({
        unit:        u.unit,
        bearingNo:   u.bearingNo,
        category:    u.category,
        qtyRecent:   u.qtyRecent,
        qtyPrevious: u.qtyPrevious,
        qtyBase:     bearingBase,   // bearing-level base for display reference
        qtyPending:  uPending,
        targetQty:   share          // already includes pending + growth at bearing level
      });
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
    recentMonths:    recent,
    previousMonths:  previous,
    missingRecent:   missingRecentMonths.map(m => `${m.monthName} ${m.year}`),
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
  const parsedGap  = (gap !== null && gap !== undefined && !isNaN(parseInt(gap, 10)))
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
  const planMonths = [];
  let m = isStartMonth ? startMonth : startMonth + 1;
  let y = startYear;
  if (m > 12) { m = 1; y += 1; }

  for (let i = 0; i < N; i++) {
    if (m > 12) { m = 1; y += 1; }
    planMonths.push({ monthNum: m, monthName: MONTH_NAMES[m - 1], year: y });
    m++;
  }

  const rawMinThresholds = Array.isArray(rules.minThresholds) ? rules.minThresholds : [];
  const minThresholds = [
    Math.max(0, parseInt(rawMinThresholds[0], 10) || 0),
    Math.max(0, parseInt(rawMinThresholds[1], 10) || 0),
    Math.max(0, parseInt(rawMinThresholds[2], 10) || 0)
  ];
  const gapMonth       = rules.gapMonth !== undefined && rules.gapMonth !== null ? rules.gapMonth : null;
  const dividingRatios = rules.dividingRatios || [];
  const itemsList      = [];

  const activeThresholds = minThresholds
    .filter(val => typeof val === 'number' && val > 0)
    .sort((a, b) => a - b);
  const M = activeThresholds.length;

  // Bearing-level grand totals (sum across units) for threshold bucketing
  const bearingGrandTotals = {};
  baselineItems.forEach(item => {
    bearingGrandTotals[item.bearingNo] = (bearingGrandTotals[item.bearingNo] || 0) + (item.targetQty || 0);
  });

  const bearingConfigs = {};
  Object.keys(bearingGrandTotals).forEach(bNo => {
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

    bearingConfigs[bNo] = { distMonths, useDividingRatios, activeIndices };
  });

  baselineItems.forEach(item => {
    const totalPlanned = item.targetQty;
    const bConfig = bearingConfigs[item.bearingNo] || {
      distMonths: 1,
      useDividingRatios: false,
      activeIndices: [0]
    };
    const { distMonths, useDividingRatios, activeIndices } = bConfig;

    const A = Array(N).fill(0);
    if (distMonths > 0) {
      if (useDividingRatios) {
        const ratioSum = dividingRatios.reduce((s, r) => s + r, 0);
        if (ratioSum > 0) {
          const activeRatioSum = activeIndices.reduce((sum, idx) => sum + (dividingRatios[idx] || 0), 0);
          if (activeRatioSum > 0) {
            let allocated = 0;
            const shares = activeIndices.map(idx => {
              const ratio = dividingRatios[idx] || 0;
              const share = Math.floor(totalPlanned * ratio / activeRatioSum);
              allocated += share;
              return { idx, share, remainder: (totalPlanned * ratio / activeRatioSum) - share };
            });
            let remainder = totalPlanned - allocated;
            shares.sort((a, b) => b.remainder - a.remainder);
            let remIdx = 0;
            while (remainder > 0) {
              shares[remIdx % shares.length].share += 1;
              remainder--;
              remIdx++;
            }
            shares.forEach(s => { A[s.idx] = s.share; });
          } else {
            const baseShare = Math.floor(totalPlanned / distMonths);
            const remainder = totalPlanned % distMonths;
            activeIndices.forEach((idx, i) => { A[idx] = baseShare + (i < remainder ? 1 : 0); });
          }
        } else {
          const baseShare = Math.floor(totalPlanned / distMonths);
          const remainder = totalPlanned % distMonths;
          activeIndices.forEach((idx, i) => { A[idx] = baseShare + (i < remainder ? 1 : 0); });
        }
      } else {
        const baseShare = Math.floor(totalPlanned / distMonths);
        const remainder = totalPlanned % distMonths;
        activeIndices.forEach((idx, i) => { A[idx] = baseShare + (i < remainder ? 1 : 0); });
      }
    }

    planMonths.forEach((mo, idx) => {
      itemsList.push({
        unitName:         item.unit,
        bearingNo:        item.bearingNo,
        category:         item.category,
        targetMonth:      mo.monthNum,
        targetYear:       mo.year,
        originalQuantity: A[idx],
        plannedQuantity:  A[idx],
        qtyRecent:        item.qtyRecent   || 0,
        qtyPrevious:      item.qtyPrevious || 0,
        qtyBase:          item.qtyBase     || 0,
        qtyPending:       item.qtyPending  || 0,
        isManuallyEdited: false
      });
    });
  });

  return { planMonths, itemsList };
}
