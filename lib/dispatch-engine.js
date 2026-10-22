export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

/**
 * Computes the 4 comparison months for a target planning month and year:
 * 1. Current Year Month M-2 (e.g. Sep 2026 for Nov 2026)
 * 2. Current Year Month M-1 (e.g. Oct 2026 for Nov 2026)
 * 3. Previous Year Month M-1 (e.g. Oct 2025 for Nov 2026)
 * 4. Previous Year Month M (e.g. Nov 2025 for Nov 2026)
 */
export function getDispatchComparisonMonths(targetMonth, targetYear) {
  const m = parseInt(targetMonth, 10);
  const y = parseInt(targetYear, 10);

  // Month 1: CY (M - 2)
  let m1Month = m - 2;
  let m1Year = y;
  if (m1Month < 1) {
    m1Month += 12;
    m1Year -= 1;
  }

  // Month 2: CY (M - 1)
  let m2Month = m - 1;
  let m2Year = y;
  if (m2Month < 1) {
    m2Month += 12;
    m2Year -= 1;
  }

  // Month 3: PY (M - 1)
  let m3Month = m - 1;
  let m3Year = y - 1;
  if (m3Month < 1) {
    m3Month += 12;
    m3Year -= 1;
  }

  // Month 4: PY (M)
  let m4Month = m;
  let m4Year = y - 1;

  return [
    {
      index: 0,
      monthNum: m1Month,
      monthName: MONTH_NAMES[m1Month - 1],
      year: m1Year,
      label: `${MONTH_NAMES[m1Month - 1].substring(0, 3)} ${m1Year}`,
      isCurrentYear: true
    },
    {
      index: 1,
      monthNum: m2Month,
      monthName: MONTH_NAMES[m2Month - 1],
      year: m2Year,
      label: `${MONTH_NAMES[m2Month - 1].substring(0, 3)} ${m2Year}`,
      isCurrentYear: true
    },
    {
      index: 2,
      monthNum: m3Month,
      monthName: MONTH_NAMES[m3Month - 1],
      year: m3Year,
      label: `${MONTH_NAMES[m3Month - 1].substring(0, 3)} ${m3Year}`,
      isCurrentYear: false
    },
    {
      index: 3,
      monthNum: m4Month,
      monthName: MONTH_NAMES[m4Month - 1],
      year: m4Year,
      label: `${MONTH_NAMES[m4Month - 1].substring(0, 3)} ${m4Year}`,
      isCurrentYear: false
    }
  ];
}

/**
 * Returns the 5 target planning months for dispatch planning:
 * - 1 previous month (N - 1)
 * - The planning month (N)
 * - 3 future months (N + 1, N + 2, N + 3)
 * 
 * Example: If baseMonth is October (10) and baseYear is 2026:
 * Returns: September 2026 (N-1), October 2026 (N), November 2026 (N+1), December 2026 (N+2), January 2027 (N+3)
 */
export function getDispatchPlanningMonths(baseMonth, baseYear) {
  const m = parseInt(baseMonth, 10) || (new Date().getMonth() + 1);
  const y = parseInt(baseYear, 10) || new Date().getFullYear();

  const months = [];
  for (let offset = -1; offset <= 3; offset++) {
    let targetM = m + offset;
    let targetY = y;

    while (targetM < 1) {
      targetM += 12;
      targetY -= 1;
    }
    while (targetM > 12) {
      targetM -= 12;
      targetY += 1;
    }

    months.push({
      monthNum: targetM,
      monthName: MONTH_NAMES[targetM - 1],
      year: targetY,
      label: `${MONTH_NAMES[targetM - 1]} ${targetY}`,
      isCurrentMonth: offset === 0,
      offset
    });
  }

  return months;
}

/**
 * Validates whether required sales records exist to calculate a dispatch plan
 */
export function checkDispatchFeasibility(records, targetMonth, targetYear) {
  const comparisonMonths = getDispatchComparisonMonths(targetMonth, targetYear);
  const m1 = comparisonMonths[0];
  const m2 = comparisonMonths[1];

  let hasM1 = false;
  let hasM2 = false;
  let hasAnyHistorical = false;

  for (const r of records) {
    const rMonthNum = parseInt(r.month, 10) || (MONTH_NAMES.indexOf(r.month) + 1);
    const rYear = parseInt(r.year, 10);

    if (rMonthNum === m1.monthNum && rYear === m1.year) hasM1 = true;
    if (rMonthNum === m2.monthNum && rYear === m2.year) hasM2 = true;

    if (comparisonMonths.some(cm => cm.monthNum === rMonthNum && cm.year === rYear)) {
      hasAnyHistorical = true;
    }

    if (hasM1 && hasM2) break;
  }

  return {
    feasible: (hasM1 && hasM2) || hasAnyHistorical || (records && records.length > 0),
    hasFullCYPreceding: hasM1 && hasM2,
    missing: [
      !hasM1 ? `${m1.monthName} ${m1.year}` : null,
      !hasM2 ? `${m2.monthName} ${m2.year}` : null
    ].filter(Boolean),
    comparisonMonths
  };
}

