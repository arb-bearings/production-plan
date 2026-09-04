// app/page.js
"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Chart from 'chart.js/auto';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function Home() {
  // --- STATE LAYER ---
  const [records, setRecords] = useState([]);
  const [plans, setPlans] = useState([]);
  const [activePlan, setActivePlan] = useState(null);
  const [activePlanItems, setActivePlanItems] = useState([]);
  
  const [role, setRole] = useState("Admin"); // Admin, Production Planner, Viewer
  const [theme, setTheme] = useState("light"); // light (default), dark
  const [activeTab, setActiveTab] = useState("dashboard"); // dashboard, ingestion, planning, reports
  const [metricMode, setMetricMode] = useState("quantity"); // quantity, basicValue, withGstValue
  
  // Unified Filters state
  const [filters, setFilters] = useState({
    year: [],
    quarter: [],
    month: [],
    unit: [],
    category: [],
    partyName: "",
    bearingNo: ""
  });

  // Planning parameters state
  const [growthRate, setGrowthRate] = useState(20);
  const [minThreshold, setMinThreshold] = useState(85);
  const [maxThreshold, setMaxThreshold] = useState(115);
  const [planningPeriod, setPlanningPeriod] = useState(6); // N Months
  const [startMonth, setStartMonth] = useState(8); // 1-12 (August default)
  const [startYear, setStartYear] = useState(2026);
  const [finalMonthRuleUnder, setFinalMonthRuleUnder] = useState("merge-backward");
  const [finalMonthRuleOver, setFinalMonthRuleOver] = useState("split-retain");
  const [minThresholds, setMinThresholds] = useState([]);
  const [gapMonth, setGapMonth] = useState(null);
  const [dividingRatios, setDividingRatios] = useState([]);
  const [planningError, setPlanningError] = useState(null);

  // Stocks state
  const [stocks, setStocks] = useState({});
  const [isStockDragOver, setIsStockDragOver] = useState(false);

  // Sorting state
  const [sortField, setSortField] = useState(null);
  const [sortOrder, setSortOrder] = useState("desc");

  // Dropdown menus visibility state
  const [activeDropdown, setActiveDropdown] = useState(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.custom-dropdown-container')) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  useEffect(() => {
    setMinThresholds(prev => {
      const requiredLength = Math.max(0, planningPeriod - 1);
      const next = [...prev];
      if (next.length < requiredLength) {
        return [...next, ...Array(requiredLength - next.length).fill(0)];
      } else if (next.length > requiredLength) {
        return next.slice(0, requiredLength);
      }
      return next;
    });
    setDividingRatios(prev => {
      const requiredLength = planningPeriod;
      const next = [...prev];
      if (next.length < requiredLength) {
        return [...next, ...Array(requiredLength - next.length).fill(0)];
      } else if (next.length > requiredLength) {
        return next.slice(0, requiredLength);
      }
      return next;
    });
  }, [planningPeriod]);

  // Ingestion state
  const [uploaderErrors, setUploaderErrors] = useState([]);
  const [uploaderPreview, setUploaderPreview] = useState([]);
  const [uploaderPreviewPage, setUploaderPreviewPage] = useState(1);
  const [tempUploadRows, setTempUploadRows] = useState([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [planningPage, setPlanningPage] = useState(1);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState("Initializing ARB Bearings Workspace...");

  // Operational Reports active submenu
  const [activeReport, setActiveReport] = useState("monthly"); // monthly, quarterly, plan_nmonth, etc.

  // Cell overrides editing state
  const [editingCell, setEditingCell] = useState(null); // { bearingNo, unitName, month, year }
  const [editValue, setEditValue] = useState("");

  const [selectedReportRows, setSelectedReportRows] = useState([]);

  useEffect(() => {
    setSelectedReportRows([]);
  }, [activeReport, filters]);

  useEffect(() => {
    setPlanningPage(1);
  }, [filters, activePlanItems]);

  const handleTabSwitch = (tabName) => {
    setActiveTab(tabName);
  };

  // Refs for Chart instances to safely destroy on update
  const chartInstancesRef = useRef({});

  // --- INITIAL DATA FETCH WITH FULL LOADING CYCLE ---
  useEffect(() => {
    let isCancelled = false;

    const loadAllInitialData = async () => {
      try {
        setLoadingStatus("Connecting to MongoDB database...");
        
        await Promise.allSettled([
          fetchRecords(),
          fetchPlans(),
          fetchStocks()
        ]);

        if (!isCancelled) {
          setLoadingStatus("Compiling dashboard analytics & rolling targets...");
        }
      } catch (err) {
        console.error("Initial load sequence error:", err);
      } finally {
        if (!isCancelled) {
          setTimeout(() => {
            setIsAppLoading(false);
            setTimeout(() => {
              setShowLoadingScreen(false);
            }, 500); // Allow fade-out transition to complete before unmounting
          }, 600);
        }
      }
    };

    loadAllInitialData();

    return () => {
      isCancelled = true;
    };
  }, []);

  const fetchRecords = async () => {
    try {
      setLoadingStatus("Loading historical production records...");
      const res = await fetch('/api/records');
      const data = await res.json();
      if (data.success) {
        setRecords(data.records || []);
        // Set initial preview to historical records
        setUploaderPreview(data.records || []);
        setUploaderPreviewPage(1);
      }
    } catch (err) {
      console.error("Error fetching records:", err);
    }
  };

  const fetchStocks = async () => {
    try {
      setLoadingStatus("Loading inventory stock levels...");
      const res = await fetch('/api/stocks');
      const data = await res.json();
      if (data.success) {
        const stockMap = {};
        (data.stocks || []).forEach(s => {
          stockMap[s.bearingNo] = s.quantity;
        });
        setStocks(stockMap);
      }
    } catch (err) {
      console.error("Error fetching stocks:", err);
    }
  };

  const fetchPlans = async () => {
    try {
      setLoadingStatus("Loading active rolling production plan...");
      const res = await fetch('/api/plans');
      const data = await res.json();
      if (data.success) {
        setPlans(data.plan ? [data.plan] : []);
        setActivePlan(data.plan);
        setActivePlanItems(data.items || []);
        if (data.plan) {
          setGrowthRate(data.plan.growthRate);
          setPlanningPeriod(data.plan.planningPeriod);
          const planStartMonth = data.plan.startMonth || (data.items && data.items.length > 0 ? data.items[0].targetMonth : 8);
          const planStartYear = data.plan.startYear || (data.items && data.items.length > 0 ? data.items[0].targetYear : 2026);
          setStartMonth(planStartMonth);
          setStartYear(planStartYear);
          setFinalMonthRuleUnder(data.plan.finalMonthRuleUnder || "merge-backward");
          setFinalMonthRuleOver(data.plan.finalMonthRuleOver || "split-retain");
          setMinThresholds(data.plan.minThresholds && data.plan.minThresholds.length === data.plan.planningPeriod - 1 
            ? data.plan.minThresholds 
            : Array(data.plan.planningPeriod - 1).fill(0));
          setGapMonth(data.plan.gapMonth !== undefined ? data.plan.gapMonth : null);
          setDividingRatios(data.plan.dividingRatios && data.plan.dividingRatios.length === data.plan.planningPeriod
            ? data.plan.dividingRatios
            : Array(data.plan.planningPeriod).fill(0));
        }
      }
    } catch (err) {
      console.error("Error fetching active plan:", err);
    }
  };

  // --- THEME CONTROL ---
  useEffect(() => {
    if (theme === "dark") {
      document.body.classList.add("dark-theme");
      document.body.classList.remove("light-theme");
    } else {
      document.body.classList.add("light-theme");
      document.body.classList.remove("dark-theme");
    }
  }, [theme]);

  // --- ROLE PERSONA INDICATOR CONTROLS ---
  const isAdmin = role === "Admin";
  const isPlanner = role === "Production Planner";
  const isViewer = role === "Viewer";

  // --- FILTERED DATA SETS ---
  const filteredActuals = useMemo(() => {
    return records.filter(r => {
      if (filters.year.length > 0 && !filters.year.includes(String(r.year))) return false;
      if (filters.quarter.length > 0 && !filters.quarter.includes(r.quarter)) return false;
      if (filters.month.length > 0 && !filters.month.includes(r.month)) return false;
      if (filters.unit.length > 0 && !filters.unit.includes(r.unit)) return false;
      if (filters.category.length > 0 && !filters.category.includes(r.category)) return false;
      if (filters.partyName && !r.partyName.toLowerCase().includes(filters.partyName.toLowerCase())) return false;
      if (filters.bearingNo && !r.bearingNo.toLowerCase().includes(filters.bearingNo.toLowerCase())) return false;
      return true;
    });
  }, [records, filters]);

  // Filter choices
  const uniqueYears = useMemo(() => {
    return [...new Set(records.map(r => r.year))].sort((a,b)=>b-a);
  }, [records]);

  const uniqueUnits = useMemo(() => {
    return [...new Set(records.map(r => r.unit))].sort();
  }, [records]);

  const uniqueCategories = useMemo(() => {
    return [...new Set(records.map(r => r.category))].sort();
  }, [records]);

  const handleFilterChange = (field, val) => {
    setFilters(prev => ({
      ...prev,
      [field]: val
    }));
  };

  const handleCheckboxFilter = (field, val, checked) => {
    setFilters(prev => {
      const current = prev[field];
      const updated = checked ? [...current, val] : current.filter(x => x !== val);
      return { ...prev, [field]: updated };
    });
  };

  const handleSelectAllFilter = (field, allOptions, checked) => {
    setFilters(prev => ({
      ...prev,
      [field]: checked ? allOptions : []
    }));
  };

  const resetFilters = () => {
    setFilters({
      year: [],
      quarter: [],
      month: [],
      unit: [],
      category: [],
      partyName: "",
      bearingNo: ""
    });
    setMetricMode("quantity");
  };

  // --- KPI CARD METRIC COMPUTATIONS ---
  const getVal = (r) => {
    if (metricMode === "basicValue") return r.basicValue || 0;
    if (metricMode === "withGstValue") return r.withGstValue || 0;
    return r.quantity || 0;
  };

  const formatMetric = (val) => {
    if (metricMode === "quantity") {
      return Math.round(val).toLocaleString();
    } else {
      return "₹" + Math.round(val).toLocaleString();
    }
  };

  const kpis = useMemo(() => {
    const totalActual = filteredActuals.reduce((sum, r) => sum + getVal(r), 0);
    const activeUnits = new Set(filteredActuals.map(r => r.unit)).size;
    const activeCategories = new Set(filteredActuals.map(r => r.category)).size;
    const activeBearings = new Set(filteredActuals.map(r => r.bearingNo)).size;

    // Estimate avg price per bearing style to calculate planned monetary values
    const prices = {};
    filteredActuals.forEach(r => {
      const key = r.bearingNo;
      if (!prices[key]) {
        prices[key] = { val: 0, qty: 0 };
      }
      prices[key].val += r.basicValue || 0;
      prices[key].qty += r.quantity || 0;
    });

    const getPlannedValue = (bearingNo, qty) => {
      const p = prices[bearingNo];
      const avgPrice = (p && p.qty > 0) ? (p.val / p.qty) : 120; // fallback default
      if (metricMode === "basicValue") {
        return qty * avgPrice;
      } else if (metricMode === "withGstValue") {
        return qty * avgPrice * 1.18;
      }
      return qty;
    };

    const currentYear = 2026; // spec base
    const yearlyPlanItems = activePlanItems.filter(item => item.targetYear === currentYear);
    const totalPlanned = yearlyPlanItems.reduce((sum, item) => sum + getPlannedValue(item.bearingNo, item.plannedQuantity), 0);

    const thisYearActuals = filteredActuals.filter(r => r.year === currentYear);
    const matchedActual = thisYearActuals.reduce((sum, r) => sum + getVal(r), 0);

    const pctMet = totalPlanned > 0 ? ((matchedActual / totalPlanned) * 100).toFixed(1) : "0.0";

    // Forecast Accuracy (WAPE based)
    const targetMonthsMap = {};
    yearlyPlanItems.forEach(item => {
      const key = `${item.targetMonth}|${item.bearingNo}`;
      const planVal = getPlannedValue(item.bearingNo, item.plannedQuantity);
      targetMonthsMap[key] = { planned: (targetMonthsMap[key]?.planned || 0) + planVal, actual: 0 };
    });

    thisYearActuals.forEach(r => {
      const mIdx = MONTH_NAMES.indexOf(r.month) + 1;
      const key = `${mIdx}|${r.bearingNo}`;
      if (targetMonthsMap[key]) {
        targetMonthsMap[key].actual += getVal(r);
      }
    });

    let sumAbsoluteError = 0;
    let sumPlanned = 0;
    Object.keys(targetMonthsMap).forEach(key => {
      const { planned, actual } = targetMonthsMap[key];
      sumAbsoluteError += Math.abs(actual - planned);
      sumPlanned += planned;
    });

    let forecastAccuracy = 100;
    if (sumPlanned > 0) {
      forecastAccuracy = Math.max(0, (1 - sumAbsoluteError / sumPlanned) * 100);
    }

    return {
      totalActual,
      activeUnits,
      activeCategories,
      activeBearings,
      totalPlanned,
      matchedActual,
      pctMet,
      forecastAccuracy: forecastAccuracy.toFixed(2) + "%"
    };

  }, [filteredActuals, activePlanItems, metricMode]);

  // --- CHART RENDERING ENGINE (React Integration) ---
  useEffect(() => {
    if (activeTab !== "dashboard" || filteredActuals.length === 0) return;

    let isMounted = true;
    const animationFrameId = requestAnimationFrame(() => {
      if (!isMounted) return;

      const colors = {
        primary: "#8b5cf6",
        primaryGlow: theme === "light" ? "rgba(139, 92, 246, 0.08)" : "rgba(139, 92, 246, 0.15)",
        secondary: "#3b82f6",
        accent: "#a855f7",
        accentGlow: "rgba(168, 85, 247, 0.2)",
        success: "#10b981",
        warning: "#f59e0b",
        danger: "#ef4444",
        grid: theme === "light" ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.05)",
        text: theme === "light" ? "#4b5563" : "#9ca3af",
        palette: [
          "#8b5cf6", "#3b82f6", "#a855f7", "#10b981", 
          "#f59e0b", "#ec4899", "#14b8a6", "#f43f5e",
          "#06b6d4", "#84cc16", "#eab308", "#6366f1"
        ]
      };

      const safeDraw = (canvasId, config) => {
        try {
          const el = document.getElementById(canvasId);
          if (!el) return;

          // Destroy existing Chart instance attached to this canvas if any
          const existingOnEl = Chart.getChart(el);
          if (existingOnEl) {
            existingOnEl.destroy();
          }
          if (chartInstancesRef.current[canvasId]) {
            try {
              chartInstancesRef.current[canvasId].destroy();
            } catch (_) {}
            delete chartInstancesRef.current[canvasId];
          }

          const ctx = el.getContext("2d");
          if (!ctx) return;
          chartInstancesRef.current[canvasId] = new Chart(ctx, config);
        } catch (err) {
          console.error(`Error rendering chart for ${canvasId}:`, err);
        }
      };

      // 1. Monthly Production Trend (Line)
      const lineMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const currentYear = 2026;
      const prevYear = 2025;
      const dataCurr = Array(12).fill(0);
      const dataPrev = Array(12).fill(0);
      filteredActuals.forEach(r => {
        const mIdx = lineMonths.indexOf(r.month);
        if (mIdx !== -1) {
          if (Number(r.year) === currentYear) dataCurr[mIdx] += getVal(r);
          else if (Number(r.year) === prevYear) dataPrev[mIdx] += getVal(r);
        }
      });

      safeDraw("chart-monthly-trend", {
        type: "line",
        data: {
          labels: lineMonths,
          datasets: [
            {
              label: `${currentYear} Actual`,
              data: dataCurr,
              borderColor: colors.primary,
              backgroundColor: colors.primaryGlow,
              fill: true,
              tension: 0.35,
              borderWidth: 3,
              pointBackgroundColor: colors.primary
            },
            {
              label: `${prevYear} Actual`,
              data: dataPrev,
              borderColor: colors.secondary,
              backgroundColor: "transparent",
              borderDash: [5, 5],
              tension: 0.35,
              borderWidth: 2,
              pointBackgroundColor: colors.secondary
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: colors.text, font: { family: "Outfit" } } },
            tooltip: {
              mode: "index",
              intersect: false,
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${formatMetric(ctx.parsed.y)}`
              }
            }
          },
          scales: {
            x: { grid: { color: colors.grid }, ticks: { color: colors.text } },
            y: { grid: { color: colors.grid }, ticks: { color: colors.text, callback: (v) => formatMetric(v) } }
          }
        }
      });

      // 2. Unit Contribution (Donut)
      const unitMap = {};
      filteredActuals.forEach(r => { 
        const u = r.unit || "Unknown";
        unitMap[u] = (unitMap[u] || 0) + getVal(r); 
      });
      safeDraw("chart-unit-contribution", {
        type: "doughnut",
        data: {
          labels: Object.keys(unitMap),
          datasets: [{
            data: Object.values(unitMap),
            backgroundColor: colors.palette,
            borderWidth: 1,
            borderColor: "rgba(0,0,0,0.1)"
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "right", labels: { color: colors.text } }
          }
        }
      });

      // 3. Planned vs Actual (Combo)
      const planMonthsKeys = {};
      (activePlanItems || []).forEach(item => {
        const key = `${item.targetYear}-${String(item.targetMonth).padStart(2,'0')}`;
        if (!planMonthsKeys[key]) planMonthsKeys[key] = { planned: 0, actual: 0 };
        planMonthsKeys[key].planned += (item.plannedQuantity || 0);
      });

      // Match actuals to active plan horizon
      filteredActuals.forEach(r => {
        const mIdx = MONTH_NAMES.indexOf(r.month) + 1;
        const key = `${r.year}-${String(mIdx).padStart(2,'0')}`;
        if (planMonthsKeys[key]) {
          planMonthsKeys[key].actual += (r.quantity || 0);
        }
      });

      const sortedHorizonKeys = Object.keys(planMonthsKeys).sort();
      let plannedDataset = [];
      let actualsDataset = [];
      let horizonLabels = [];

      if (sortedHorizonKeys.length > 0) {
        plannedDataset = sortedHorizonKeys.map(k => planMonthsKeys[k].planned);
        actualsDataset = sortedHorizonKeys.map(k => planMonthsKeys[k].actual);
        horizonLabels = sortedHorizonKeys.map(k => {
          const [y, m] = k.split("-");
          return `${MONTH_NAMES[parseInt(m)-1]?.substring(0,3) || m} ${y}`;
        });
      } else {
        horizonLabels = ["Aug 2026", "Sep 2026", "Oct 2026", "Nov 2026", "Dec 2026", "Jan 2027"];
        plannedDataset = Array(6).fill(0);
        actualsDataset = Array(6).fill(0);
      }

      safeDraw("chart-planned-vs-actual", {
        type: "bar",
        data: {
          labels: horizonLabels,
          datasets: [
            {
              type: "bar",
              label: "Planned Targets",
              data: plannedDataset,
              backgroundColor: "rgba(139, 92, 246, 0.4)",
              borderColor: colors.primary,
              borderWidth: 1,
              borderRadius: 4
            },
            {
              type: "line",
              label: "Actual Yield",
              data: actualsDataset,
              borderColor: colors.success,
              borderWidth: 2,
              fill: false,
              tension: 0.2,
              pointBackgroundColor: colors.success
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: colors.text } }
          },
          scales: {
            x: { grid: { color: colors.grid }, ticks: { color: colors.text } },
            y: { grid: { color: colors.grid }, ticks: { color: colors.text } }
          }
        }
      });

      // 4. Category Contribution (Donut)
      const catMap = {};
      filteredActuals.forEach(r => { 
        const c = r.category || "General";
        catMap[c] = (catMap[c] || 0) + getVal(r); 
      });
      safeDraw("chart-category-contribution", {
        type: "doughnut",
        data: {
          labels: Object.keys(catMap),
          datasets: [{
            data: Object.values(catMap),
            backgroundColor: colors.palette,
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "right", labels: { color: colors.text } }
          }
        }
      });

      // 5. Quarterly Comparison (Grouped Bar)
      const qMap = {};
      filteredActuals.forEach(r => {
        const yr = String(r.year);
        if (!qMap[yr]) qMap[yr] = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
        if (r.quarter && qMap[yr][r.quarter] !== undefined) {
          qMap[yr][r.quarter] += getVal(r);
        }
      });
      const recentYears = Object.keys(qMap).sort().slice(-3);
      const qDatasets = recentYears.map((yr, idx) => ({
        label: yr,
        data: ["Q1", "Q2", "Q3", "Q4"].map(q => qMap[yr][q] || 0),
        backgroundColor: colors.palette[idx % colors.palette.length],
        borderRadius: 4
      }));
      safeDraw("chart-quarterly-compare", {
        type: "bar",
        data: { labels: ["Q1", "Q2", "Q3", "Q4"], datasets: qDatasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: colors.text } } },
          scales: {
            x: { grid: { color: colors.grid }, ticks: { color: colors.text } },
            y: { grid: { color: colors.grid }, ticks: { color: colors.text, callback: (v) => formatMetric(v) } }
          }
        }
      });

      // 6. Year-over-Year Growth (Area)
      const annualMap = {};
      filteredActuals.forEach(r => { 
        const yr = String(r.year);
        annualMap[yr] = (annualMap[yr] || 0) + getVal(r); 
      });
      const sortedYears = Object.keys(annualMap).sort();
      const growthRates = sortedYears.map((yr, idx) => {
        if (idx === 0) return 0;
        const prev = annualMap[sortedYears[idx-1]];
        return prev > 0 ? parseFloat((((annualMap[yr] - prev) / prev) * 100).toFixed(2)) : 0;
      });
      safeDraw("chart-yoy-growth", {
        type: "line",
        data: {
          labels: sortedYears,
          datasets: [{
            label: "YoY Growth (%)",
            data: growthRates,
            borderColor: colors.accent,
            backgroundColor: colors.accentGlow,
            fill: true,
            tension: 0.3,
            borderWidth: 3,
            pointRadius: 5
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: colors.text } } },
          scales: {
            x: { grid: { color: colors.grid }, ticks: { color: colors.text } },
            y: { grid: { color: colors.grid }, ticks: { color: colors.text, callback: (v) => v + "%" } }
          }
        }
      });

      // 7 & 8. Top & Least Produced Bearings (Bar)
      const bearingMap = {};
      filteredActuals.forEach(r => { 
        const b = r.bearingNo || "Unknown";
        bearingMap[b] = (bearingMap[b] || 0) + getVal(r); 
      });
      const bearingsSorted = Object.keys(bearingMap).sort((a,b) => bearingMap[b] - bearingMap[a]);
      const top5 = bearingsSorted.slice(0, 5);
      const least5 = bearingsSorted.slice(-5).reverse();

      safeDraw("chart-top-bearings", {
        type: "bar",
        data: {
          labels: top5,
          datasets: [{
            label: "Top Output",
            data: top5.map(b => bearingMap[b]),
            backgroundColor: "rgba(16, 185, 129, 0.6)",
            borderColor: colors.success,
            borderWidth: 1,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: colors.text } } },
          scales: {
            x: { grid: { color: colors.grid }, ticks: { color: colors.text } },
            y: { grid: { color: colors.grid }, ticks: { color: colors.text } }
          }
        }
      });

      safeDraw("chart-least-bearings", {
        type: "bar",
        data: {
          labels: least5,
          datasets: [{
            label: "Least Output",
            data: least5.map(b => bearingMap[b]),
            backgroundColor: "rgba(239, 68, 68, 0.6)",
            borderColor: colors.danger,
            borderWidth: 1,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: colors.text } } },
          scales: {
            x: { grid: { color: colors.grid }, ticks: { color: colors.text } },
            y: { grid: { color: colors.grid }, ticks: { color: colors.text } }
          }
        }
      });

      // 9. Production by Unit (Horizontal Bar)
      const unitKeys = Object.keys(unitMap).sort((a,b)=>unitMap[b]-unitMap[a]);
      safeDraw("chart-production-by-unit", {
        type: "bar",
        data: {
          labels: unitKeys,
          datasets: [{
            label: "Output by Unit",
            data: unitKeys.map(u => unitMap[u]),
            backgroundColor: colors.secondary,
            borderRadius: 4
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: colors.text } } },
          scales: {
            x: { grid: { color: colors.grid }, ticks: { color: colors.text } },
            y: { grid: { color: colors.grid }, ticks: { color: colors.text } }
          }
        }
      });

      // 10. Production by Category (Vertical Bar)
      const catKeys = Object.keys(catMap).sort((a,b)=>catMap[b]-catMap[a]);
      safeDraw("chart-production-by-category", {
        type: "bar",
        data: {
          labels: catKeys,
          datasets: [{
            label: "Output by Category",
            data: catKeys.map(c => catMap[c]),
            backgroundColor: colors.accent,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: colors.text } } },
          scales: {
            x: { grid: { color: colors.grid }, ticks: { color: colors.text } },
            y: { grid: { color: colors.grid }, ticks: { color: colors.text } }
          }
        }
      });

    });

    return () => {
      isMounted = false;
      cancelAnimationFrame(animationFrameId);
      Object.keys(chartInstancesRef.current).forEach(id => {
        try {
          if (chartInstancesRef.current[id]) {
            chartInstancesRef.current[id].destroy();
          }
        } catch (_) {}
      });
      chartInstancesRef.current = {};
    };

  }, [activeTab, filteredActuals, activePlanItems, metricMode, theme]);

  // Matrix Heatmap calculations (Units vs Months matrix)
  const heatmapData = useMemo(() => {
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const matrix = {};
    uniqueUnits.forEach(u => {
      matrix[u] = Array(12).fill(0);
    });

    // Filtered year actuals (using latest filtered year or 2026 by default)
    const activeYear = filters.year.length > 0 ? parseInt(filters.year[0]) : 2026;
    const yearActuals = filteredActuals.filter(r => r.year === activeYear);

    yearActuals.forEach(r => {
      const mIdx = months.indexOf(r.month);
      if (mIdx !== -1 && matrix[r.unit]) {
        matrix[r.unit][mIdx] += getVal(r);
      }
    });

    // Get max value for coloring opacity
    let max = 1;
    Object.values(matrix).forEach(arr => {
      arr.forEach(val => {
        if (val > max) max = val;
      });
    });

    return { matrix, max, activeYear };
  }, [filteredActuals, uniqueUnits, filters.year, metricMode]);

  // --- AUTOMATED PLANNING ENGINE CALL ---
  const triggerGeneratePlan = async () => {
    if (isViewer) {
      alert("Role Simulation View: Reader Persona does not have write access.");
      return;
    }

    const ratioSum = dividingRatios.reduce((sum, val) => sum + val, 0);
    if (ratioSum !== 0 && ratioSum !== 100) {
      alert("Error: The sum of dividing ratios must be exactly 100% (or all 0% for equal split). Current sum is " + ratioSum + "%.");
      return;
    }

    setPlanningError(null);

    try {
      const res = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          growthRate,
          planningPeriod,
          startMonth,
          startYear,
          finalMonthRuleUnder,
          finalMonthRuleOver,
          minThresholds,
          gapMonth,
          dividingRatios
        })
      });
      const data = await res.json();
      if (data.success) {
        setPlanningError(null);
        setActivePlan(data.plan);
        setActivePlanItems(data.items);
        setPlans(prev => [data.plan, ...prev.filter(p => p._id !== data.plan._id)]);
        const planStartMonth = data.plan.startMonth || startMonth;
        const planStartYear = data.plan.startYear || startYear;
        setStartMonth(planStartMonth);
        setStartYear(planStartYear);
        setGapMonth(data.plan.gapMonth !== undefined ? data.plan.gapMonth : null);
        setDividingRatios(data.plan.dividingRatios && data.plan.dividingRatios.length === data.plan.planningPeriod
          ? data.plan.dividingRatios
          : Array(data.plan.planningPeriod).fill(0));
        alert(`Draft Production Plan generated successfully for ${planningPeriod} months starting ${MONTH_NAMES[planStartMonth - 1]} ${planStartYear}.`);
      } else {
        setPlanningError(data.error || "Failed to generate plan.");
      }
    } catch (err) {
      console.error("Generate plan error:", err);
      setPlanningError("Network or server error while generating plan. Please check database connection.");
    }
  };

  const handleApprovePlan = async () => {
    if (!isAdmin) {
      alert("Role Simulation View: Only Admin persona is allowed to Lock & Approve plans.");
      return;
    }
    if (!activePlan) return;

    try {
      const res = await fetch(`/api/plans/${activePlan._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Approved',
          approvedBy: 'admin'
        })
      });
      const data = await res.json();
      if (data.success) {
        setActivePlan(prev => ({
          ...prev,
          status: 'Approved',
          approvedBy: 'admin',
          approvedAt: new Date().toISOString()
        }));
        alert("Plan locked and approved successfully!");
      }
    } catch (err) {
      console.error("Approve plan error:", err);
    }
  };

  // --- GRID CELLS MANUAL EDIT OVERRIDES ---
  const handleCellDoubleClick = (item, month, year) => {
    if (isViewer) return;
    if (activePlan?.status === 'Approved') {
      alert("This production plan has already been locked & approved. Editing is disabled.");
      return;
    }

    setEditingCell({
      bearingNo: item.bearingNo,
      unitName: item.unitName,
      month,
      year
    });
    setEditValue(item.plannedQuantity);
  };

  const saveCellOverride = async () => {
    if (!editingCell || !activePlan) return;

    try {
      const res = await fetch(`/api/plans/${activePlan._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitName: editingCell.unitName,
          bearingNo: editingCell.bearingNo,
          category: activePlanItems.find(i => i.bearingNo === editingCell.bearingNo)?.category || "",
          targetMonth: editingCell.month,
          targetYear: editingCell.year,
          plannedQuantity: editValue
        })
      });
      const data = await res.json();
      if (data.success) {
        // Update local React state
        setActivePlanItems(prev => prev.map(item => {
          if (item.bearingNo === editingCell.bearingNo &&
              item.unitName === editingCell.unitName &&
              item.targetMonth === editingCell.month &&
              item.targetYear === editingCell.year) {
            return {
              ...item,
              plannedQuantity: parseInt(editValue, 10),
              isManuallyEdited: true
            };
          }
          return item;
        }));
      }
    } catch (err) {
      console.error("Save cell override error:", err);
    } finally {
      setEditingCell(null);
    }
  };

  // --- DATA INGESTION ENGINE UPLOADER ---
  const processFile = (file) => {
    setIsUploading(true);
    setUploadProgress({
      text: `Reading file "${file.name}"...`,
      percent: 15,
      remaining: "Parsing spreadsheet data..."
    });
    setUploaderErrors([]);
    setUploaderPreview([]);
    setUploaderPreviewPage(1);
    const isCsv = file.name.toLowerCase().endsWith(".csv");

    setTimeout(() => {
      if (isCsv) {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            setUploadProgress({
              text: `Validating ${results.data.length.toLocaleString()} rows...`,
              percent: 50,
              remaining: "Checking headers & schema constraints..."
            });
            setTimeout(() => {
              processRawRows(results.data);
            }, 30);
          },
          error: (err) => {
            alert("CSV parsing failed: " + err.message);
            setIsUploading(false);
            setUploadProgress(null);
          }
        });
      } else {
        const reader = new FileReader();
        reader.onload = (evt) => {
          setUploadProgress({
            text: "Parsing Excel binary workbook...",
            percent: 40,
            remaining: "Extracting sheet records..."
          });
          setTimeout(() => {
            try {
              const data = new Uint8Array(evt.target.result);
              const workbook = XLSX.read(data, { type: "array" });
              const firstSheetName = workbook.SheetNames[0];
              const worksheet = workbook.Sheets[firstSheetName];
              const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
              setUploadProgress({
                text: `Validating ${jsonData.length.toLocaleString()} Excel records...`,
                percent: 65,
                remaining: "Normalizing columns & checking duplicates..."
              });
              setTimeout(() => {
                processRawRows(jsonData);
              }, 30);
            } catch (err) {
              alert("Excel parsing failed: " + err.message);
              setIsUploading(false);
              setUploadProgress(null);
            }
          }, 30);
        };
        reader.onerror = () => {
          alert("File reading failed.");
          setIsUploading(false);
          setUploadProgress(null);
        };
        reader.readAsArrayBuffer(file);
      }
    }, 40);
  };

  const handleFileUpload = (e) => {
    if (!isAdmin) {
      alert("Role Simulation View: Only Admin persona is allowed to ingest production data.");
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const processRawRows = (rawRows) => {
    try {
      // 1. Standardize Headers (compiled keymap)
      const HEADER_MAP = {
        "unit": "Unit", "month": "Month", "year": "Year", "quarter": "Quarter",
        "party name": "Party Name", "customer": "Party Name", "bearing no.": "Bearing No.",
        "bearing number": "Bearing No.", "bearing no": "Bearing No.", "category": "Category",
        "qty.": "QTY.", "qty": "QTY.", "quantity": "QTY.", "f.year": "Year",
        "f. year": "Year", "financial year": "Year", "basic value": "Basic Value",
        "with gst value": "With GST Value", "gst value": "With GST Value"
      };

      if (!rawRows || rawRows.length === 0) {
        setUploaderErrors([{ row: 0, error: "The uploaded file contains no rows or is empty." }]);
        setIsUploading(false);
        setUploadProgress(null);
        return;
      }

      const firstRow = rawRows[0] || {};
      const keyMap = {};
      Object.keys(firstRow).forEach(rawKey => {
        const clean = rawKey.trim().toLowerCase();
        keyMap[rawKey] = HEADER_MAP[clean] || rawKey;
      });

      // 2. Validate Row data
      const REQUIRED_HEADERS = ["Unit", "Month", "Year", "Quarter", "Party Name", "Bearing No.", "Category", "QTY."];
      const mappedFirstRow = {};
      Object.keys(firstRow).forEach(k => {
        mappedFirstRow[keyMap[k]] = firstRow[k];
      });

      const missing = REQUIRED_HEADERS.filter(h => !(h in mappedFirstRow));
      if (missing.length > 0) {
        setUploaderErrors([{ row: 1, error: `Missing required column headers: ${missing.join(", ")}.` }]);
        setIsUploading(false);
        setUploadProgress(null);
        return;
      }

      const unitRegex1 = /(?:unit|p)(?:-| )?(\d+)/i;
      const unitRegex2 = /^(\d+)$/;
      const alphanumericRegex = /^[a-z0-9\-\s]+$/i;
      const separators = /[\s\-\/]/;
      const quarterRegex = /^Q[1-4]$/;

      const monthMap = {
        "jan": "January", "january": "January", "01": "January", "1": "January",
        "feb": "February", "february": "February", "02": "February", "2": "February",
        "mar": "March", "march": "March", "03": "March", "3": "March",
        "apr": "April", "april": "April", "04": "April", "4": "April",
        "may": "May", "05": "May", "5": "May",
        "jun": "June", "june": "June", "06": "June", "6": "June",
        "jul": "July", "july": "July", "07": "July", "7": "July",
        "aug": "August", "august": "August", "08": "August", "8": "August",
        "sep": "September", "september": "September", "09": "September", "9": "September",
        "oct": "October", "october": "October", "10": "October",
        "nov": "November", "november": "November", "11": "November",
        "dec": "December", "december": "December", "12": "December"
      };

      const errors = [];
      const validRows = [];

      for (let idx = 0; idx < rawRows.length; idx++) {
        const rawRow = rawRows[idx];
        if (!rawRow || typeof rawRow !== "object") continue;

        const rowNum = idx + 2;
        const rowErrors = [];

        const row = {};
        for (const rawKey in keyMap) {
          row[keyMap[rawKey]] = rawRow[rawKey];
        }

        // Unit
        let unit = String(row["Unit"] !== undefined ? row["Unit"] : "").trim();
        if (!unit || unit === "undefined" || unit === "null") {
          rowErrors.push("Unit is required.");
        } else {
          const match = unit.match(unitRegex1) || unit.match(unitRegex2);
          if (match) {
            unit = `Unit-${match[1]}`;
          } else {
            const isAlphanumeric = alphanumericRegex.test(unit);
            if (isAlphanumeric && unit.length >= 2) {
              unit = unit.toUpperCase();
            } else {
              rowErrors.push(`Invalid Unit format: "${unit}".`);
            }
          }
        }

        // Month
        let month = String(row["Month"] !== undefined ? row["Month"] : "").trim();
        if (!month || month === "undefined" || month === "null") {
          rowErrors.push("Month is required.");
        } else {
          let monthDate = null;
          let mNum = Number(month);
          if (!isNaN(mNum) && mNum > 100) {
            monthDate = new Date((mNum - 25569) * 86400 * 1000);
          } else if (isNaN(mNum) && month.length > 4 && !isNaN(Date.parse(month))) {
            const localDate = new Date(month);
            monthDate = new Date(localDate.getTime() - localDate.getTimezoneOffset() * 60000);
          }

          if (monthDate && !isNaN(monthDate.getTime())) {
            month = MONTH_NAMES[monthDate.getUTCMonth()];
          }

          let mClean = month.toLowerCase();
          if (separators.test(mClean)) {
            const tokens = mClean.split(separators);
            for (const token of tokens) {
              if (monthMap[token.trim()]) {
                mClean = token.trim();
                break;
              }
            }
          }
          if (monthMap[mClean]) month = monthMap[mClean];
          else rowErrors.push(`Invalid Month: "${month}".`);
        }

        // Year
        let yearVal = row["Year"];
        let yearDate = null;
        let yearNum = NaN;

        if (typeof yearVal === "string" && yearVal.includes("-")) {
          if (yearVal.length > 4 && !isNaN(Date.parse(yearVal))) {
            const localDate = new Date(yearVal);
            yearDate = new Date(localDate.getTime() - localDate.getTimezoneOffset() * 60000);
          } else {
            yearVal = yearVal.split("-")[0].trim();
            yearNum = parseInt(yearVal, 10);
          }
        } else {
          let yNum = Number(yearVal);
          if (!isNaN(yNum) && yNum >= 2020 && yNum <= 2030) {
            yearNum = yNum;
          } else if (!isNaN(yNum) && yNum > 40000) {
            yearDate = new Date((yNum - 25569) * 86400 * 1000);
          } else if (isNaN(yNum) && String(yearVal).length > 4 && !isNaN(Date.parse(String(yearVal)))) {
            const localDate = new Date(String(yearVal));
            yearDate = new Date(localDate.getTime() - localDate.getTimezoneOffset() * 60000);
          } else {
            yearNum = parseInt(String(yearVal), 10);
          }
        }

        if (yearDate && !isNaN(yearDate.getTime())) {
          yearNum = yearDate.getUTCFullYear();
        }

        const year = yearNum;
        if (isNaN(year) || year < 2020 || year > 2030) {
          rowErrors.push(`Invalid Year: "${row["Year"] !== undefined ? row["Year"] : ""}".`);
        }

        // Quarter
        const quarter = String(row["Quarter"] !== undefined ? row["Quarter"] : "").trim().toUpperCase().replace("-", "");
        if (!quarter || !quarterRegex.test(quarter)) {
          rowErrors.push(`Invalid Quarter: "${row["Quarter"] !== undefined ? row["Quarter"] : ""}".`);
        }

        // Party, Bearing, Category
        const partyName = String(row["Party Name"] !== undefined ? row["Party Name"] : "").trim();
        const bearingNo = String(row["Bearing No."] !== undefined ? row["Bearing No."] : "").trim().toUpperCase();
        const category = String(row["Category"] !== undefined ? row["Category"] : "").trim().toUpperCase();

        if (!partyName) rowErrors.push("Party Name is required.");
        if (!bearingNo) rowErrors.push("Bearing No. is required.");
        if (!category) rowErrors.push("Category is required.");

        // Qty
        const qtyStr = String(row["QTY."] !== undefined ? row["QTY."] : "").replace(/,/g, "").trim();
        const quantity = parseInt(qtyStr, 10);
        if (isNaN(quantity) || quantity < 0) {
          rowErrors.push(`Invalid Quantity: "${row["QTY."] !== undefined ? row["QTY."] : ""}".`);
        }

        // Values
        let basicValue = 0;
        if (row["Basic Value"] !== undefined && String(row["Basic Value"]).trim() !== "") {
          basicValue = parseFloat(String(row["Basic Value"]).replace(/,/g, "").trim());
          if (isNaN(basicValue) || basicValue < 0) {
            rowErrors.push(`Invalid Basic Value: "${row["Basic Value"]}".`);
          }
        } else {
          let basePrice = 100;
          if (category === "SPHERICAL ROLLER BEARING") basePrice = 1000;
          else if (category === "BALL BEARING") basePrice = 150;
          basicValue = Math.round(quantity * basePrice);
        }

        let withGstValue = Math.round(basicValue * 1.18);
        if (row["With GST Value"] !== undefined && String(row["With GST Value"]).trim() !== "") {
          withGstValue = parseFloat(String(row["With GST Value"]).replace(/,/g, "").trim());
          if (isNaN(withGstValue) || withGstValue < 0) {
            rowErrors.push(`Invalid With GST Value: "${row["With GST Value"]}".`);
          }
        }

        if (rowErrors.length > 0) {
          errors.push({ row: rowNum, bearing: bearingNo || "Unknown", error: rowErrors.join(" | ") });
        } else {
          validRows.push({
            unit, month, year, quarter, partyName, bearingNo, category, quantity, basicValue, withGstValue
          });
        }
      }

      setUploaderErrors(errors);

      if (errors.length > 0) {
        setIsUploading(false);
        setUploadProgress(null);
        alert(`Validation detected ${errors.length} row error(s). Please review and correct the errors below.`);
        return;
      }

      if (validRows.length === 0) {
        setIsUploading(false);
        setUploadProgress(null);
        alert("No valid rows were found in the uploaded file.");
        return;
      }

      // Aggregate rows within upload spreadsheet to group duplicates
      const aggregated = {};
      validRows.forEach(row => {
        const key = `${row.unit.toLowerCase()}|${row.month.toLowerCase()}|${row.year}|${row.partyName.toLowerCase()}|${row.bearingNo.toLowerCase()}`;
        if (!aggregated[key]) {
          aggregated[key] = { ...row };
        } else {
          aggregated[key].quantity += row.quantity;
          aggregated[key].basicValue += row.basicValue;
          aggregated[key].withGstValue += row.withGstValue;
        }
      });
      const finalRows = Object.values(aggregated);

      setUploaderPreview(finalRows);
      setUploaderPreviewPage(1);
      setTempUploadRows(finalRows);

      // Check duplicates against existing database records
      const existingKeys = new Set(records.map(r => {
        const u = String(r.unit || "").trim().toLowerCase();
        const m = String(r.month || "").trim().toLowerCase();
        const y = String(r.year || "").trim();
        const p = String(r.partyName || "").trim().toLowerCase();
        const b = String(r.bearingNo || "").trim().toLowerCase();
        return `${u}|${m}|${y}|${p}|${b}`;
      }));

      const duplicates = finalRows.filter(r => {
        const u = String(r.unit || "").trim().toLowerCase();
        const m = String(r.month || "").trim().toLowerCase();
        const y = String(r.year || "").trim();
        const p = String(r.partyName || "").trim().toLowerCase();
        const b = String(r.bearingNo || "").trim().toLowerCase();
        return existingKeys.has(`${u}|${m}|${y}|${p}|${b}`);
      });

      if (duplicates.length > 0) {
        setDuplicateCount(duplicates.length);
        setIsUploading(false); // Close upload progress overlay so modal is cleanly accessible
        setUploadProgress(null);
        setShowDuplicateModal(true);
      } else {
        submitImportCheck(finalRows, "merge");
      }

    } catch (err) {
      console.error("Row processing error:", err);
      alert("Error processing file rows: " + err.message);
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const handleResolveDuplicates = (action) => {
    setShowDuplicateModal(false);
    if (action === "cancel") {
      setTempUploadRows([]);
      setUploaderPreview([]);
      setIsUploading(false);
      setUploadProgress(null);
      return;
    }

    let rowsToUpload = tempUploadRows;
    if (action === "skip") {
      const existingKeys = new Set(records.map(r => 
        `${String(r.unit || '').trim().toLowerCase()}|${String(r.month || '').trim().toLowerCase()}|${String(r.year || '').trim()}|${String(r.partyName || '').trim().toLowerCase()}|${String(r.bearingNo || '').trim().toLowerCase()}`
      ));
      rowsToUpload = tempUploadRows.filter(r => 
        !existingKeys.has(`${String(r.unit || '').trim().toLowerCase()}|${String(r.month || '').trim().toLowerCase()}|${String(r.year || '').trim()}|${String(r.partyName || '').trim().toLowerCase()}|${String(r.bearingNo || '').trim().toLowerCase()}`)
      );

      if (rowsToUpload.length === 0) {
        alert("All uploaded records were duplicates and have been skipped.");
        setTempUploadRows([]);
        setIsUploading(false);
        setUploadProgress(null);
        return;
      }
    }

    submitImportCheck(rowsToUpload, action);
  };

  const submitImportCheck = async (rowsToUpload, action = "merge") => {
    setIsUploading(true);
    setUploadProgress({
      text: `Syncing ${rowsToUpload.length.toLocaleString()} records with MongoDB...`,
      percent: 35,
      remaining: "Writing batch data..."
    });

    try {
      const BATCH_SIZE = 1000;
      let totalInserted = 0;
      let totalUpdated = 0;

      for (let i = 0; i < rowsToUpload.length; i += BATCH_SIZE) {
        const batch = rowsToUpload.slice(i, i + BATCH_SIZE);
        const progressPct = Math.round(((i + batch.length) / rowsToUpload.length) * 100);
        
        setUploadProgress({
          text: `Processed ${Math.min(i + batch.length, rowsToUpload.length).toLocaleString()} of ${rowsToUpload.length.toLocaleString()} records`,
          percent: progressPct,
          remaining: progressPct < 100 ? "Syncing batches to cloud database..." : "Finalizing data indexing..."
        });

        const res = await fetch('/api/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: batch, action })
        });
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || "Batch ingestion failed");
        }
        totalInserted += (data.insertedCount || 0);
        totalUpdated += (data.updatedCount || 0);
      }

      await fetchRecords();

      if (action === "overwrite") {
        alert(`Successfully overwritten records! Total records processed: ${rowsToUpload.length.toLocaleString()}`);
      } else if (action === "skip") {
        alert(`Successfully ingested new records (skipped duplicates)! Total records: ${rowsToUpload.length.toLocaleString()}`);
      } else {
        alert(`Successfully merged spreadsheet records! (New: ${totalInserted}, Appended/Updated: ${totalUpdated})`);
      }
    } catch (err) {
      console.error("Import error:", err);
      alert("Import request failed: " + err.message);
    } finally {
      setTempUploadRows([]);
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const handleDeleteAllRecords = async () => {
    if (deleteConfirmText.trim() !== "DELETE RECORDS") return;
    setIsDeleting(true);
    try {
      const res = await fetch('/api/records', {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setRecords([]);
        setUploaderPreview([]);
        setUploaderPreviewPage(1);
        setTempUploadRows([]);
        setShowDeleteModal(false);
        setDeleteConfirmText("");
        alert(`Successfully deleted all historical records (${data.deletedCount || 0} removed from database).`);
      } else {
        alert("Failed to delete records: " + data.error);
      }
    } catch (err) {
      console.error("Delete records error:", err);
      alert("Delete request failed: " + err.message);
    } finally {
      setIsDeleting(false);
    }
  };



  const handleStockFileUpload = (e) => {
    if (!isAdmin) {
      alert("Role Simulation View: Only Admin persona is allowed to ingest stock data.");
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    processStockFile(file);
  };

  const processStockFile = (file) => {
    setIsUploading(true);
    setUploadProgress({
      text: "Parsing stock spreadsheet...",
      percent: 50,
      remaining: "Validating bearing styles & quantities..."
    });
    setUploaderErrors([]);
    const isCsv = file.name.toLowerCase().endsWith(".csv");

    const onParsed = (rawRows) => {
      try {
        if (!rawRows || rawRows.length === 0) {
          alert("The uploaded stock file is empty.");
          setIsUploading(false);
          setUploadProgress(null);
          return;
        }

        const HEADER_MAP = {
          "bearing no.": "bearingNo", "bearing number": "bearingNo", "bearing no": "bearingNo",
          "bearing style": "bearingNo", "bearingstyle": "bearingNo", "bearing": "bearingNo",
          "quantity": "quantity", "qty": "quantity", "stock": "quantity", "stock qty": "quantity",
          "stock quantity": "quantity", "stockqty": "quantity", "stockquantity": "quantity"
        };

        const firstRow = rawRows[0] || {};
        const keyMap = {};
        Object.keys(firstRow).forEach(rawKey => {
          const clean = rawKey.trim().toLowerCase();
          keyMap[rawKey] = HEADER_MAP[clean] || rawKey;
        });

        const standardizedRows = [];
        const errors = [];

        rawRows.forEach((rawRow, idx) => {
          const rowNum = idx + 2;
          const row = {};
          for (const rawKey in keyMap) {
            row[keyMap[rawKey]] = rawRow[rawKey];
          }

          const bearingNo = String(row["bearingNo"] !== undefined ? row["bearingNo"] : "").trim().toUpperCase();
          const qtyStr = String(row["quantity"] !== undefined ? row["quantity"] : "").replace(/,/g, "").trim();
          const quantity = parseInt(qtyStr, 10);

          const rowErrors = [];
          if (!bearingNo) {
            rowErrors.push("Bearing No. is required.");
          }
          if (isNaN(quantity) || quantity < 0) {
            rowErrors.push(`Invalid Quantity value: "${qtyStr}". Quantity must be a positive integer.`);
          }

          if (rowErrors.length > 0) {
            errors.push({ row: rowNum, bearing: bearingNo || "Unknown", error: rowErrors.join(" | ") });
          } else {
            standardizedRows.push({ bearingNo, quantity });
          }
        });

        if (errors.length > 0) {
          setUploaderErrors(errors);
          setIsUploading(false);
          setUploadProgress(null);
          alert(`Validation failed: Detected ${errors.length} error(s) in Stock data.`);
          return;
        }

        submitStockImport(standardizedRows);

      } catch (err) {
        console.error("Stock row processing error:", err);
        alert("Error processing stock file rows: " + err.message);
        setIsUploading(false);
        setUploadProgress(null);
      }
    };

    if (isCsv) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          onParsed(results.data);
        },
        error: (err) => {
          alert("CSV parsing failed: " + err.message);
          setIsUploading(false);
          setUploadProgress(null);
        }
      });
    } else {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = new Uint8Array(evt.target.result);
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
          onParsed(jsonData);
        } catch (err) {
          alert("Excel parsing failed: " + err.message);
          setIsUploading(false);
          setUploadProgress(null);
        }
      };
      reader.onerror = () => {
        alert("File reading failed.");
        setIsUploading(false);
        setUploadProgress(null);
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const submitStockImport = async (rowsToUpload) => {
    setIsUploading(true);
    setUploadProgress({
      text: `Syncing ${rowsToUpload.length.toLocaleString()} stock inventory items...`,
      percent: 75,
      remaining: "Updating stock balances..."
    });

    try {
      const res = await fetch('/api/stocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: rowsToUpload })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Successfully imported stock data! Total Bearing Styles upserted: ${data.modifiedCount}`);
        await fetchStocks();
      } else {
        alert("Failed to ingest stocks: " + data.error);
      }
    } catch (err) {
      console.error("Stock import error:", err);
      alert("Stock Import request failed: " + err.message);
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  // --- OPERATIONAL REPORTS GENERATOR ---
  const reportData = useMemo(() => {
    let headers = [];
    let rows = [];
    let summary = [];

    switch (activeReport) {
      case "monthly":
        headers = ["Year", "Month", "Unit", "Quantity (QTY)", "Basic Value", "With GST Value", "YoY Change (%)"];
        const monthlyQty = {};
        const monthlyBasic = {};
        const monthlyGst = {};
        filteredActuals.forEach(r => {
          const key = `${r.year}|${r.month}|${r.unit}`;
          monthlyQty[key] = (monthlyQty[key] || 0) + r.quantity;
          monthlyBasic[key] = (monthlyBasic[key] || 0) + r.basicValue;
          monthlyGst[key] = (monthlyGst[key] || 0) + r.withGstValue;
        });

        // Create dimension-filtered lookup map of ALL records (ignoring year/quarter/month filters)
        const lookupQty = {};
        records.forEach(r => {
          if (filters.unit.length > 0 && !filters.unit.includes(r.unit)) return;
          if (filters.category.length > 0 && !filters.category.includes(r.category)) return;
          if (filters.partyName && !r.partyName.toLowerCase().includes(filters.partyName.toLowerCase())) return;
          if (filters.bearingNo && !r.bearingNo.toLowerCase().includes(filters.bearingNo.toLowerCase())) return;
          
          const key = `${r.year}|${r.month}|${r.unit}`;
          lookupQty[key] = (lookupQty[key] || 0) + r.quantity;
        });

        Object.keys(monthlyQty).forEach(key => {
          const [year, month, unit] = key.split("|");
          const qty = monthlyQty[key];
          const prevKey = `${parseInt(year)-1}|${month}|${unit}`;
          const prevQty = lookupQty[prevKey];
          let yoy = "N/A";
          if (prevQty && prevQty > 0) {
            yoy = (((qty - prevQty) / prevQty) * 100).toFixed(1) + "%";
          }
          rows.push({
            year: parseInt(year),
            month,
            unit,
            qty,
            basicValue: monthlyBasic[key] || 0,
            withGstValue: monthlyGst[key] || 0,
            yoy
          });
        });

        rows.sort((a, b) => {
          if (b.year !== a.year) return b.year - a.year;
          const monthDiff = MONTH_NAMES.indexOf(b.month) - MONTH_NAMES.indexOf(a.month);
          if (monthDiff !== 0) return monthDiff;
          return a.unit.localeCompare(b.unit);
        });

        const totalQty = rows.reduce((sum, r) => sum + r.qty, 0);
        const totalBasic = rows.reduce((sum, r) => sum + r.basicValue, 0);
        const totalGst = rows.reduce((sum, r) => sum + r.withGstValue, 0);
        summary = ["Total", "", "", totalQty.toLocaleString(), "₹" + Math.round(totalBasic).toLocaleString(), "₹" + Math.round(totalGst).toLocaleString(), ""];
        break;

      case "quarterly":
        headers = ["Year", "Quarter", "Unit", "Quantity (QTY)", "Basic Value", "With GST Value", "% Share of Year"];
        const qQty = {};
        const qBasic = {};
        const qGst = {};
        const yrTotals = {};
        filteredActuals.forEach(r => {
          const key = `${r.year}|${r.quarter}|${r.unit}`;
          qQty[key] = (qQty[key] || 0) + r.quantity;
          qBasic[key] = (qBasic[key] || 0) + r.basicValue;
          qGst[key] = (qGst[key] || 0) + r.withGstValue;
          yrTotals[r.year] = (yrTotals[r.year] || 0) + r.quantity;
        });

        Object.keys(qQty).forEach(key => {
          const [year, quarter, unit] = key.split("|");
          const qty = qQty[key];
          const share = ((qty / (yrTotals[year] || 1)) * 100).toFixed(1) + "%";
          rows.push({
            year: parseInt(year), quarter, unit, qty, basicValue: qBasic[key] || 0, withGstValue: qGst[key] || 0, share
          });
        });

        rows.sort((a,b) => {
          if (b.year !== a.year) return b.year - a.year;
          if (a.quarter !== b.quarter) return a.quarter.localeCompare(b.quarter);
          return a.unit.localeCompare(b.unit);
        });

        summary = [
          "Total", "", "",
          rows.reduce((sum, r) => sum + r.qty, 0).toLocaleString(),
          "₹" + Math.round(rows.reduce((sum, r) => sum + r.basicValue, 0)).toLocaleString(),
          "₹" + Math.round(rows.reduce((sum, r) => sum + r.withGstValue, 0)).toLocaleString(),
          ""
        ];
        break;

      case "plan_nmonth":
        // Dynamically get the N planning months
        const planGroups = {};
        const monthsInPlan = [...new Set(activePlanItems.map(item => `${item.targetYear}-${String(item.targetMonth).padStart(2,'0')}`))].sort();
        const displayMonths = monthsInPlan.map(ym => {
          const [y, m] = ym.split("-");
          return `${MONTH_NAMES[parseInt(m)-1]} ${y}`;
        });

        headers = ["Bearing No.", "Category", "Mfg Unit", ...displayMonths, "Total Target"];
        const filteredPlanItems = activePlanItems.filter(item => {
          if (filters.unit.length > 0 && !filters.unit.includes(item.unitName)) return false;
          if (filters.category.length > 0 && !filters.category.includes(item.category)) return false;
          if (filters.bearingNo && !item.bearingNo.toLowerCase().includes(filters.bearingNo.toLowerCase())) return false;
          if (filters.year.length > 0 && !filters.year.includes(String(item.targetYear))) return false;
          if (filters.month.length > 0) {
            const mName = MONTH_NAMES[item.targetMonth - 1];
            if (!filters.month.includes(mName)) return false;
          }
          return true;
        });

        filteredPlanItems.forEach(item => {
          const key = `${item.bearingNo}|${item.category}|${item.unitName}`;
          if (!planGroups[key]) {
            planGroups[key] = Array(planningPeriod).fill(null).map(() => ({ val: 0, edited: false }));
          }
          const ymStr = `${item.targetYear}-${String(item.targetMonth).padStart(2,'0')}`;
          const mIdx = monthsInPlan.indexOf(ymStr);
          if (mIdx !== -1) {
            planGroups[key][mIdx] = { val: item.plannedQuantity, edited: item.isManuallyEdited };
          }
        });

        Object.keys(planGroups).forEach(key => {
          const [bearing, category, unit] = key.split("|");
          const targets = planGroups[key];
          const total = targets.reduce((sum, t) => sum + (t ? t.val : 0), 0);
          rows.push({ bearing, category, unit, targets, total });
        });

        rows.sort((a, b) => {
          if (a.unit !== b.unit) return a.unit.localeCompare(b.unit);
          if (a.category !== b.category) return a.category.localeCompare(b.category);
          return a.bearing.localeCompare(b.bearing);
        });

        const monthlySums = Array(planningPeriod).fill(0);
        let grandTotal = 0;
        rows.forEach(r => {
          r.targets.forEach((tObj, idx) => { monthlySums[idx] += tObj.val; });
          grandTotal += r.total;
        });

        summary = ["Total Target", "", "", ...monthlySums.map(v => v.toLocaleString()), grandTotal.toLocaleString()];
        break;

      case "unit_wise":
        headers = ["Manufacturing Unit", "Active Product Count", "Total Production (QTY)", "Basic Value", "With GST Value"];
        const unitStats = {};
        filteredActuals.forEach(r => {
          if (!unitStats[r.unit]) unitStats[r.unit] = { bearings: new Set(), total: 0, basic: 0, gst: 0 };
          unitStats[r.unit].bearings.add(r.bearingNo);
          unitStats[r.unit].total += r.quantity;
          unitStats[r.unit].basic += r.basicValue;
          unitStats[r.unit].gst += r.withGstValue;
        });

        Object.keys(unitStats).forEach(u => {
          rows.push({
            unit: u,
            bearings: unitStats[u].bearings.size,
            qty: unitStats[u].total,
            basic: unitStats[u].basic,
            gst: unitStats[u].gst
          });
        });
        summary = ["Total", rows.reduce((sum, r) => sum + r.bearings, 0).toString(), rows.reduce((sum, r) => sum + r.qty, 0).toLocaleString(), "₹" + Math.round(rows.reduce((sum, r) => sum + r.basic, 0)).toLocaleString(), "₹" + Math.round(rows.reduce((sum, r) => sum + r.gst, 0)).toLocaleString()];
        break;

      default:
        headers = ["Dimension", "Total Volume"];
        rows = [{ dim: "No Report Loaded", val: 0 }];
        summary = ["Total", "0"];
    }

    return { headers, rows, summary };
  }, [activeReport, filteredActuals, activePlanItems, planningPeriod]);

  // --- REPORT EXPORT HANDLERS ---
  // --- REPORT EXPORT HANDLERS ---
  const getExportData = () => {
    return selectedReportRows.length > 0 
      ? reportData.rows.filter((_, idx) => selectedReportRows.includes(idx))
      : reportData.rows;
  };

  const getExportSummary = (rows) => {
    if (rows.length === reportData.rows.length) {
      return reportData.summary;
    }
    
    switch (activeReport) {
      case "monthly": {
        const totalQty = rows.reduce((sum, r) => sum + r.qty, 0);
        const totalBasic = rows.reduce((sum, r) => sum + r.basicValue, 0);
        const totalGst = rows.reduce((sum, r) => sum + r.withGstValue, 0);
        return ["Total (Selected)", "", "", totalQty.toLocaleString(), "₹" + Math.round(totalBasic).toLocaleString(), "₹" + Math.round(totalGst).toLocaleString(), ""];
      }
      case "quarterly": {
        const totalQty = rows.reduce((sum, r) => sum + r.qty, 0);
        const totalBasic = rows.reduce((sum, r) => sum + r.basicValue, 0);
        const totalGst = rows.reduce((sum, r) => sum + r.withGstValue, 0);
        return ["Total (Selected)", "", "", totalQty.toLocaleString(), "₹" + Math.round(totalBasic).toLocaleString(), "₹" + Math.round(totalGst).toLocaleString(), ""];
      }
      case "plan_nmonth": {
        const monthlySums = Array(planningPeriod).fill(0);
        let grandTotal = 0;
        rows.forEach(r => {
          r.targets.forEach((tObj, idx) => { monthlySums[idx] += tObj.val; });
          grandTotal += r.total;
        });
        return ["Total Target (Selected)", "", "", ...monthlySums.map(v => v.toLocaleString()), grandTotal.toLocaleString()];
      }
      case "unit_wise": {
        const bearings = rows.reduce((sum, r) => sum + r.bearings, 0);
        const qty = rows.reduce((sum, r) => sum + r.qty, 0);
        const basic = rows.reduce((sum, r) => sum + r.basic, 0);
        const gst = rows.reduce((sum, r) => sum + r.gst, 0);
        return ["Total (Selected)", bearings.toString(), qty.toLocaleString(), "₹" + Math.round(basic).toLocaleString(), "₹" + Math.round(gst).toLocaleString()];
      }
      default:
        return reportData.summary;
    }
  };

  const flattenRowForExport = (r) => {
    const vals = [];
    Object.values(r).forEach(v => {
      if (Array.isArray(v)) {
        v.forEach(item => {
          const formatted = typeof item === 'object' && item !== null 
            ? (item.edited ? `${item.val}*` : item.val) 
            : item;
          vals.push(formatted);
        });
      } else {
        vals.push(v);
      }
    });
    return vals;
  };

  const exportCSV = () => {
    const csvContent = [];
    csvContent.push(reportData.headers.join(","));
    const dataToExport = getExportData();
    dataToExport.forEach(r => {
      const flat = flattenRowForExport(r).map(v => `"${String(v).replace(/"/g, '""')}"`);
      csvContent.push(flat.join(","));
    });
    csvContent.push(getExportSummary(dataToExport).map(s => `"${s.replace(/₹|,/g, "")}"`).join(","));

    const blob = new Blob([csvContent.join("\n")], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `ARB_Report_${activeReport}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportExcel = () => {
    const wsData = [reportData.headers];
    const dataToExport = getExportData();
    dataToExport.forEach(r => {
      wsData.push(flattenRowForExport(r));
    });
    wsData.push(getExportSummary(dataToExport));

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Operational Report");
    XLSX.writeFile(wb, `ARB_Report_${activeReport}.xlsx`);
  };

  const exportPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFont("helvetica", "bold");
    doc.text(`ARB BEARINGS - Operational Report (${activeReport.toUpperCase()})`, 14, 15);
    doc.setFontSize(8);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 20);

    const dataToExport = getExportData();
    const bodyData = dataToExport.map(r => flattenRowForExport(r));
    bodyData.push(getExportSummary(dataToExport));

    doc.autoTable({
      head: [reportData.headers],
      body: bodyData,
      startY: 25,
      theme: 'grid',
      styles: { fontSize: 8, font: "helvetica" },
      headStyles: { fillColor: [139, 92, 246] },
      footStyles: { fontStyle: 'bold' }
    });

    doc.save(`ARB_Report_${activeReport}.pdf`);
  };

  // --- PLANNING TARGETS GRID CALCULATIONS ---
  // Returns unique keys for products in target items
  const planningProducts = useMemo(() => {
    const prodKeys = {};
    activePlanItems.forEach(item => {
      // Apply unified filters to targets grid to match operational report views
      if (filters.unit.length > 0 && !filters.unit.includes(item.unitName)) return;
      if (filters.category.length > 0 && !filters.category.includes(item.category)) return;
      if (filters.bearingNo && !item.bearingNo.toLowerCase().includes(filters.bearingNo.toLowerCase())) return;

      const key = `${item.bearingNo}|${item.unitName}|${item.category}`;
      if (!prodKeys[key]) {
        prodKeys[key] = {
          bearingNo: item.bearingNo,
          unitName: item.unitName,
          category: item.category,
          monthlyTargets: {}
        };
      }
      const ymStr = `${item.targetYear}-${String(item.targetMonth).padStart(2,'0')}`;
      prodKeys[key].monthlyTargets[ymStr] = item;
    });

    let list = Object.values(prodKeys);
    
    // Attach sort values to list items
    list.forEach(p => {
      p.sumTarget = Object.values(p.monthlyTargets).reduce((s, item) => s + (item.plannedQuantity || 0), 0);
      p.stockVal = stocks[p.bearingNo] !== undefined ? stocks[p.bearingNo] : 0;
    });

    if (sortField) {
      list.sort((a, b) => {
        let valA, valB;
        if (sortField === 'bearingNo') {
          valA = a.bearingNo;
          valB = b.bearingNo;
        } else if (sortField === 'category') {
          valA = a.category;
          valB = b.category;
        } else if (sortField === 'unitName') {
          valA = a.unitName;
          valB = b.unitName;
        } else if (sortField === 'stock') {
          valA = a.stockVal;
          valB = b.stockVal;
        } else if (sortField === 'sumTarget') {
          valA = a.sumTarget;
          valB = b.sumTarget;
        }

        if (typeof valA === 'string') {
          return sortOrder === 'asc' 
            ? valA.localeCompare(valB) 
            : valB.localeCompare(valA);
        } else {
          return sortOrder === 'asc' 
            ? valA - valB 
            : valB - valA;
        }
      });
    } else {
      // Default fallback
      list.sort((a, b) => a.bearingNo.localeCompare(b.bearingNo));
    }
    return list;
  }, [activePlanItems, filters.unit, filters.category, filters.bearingNo, sortField, sortOrder, stocks]);

  const PLANNING_PAGE_SIZE = 50;

  const paginatedProducts = useMemo(() => {
    const start = (planningPage - 1) * PLANNING_PAGE_SIZE;
    return planningProducts.slice(start, start + PLANNING_PAGE_SIZE);
  }, [planningProducts, planningPage]);

  const UPLOADER_PAGE_SIZE = 50;

  const paginatedPreviewRows = useMemo(() => {
    const start = (uploaderPreviewPage - 1) * UPLOADER_PAGE_SIZE;
    return uploaderPreview.slice(start, start + UPLOADER_PAGE_SIZE);
  }, [uploaderPreview, uploaderPreviewPage]);

  const totalPreviewPages = Math.max(1, Math.ceil(uploaderPreview.length / UPLOADER_PAGE_SIZE));

  const planningMonthsList = useMemo(() => {
    return [...new Set(activePlanItems.map(item => `${item.targetYear}-${String(item.targetMonth).padStart(2,'0')}`))].sort();
  }, [activePlanItems]);

  const getPlanningMonths = (period, sMonth = startMonth, sYear = startYear) => {
    const monthsList = [];
    let m = sMonth;
    let y = sYear;
    for (let i = 0; i < period; i++) {
      if (m > 12) {
        m = 1;
        y += 1;
      }
      monthsList.push({
        monthNum: m,
        monthName: MONTH_NAMES[m - 1],
        year: y
      });
      m++;
    }
    return monthsList;
  };

  const renderSortHeader = (field, label, style = {}) => {
    const isActive = sortField === field;
    return (
      <th 
        style={{ cursor: "pointer", userSelect: "none", ...style }}
        onClick={() => {
          if (sortField === field) {
            if (sortOrder === 'desc') {
              setSortOrder('asc');
            } else {
              setSortField(null);
              setSortOrder(null);
            }
          } else {
            setSortField(field);
            setSortOrder('desc');
          }
        }}
      >
        <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", justifyContent: style.textAlign || "left" }}>
          <span>{label}</span>
          <span className="material-icons-round" style={{ 
            fontSize: "0.85rem", 
            opacity: isActive ? 1 : 0.5, 
            color: isActive ? "var(--color-primary, #8b5cf6)" : "inherit",
            transition: "all 0.2s"
          }}>
            {!isActive ? 'swap_vert' : (sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward')}
          </span>
        </div>
      </th>
    );
  };

  return (
    <div className="app-container">
      
      {/* HEADER BAR */}
      <header>
        <div className="logo-container">
          <div className="logo-icon">ARB</div>
          <div className="logo-title">
            <h1>ARB BEARINGS</h1>
            <span>Production Planning & Analytics Dashboard</span>
          </div>
        </div>
        
        <div className="header-controls">
          {/* Role Simulator Selector */}
          <div className="role-simulator">
            <span className="material-icons-round" style={{color: "var(--color-primary)", fontSize: "1.1rem"}}>admin_panel_settings</span>
            <span className="role-label">User Persona</span>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="role-select">
              <option value="Admin">Admin (Full Control)</option>
              <option value="Production Planner">Production Planner</option>
              <option value="Viewer">Viewer (Read-Only)</option>
            </select>
          </div>

          {/* Theme Toggle */}
          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="btn-icon" title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}>
            <span className="material-icons-round">{theme === "dark" ? "light_mode" : "dark_mode"}</span>
          </button>
        </div>
      </header>

      {/* TAB NAVIGATION NAVIGATION */}
      <nav className="nav-tabs">
        <button onClick={() => handleTabSwitch("dashboard")} className={`tab-btn ${activeTab === "dashboard" ? "active" : ""}`}>
          <span className="material-icons-round" style={{verticalAlign: "middle", marginRight: "6px", fontSize: "1.1rem"}}>dashboard</span>Dashboard
        </button>
        <button onClick={() => handleTabSwitch("ingestion")} className={`tab-btn ${activeTab === "ingestion" ? "active" : ""}`}>
          <span className="material-icons-round" style={{verticalAlign: "middle", marginRight: "6px", fontSize: "1.1rem"}}>cloud_upload</span>Data Ingestion
        </button>
        <button onClick={() => handleTabSwitch("planning")} className={`tab-btn ${activeTab === "planning" ? "active" : ""}`}>
          <span className="material-icons-round" style={{verticalAlign: "middle", marginRight: "6px", fontSize: "1.1rem"}}>date_range</span>Production Planning
        </button>
        <button onClick={() => handleTabSwitch("reports")} className={`tab-btn ${activeTab === "reports" ? "active" : ""}`}>
          <span className="material-icons-round" style={{verticalAlign: "middle", marginRight: "6px", fontSize: "1.1rem"}}>summarize</span>Operational Reports
        </button>
      </nav>

      {/* CORE VIEWPORT CONTENT PANELS */}
      <main className="view-viewport">
        
        {/* GLOBAL UNIFIED FILTER DECK */}
        <section className="filters-panel">
          <div className="filters-header">
            <h3>Unified Filter Deck</h3>
            <button onClick={resetFilters} className="btn-reset">
              <span className="material-icons-round" style={{fontSize: "0.9rem"}}>refresh</span>Reset Deck
            </button>
          </div>
          <div className="filters-grid">
            {/* Custom Dropdown for Production Year */}
            <div className="filter-group custom-dropdown-container" style={{ zIndex: activeDropdown === 'year' ? 1001 : 1 }}>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: "6px", fontSize: "0.8rem", color: "var(--text-muted)" }}>Production Year</label>
              <button 
                type="button"
                className="custom-dropdown-btn"
                onClick={() => setActiveDropdown(activeDropdown === 'year' ? null : 'year')}
              >
                <span>
                  {filters.year.length === 0 || filters.year.length === uniqueYears.length
                    ? "All Years"
                    : `${filters.year.length} selected`}
                </span>
                <span className="material-icons-round" style={{ fontSize: "1rem" }}>
                  {activeDropdown === 'year' ? 'expand_less' : 'expand_more'}
                </span>
              </button>
              {activeDropdown === 'year' && (
                <div className="custom-dropdown-panel">
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", cursor: "pointer", margin: "2px 0", fontWeight: "600", color: "var(--color-primary, #8b5cf6)", borderBottom: "1px solid var(--border-color)", paddingBottom: "4px" }}>
                    <input 
                      type="checkbox" 
                      checked={filters.year.length === uniqueYears.length} 
                      onChange={(e) => handleSelectAllFilter("year", uniqueYears.map(String), e.target.checked)} 
                    /> Select All
                  </label>
                  {uniqueYears.map(y => (
                    <label key={y} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", cursor: "pointer", margin: "2px 0", color: "var(--text-main)" }}>
                      <input 
                        type="checkbox" 
                        checked={filters.year.includes(String(y))} 
                        onChange={(e) => handleCheckboxFilter("year", String(y), e.target.checked)} 
                      /> {y}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Custom Dropdown for Mfg Unit */}
            <div className="filter-group custom-dropdown-container" style={{ zIndex: activeDropdown === 'unit' ? 1001 : 1 }}>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: "6px", fontSize: "0.8rem", color: "var(--text-muted)" }}>Mfg Unit</label>
              <button 
                type="button"
                className="custom-dropdown-btn"
                onClick={() => setActiveDropdown(activeDropdown === 'unit' ? null : 'unit')}
              >
                <span>
                  {filters.unit.length === 0 || filters.unit.length === uniqueUnits.length
                    ? "All Mfg Units"
                    : `${filters.unit.length} selected`}
                </span>
                <span className="material-icons-round" style={{ fontSize: "1rem" }}>
                  {activeDropdown === 'unit' ? 'expand_less' : 'expand_more'}
                </span>
              </button>
              {activeDropdown === 'unit' && (
                <div className="custom-dropdown-panel">
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", cursor: "pointer", margin: "2px 0", fontWeight: "600", color: "var(--color-primary, #8b5cf6)", borderBottom: "1px solid var(--border-color)", paddingBottom: "4px" }}>
                    <input 
                      type="checkbox" 
                      checked={filters.unit.length === uniqueUnits.length} 
                      onChange={(e) => handleSelectAllFilter("unit", uniqueUnits, e.target.checked)} 
                    /> Select All
                  </label>
                  {uniqueUnits.map(u => (
                    <label key={u} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", cursor: "pointer", margin: "2px 0", color: "var(--text-main)" }}>
                      <input 
                        type="checkbox" 
                        checked={filters.unit.includes(u)} 
                        onChange={(e) => handleCheckboxFilter("unit", u, e.target.checked)} 
                      /> {u}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Custom Dropdown for Bearing Category */}
            <div className="filter-group custom-dropdown-container" style={{ zIndex: activeDropdown === 'category' ? 1001 : 1 }}>
              <label style={{ fontWeight: "bold", display: "block", marginBottom: "6px", fontSize: "0.8rem", color: "var(--text-muted)" }}>Bearing Category</label>
              <button 
                type="button"
                className="custom-dropdown-btn"
                onClick={() => setActiveDropdown(activeDropdown === 'category' ? null : 'category')}
              >
                <span>
                  {filters.category.length === 0 || filters.category.length === uniqueCategories.length
                    ? "All Categories"
                    : `${filters.category.length} selected`}
                </span>
                <span className="material-icons-round" style={{ fontSize: "1rem" }}>
                  {activeDropdown === 'category' ? 'expand_less' : 'expand_more'}
                </span>
              </button>
              {activeDropdown === 'category' && (
                <div className="custom-dropdown-panel">
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", cursor: "pointer", margin: "2px 0", fontWeight: "600", color: "var(--color-primary, #8b5cf6)", borderBottom: "1px solid var(--border-color)", paddingBottom: "4px" }}>
                    <input 
                      type="checkbox" 
                      checked={filters.category.length === uniqueCategories.length} 
                      onChange={(e) => handleSelectAllFilter("category", uniqueCategories, e.target.checked)} 
                    /> Select All
                  </label>
                  {uniqueCategories.map(c => (
                    <label key={c} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", cursor: "pointer", margin: "2px 0", color: "var(--text-main)" }}>
                      <input 
                        type="checkbox" 
                        checked={filters.category.includes(c)} 
                        onChange={(e) => handleCheckboxFilter("category", c, e.target.checked)} 
                      /> {c}
                    </label>
                  ))}
                </div>
              )}
            </div>
            {/* Party Name Search */}
            <div className="filter-group">
              <label>Party / Customer Name</label>
              <input 
                type="text" 
                value={filters.partyName} 
                onChange={(e) => handleFilterChange("partyName", e.target.value)} 
                className="filter-control" 
                placeholder="Search customer..."
              />
            </div>
            {/* Bearing Search */}
            <div className="filter-group">
              <label>Bearing Number</label>
              <input 
                type="text" 
                value={filters.bearingNo} 
                onChange={(e) => handleFilterChange("bearingNo", e.target.value)} 
                className="filter-control" 
                placeholder="Search bearing catalog..."
              />
            </div>
            {/* Display Metric Mode Select */}
            <div className="filter-group">
              <label>Display Metric Mode</label>
              <select 
                value={metricMode} 
                onChange={(e) => setMetricMode(e.target.value)} 
                className="filter-control"
              >
                <option value="quantity">Quantity (QTY)</option>
                <option value="basicValue">Basic Value (excl. GST)</option>
                <option value="withGstValue">With GST Value (incl. GST)</option>
              </select>
            </div>
          </div>
          
          {/* Multi-select checkboxes for Quarters & Months */}
          <div style={{display: "flex", gap: "30px", marginTop: "14px", flexWrap: "wrap", borderTop: "1px solid var(--border-color)", paddingTop: "14px"}}>
            <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
              <span style={{fontSize: "0.75rem", fontWeight: "600", color: "var(--text-muted)"}}>Quarters:</span>
              {["Q1", "Q2", "Q3", "Q4"].map(q => (
                <label key={q} style={{fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "4px", cursor: "pointer"}}>
                  <input 
                    type="checkbox" 
                    checked={filters.quarter.includes(q)} 
                    onChange={(e) => handleCheckboxFilter("quarter", q, e.target.checked)} 
                  /> {q}
                </label>
              ))}
            </div>
            <div style={{display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap"}}>
              <span style={{fontSize: "0.75rem", fontWeight: "600", color: "var(--text-muted)"}}>Months:</span>
              {MONTH_NAMES.map(m => (
                <label key={m} style={{fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "4px", cursor: "pointer"}}>
                  <input 
                    type="checkbox" 
                    checked={filters.month.includes(m)} 
                    onChange={(e) => handleCheckboxFilter("month", m, e.target.checked)} 
                  /> {m.substring(0,3)}
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* 1. DASHBOARD TAB PANEL */}
        <div id="view-dashboard" className={`view-panel ${activeTab === "dashboard" ? "active" : ""}`}>
          
          {/* KPI METRICS */}
          <div className="kpis-grid">
            <div className="kpi-card">
              <div className="kpi-label">
                {metricMode === "quantity" ? "Actual Output Quantity" : (metricMode === "basicValue" ? "Actual Basic Value" : "Actual Output Value (GST)")}
              </div>
              <div className="kpi-val">{formatMetric(kpis.totalActual)}</div>
              <div className="kpi-sub neutral"><span className="material-icons-round" style={{fontSize: "0.9rem"}}>timeline</span>Total production volumes</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Manufacturing Units</div>
              <div className="kpi-val">{kpis.activeUnits}</div>
              <div className="kpi-sub neutral"><span className="material-icons-round" style={{fontSize: "0.9rem"}}>business</span>Active facilities</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Product Categories</div>
              <div className="kpi-val">{kpis.activeCategories}</div>
              <div className="kpi-sub neutral"><span className="material-icons-round" style={{fontSize: "0.9rem"}}>category</span>Distinct bearing families</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Catalog Numbers</div>
              <div className="kpi-val">{kpis.activeBearings}</div>
              <div className="kpi-sub neutral"><span className="material-icons-round" style={{fontSize: "0.9rem"}}>tag</span>Unique bearing codes</div>
            </div>
            <div className="kpi-card kpi-planned">
              <div className="kpi-label">
                {metricMode === "quantity" ? "Planned Volume (CY)" : (metricMode === "basicValue" ? "Planned Basic Value (CY)" : "Planned Value with GST (CY)")}
              </div>
              <div className="kpi-val">{formatMetric(kpis.totalPlanned)}</div>
              <div className="kpi-sub neutral"><span className="material-icons-round" style={{fontSize: "0.9rem"}}>calendar_month</span>Rolling plan targets</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">
                {metricMode === "quantity" ? "Actual Meeting Plan (CY)" : (metricMode === "basicValue" ? "Actual Met Value (CY)" : "Actual Met Value with GST (CY)")}
              </div>
              <div className="kpi-val">{formatMetric(kpis.matchedActual)}</div>
              <div className="kpi-sub up"><span className="material-icons-round" style={{fontSize: "0.9rem"}}>trending_up</span>{kpis.pctMet}% achieved</div>
            </div>
            <div className="kpi-card kpi-growth">
              <div className="kpi-label">Planning Growth %</div>
              <div className="kpi-val">{activePlan ? activePlan.growthRate : growthRate}%</div>
              <div className="kpi-sub neutral"><span className="material-icons-round" style={{fontSize: "0.9rem"}}>settings</span>Uplift config value</div>
            </div>
            <div className="kpi-card kpi-accuracy">
              <div className="kpi-label">Forecast Accuracy</div>
              <div className="kpi-val">{kpis.forecastAccuracy}</div>
              <div className="kpi-sub up"><span className="material-icons-round" style={{fontSize: "0.9rem"}}>insights</span>WAPE Method accuracy</div>
            </div>
          </div>

          {/* CHARTS CONTAINER GRID */}
          <div className="charts-grid">
            <div className="chart-card col-8">
              <h4>Monthly Production Trend</h4>
              <div className="chart-wrapper"><canvas id="chart-monthly-trend"></canvas></div>
            </div>
            <div className="chart-card col-4">
              <h4>Unit Contribution</h4>
              <div className="chart-wrapper"><canvas id="chart-unit-contribution"></canvas></div>
            </div>
            <div className="chart-card col-8">
              <h4>Planned vs Actual Production</h4>
              <div className="chart-wrapper"><canvas id="chart-planned-vs-actual"></canvas></div>
            </div>
            <div className="chart-card col-4">
              <h4>Category Contribution</h4>
              <div className="chart-wrapper"><canvas id="chart-category-contribution"></canvas></div>
            </div>
            <div className="chart-card col-6">
              <h4>Quarterly Production Comparison</h4>
              <div className="chart-wrapper"><canvas id="chart-quarterly-compare"></canvas></div>
            </div>
            <div className="chart-card col-6">
              <h4>Year-over-Year Growth</h4>
              <div className="chart-wrapper"><canvas id="chart-yoy-growth"></canvas></div>
            </div>
            <div className="chart-card col-6">
              <h4>Top Produced Bearings</h4>
              <div className="chart-wrapper"><canvas id="chart-top-bearings"></canvas></div>
            </div>
            <div className="chart-card col-6">
              <h4>Least Produced Bearings</h4>
              <div className="chart-wrapper"><canvas id="chart-least-bearings"></canvas></div>
            </div>
            <div className="chart-card col-6">
              <h4>Production by Unit</h4>
              <div className="chart-wrapper"><canvas id="chart-production-by-unit"></canvas></div>
            </div>
            <div className="chart-card col-6">
              <h4>Production by Category</h4>
              <div className="chart-wrapper"><canvas id="chart-production-by-category"></canvas></div>
            </div>

            {/* MATRIX HEATMAP CUSTOM RENDERING */}
            <div className="chart-card col-12">
              <h4>Monthly Production Heatmap (Units vs Months) - {heatmapData.activeYear}</h4>
              <div style={{overflowX: "auto"}}>
                <table className="grid-table" style={{borderCollapse: "collapse", width: "100%"}}>
                  <thead>
                    <tr>
                      <th style={{background: "var(--bg-surface-opaque)"}}>Mfg Facility</th>
                      {MONTH_NAMES.map(m => <th key={m} style={{textAlign: "center", background: "var(--bg-surface-opaque)"}}>{m.substring(0,3)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(heatmapData.matrix).map(u => (
                      <tr key={u}>
                        <td style={{fontWeight: 700}}>{u}</td>
                        {heatmapData.matrix[u].map((val, idx) => {
                          const opacity = val > 0 ? Math.min(1, Math.max(0.1, val / heatmapData.max)) : 0;
                          const bg = val > 0 ? `rgba(139, 92, 246, ${opacity})` : 'transparent';
                          const color = opacity > 0.5 ? '#fff' : 'var(--text-main)';
                          return (
                            <td 
                              key={idx} 
                              style={{
                                textAlign: "center", 
                                background: bg, 
                                color,
                                transition: "background 0.3s",
                                padding: "14px"
                              }}
                              title={`${u} - ${MONTH_NAMES[idx]}: ${formatMetric(val)}`}
                            >
                              {val > 0 ? formatMetric(val) : "-"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>

        {/* 2. INGESTION TAB PANEL */}
        <div id="view-ingestion" className={`view-panel ${activeTab === "ingestion" ? "active" : ""}`}>
          <div className="ingestion-container">
            <div className="uploader-card">
              <h3 style={{fontSize: "1.1rem", borderLeft: "3px solid var(--color-primary)", paddingLeft: "10px"}}>Ingest Production Data</h3>
              <p style={{fontSize: "0.85rem", color: "var(--text-muted)"}}>
                Upload actual historical CSV or Excel templates. The system will parse column mappings, check for negative figures, GST validation, and trigger duplicate conflicts overlay.
              </p>
              
              <div 
                className={`dropzone ${isDragOver ? "dragover" : ""}`}
                onClick={() => document.getElementById("file-input").click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (isAdmin) setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  if (!isAdmin) {
                    alert("Role Simulation View: Only Admin persona is allowed to ingest production data.");
                    return;
                  }
                  const file = e.dataTransfer.files?.[0];
                  if (file) {
                    processFile(file);
                  }
                }}
              >
                <span className="material-icons-round dropzone-icon">cloud_upload</span>
                <p>Drag & Drop or Click to Select Spreadsheet</p>
                <button type="button">Select File</button>
                <input 
                  type="file" 
                  id="file-input" 
                  className="hidden-input" 
                  accept=".csv, .xlsx, .xls"
                  onChange={handleFileUpload}
                  disabled={!isAdmin}
                />
              </div>

              <div className="requirements-list">
                <h5>Validation Checkpoints & Rules:</h5>
                <ul>
                  <li>Includes Unit, Month (e.g. Apr-24), Year, Quarter, Party name, Bearing styling details, and QTY.</li>
                  <li>Values calculated at 18% GST (GST = Basic Value * 1.18).</li>
                  <li>No negative quantities allowed (flagged instantly).</li>
                  <li>Simulation View: Only "Admin" persona can run data uploads.</li>
                </ul>
              </div>

              {uploaderErrors.length > 0 && (
                <div className="error-console active">
                  <div className="error-console-title">Row Validation Failures Detected ({uploaderErrors.length})</div>
                  <ul className="error-console-list">
                    {uploaderErrors.slice(0, 100).map((err, i) => (
                      <li key={i}>Row {err.row} ({err.bearing}): {err.error}</li>
                    ))}
                  </ul>
                  {uploaderErrors.length > 100 && (
                    <div style={{padding: "8px 12px", color: "var(--text-muted)", fontSize: "0.8rem", fontStyle: "italic", borderTop: "1px solid var(--border-color)", marginTop: "4px"}}>
                      Showing first 100 of {uploaderErrors.length} errors. Please fix these rows in your spreadsheet and re-upload.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="uploader-card" style={{ marginTop: "24px" }}>
              <h3 style={{fontSize: "1.1rem", borderLeft: "3px solid var(--color-primary)", paddingLeft: "10px"}}>Ingest Stock Inventory</h3>
              <p style={{fontSize: "0.85rem", color: "var(--text-muted)"}}>
                Upload physical stock spreadsheet. Must contain Bearing Catalog Number / Style and current Quantity. Upload will append new bearings or update existing stock levels.
              </p>
              
              <div 
                className={`dropzone ${isStockDragOver ? "dragover" : ""}`}
                onClick={() => document.getElementById("stock-file-input").click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (isAdmin) setIsStockDragOver(true);
                }}
                onDragLeave={() => setIsStockDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsStockDragOver(false);
                  if (!isAdmin) {
                    alert("Role Simulation View: Only Admin persona is allowed to ingest stock data.");
                    return;
                  }
                  const file = e.dataTransfer.files?.[0];
                  if (file) {
                    processStockFile(file);
                  }
                }}
              >
                <span className="material-icons-round dropzone-icon" style={{ color: "var(--color-accent, #a855f7)" }}>inventory_2</span>
                <p>Drag & Drop or Click to Select Stock Spreadsheet</p>
                <button type="button" style={{ background: "var(--color-accent, #a855f7)", borderColor: "var(--color-accent, #a855f7)" }}>Select Stock File</button>
                <input 
                  type="file" 
                  id="stock-file-input" 
                  className="hidden-input" 
                  accept=".csv, .xlsx, .xls"
                  onChange={handleStockFileUpload}
                  disabled={!isAdmin}
                />
              </div>

              <div className="requirements-list">
                <h5>Stock Validation Rules:</h5>
                <ul>
                  <li>Header must contain bearing identification (e.g. Bearing No, Bearing Style) and stock quantity (e.g. Quantity, Stock, Qty).</li>
                  <li>No negative quantities allowed (flagged instantly).</li>
                  <li>Simulation View: Only "Admin" persona can run stock uploads.</li>
                </ul>
              </div>
            </div>

            <div className="preview-card">
              <div className="preview-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", borderBottom: "1px solid var(--border-color)", paddingBottom: "14px", marginBottom: "16px" }}>
                <div>
                  <h3 style={{fontSize: "1.1rem", borderLeft: "3px solid var(--color-primary)", paddingLeft: "10px", margin: 0}}>
                    {tempUploadRows.length > 0 ? "Parsed Upload Preview" : `Historical Production Records (${records.length.toLocaleString()})`}
                  </h3>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginLeft: "13px", display: "inline-block", marginTop: "2px" }}>
                    {records.length > 0 ? `${records.length.toLocaleString()} total entries loaded from MongoDB database` : "Database is currently empty"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>

                  {records.length > 0 && (
                    <button 
                      type="button" 
                      onClick={() => {
                        if (!isAdmin) {
                          alert("Role Simulation View: Only Admin persona is allowed to delete records.");
                          return;
                        }
                        setDeleteConfirmText("");
                        setShowDeleteModal(true);
                      }} 
                      className="btn btn-danger" 
                      style={{ 
                        fontSize: "0.82rem", 
                        display: "inline-flex", 
                        alignItems: "center", 
                        gap: "6px",
                        boxShadow: "0 2px 8px rgba(220, 38, 38, 0.2)"
                      }}
                      disabled={!isAdmin}
                      title="Permanently wipe all records from database"
                    >
                      <span className="material-icons-round" style={{ fontSize: "1.1rem" }}>delete_forever</span>
                      Delete All Records
                    </button>
                  )}
                </div>
              </div>
              <div className="preview-table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Unit</th>
                      <th>Month</th>
                      <th>Year</th>
                      <th>Quarter</th>
                      <th>Party Name</th>
                      <th>Bearing No.</th>
                      <th>Category</th>
                      <th>QTY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedPreviewRows.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="empty-state">No file uploaded or parsing failed.</td>
                      </tr>
                    ) : (
                      paginatedPreviewRows.map((r, i) => (
                        <tr key={i}>
                          <td>{r.unit}</td>
                          <td>{r.month}</td>
                          <td>{r.year}</td>
                          <td>{r.quarter}</td>
                          <td>{r.partyName}</td>
                          <td>{r.bearingNo}</td>
                          <td>{r.category}</td>
                          <td>{r.quantity}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {uploaderPreview.length > UPLOADER_PAGE_SIZE && (
                <div className="pagination-controls" style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: "16px",
                  paddingTop: "16px",
                  borderTop: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))"
                }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Showing {Math.min(uploaderPreview.length, (uploaderPreviewPage - 1) * UPLOADER_PAGE_SIZE + 1)} to {Math.min(uploaderPreview.length, uploaderPreviewPage * UPLOADER_PAGE_SIZE)} of {uploaderPreview.length.toLocaleString()} entries
                  </span>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button 
                      onClick={() => setUploaderPreviewPage(p => Math.max(1, p - 1))} 
                      className="btn btn-secondary" 
                      style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                      disabled={uploaderPreviewPage === 1}
                    >
                      Previous
                    </button>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", color: "var(--text-main)", fontWeight: "600" }}>
                      <span>Page</span>
                      <input 
                        type="number"
                        value={uploaderPreviewPage || ""}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) {
                            setUploaderPreviewPage(Math.max(1, Math.min(totalPreviewPages, val)));
                          }
                        }}
                        style={{
                          width: "50px",
                          textAlign: "center",
                          padding: "4px 6px",
                          borderRadius: "6px",
                          border: "1px solid var(--border-color, rgba(255, 255, 255, 0.15))",
                          background: "var(--bg-surface-opaque, rgba(255, 255, 255, 0.05))",
                          color: "var(--text-main)",
                          fontSize: "0.85rem"
                        }}
                        min="1"
                        max={totalPreviewPages}
                      />
                      <span>of {totalPreviewPages}</span>
                    </div>
                    <button 
                      onClick={() => setUploaderPreviewPage(p => Math.min(totalPreviewPages, p + 1))} 
                      className="btn btn-secondary" 
                      style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                      disabled={uploaderPreviewPage >= totalPreviewPages}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 3. PRODUCTION PLANNING TAB PANEL */}
        <div id="view-planning" className={`view-panel ${activeTab === "planning" ? "active" : ""}`}>
          
          {planningError && (
            <div className="planning-error-banner" style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "14px",
              padding: "16px 20px",
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              borderRadius: "12px",
              color: "#fca5a5",
              marginBottom: "16px",
              width: "100%",
              boxShadow: "0 4px 16px rgba(239, 68, 68, 0.1)"
            }}>
              <span className="material-icons-round" style={{ fontSize: "1.5rem", color: "var(--color-danger, #ef4444)", flexShrink: 0, marginTop: "2px" }}>
                error
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", flexGrow: 1 }}>
                <strong style={{ color: "#fff", fontSize: "0.95rem" }}>Historical Data Missing / Incomplete</strong>
                <span style={{ fontSize: "0.85rem", lineHeight: "1.5", color: "rgba(255, 255, 255, 0.9)" }}>
                  {planningError}
                </span>
              </div>
              <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                <button 
                  onClick={() => handleTabSwitch("ingestion")} 
                  className="btn btn-secondary"
                  style={{ fontSize: "0.8rem", padding: "6px 14px", background: "rgba(239, 68, 68, 0.25)", borderColor: "rgba(239, 68, 68, 0.5)", color: "#fff", display: "flex", alignItems: "center", gap: "4px" }}
                >
                  <span className="material-icons-round" style={{ fontSize: "0.95rem" }}>cloud_upload</span>
                  Go to Data Ingestion
                </button>
                <button 
                  onClick={() => setPlanningError(null)} 
                  className="btn-icon" 
                  style={{ color: "rgba(255, 255, 255, 0.7)", background: "transparent", border: "none", cursor: "pointer" }}
                  title="Dismiss"
                >
                  <span className="material-icons-round" style={{ fontSize: "1.2rem" }}>close</span>
                </button>
              </div>
            </div>
          )}

          <div className="planning-top-actions" style={{ flexDirection: "column", alignItems: "flex-start", gap: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", flexWrap: "wrap", gap: "16px" }}>
              <div className="planning-params">
                <div className="param-input-group">
                  <label style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span className="material-icons-round" style={{ fontSize: "1rem", color: "var(--color-primary)" }}>event</span>
                    Start Month:
                  </label>
                  <select 
                    value={startMonth} 
                    onChange={(e) => setStartMonth(parseInt(e.target.value, 10))}
                    className="param-select"
                    style={{ fontWeight: "600", minWidth: "120px" }}
                    disabled={isViewer}
                  >
                    {MONTH_NAMES.map((name, idx) => (
                      <option key={name} value={idx + 1}>{name}</option>
                    ))}
                  </select>
                  <select
                    value={startYear}
                    onChange={(e) => setStartYear(parseInt(e.target.value, 10))}
                    className="param-select"
                    style={{ fontWeight: "600", minWidth: "85px" }}
                    disabled={isViewer}
                  >
                    {[...new Set([...(uniqueYears.length > 0 ? uniqueYears : [2024, 2025, 2026]), 2024, 2025, 2026, 2027, 2028, 2029, 2030])].sort().map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div className="param-input-group">
                  <label>Planning N Months:</label>
                  <input 
                    type="number" 
                    value={planningPeriod} 
                    onChange={(e) => setPlanningPeriod(Math.max(1, parseInt(e.target.value) || 0))}
                    className="param-input"
                    min="1"
                    disabled={isViewer}
                  />
                </div>
                <div className="param-input-group">
                  <label>Growth Modifier %:</label>
                  <input 
                    type="number" 
                    value={growthRate} 
                    onChange={(e) => setGrowthRate(parseFloat(e.target.value) || 0)}
                    className="param-input"
                    min="0"
                    disabled={isViewer}
                  />
                </div>
                <div className="param-input-group">
                  <label>Gap Month:</label>
                  <select 
                    value={gapMonth === null ? "" : gapMonth} 
                    onChange={(e) => setGapMonth(e.target.value === "" ? null : parseInt(e.target.value, 10))}
                    className="param-select"
                    style={{ minWidth: "160px" }}
                    disabled={isViewer}
                  >
                    <option value="">Default (N/2 + 1)</option>
                    {Array.from({ length: Math.max(0, planningPeriod - 1) }, (_, i) => i + 2).map(m => {
                      const horizon = getPlanningMonths(planningPeriod, startMonth, startYear);
                      const targetMonthInfo = horizon[m - 1];
                      const monthStr = targetMonthInfo ? ` (${targetMonthInfo.monthName.substring(0,3)} ${targetMonthInfo.year})` : "";
                      return (
                        <option key={m} value={m}>Month {m}{monthStr}</option>
                      );
                    })}
                  </select>
                </div>
              </div>
              <div style={{display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap"}}>
                <div className="plan-start-badge" title="Active Plan Start Month">
                  <span className="material-icons-round" style={{ fontSize: "1rem", color: "var(--color-primary)" }}>calendar_month</span>
                  <span>Start Month: <strong>{MONTH_NAMES[startMonth - 1]} {startYear}</strong></span>
                </div>
                <div className="plan-status-row">
                  {activePlan ? (
                    <span className={`plan-status-badge badge-${activePlan.status.toLowerCase()}`}>
                      Status: {activePlan.status}
                    </span>
                  ) : (
                    <span className="plan-status-badge badge-draft">No Active Plan</span>
                  )}
                </div>
                <button 
                  onClick={triggerGeneratePlan} 
                  className="btn btn-primary" 
                  style={{display: "flex", alignItems: "center", gap: "6px"}}
                  disabled={isViewer}
                >
                  <span className="material-icons-round" style={{fontSize: "1.1rem"}}>analytics</span>Generate Plan
                </button>
                {activePlan?.status === "Draft" && (
                  <button 
                    onClick={handleApprovePlan} 
                    className="btn btn-primary" 
                    style={{background: "var(--color-success)", color: "#fff", display: "flex", alignItems: "center", gap: "6px"}}
                    disabled={!isAdmin}
                  >
                    <span className="material-icons-round" style={{fontSize: "1.1rem"}}>lock</span>Lock & Approve
                  </button>
                )}
              </div>
            </div>

            {minThresholds.length > 0 && (
              <div className="ratios-config-panel" style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                padding: "16px",
                background: "var(--bg-surface-opaque, rgba(255, 255, 255, 0.03))",
                borderRadius: "12px",
                border: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
                width: "100%"
              }}>
                <span style={{ fontSize: "0.85rem", fontWeight: "600", color: "var(--text-main)" }}>
                  Minimum Quantity Thresholds for Category Split (Enter value for each threshold):
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                  {minThresholds.map((val, idx) => (
                    <div key={idx} style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "120px" }}>
                      <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600" }}>
                        Min {idx + 1}
                      </label>
                      <input 
                        type="number"
                        value={val}
                        onChange={(e) => {
                          const value = parseInt(e.target.value) || 0;
                          setMinThresholds(prev => {
                            const next = [...prev];
                            next[idx] = Math.max(0, value);
                            return next;
                          });
                        }}
                        className="param-input"
                        style={{ width: "100%", textAlign: "center" }}
                        disabled={isViewer}
                        min="0"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {dividingRatios.length > 0 && (() => {
              const totalRatioSum = dividingRatios.reduce((s, r) => s + r, 0);
              const isOver = totalRatioSum > 100;
              const isInvalid = totalRatioSum !== 100 && totalRatioSum !== 0;
              return (
                <div className={`ratios-config-panel ${isOver ? "shake-alert warning-flash" : ""}`} style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  padding: "16px",
                  background: "var(--bg-surface-opaque, rgba(255, 255, 255, 0.03))",
                  borderRadius: "12px",
                  border: isOver ? "1px solid var(--color-danger, #ef4444)" : "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
                  width: "100%",
                  marginTop: "12px",
                  transition: "all 0.3s"
                }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: "600", color: "var(--text-main)", display: "flex", justifyContent: "space-between", width: "100%", flexWrap: "wrap", gap: "8px" }}>
                    <span>Dividing Ratios for Month Split (Percentages, sum must be 100% or all 0%):</span>
                    <span style={{ 
                      color: isInvalid ? "var(--color-danger, #ef4444)" : "var(--color-success, #10b981)",
                      fontWeight: "bold"
                    }}>
                      Total: {totalRatioSum}%
                    </span>
                  </span>
                  
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                    {(() => {
                      const horizon = getPlanningMonths(planningPeriod, startMonth, startYear);
                      return dividingRatios.map((val, idx) => {
                        const targetMonthInfo = horizon[idx];
                        const monthLabel = targetMonthInfo ? `${targetMonthInfo.monthName.substring(0,3)} ${targetMonthInfo.year}` : `Month ${idx + 1}`;
                        return (
                          <div key={idx} style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "120px" }}>
                            <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600" }}>
                              M{idx + 1} ({monthLabel}) %
                            </label>
                            <input 
                              type="number"
                              value={val || ""}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value) || 0;
                                setDividingRatios(prev => {
                                  const next = [...prev];
                                  next[idx] = Math.max(0, value);
                                  return next;
                                });
                              }}
                              className="param-input"
                              style={{ width: "100%", textAlign: "center", borderColor: isOver ? "var(--color-danger, #ef4444)" : "" }}
                              disabled={isViewer}
                              min="0"
                            />
                          </div>
                        );
                      });
                    })()}
                  </div>

                  {isInvalid && (
                    <div style={{ 
                      fontSize: "0.8rem", 
                      color: "var(--color-danger, #ef4444)", 
                      fontWeight: "600",
                      marginTop: "4px",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    }}>
                      <span className="material-icons-round" style={{ fontSize: "1rem" }}>error_outline</span>
                      {isOver 
                        ? "Total ratio exceeds 100%! Please reduce values to sum to exactly 100%."
                        : "Total ratio is less than 100%. Custom ratios must sum to exactly 100%."
                      }
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {activePlan && (activePlan.recentTotal !== undefined || activePlan.previousTotal !== undefined) && (
            <div className="comparison-panel" style={{
              display: "flex",
              gap: "24px",
              marginBottom: "20px",
              padding: "20px",
              background: "var(--bg-surface-opaque, rgba(255, 255, 255, 0.03))",
              borderRadius: "12px",
              border: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
              alignItems: "center",
              justifyContent: "space-between"
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <h4 style={{ margin: 0, fontSize: "1rem", color: "var(--text-main)", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span>Baseline Period Comparison (N = {activePlan.planningPeriod} Months)</span>
                  <span style={{ fontSize: "0.75rem", fontWeight: "600", padding: "2px 8px", borderRadius: "6px", background: "rgba(139, 92, 246, 0.15)", color: "var(--color-primary)" }}>
                    Start: {MONTH_NAMES[(activePlan.startMonth || startMonth) - 1]} {activePlan.startYear || startYear}
                  </span>
                </h4>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Historical actual production compared between {activePlan.planningPeriod} completed baseline months prior to {MONTH_NAMES[(activePlan.startMonth || startMonth) - 1]} {activePlan.startYear || startYear} and the previous year.
                </p>
              </div>

              <div style={{ display: "flex", gap: "32px", alignItems: "center" }}>
                {/* Recent Months Total Card */}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "4px" }}>Recent {activePlan.planningPeriod} Months</div>
                  <div style={{ 
                    fontSize: "1.25rem", 
                    fontWeight: "700", 
                    color: activePlan.isRecentStronger ? "var(--color-success, #10b981)" : "var(--text-main)" 
                  }}>
                    {activePlan.recentTotal?.toLocaleString() || 0} units
                  </div>
                  {activePlan.isRecentStronger && (
                    <span style={{ fontSize: "0.6rem", background: "rgba(16, 185, 129, 0.15)", color: "var(--color-success)", padding: "2px 6px", borderRadius: "4px", fontWeight: "600" }}>Higher (Selected)</span>
                  )}
                </div>

                <div style={{ fontSize: "1.2rem", fontWeight: "300", color: "var(--text-muted)" }}>vs</div>

                {/* Previous Year Months Total Card */}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "4px" }}>Previous Year Period</div>
                  <div style={{ 
                    fontSize: "1.25rem", 
                    fontWeight: "700", 
                    color: !activePlan.isRecentStronger ? "var(--color-success, #10b981)" : "var(--text-main)" 
                  }}>
                    {activePlan.previousTotal?.toLocaleString() || 0} units
                  </div>
                  {!activePlan.isRecentStronger && (
                    <span style={{ fontSize: "0.6rem", background: "rgba(16, 185, 129, 0.15)", color: "var(--color-success)", padding: "2px 6px", borderRadius: "4px", fontWeight: "600" }}>Higher (Selected)</span>
                  )}
                </div>

                <div style={{ 
                  paddingLeft: "20px", 
                  borderLeft: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))", 
                  display: "flex", 
                  flexDirection: "column", 
                  gap: "4px" 
                }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Growth Modifier Applied</div>
                  <div style={{ fontSize: "1.25rem", fontWeight: "700", color: "var(--color-primary, #8b5cf6)" }}>
                    +{activePlan.growthRate}%
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PLANNING TARGETS GRID */}
          <div className="planning-grid-card">
            <div className="preview-header" style={{marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px"}}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <h3 style={{fontSize: "1.1rem", borderLeft: "3px solid var(--color-primary)", paddingLeft: "10px", margin: 0}}>
                  {planningPeriod}-Month Production Target Grid
                </h3>
                <span className="plan-start-chip">
                  <span className="material-icons-round" style={{ fontSize: "0.9rem" }}>flag</span>
                  Starts: {MONTH_NAMES[startMonth - 1]} {startYear}
                </span>
              </div>
              <span style={{fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic"}}>
                Double-click cells highlighted in purple to modify (double click outside or hit enter to submit cell edit).
              </span>
            </div>

            <div className="grid-table-container">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th>Bearing style</th>
                    <th>Category</th>
                    <th>Mfg unit</th>
                    {renderSortHeader('stock', 'Stock', {textAlign: "center", color: "var(--color-accent, #a855f7)"})}
                    <th style={{textAlign: "center", color: "var(--color-primary, #8b5cf6)"}}>CY Baseline ({planningPeriod}m)</th>
                    <th style={{textAlign: "center", color: "var(--color-primary, #8b5cf6)"}}>PY Baseline ({planningPeriod}m)</th>
                    {planningMonthsList.map(ym => {
                      const [y, m] = ym.split("-");
                      return <th key={ym} style={{textAlign: "center"}}>{MONTH_NAMES[parseInt(m)-1].substring(0,3)} {y}</th>;
                    })}
                    {renderSortHeader('sumTarget', 'Sum Target', {textAlign: "center"})}
                  </tr>
                </thead>
                <tbody>
                  {paginatedProducts.length === 0 ? (
                    <tr>
                      <td colSpan={planningMonthsList.length + 7} className="empty-state">No target grids matching filters. Generate plan.</td>
                    </tr>
                  ) : (
                    paginatedProducts.map((p, idx) => {
                      let rowSum = 0;
                      const firstTarget = Object.values(p.monthlyTargets)[0];
                      const qtyRecent = firstTarget ? (firstTarget.qtyRecent || 0) : 0;
                      const qtyPrevious = firstTarget ? (firstTarget.qtyPrevious || 0) : 0;
                      
                      const hasData = qtyRecent > 0 || qtyPrevious > 0;
                      const isRecentWinner = hasData && qtyRecent >= qtyPrevious;
                      const isPreviousWinner = hasData && qtyPrevious > qtyRecent;

                      return (
                        <tr key={idx}>
                          <td style={{fontWeight: 700}}>{p.bearingNo}</td>
                          <td style={{fontSize: "0.75rem", color: "var(--text-muted)"}}>{p.category}</td>
                          <td>{p.unitName}</td>
                          <td style={{
                            textAlign: "center", 
                            fontWeight: "600",
                            color: "var(--color-accent, #a855f7)",
                            background: "rgba(168, 85, 247, 0.05)"
                          }}>
                            {(stocks[p.bearingNo] !== undefined ? stocks[p.bearingNo] : 0).toLocaleString()}
                          </td>
                          <td style={{
                            textAlign: "center", 
                            fontWeight: isRecentWinner ? "700" : "400",
                            color: isRecentWinner ? "var(--color-success, #10b981)" : "var(--text-muted)",
                            background: isRecentWinner ? "rgba(16, 185, 129, 0.05)" : "transparent"
                          }}>
                            {qtyRecent.toLocaleString()}
                          </td>
                          <td style={{
                            textAlign: "center", 
                            fontWeight: isPreviousWinner ? "700" : "400",
                            color: isPreviousWinner ? "var(--color-success, #10b981)" : "var(--text-muted)",
                            background: isPreviousWinner ? "rgba(16, 185, 129, 0.05)" : "transparent"
                          }}>
                            {qtyPrevious.toLocaleString()}
                          </td>
                          {planningMonthsList.map((ym, monthIdx) => {
                            const item = p.monthlyTargets[ym];
                            const qty = item ? item.plannedQuantity : 0;
                            rowSum += qty;
                            
                            const isEditing = editingCell && 
                              editingCell.bearingNo === p.bearingNo &&
                              editingCell.unitName === p.unitName &&
                              editingCell.month === parseInt(ym.split("-")[1]) &&
                              editingCell.year === parseInt(ym.split("-")[0]);

                            return (
                              <td 
                                key={ym} 
                                className={`cell-editable ${item?.isManuallyEdited ? "modified" : ""}`}
                                onDoubleClick={() => item && handleCellDoubleClick(item, item.targetMonth, item.targetYear)}
                              >
                                {isEditing ? (
                                  <input 
                                    type="number"
                                    value={editValue}
                                    onChange={(e) => {
                                      const clean = e.target.value.replace(/[^0-9]/g, "");
                                      setEditValue(clean);
                                    }}
                                    onBlur={saveCellOverride}
                                    onKeyDown={(e) => e.key === 'Enter' && saveCellOverride()}
                                    autoFocus
                                    min="0"
                                    step="1"
                                  />
                                ) : (
                                  <span>{qty.toLocaleString()}</span>
                                )}
                              </td>
                            );
                          })}
                          <td style={{textAlign: "center", fontWeight: "700"}}>{rowSum.toLocaleString()}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {planningProducts.length > PLANNING_PAGE_SIZE && (
              <div className="pagination-controls" style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "16px",
                paddingTop: "16px",
                borderTop: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))"
              }}>
                <span style={{fontSize: "0.8rem", color: "var(--text-muted)"}}>
                  Showing {Math.min(planningProducts.length, (planningPage - 1) * PLANNING_PAGE_SIZE + 1)} to {Math.min(planningProducts.length, planningPage * PLANNING_PAGE_SIZE)} of {planningProducts.length} entries
                </span>
                <div style={{display: "flex", gap: "8px", alignItems: "center"}}>
                  <button 
                    onClick={() => setPlanningPage(p => Math.max(1, p - 1))} 
                    className="btn btn-secondary" 
                    style={{padding: "6px 12px", fontSize: "0.8rem"}}
                    disabled={planningPage === 1}
                  >
                    Previous
                  </button>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", color: "var(--text-main)", fontWeight: "600" }}>
                    <span>Page</span>
                    <input 
                      type="number"
                      value={planningPage || ""}
                      onChange={(e) => {
                        const totalPages = Math.ceil(planningProducts.length / PLANNING_PAGE_SIZE) || 1;
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) {
                          setPlanningPage(Math.max(1, Math.min(totalPages, val)));
                        } else {
                          setPlanningPage(""); 
                        }
                      }}
                      onBlur={(e) => {
                        if (e.target.value === "") {
                          setPlanningPage(1);
                        }
                      }}
                      style={{ 
                        width: "55px", 
                        padding: "4px 8px", 
                        fontSize: "0.8rem", 
                        textAlign: "center",
                        background: "var(--bg-input, rgba(255, 255, 255, 0.05))",
                        border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                        borderRadius: "6px",
                        color: "var(--text-main)",
                        fontWeight: "600"
                      }}
                      min="1"
                      max={Math.ceil(planningProducts.length / PLANNING_PAGE_SIZE) || 1}
                    />
                    <span>of {Math.ceil(planningProducts.length / PLANNING_PAGE_SIZE) || 1}</span>
                  </div>
                  <button 
                    onClick={() => setPlanningPage(p => Math.min(Math.ceil(planningProducts.length / PLANNING_PAGE_SIZE), p + 1))} 
                    className="btn btn-secondary" 
                    style={{padding: "6px 12px", fontSize: "0.8rem"}}
                    disabled={planningPage === Math.ceil(planningProducts.length / PLANNING_PAGE_SIZE)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

          </div>



        </div>

        {/* 4. OPERATIONAL REPORTS TAB PANEL */}
        <div id="view-reports" className={`view-panel ${activeTab === "reports" ? "active" : ""}`}>
          <div className="reports-layout">
            <aside className="reports-menu">
              <div style={{ padding: "4px 8px 8px", fontSize: "0.75rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-muted)" }}>
                Report Catalog
              </div>
              <button 
                onClick={() => setActiveReport("monthly")} 
                className={`report-menu-btn ${activeReport === "monthly" ? "active" : ""}`}
              >
                <span className="material-icons-round" style={{ fontSize: "1.15rem", marginRight: "8px" }}>calendar_view_month</span>
                Monthly Output Report
              </button>
              <button 
                onClick={() => setActiveReport("quarterly")} 
                className={`report-menu-btn ${activeReport === "quarterly" ? "active" : ""}`}
              >
                <span className="material-icons-round" style={{ fontSize: "1.15rem", marginRight: "8px" }}>pie_chart</span>
                Quarterly Output Report
              </button>
              <button 
                onClick={() => setActiveReport("plan_nmonth")} 
                className={`report-menu-btn ${activeReport === "plan_nmonth" ? "active" : ""}`}
              >
                <span className="material-icons-round" style={{ fontSize: "1.15rem", marginRight: "8px" }}>trending_up</span>
                {planningPeriod}-Month Targets Report
              </button>
              <button 
                onClick={() => setActiveReport("unit_wise")} 
                className={`report-menu-btn ${activeReport === "unit_wise" ? "active" : ""}`}
              >
                <span className="material-icons-round" style={{ fontSize: "1.15rem", marginRight: "8px" }}>factory</span>
                Unit Output Summary
              </button>
            </aside>

            <div className="report-viewer-card">
              <div className="report-viewer-header">
                <h3 style={{textTransform: "capitalize", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap"}}>
                  <span>{activeReport === "plan_nmonth" ? `${planningPeriod}-Month Targets Report` : `${activeReport.replace("_", " ")} Report Table`}</span>
                  {activeReport === "plan_nmonth" && (
                    <span className="plan-start-chip">
                      <span className="material-icons-round" style={{ fontSize: "0.9rem" }}>flag</span>
                      Starts: {MONTH_NAMES[startMonth - 1]} {startYear}
                    </span>
                  )}
                </h3>
                
                <div className="export-actions">
                  <button onClick={exportCSV} className="btn-export btn-csv">
                    <span className="material-icons-round" style={{fontSize: "0.95rem"}}>description</span>CSV
                  </button>
                  <button onClick={exportExcel} className="btn-export btn-excel">
                    <span className="material-icons-round" style={{fontSize: "0.95rem"}}>table_chart</span>Excel
                  </button>
                  <button onClick={exportPDF} className="btn-export btn-pdf">
                    <span className="material-icons-round" style={{fontSize: "0.95rem"}}>picture_as_pdf</span>PDF
                  </button>
                </div>
              </div>

              <div className="report-table-container">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th style={{ width: "40px", textAlign: "center" }}>
                        <input 
                          type="checkbox" 
                          checked={selectedReportRows.length === reportData.rows.length && reportData.rows.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedReportRows(reportData.rows.map((_, idx) => idx));
                            } else {
                              setSelectedReportRows([]);
                            }
                          }}
                        />
                      </th>
                      {reportData.headers.map((h, i) => <th key={i}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.rows.length === 0 ? (
                      <tr>
                        <td colSpan={reportData.headers.length + 1} className="empty-state">No report rows available. Adjust filters.</td>
                      </tr>
                    ) : (
                      reportData.rows.map((row, rowIdx) => {
                        const isChecked = selectedReportRows.includes(rowIdx);
                        return (
                          <tr 
                            key={rowIdx} 
                            className={isChecked ? "selected-row" : ""}
                            style={{ background: isChecked ? "rgba(139, 92, 246, 0.08)" : "transparent" }}
                          >
                            <td style={{ textAlign: "center" }}>
                              <input 
                                type="checkbox" 
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedReportRows(prev => [...prev, rowIdx]);
                                  } else {
                                    setSelectedReportRows(prev => prev.filter(x => x !== rowIdx));
                                  }
                                }}
                              />
                            </td>
                            {Object.values(row).map((val, cellIdx) => {
                              if (Array.isArray(val)) {
                                return val.map((v, arrayIdx) => {
                                  const isEdited = typeof v === 'object' && v !== null && v.edited;
                                  const displayValue = typeof v === 'object' && v !== null 
                                    ? (v.edited ? `${v.val.toLocaleString()}*` : v.val.toLocaleString()) 
                                    : v.toLocaleString();
                                  return (
                                    <td 
                                      key={`${cellIdx}-${arrayIdx}`} 
                                      style={{
                                        textAlign: "center",
                                        background: isEdited ? "rgba(245, 158, 11, 0.12)" : "transparent",
                                        fontWeight: isEdited ? "700" : "400"
                                      }}
                                      title={isEdited ? "Manually Edited Target Override" : ""}
                                    >
                                      {displayValue}
                                    </td>
                                  );
                                });
                              }
                              const isNumeric = typeof val === 'number';
                              const formatted = isNumeric ? (activeReport === 'monthly' || activeReport === 'quarterly' || activeReport === 'unit_wise' ? (cellIdx >= 4 && cellIdx <= 5 ? "₹" + Math.round(val).toLocaleString() : val.toLocaleString()) : val.toLocaleString()) : val;
                              return (
                                <td key={cellIdx} style={{textAlign: isNumeric ? "center" : "left"}}>
                                  {formatted}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                    
                    {reportData.rows.length > 0 && (
                      <tr className="report-summary-row">
                        <td></td>
                        {reportData.summary.map((s, i) => (
                          <td key={i} style={{textAlign: i >= 3 ? "center" : "left"}}>{s}</td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

      </main>

      {/* INITIAL FULL SCREEN APPLICATION LOADER */}
      {showLoadingScreen && (
        <div className={`app-loading-screen ${!isAppLoading ? "fade-out" : ""}`}>
          <div className="app-loading-card">
            <div className="app-loading-badge-wrap">
              <div className="app-loading-ring"></div>
              <div className="app-loading-ring-outer"></div>
              <div className="app-loading-icon">ARB</div>
            </div>
            <div className="app-loading-title">ARB BEARINGS</div>
            <div className="app-loading-subtitle">Production Planning & Analytics Dashboard</div>
            
            <div className="app-loading-bar-container">
              <div className="app-loading-bar"></div>
            </div>

            <div className="app-loading-status-pill">
              <span className="app-loading-dot"></span>
              <span>{loadingStatus}</span>
            </div>
          </div>
        </div>
      )}

      {isUploading && (
        <div className="loading-overlay">
          <div className="loading-card">
            <div className="spinner"></div>
            <div className="loading-title">Ingesting Production Data</div>
            <div className="loading-subtitle">Parsing and validating spreadsheet records...</div>
            {uploadProgress && (
              <div className="progress-container">
                <div className="progress-bar-wrapper">
                  <div className="progress-bar" style={{ width: `${uploadProgress.percent}%` }}></div>
                </div>
                <div className="progress-metrics">
                  <span>{uploadProgress.text}</span>
                  <span>{uploadProgress.percent}%</span>
                </div>
                {uploadProgress.remaining && (
                  <div className="progress-remaining">{uploadProgress.remaining}</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {showDuplicateModal && (
        <div className="modal-overlay active">
          <div className="modal-box">
            <div className="modal-title" style={{ color: "var(--color-warning)", borderBottom: "1px solid var(--border-color)", paddingBottom: "10px", marginBottom: "15px" }}>
              <span className="material-icons-round" style={{ verticalAlign: "middle", marginRight: "6px" }}>warning</span>
              Duplicate Records Detected
            </div>
            <div className="modal-body" style={{ color: "var(--text-main)" }}>
              <p style={{ marginBottom: "12px" }}>
                The upload engine detected <strong>{duplicateCount} duplicate production records</strong> in your spreadsheet.
              </p>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "16px" }}>
                Duplicates share the same Unit, Year, Month, Party Name, and Bearing Catalog Number. Please select how you want to resolve these conflicts:
              </p>
              <div className="duplicate-options-list" style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.85rem" }}>
                <div style={{ padding: "10px", background: "rgba(139, 92, 246, 0.08)", border: "1px solid rgba(139, 92, 246, 0.2)", borderRadius: "6px" }}>
                  <strong style={{ color: "var(--color-primary)" }}>Merge / Append (Recommended):</strong> Adds the spreadsheet quantities and values to the existing entries.
                </div>
                <div style={{ padding: "10px", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "6px" }}>
                  <strong style={{ color: "var(--color-danger)" }}>Overwrite:</strong> Replaces the existing database entries entirely with the figures from your spreadsheet.
                </div>
                <div style={{ padding: "10px", background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "6px" }}>
                  <strong style={{ color: "var(--color-success)" }}>Skip Duplicates:</strong> Ignores the duplicates in your sheet and only uploads brand new records.
                </div>
              </div>
            </div>
            <div className="modal-actions" style={{ borderTop: "1px solid var(--border-color)", paddingTop: "15px", marginTop: "20px" }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => handleResolveDuplicates("cancel")}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-success" 
                onClick={() => handleResolveDuplicates("skip")}
              >
                Skip Duplicates
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={() => handleResolveDuplicates("merge")}
              >
                Merge / Append
              </button>
              <button 
                type="button" 
                className="btn btn-danger" 
                onClick={() => handleResolveDuplicates("overwrite")}
              >
                Overwrite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {showDeleteModal && (
        <div className="modal-overlay active">
          <div className="modal-box" style={{ maxWidth: "520px" }}>
            <div className="modal-title" style={{ color: "var(--color-danger)", borderBottom: "1px solid var(--border-color)", paddingBottom: "12px", marginBottom: "16px" }}>
              <span className="material-icons-round" style={{ color: "var(--color-danger)", fontSize: "1.3rem", verticalAlign: "middle", marginRight: "6px" }}>delete_forever</span>
              Confirm Records Deletion
            </div>
            <div className="modal-body" style={{ color: "var(--text-main)" }}>
              <div style={{
                background: "var(--color-danger-bg)",
                border: "1px solid rgba(220, 38, 38, 0.2)",
                borderRadius: "8px",
                padding: "12px 16px",
                marginBottom: "16px",
                fontSize: "0.85rem",
                lineHeight: "1.5"
              }}>
                <strong style={{ color: "var(--color-danger)", display: "block", marginBottom: "4px" }}>
                  ⚠️ Critical Warning: Irreversible Action
                </strong>
                This action will permanently remove all <strong>{records.length.toLocaleString()} historical production records</strong> from the MongoDB database. Dashboard analytics, monthly trends, and rolling forecast baselines will be cleared.
              </div>
              
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "10px" }}>
                To proceed with deletion, please type <strong style={{ color: "var(--color-danger)", fontFamily: "monospace", letterSpacing: "0.5px", background: "var(--color-danger-bg)", padding: "2px 6px", borderRadius: "4px" }}>DELETE RECORDS</strong> below:
              </p>

              <input
                type="text"
                className="filter-control"
                style={{
                  padding: "10px 14px",
                  fontSize: "0.92rem",
                  letterSpacing: "0.5px",
                  fontWeight: "600",
                  borderColor: deleteConfirmText.trim() === "DELETE RECORDS" ? "var(--color-success)" : deleteConfirmText.length > 0 ? "var(--color-danger)" : "var(--border-color)",
                  boxShadow: deleteConfirmText.trim() === "DELETE RECORDS" ? "0 0 10px rgba(5, 150, 105, 0.2)" : "none"
                }}
                placeholder='Type "DELETE RECORDS" to confirm...'
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                autoFocus
              />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", fontSize: "0.78rem" }}>
                <span style={{ color: deleteConfirmText.trim() === "DELETE RECORDS" ? "var(--color-success)" : "var(--text-muted)", fontWeight: "500" }}>
                  {deleteConfirmText.trim() === "DELETE RECORDS" ? "✓ Confirmation phrase matched" : 'Required phrase: DELETE RECORDS'}
                </span>
                <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                  Exact match required
                </span>
              </div>
            </div>

            <div className="modal-actions" style={{ borderTop: "1px solid var(--border-color)", paddingTop: "16px", marginTop: "20px" }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText("");
                }}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-danger" 
                onClick={handleDeleteAllRecords}
                disabled={deleteConfirmText.trim() !== "DELETE RECORDS" || isDeleting}
                style={{
                  opacity: deleteConfirmText.trim() === "DELETE RECORDS" ? 1 : 0.45,
                  cursor: deleteConfirmText.trim() === "DELETE RECORDS" ? "pointer" : "not-allowed",
                  boxShadow: deleteConfirmText.trim() === "DELETE RECORDS" ? "0 0 16px rgba(220, 38, 38, 0.35)" : "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <span className="material-icons-round" style={{ fontSize: "1rem" }}>
                  {isDeleting ? "hourglass_empty" : "delete_forever"}
                </span>
                {isDeleting ? "Wiping Records..." : "Permanently Delete Records"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