/**
 * Calculates Dispatch Planning
 */
export function calculateDispatchPlan(records, pendings = [], stocks = [], targetMonth, targetYear, growthRate = 20, depotRatios = {}) {
  const comparisonMonths = getDispatchComparisonMonths(targetMonth, targetYear);
  const parsedGrowth = typeof growthRate === 'number' ? growthRate : (parseFloat(growthRate) || 0);

  // Index stocks by bearingNo
  const stockMap = {};
  stocks.forEach(s => {
    if (s.bearingNo) {
      stockMap[s.bearingNo] = s.quantity || 0;
    }
  });

  // Index pendings by unit|bearingNo and by bearingNo
  const pendingByUnitBearing = {};
  const pendingByBearing = {};
  pendings.forEach(p => {
    const qty = p.quantity || 0;
    const bNo = p.bearingNo || '';
    const u = (p.unit || '').trim();
    if (u) {
      pendingByUnitBearing[`${u}|${bNo}`] = (pendingByUnitBearing[`${u}|${bNo}`] || 0) + qty;
    }
    pendingByBearing[bNo] = (pendingByBearing[bNo] || 0) + qty;
  });

  // Track sales across the 4 comparison months
  // Key: `${unit}|${bearingNo}|${category}`
  const salesMap = {};
  const allKeys = new Set();

  records.forEach(r => {
    const u = r.unit || 'General';
    const bNo = r.bearingNo || 'General';
    const cat = r.category || 'General';
    const rMonthNum = parseInt(r.month, 10) || (MONTH_NAMES.indexOf(r.month) + 1);
    const rYear = parseInt(r.year, 10);
    const qty = r.quantity || 0;

    const key = `${u}|${bNo}|${cat}`;
    allKeys.add(key);

    if (!salesMap[key]) {
      salesMap[key] = [0, 0, 0, 0];
    }

    comparisonMonths.forEach((cm, idx) => {
      if (rMonthNum === cm.monthNum && rYear === cm.year) {
        salesMap[key][idx] += qty;
      }
    });
  });

  // Also include pendings that might not have historical records
  pendings.forEach(p => {
    const bNo = p.bearingNo;
    const u = (p.unit || '').trim() || 'General';
    if (bNo) {
      let found = false;
      allKeys.forEach(k => {
        if (k.startsWith(`${u}|${bNo}|`) || k.split('|')[1] === bNo) found = true;
      });
      if (!found) {
        allKeys.add(`${u}|${bNo}|General`);
      }
    }
  });

  // Count bearing appearances to split global pending evenly
  const bearingKeyCounts = {};
  allKeys.forEach(key => {
    const bNo = key.split('|')[1];
    bearingKeyCounts[bNo] = (bearingKeyCounts[bNo] || 0) + 1;
  });

  const pendingAllocatedMap = {};
  const pendingDoneCountMap = {};

  // First pass: compute preliminary grossQty to proportionally allocate bearing-level stock
  const preliminaryItems = [];
  const bearingGrossTotals = {};

  allKeys.forEach(key => {
    const [depot, bearingNo, category] = key.split('|');
    const monthlySales = salesMap[key] || [0, 0, 0, 0];
    const highestSales = Math.max(...monthlySales);
    let highestMonthIndex = 0;
    for (let i = 0; i < 4; i++) {
      if (monthlySales[i] === highestSales) {
        highestMonthIndex = i;
        break;
      }
    }

    const growthQty = Math.round(highestSales * (1 + parsedGrowth / 100));

    // Calculate pending quantity
    let pendingQty = 0;
    const uKey = `${depot}|${bearingNo}`;
    if (pendingByUnitBearing[uKey] !== undefined) {
      pendingQty = pendingByUnitBearing[uKey];
    } else if (pendingByBearing[bearingNo] !== undefined) {
      const totalGlobal = pendingByBearing[bearingNo];
      const itemCnt = bearingKeyCounts[bearingNo] || 1;
      const doneCount = (pendingDoneCountMap[bearingNo] || 0) + 1;
      pendingDoneCountMap[bearingNo] = doneCount;

      if (doneCount === itemCnt) {
        pendingQty = totalGlobal - (pendingAllocatedMap[bearingNo] || 0);
      } else {
        pendingQty = Math.floor(totalGlobal / itemCnt);
        pendingAllocatedMap[bearingNo] = (pendingAllocatedMap[bearingNo] || 0) + pendingQty;
      }
    }

    const grossQty = growthQty + pendingQty;
    bearingGrossTotals[bearingNo] = (bearingGrossTotals[bearingNo] || 0) + grossQty;

    preliminaryItems.push({
      depot,
      bearingNo,
      category,
      monthlySales,
      highestSales,
      highestMonthIndex,
      growthQty,
      pendingQty,
      grossQty
    });
  });

  // Second pass: subtract stock and split into 4 dispatches
  const stockAllocatedMap = {};
  const stockDoneCountMap = {};
  const items = [];

  let totalNetDispatch = 0;
  let totalDispatch1 = 0;
  let totalDispatch2 = 0;
  let totalDispatch3 = 0;
  let totalDispatch4 = 0;

  preliminaryItems.forEach(item => {
    const totalAvailStock = stockMap[item.bearingNo] || 0;
    const bGrossTotal = bearingGrossTotals[item.bearingNo] || 0;
    const itemCnt = bearingKeyCounts[item.bearingNo] || 1;
    const doneCount = (stockDoneCountMap[item.bearingNo] || 0) + 1;
    stockDoneCountMap[item.bearingNo] = doneCount;

    let stockQty = 0;
    if (totalAvailStock > 0) {
      if (doneCount === itemCnt) {
        stockQty = totalAvailStock - (stockAllocatedMap[item.bearingNo] || 0);
      } else if (bGrossTotal > 0) {
        stockQty = Math.round((totalAvailStock * item.grossQty) / bGrossTotal);
        stockAllocatedMap[item.bearingNo] = (stockAllocatedMap[item.bearingNo] || 0) + stockQty;
      } else {
        stockQty = Math.floor(totalAvailStock / itemCnt);
        stockAllocatedMap[item.bearingNo] = (stockAllocatedMap[item.bearingNo] || 0) + stockQty;
      }
      stockQty = Math.min(stockQty, item.grossQty);
    }

    const netDispatchTarget = Math.max(0, item.grossQty - stockQty);

    // Get depot dispatch dividing ratios (defaults to 25% each)
    let ratios = [25, 25, 25, 25];
    if (depotRatios && depotRatios[item.depot] && Array.isArray(depotRatios[item.depot])) {
      const custom = depotRatios[item.depot];
      if (custom.length === 4 && custom.reduce((a, b) => a + b, 0) === 100) {
        ratios = custom;
      }
    }

    // Allocate 4 dispatches using Largest Remainder Method
    let allocated = 0;
    const shares = ratios.map((r, i) => {
      const exact = (netDispatchTarget * r) / 100;
      const base = Math.floor(exact);
      allocated += base;
      return { idx: i, share: base, remainder: exact - base };
    });

    let rem = netDispatchTarget - allocated;
    shares.sort((a, b) => b.remainder - a.remainder);
    for (let k = 0; k < rem; k++) {
      shares[k % shares.length].share += 1;
    }
    shares.sort((a, b) => a.idx - b.idx);

    const d1 = shares[0].share;
    const d2 = shares[1].share;
    const d3 = shares[2].share;
    const d4 = shares[3].share;

    totalNetDispatch += netDispatchTarget;
    totalDispatch1 += d1;
    totalDispatch2 += d2;
    totalDispatch3 += d3;
    totalDispatch4 += d4;

    items.push({
      depot: item.depot,
      bearingNo: item.bearingNo,
      category: item.category,
      m1Sales: item.monthlySales[0],
      m2Sales: item.monthlySales[1],
      m3Sales: item.monthlySales[2],
      m4Sales: item.monthlySales[3],
      m1Label: comparisonMonths[0].label,
      m2Label: comparisonMonths[1].label,
      m3Label: comparisonMonths[2].label,
      m4Label: comparisonMonths[3].label,
      highestSales: item.highestSales,
      highestMonthIndex: item.highestMonthIndex,
      growthQty: item.growthQty,
      pendingQty: item.pendingQty,
      grossQty: item.grossQty,
      stockQty,
      netDispatchTarget,
      dispatch1: d1,
      dispatch2: d2,
      dispatch3: d3,
      dispatch4: d4,
      isManuallyEdited: false
    });
  });

  return {
    success: true,
    comparisonMonths,
    totals: {
      totalNetDispatch,
      totalDispatch1,
      totalDispatch2,
      totalDispatch3,
      totalDispatch4
    },
    items
  };
}
