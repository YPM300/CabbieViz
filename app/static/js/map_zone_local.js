<<<<<<< HEAD
import { select, json, geoPath, geoMercator, scaleLinear, scaleLog, scalePow,
  scaleThreshold, interpolateRgb, zoom, range, pointer }
  from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { timeParse, timeFormat } 
  from "https://cdn.jsdelivr.net/npm/d3-time-format@3/+esm";

// ——— GLOBAL CONSTANTS ———————————————————————————————————————————————
const API_BASE    = "http://localhost:9001";
const parseDate   = timeParse("%Y-%m-%d");
const formatDate  = timeFormat("%Y-%m-%d");
const tooltip     = select("#tooltip");
const grayFill    = "#808080";

// Color schemes by borough
const colorCfg = {
  Manhattan: ["#ebf4fc","#125a9e"],
  Brooklyn:  ["#fff2e6","#e65c00"],
  Queens:    ["#e6fbe6","#1d8c1d"],
  Bronx:     ["#fce6e6","#b21818"],
  default:   ["#f3e6fc","#6b3e9b"]
};

// ——— STATE —————————————————————————————————————————————————————————————
let pickupCache      = {};
let odCache          = {};
let reverseODCache = {};
let geoDataGlobal;
let tripCounts       = {};
let sumFareByZone    = {};
let avgFareByZone    = {};
let boroughScales    = {};
let boroughFareScales= {};
let maxTripsByBorough= {};
let maxFareByBorough = {};
let selectedLocation = null;
let currentMetric    = "count"; // ← either "count" or "fare"
let basePaths;
let dropoffCache     = {};
let currentDirection = "pickup"; // or "dropoff"
let currentScale     = "count";  // or "fare"
let currentMode = "pickup";  // "pickup" | "dropoff" | "avgFare"
let useGlobalScale = false;
let useLogScale    = false;
const BINS = 9;
let globalMinCount = 1,
    globalMaxCount = 1,
    globalMinFare  = 0.01,
    globalMaxFare  = 1;
const GLOBAL_COUNT_COLORS = [
  "#FFF5F0","#FEE0D2","#FCBBA1",
  "#FC9272","#FB6A4A","#EF3B2C",
  "#CB181D","#A50F15","#67000D"
];
let currentMinTripsByBorough = {};
let currentMinFareByBorough  = {};

const GLOBAL_FARE_COLORS  = GLOBAL_COUNT_COLORS;

// ─── pick the right loader based on the current mode ──────────────────────
function loaderForMode() {
  return currentMode === "dropoff" ? loadDropoff : loadPickup;
}

// ─── are we coloring by fare (rather than by count)? ─────────────────────
function isFareMode() {
  return currentMode === "avgFare";
}

// ─── compute each zone’s fill color ────────────────────────────────────
function getBaseFill(d) {
  const id   = d.properties.LocationID;
  const cnt  = tripCounts[id]    || 0;
  const fare = avgFareByZone[id] || 0;

  if (!useGlobalScale && d.properties.zone.includes("Airport")) {
    return "#1fb4b4";
  }

  if (isFareMode()) {
    const scale = boroughFareScales[d.properties.borough];
    return scale
      ? scale(fare)
      : grayFill;
  } else {
    const scale = boroughScales[d.properties.borough];
    return scale
      ? scale(cnt)
      : grayFill;
  }
}


// ─── recolor all paths and redraw the legend ─────────────────────────────
function recolorMap() {
  gBase.selectAll("path").attr("fill", getBaseFill);
  updateLegend(isFareMode() ? "fare" : "pickup");
}
function clearFlows() {
  gFlows.selectAll("*").remove();
}
function formatValue(v) {
  if (v >= 1e6) return (v/1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v/1e3).toFixed(1) + "K";
  return Math.round(v, 1).toString();
}

// ——— SVG SETUP —————————————————————————————————————————————————————————————
const svg     = select("#map");
svg.append("defs")
  .append("marker")
    .attr("id", "arrowhead")
    .attr("viewBox", "0 0 10 10")
    .attr("refX", 10)               // move tip to end of stroke
    .attr("refY", 5)
    .attr("markerUnits", "strokeWidth")
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
  .append("path")
    .attr("d", "M0,0 L10,5 L0,10 Z")
    .attr("fill", "steelblue");
const gBase   = svg.append("g").attr("class","base-map");  // map shapes
// when you create it:
const gFlows = svg.append("g")
  .attr("class","flows")
  .style("pointer-events","none");   // ← disable events for all its children
let flowsVisible = true;
const gLabels = svg.append("g").attr("class","labels");    // text labels
const legend = select("#legend");
const { width, height } = svg.node().getBoundingClientRect();
const projection = geoMercator()
  .scale(64000)
  .center([-74,40.7])
  .translate([width/2, height/2]);
const path = geoPath().projection(projection);
let currentDistribution = null;

// ——— API LOADERS ————————————————————————————————————————————————————————
async function loadPickup(dayKey) {
  if (pickupCache[dayKey]) return pickupCache[dayKey];
  const res = await fetch(`${API_BASE}/aggregates/pickup/${dayKey}`);
  if (res.status === 404) {
    // no data for that date → cache & return an empty list
    pickupCache[dayKey] = [];
    return [];
  }

  if (!res.ok) throw new Error(`Pickup API error ${res.status}`);
  return pickupCache[dayKey] = await res.json();
}

async function loadDropoff(dayKey) {
  if (dropoffCache[dayKey]) return dropoffCache[dayKey];
  const res = await fetch(`${API_BASE}/aggregates/dropoff/${dayKey}`);
  if (res.status === 404) {
    // no data for that date → cache & return an empty list
    pickupCache[dayKey] = [];
    return [];
  }
  if (!res.ok) throw new Error(`Dropoff API error ${res.status}`);
  return (dropoffCache[dayKey] = await res.json());
}

async function loadOD(dayKey, zone) {
  const key = `${dayKey}|${zone}`;
  if (odCache[key]) return odCache[key];
  const res = await fetch(`${API_BASE}/aggregates/od/${dayKey}/${zone}`);
  if (res.status === 404) {
    // no data for that date → cache & return an empty list
    pickupCache[dayKey] = [];
    return [];
  }
  if (!res.ok) throw new Error(`OD API error ${res.status}`);
  return odCache[key] = await res.json();
}

async function loadReverseOD(dayKey, zone) {
  const key = `${dayKey}|reverse|${zone}`;
  if (reverseODCache[key]) return reverseODCache[key];
  const res = await fetch(
    `${API_BASE}/aggregates/od_reverse/${dayKey}/${zone}`
  );
  if (res.status === 404) {
    reverseODCache[key] = [];
    return [];
  }
  if (!res.ok) throw new Error(`Reverse OD API error ${res.status}`);
  return reverseODCache[key] = await res.json();
}

// ——— LOADING OVERLAY ————————————————————————————————————————————————————
function showLoading() { d3.select("#loading-overlay").style("display","flex"); }
function hideLoading() { d3.select("#loading-overlay").style("display","none"); }



// ——— LEGEND RENDERER —————————————————————————————————————————————————————
function updateLegend(mode) {
  legend.selectAll("*").remove();

  const W    = legend.node().getBoundingClientRect().width;
  const bins = BINS;
  const barH = 24;
  const padL = 120;  // margin for text
  const padT = 20;   // top margin
  const gapY = 45;   // row spacing
  const binW = (W - padL - 20) / bins;

  const isFare = mode === "fare";

  // helpers to compute the same splits
  function linearSplits(min, max) {
    return d3.range(0, bins + 1).map(i => min + (max - min) * (i / bins));
  }
  function logSplits(min, max) {
    const m = Math.max(min, 1e-6);
    return d3.range(0, bins + 1).map(i => m * Math.pow(max / m, i / bins));
  }

  // single‐row drawer
  function drawRow(label, scaleFn, minV, maxV, y0) {
    // compute split boundaries
    const splits = useLogScale
      ? logSplits(minV, maxV)
      : linearSplits(minV, maxV);

    // left label
    legend.append("text")
      .attr("x", 5)
      .attr("y", y0 + barH/2)
      .attr("alignment-baseline", "middle")
      .attr("font-size", "18px")
      .text(label);

    // colored bins
    for (let i = 0; i < bins; i++) {
      // pick a sample value in each bin for fill
      const sampleVal = splits[i] + (splits[i+1] - splits[i]) / 2;
      legend.append("rect")
        .attr("x", padL + i * binW)
        .attr("y", y0)
        .attr("width", binW)
        .attr("height", barH)
        .style("fill", scaleFn(sampleVal));
    }

    // 10 boundary labels
    splits.forEach((v,i) => {
      let txt = isFare
        ? `$${formatValue(v)}`
        : formatValue(v);
      legend.append("text")
        .attr("x", padL + i * binW)
        .attr("y", y0 + barH + 16)
        .attr("text-anchor", i === 0
          ? "start"
          : (i === bins ? "end" : "middle"))
        .attr("font-size", (i === 0 || i === bins) ? "11px" : "9px")
        .text(txt);
    });
  }

  const boroughs = Object.keys(boroughScales)
    .filter(b => b !== "EWR")
    .sort((a,b) => (maxTripsByBorough[b]||0) - (maxTripsByBorough[a]||0));

  if (useGlobalScale) {
    // one global row
    const sample = isFare
      ? boroughFareScales[boroughs[0]]
      : boroughScales[   boroughs[0]];
    const minV = isFare ? globalMinFare : globalMinCount;
    const maxV = isFare ? globalMaxFare : globalMaxCount;
    const lbl  = isFare ? "Avg Fare (Global)" : "Trips (Global)";
    drawRow(lbl, sample, minV, maxV, padT);

  } else {
    // one row per borough
    boroughs.forEach((b,i) => {
      const y0    = padT + i * gapY;
      const scale = isFare
        ? boroughFareScales[b]
        : boroughScales[b];
      const minV  = isFare
        ? (currentMinFareByBorough[b] || 0)
        : (currentMinTripsByBorough[b] || 0);
      const maxV  = isFare
        ? maxFareByBorough[b]
        : maxTripsByBorough[b];
      drawRow(b, scale, minV, maxV, y0);
    });
  }
}


// ——— AGGREGATE A RANGE ————————————————————————————————————————————————————
async function updateDataForRange(start, end) {
  showLoading();

  // 1) build the list of YYYY-MM-DD strings
  const days = [];
  for (let m = moment(start); m.isSameOrBefore(end); m.add(1, "days")) {
    days.push(m.format("YYYY-MM-DD"));
  }

  // 2) fetch pickup or dropoff aggregates
  const loader = currentMode === "dropoff" ? loadDropoff : loadPickup;
  const batches = await Promise.all(
    days.map(d => loader(d).catch(() => []))
  );

  // 3) aggregate counts & weighted sums
  tripCounts = {};
  sumFareByZone = {};
  batches.flat().forEach(r => {
    const id = +r.zone_id,
          n  = r.num_trips,
          f  = r.avg_fare || 0;
    tripCounts[id]    = (tripCounts[id]    || 0) + n;
    sumFareByZone[id] = (sumFareByZone[id] || 0) + f * n;
  });

  // 4) compute average fares
  avgFareByZone = {};
  Object.entries(sumFareByZone).forEach(([id, tot]) => {
    avgFareByZone[id] = tot / (tripCounts[id] || 1);
  });

  // 5) per-borough min/max (only non-zero) & overall max
  const minTripsByBorough = {}, minFareByBorough = {};
  maxTripsByBorough = {}; maxFareByBorough = {};

  geoDataGlobal.features.forEach(f => {
    if (f.properties.zone.includes("Airport")) return;
    const b  = f.properties.borough,
          id = f.properties.LocationID,
          ct = tripCounts[id]    || 0,
          av = avgFareByZone[id] || 0;

    // maxima
    maxTripsByBorough[b] = Math.max(maxTripsByBorough[b] || 0, ct);
    maxFareByBorough[b]  = Math.max(maxFareByBorough[b]  || 0, av);

    // minima only for >0
    if (ct > 0) minTripsByBorough[b] = Math.min(minTripsByBorough[b] || Infinity, ct);
    if (av > 0) minFareByBorough[b]  = Math.min(minFareByBorough[b]  || Infinity, av);
  });

  // stash minima for the legend
  currentMinTripsByBorough = { ...minTripsByBorough };
  currentMinFareByBorough  = { ...minFareByBorough  };

  // 6) global min/max across all zones
  const allCounts = Object.values(tripCounts).filter(v => v > 0),
        allFares  = Object.values(avgFareByZone).filter(v => v > 0);
  globalMinCount = allCounts.length ? d3.min(allCounts) : 1;
  globalMaxCount = allCounts.length ? d3.max(allCounts) : 1;
  globalMinFare  = allFares.length  ? d3.min(allFares)  : 0.01;
  globalMaxFare  = allFares.length  ? d3.max(allFares)  : 1;

  // 7) rebuild boroughScales & boroughFareScales (threshold scales)
  const boroughKeys = Object.keys(boroughScales);

  // helpers to get splits
  function linearSplits(min, max) {
    return d3.range(0, BINS + 1).map(i => min + (max - min) * (i / BINS));
  }
  function logSplits(min, max) {
    const m = Math.max(min, 1e-6);
    return d3.range(0, BINS + 1).map(i => m * Math.pow(max / m, i / BINS));
  }

  // precompute local color ramps for each borough
  const LOCAL_COUNT_RAMPS = {}, LOCAL_FARE_RAMPS = {};
  boroughKeys.forEach(b => {
    const [c0, c1] = colorCfg[b] || colorCfg.default;
    const interp = d3.interpolateRgb(c0, c1);
    LOCAL_COUNT_RAMPS[b] = d3.range(BINS).map(i => interp(i / (BINS - 1)));
    LOCAL_FARE_RAMPS[b]  = d3.range(BINS).map(i => interp(i / (BINS - 1)));
  });

  // rebuild count scales
  boroughKeys.forEach(b => {
    let lo = useGlobalScale ? globalMinCount : (minTripsByBorough[b] || 0);
    let hi = useGlobalScale ? globalMaxCount : (maxTripsByBorough[b] || 1);
    if (useLogScale) lo = Math.max(lo, 1e-6);

    const splits     = useLogScale ? logSplits(lo, hi) : linearSplits(lo, hi);
    const thresholds = splits.slice(1, BINS);
    const colors     = useGlobalScale
      ? GLOBAL_COUNT_COLORS
      : (LOCAL_COUNT_RAMPS[b] || LOCAL_COUNT_RAMPS.default);

    boroughScales[b] = d3.scaleThreshold()
      .domain(thresholds)
      .range(colors);
  });

  // rebuild fare scales
  boroughKeys.forEach(b => {
    let lo = useGlobalScale ? globalMinFare : (minFareByBorough[b] || 0);
    let hi = useGlobalScale ? globalMaxFare : (maxFareByBorough[b] || 1);
    if (useLogScale) lo = Math.max(lo, 1e-6);

    const splits     = useLogScale ? logSplits(lo, hi) : linearSplits(lo, hi);
    const thresholds = splits.slice(1, BINS);
    const colors     = useGlobalScale
      ? GLOBAL_FARE_COLORS
      : (LOCAL_FARE_RAMPS[b] || LOCAL_FARE_RAMPS.default);

    boroughFareScales[b] = d3.scaleThreshold()
      .domain(thresholds)
      .range(colors);
  });

  // 8) repaint map & hide spinner
  recolorMap();
  hideLoading();
}
async function updateODForRange(start, end, originZone) {
  showLoading();

  const days = [];
  for (let m = moment(start); m.isSameOrBefore(end); m.add(1, "days")) {
    days.push(m.format("YYYY-MM-DD"));
  }

  const batches = await Promise.all(
    days.map(d => loadOD(d, originZone).catch(() => []))
  );

  hideLoading();
  drawFlows(originZone, batches.flat());
  return batches.flat();   // ← return data so click‐handler can reuse it
}

// ─── recolor map by distribution from one origin ────────────────────────
function recolorDistribution(destCounts) {
  // 1) max trips from this origin
  const counts = Object.values(destCounts);
  const maxCount = counts.length ? Math.max(...counts) : 1;

  // 2) build a linear 0→maxCount split into BINS buckets
  const splits = d3.range(0, BINS + 1).map(i => (maxCount * i) / BINS);
  const thresholds = splits.slice(1, BINS);  // drop first and last
  const scale = d3.scaleThreshold()
    .domain(thresholds)
    .range(GLOBAL_COUNT_COLORS);

  // 3) apply to every zone path
  gBase.selectAll("path").attr("fill", d => {
    const cnt = destCounts[d.properties.LocationID] || 0;
    return cnt > 0
      ? scale(cnt)
      : grayFill;   // keep grey for zero trips
  });
}

function drawFlows(originZone, destCounts) {
  clearFlows();

  const zoneId = +originZone;
  // find origin feature and centroid
  const originFeat = geoDataGlobal.features
    .find(f => f.properties.LocationID === zoneId);
  if (!originFeat) return;
  const [x0, y0] = path.centroid(originFeat);
  
  // build stroke‐width scale: final width 1→8px
  const counts   = Object.values(destCounts);
  const maxCount = counts.length ? Math.max(...counts) : 1;
  const strokeScale = scalePow()
    .exponent(2)                 // square the input
    .domain([0, maxCount])       // 0 → maxCount
    .range([0.4, 8])             // 0.1px at the base → 8px max
    .clamp(true);                // optional: never exceed 8 or go below .1
  const opacityScale = scalePow()
    .exponent(0.5)
    .domain([0, maxCount])
    .range([0.1, 0.6])
    .clamp(true);

  // draw one tapered polygon per destination
  Object.entries(destCounts).forEach(([destId, count]) => {
    const destZone = +destId;
    if (destZone === zoneId) return;   // skip self

    const destFeat = geoDataGlobal.features
      .find(f => f.properties.LocationID === destZone);
    if (!destFeat) return;
    const [x1, y1] = path.centroid(destFeat);

    // control‐point for Bézier curve
    const dx = x1 - x0, dy = y1 - y0;
    const mx = x0 + dx/2, my = y0 + dy/2;
    const dist   = Math.hypot(dx, dy) || 1;
    const offset = dist * 0.1;
    const cx = mx + (dy/dist)*offset;
    const cy = my - (dx/dist)*offset;

    // sample the curve, compute normals and widths
    const steps    = 20;
    const leftPts  = [];
    const rightPts = [];
    const fullW    = strokeScale(count);
    const baseW    = 0.1;
    for (let i = 0; i <= steps; i++) {
      const u  = i/steps;
      const om = 1 - u;
      // point on curve
      const bx = om*om*x0 + 2*om*u*cx + u*u*x1;
      const by = om*om*y0 + 2*om*u*cy + u*u*y1;
      // tangent
      const tx = 2*om*(cx - x0) + 2*u*(x1 - cx);
      const ty = 2*om*(cy - y0) + 2*u*(y1 - cy);
      const len = Math.hypot(tx, ty) || 1;
      const nx  = -ty/len, ny = tx/len;
      // linear taper from baseW→fullW
      const w  = baseW + (fullW - baseW)*u;
      const h2 = w/2;
      leftPts .push([bx + nx*h2, by + ny*h2]);
      rightPts.push([bx - nx*h2, by - ny*h2]);
    }

    // build closed-path string
    const pts = leftPts.concat(rightPts.reverse());
    const d   = pts.map((p,i) =>
      (i===0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1)
    ).join(" ") + " Z";

    gFlows.append("path")
      .attr("d", `M${x0},${y0} Q${cx},${cy} ${x1},${y1}`)
      .attr("stroke", "steelblue")
      .attr("fill", "none")
      .attr("marker-end", "url(#arrowhead)")
      // choose your width:
      .attr("stroke-width", count === 0 ? 0.1 : strokeScale(count))
      // scale opacity by count:
      .attr("opacity", count === 0 ? 0.1 : opacityScale(count))
      .style("pointer-events", "none");
    });
}







// ——— INITIAL DRAW & HOOKUPS —————————————————————————————————————————————————
(async ()=>{
  geoDataGlobal = await json("/static/js/data/taxi_zones.geojson");
  const boroughs = Array.from(new Set(geoDataGlobal.features.map(f => f.properties.borough)));

  // Initialize both count‐ and fare‐scales for each borough
  boroughs.forEach(b => {
    const cols = colorCfg[b] || colorCfg.default;
    boroughScales[b]     = scaleLinear().domain([0,1]).range(cols);
    boroughFareScales[b] = scaleLinear().domain([0,1]).range(cols);
  });
  // ─── hook up the DateRangePicker ─────────────────────────────
  $('#daterange').daterangepicker({
    showDropdowns: true,
    startDate: moment('2024-01-01'),
    endDate:   moment('2024-01-31'),
    minDate:   '2024-01-01',
    maxDate:   '2024-12-31',
    locale:    { format: 'MM/DD/YYYY' }
  }, async (start, end) => {
    // update the input’s visible text
    $('#daterange').val(
      `${start.format('MM/DD/YYYY')} – ${end.format('MM/DD/YYYY')}`
    );
    // re-run the aggregation over the newly-picked range
    await updateDataForRange(start, end);
  });

  // initialize boroughScales
  new Set(geoDataGlobal.features.map(f => f.properties.borough))
  .forEach(b => {
    const cols = colorCfg[b] || colorCfg.default;    // default if missing
    boroughScales[b] = scaleLinear()
      .domain([0, 1])
      .range(cols);
  });

  // draw zones once
  basePaths = gBase.selectAll("path")
    .data(geoDataGlobal.features)
    .join("path")
      .attr("d", path)
      .attr("stroke","#000")
      .attr("stroke-width",0.5)
      .on("click",(ev,d)=>{
        selectedLocation = selectedLocation===d.properties.LocationID
                          ? null
                          : d.properties.LocationID;
      })
      .on("mouseover",(ev,d)=>{
        const id = d.properties.LocationID;
        let html = `<strong>${d.properties.zone}</strong><br/>`;

          if (currentDistribution) {
            const cnt = currentDistribution[id] || 0;
            // in dropoff mode these are pickups, otherwise dropoffs
            const label = currentMode === "dropoff" ? "Pickups" : "Dropoffs";
            html += `${label}: ${cnt.toLocaleString()}`;
          } else {
          // normal tooltip
          const cnt  = tripCounts[id]    || 0;
          const fare = avgFareByZone[id] || 0;
          if (currentMode === "dropoff") {
            html += `Drop-offs: ${cnt.toLocaleString()}<br/>`;
          } else {
            html += `Pickups: ${cnt.toLocaleString()}<br/>`;
          }
          if (currentMode === "avgFare") {
            html += `Avg Fare: $${fare.toFixed(2)}`;
          }
        }

        tooltip
          .style("opacity", 1)
          .html(html);
      })
      .on("mousemove", function(event, d) {
        const [x, y] = pointer(event, svg.node());
        tooltip
          .style("left",  (x + 12) + "px")
          .style("top",   (y + 12) + "px");
      })
      .on("mouseout",()=>{
        tooltip.style("opacity",0);
      })
      .on("click", async (ev, d) => {
        showLoading();
      
        const zone = +d.properties.LocationID;
      
        if (selectedLocation === zone) {
          // deselect
          selectedLocation = null;
          currentDistribution = null;
          clearFlows();
          recolorMap();
        } else {
          selectedLocation = zone;
      
          // build date list
          const dr = $('#daterange').data('daterangepicker');
          const days = [];
          for (let m = moment(dr.startDate); m.isSameOrBefore(dr.endDate); m.add(1, "days")) {
            days.push(m.format("YYYY-MM-DD"));
          }
      
          // pick the right loader for OD based on mode
          const odLoader = currentMode === "dropoff"
            ? loadReverseOD  // your new reverse endpoint
            : loadOD;        // original OD
      
          // fetch and flatten
          const batches = await Promise.all(
            days.map(day => odLoader(day, zone).catch(() => []))
          );
          // console.log(batches)
          // sum up into destCounts/originCounts
          const destCounts = {};
          batches.flat().forEach(r => {
            destCounts[r.zone_id] = (destCounts[r.zone_id] || 0) + r.num_trips;
          });
          currentDistribution = destCounts;


          clearFlows();

          drawFlows(zone, destCounts);
          recolorDistribution(destCounts);
        }
      
        hideLoading();
      });
      
  
  


  // add labels
  gLabels.selectAll("text")
    .data(geoDataGlobal.features)
    .join("text")
      .attr("x", d=> path.centroid(d)[0])
      .attr("y", d=> path.centroid(d)[1])
      .attr("font-size","4px")
      .attr("text-anchor","middle")
      .attr("pointer-events","none")
      .text(d=> d.properties.LocationID);

  // zoom/pan
  svg.call( zoom()
    .scaleExtent([1,8])
    .on("zoom", ev => {
      gBase .attr("transform", ev.transform);
      gFlows.attr("transform", ev.transform);
      gLabels.attr("transform", ev.transform);
    })
  );

  select("#mode-controls").selectAll("button")
  .on("click", function() {
    // highlight
    select("#mode-controls").selectAll("button").classed("active", false);
    select(this).classed("active", true);

    // change mode
    currentMode = this.dataset.mode;  // pickup | dropoff | avgFare

    const dr = $('#daterange').data('daterangepicker');
    if (currentMode === "avgFare") {
      // we already have sumFareByZone + tripCounts loaded
      recolorMap();
    } else {
      updateDataForRange(dr.startDate, dr.endDate);
    }
  });

// ——— SCALE SCOPE BUTTONS ———————————————————————
select("#scale-controls").selectAll("button")
  .on("click", function() {
    select("#scale-controls").selectAll("button").classed("active", false);
    select(this).classed("active", true);

    useGlobalScale = this.dataset.scale === "global";

    // re-aggregate to rebuild domains
    const dr = $('#daterange').data('daterangepicker');
    updateDataForRange(dr.startDate, dr.endDate);
  });
  select("#toggle-flows").on("click", () => {
    flowsVisible = !flowsVisible;
    gFlows.style("display", flowsVisible ? null : "none");
    select("#toggle-flows")
      .text(flowsVisible ? "Hide Flows" : "Show Flows");
  });
// ——— SCALE TRANSFORM BUTTONS —————————————————————
select("#transform-controls").selectAll("button")
  .on("click", function() {
    select("#transform-controls").selectAll("button").classed("active", false);
    select(this).classed("active", true);

    useLogScale = this.dataset.transform === "log";

    // re-aggregate to rebuild scales as log or linear
    const dr = $('#daterange').data('daterangepicker');
    updateDataForRange(dr.startDate, dr.endDate);
  });

  // initial load
  const dr = $('#daterange').data('daterangepicker');
  $('#daterange').val(`${dr.startDate.format("MM/DD/YYYY")} – ${dr.endDate.format("MM/DD/YYYY")}`);
  await updateDataForRange(dr.startDate, dr.endDate);

  select("#toggle-direction").on("click", function() {
    currentDirection = currentDirection === "pickup" ? "dropoff" : "pickup";
    this.textContent = currentDirection === "pickup" ? "Pickups" : "Drop-offs";
    // re-fetch the currently selected range & redraw
    const dr = $('#daterange').data('daterangepicker');
    updateDataForRange(dr.startDate, dr.endDate);
  });
  
  // toggle scale button
  select("#toggle-scale").on("click", function() {
    currentScale = currentScale === "count" ? "fare" : "count";
    this.textContent = currentScale === "count" ? "Count" : "Avg Fare";
    // just recolor the already-loaded data
    recolorMap();
  });
select("#toggle-flows").on("click", () => {
  flowsVisible = !flowsVisible;
  gFlows.style("display", flowsVisible ? null : "none");
  select("#toggle-flows")
    .text(flowsVisible ? "Hide Flows" : "Show Flows");
});
})();
=======
import { select, json, geoPath, geoMercator, scaleLinear, scaleLog, scalePow,
  scaleThreshold, interpolateRgb, zoom, range, pointer }
  from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { timeParse, timeFormat } 
  from "https://cdn.jsdelivr.net/npm/d3-time-format@3/+esm";

// ——— GLOBAL CONSTANTS ———————————————————————————————————————————————
const API_BASE    = "http://localhost:9001";
const parseDate   = timeParse("%Y-%m-%d");
const formatDate  = timeFormat("%Y-%m-%d");
const tooltip     = select("#tooltip");
const grayFill    = "#808080";

// Color schemes by borough
const colorCfg = {
  Manhattan: ["#ebf4fc","#125a9e"],
  Brooklyn:  ["#fff2e6","#e65c00"],
  Queens:    ["#e6fbe6","#1d8c1d"],
  Bronx:     ["#fce6e6","#b21818"],
  default:   ["#f3e6fc","#6b3e9b"]
};

// ——— STATE —————————————————————————————————————————————————————————————
let pickupCache      = {};
let odCache          = {};
let reverseODCache = {};
let geoDataGlobal;
let tripCounts       = {};
let sumFareByZone    = {};
let avgFareByZone    = {};
let boroughScales    = {};
let boroughFareScales= {};
let maxTripsByBorough= {};
let maxFareByBorough = {};
let selectedLocation = null;
let currentMetric    = "count"; // ← either "count" or "fare"
let basePaths;
let dropoffCache     = {};
let currentDirection = "pickup"; // or "dropoff"
let currentScale     = "count";  // or "fare"
let currentMode = "pickup";  // "pickup" | "dropoff" | "avgFare"
let useGlobalScale = false;
let useLogScale    = false;
const BINS = 9;
let globalMinCount = 1,
    globalMaxCount = 1,
    globalMinFare  = 0.01,
    globalMaxFare  = 1;
const GLOBAL_COUNT_COLORS = [
  "#FFF5F0","#FEE0D2","#FCBBA1",
  "#FC9272","#FB6A4A","#EF3B2C",
  "#CB181D","#A50F15","#67000D"
];
let currentMinTripsByBorough = {};
let currentMinFareByBorough  = {};

const GLOBAL_FARE_COLORS  = GLOBAL_COUNT_COLORS;

// ─── pick the right loader based on the current mode ──────────────────────
function loaderForMode() {
  return currentMode === "dropoff" ? loadDropoff : loadPickup;
}

// ─── are we coloring by fare (rather than by count)? ─────────────────────
function isFareMode() {
  return currentMode === "avgFare";
}

// ─── compute each zone’s fill color ────────────────────────────────────
function getBaseFill(d) {
  const id   = d.properties.LocationID;
  const cnt  = tripCounts[id]    || 0;
  const fare = avgFareByZone[id] || 0;

  if (!useGlobalScale && d.properties.zone.includes("Airport")) {
    return "#1fb4b4";
  }

  if (isFareMode()) {
    const scale = boroughFareScales[d.properties.borough];
    return scale
      ? scale(fare)
      : grayFill;
  } else {
    const scale = boroughScales[d.properties.borough];
    return scale
      ? scale(cnt)
      : grayFill;
  }
}


// ─── recolor all paths and redraw the legend ─────────────────────────────
function recolorMap() {
  gBase.selectAll("path").attr("fill", getBaseFill);
  updateLegend(isFareMode() ? "fare" : "pickup");
}
function clearFlows() {
  gFlows.selectAll("*").remove();
}
function formatValue(v) {
  if (v >= 1e6) return (v/1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v/1e3).toFixed(1) + "K";
  return Math.round(v, 1).toString();
}

// ——— SVG SETUP —————————————————————————————————————————————————————————————
const svg     = select("#map");
svg.append("defs")
  .append("marker")
    .attr("id", "arrowhead")
    .attr("viewBox", "0 0 10 10")
    .attr("refX", 10)               // move tip to end of stroke
    .attr("refY", 5)
    .attr("markerUnits", "strokeWidth")
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
  .append("path")
    .attr("d", "M0,0 L10,5 L0,10 Z")
    .attr("fill", "steelblue");
const gBase   = svg.append("g").attr("class","base-map");  // map shapes
// when you create it:
const gFlows = svg.append("g")
  .attr("class","flows")
  .style("pointer-events","none");   // ← disable events for all its children
let flowsVisible = true;
const gLabels = svg.append("g").attr("class","labels");    // text labels
const legend = select("#legend");
const { width, height } = svg.node().getBoundingClientRect();
const projection = geoMercator()
  .scale(64000)
  .center([-74,40.7])
  .translate([width/2, height/2]);
const path = geoPath().projection(projection);
let currentDistribution = null;

// ——— API LOADERS ————————————————————————————————————————————————————————
async function loadPickup(dayKey) {
  if (pickupCache[dayKey]) return pickupCache[dayKey];
  const res = await fetch(`${API_BASE}/aggregates/pickup/${dayKey}`);
  if (res.status === 404) {
    // no data for that date → cache & return an empty list
    pickupCache[dayKey] = [];
    return [];
  }

  if (!res.ok) throw new Error(`Pickup API error ${res.status}`);
  return pickupCache[dayKey] = await res.json();
}

async function loadDropoff(dayKey) {
  if (dropoffCache[dayKey]) return dropoffCache[dayKey];
  const res = await fetch(`${API_BASE}/aggregates/dropoff/${dayKey}`);
  if (res.status === 404) {
    // no data for that date → cache & return an empty list
    pickupCache[dayKey] = [];
    return [];
  }
  if (!res.ok) throw new Error(`Dropoff API error ${res.status}`);
  return (dropoffCache[dayKey] = await res.json());
}

async function loadOD(dayKey, zone) {
  const key = `${dayKey}|${zone}`;
  if (odCache[key]) return odCache[key];
  const res = await fetch(`${API_BASE}/aggregates/od/${dayKey}/${zone}`);
  if (res.status === 404) {
    // no data for that date → cache & return an empty list
    pickupCache[dayKey] = [];
    return [];
  }
  if (!res.ok) throw new Error(`OD API error ${res.status}`);
  return odCache[key] = await res.json();
}

async function loadReverseOD(dayKey, zone) {
  const key = `${dayKey}|reverse|${zone}`;
  if (reverseODCache[key]) return reverseODCache[key];
  const res = await fetch(
    `${API_BASE}/aggregates/od_reverse/${dayKey}/${zone}`
  );
  if (res.status === 404) {
    reverseODCache[key] = [];
    return [];
  }
  if (!res.ok) throw new Error(`Reverse OD API error ${res.status}`);
  return reverseODCache[key] = await res.json();
}

// ——— LOADING OVERLAY ————————————————————————————————————————————————————
function showLoading() { d3.select("#loading-overlay").style("display","flex"); }
function hideLoading() { d3.select("#loading-overlay").style("display","none"); }



// ——— LEGEND RENDERER —————————————————————————————————————————————————————
function updateLegend(mode) {
  legend.selectAll("*").remove();

  const W    = legend.node().getBoundingClientRect().width;
  const bins = BINS;
  const barH = 24;
  const padL = 120;  // margin for text
  const padT = 20;   // top margin
  const gapY = 45;   // row spacing
  const binW = (W - padL - 20) / bins;

  const isFare = mode === "fare";

  // helpers to compute the same splits
  function linearSplits(min, max) {
    return d3.range(0, bins + 1).map(i => min + (max - min) * (i / bins));
  }
  function logSplits(min, max) {
    const m = Math.max(min, 1e-6);
    return d3.range(0, bins + 1).map(i => m * Math.pow(max / m, i / bins));
  }

  // single‐row drawer
  function drawRow(label, scaleFn, minV, maxV, y0) {
    // compute split boundaries
    const splits = useLogScale
      ? logSplits(minV, maxV)
      : linearSplits(minV, maxV);

    // left label
    legend.append("text")
      .attr("x", 5)
      .attr("y", y0 + barH/2)
      .attr("alignment-baseline", "middle")
      .attr("font-size", "18px")
      .text(label);

    // colored bins
    for (let i = 0; i < bins; i++) {
      // pick a sample value in each bin for fill
      const sampleVal = splits[i] + (splits[i+1] - splits[i]) / 2;
      legend.append("rect")
        .attr("x", padL + i * binW)
        .attr("y", y0)
        .attr("width", binW)
        .attr("height", barH)
        .style("fill", scaleFn(sampleVal));
    }

    // 10 boundary labels
    splits.forEach((v,i) => {
      let txt = isFare
        ? `$${formatValue(v)}`
        : formatValue(v);
      legend.append("text")
        .attr("x", padL + i * binW)
        .attr("y", y0 + barH + 16)
        .attr("text-anchor", i === 0
          ? "start"
          : (i === bins ? "end" : "middle"))
        .attr("font-size", (i === 0 || i === bins) ? "11px" : "9px")
        .text(txt);
    });
  }

  const boroughs = Object.keys(boroughScales)
    .filter(b => b !== "EWR")
    .sort((a,b) => (maxTripsByBorough[b]||0) - (maxTripsByBorough[a]||0));

  if (useGlobalScale) {
    // one global row
    const sample = isFare
      ? boroughFareScales[boroughs[0]]
      : boroughScales[   boroughs[0]];
    const minV = isFare ? globalMinFare : globalMinCount;
    const maxV = isFare ? globalMaxFare : globalMaxCount;
    const lbl  = isFare ? "Avg Fare (Global)" : "Trips (Global)";
    drawRow(lbl, sample, minV, maxV, padT);

  } else {
    // one row per borough
    boroughs.forEach((b,i) => {
      const y0    = padT + i * gapY;
      const scale = isFare
        ? boroughFareScales[b]
        : boroughScales[b];
      const minV  = isFare
        ? (currentMinFareByBorough[b] || 0)
        : (currentMinTripsByBorough[b] || 0);
      const maxV  = isFare
        ? maxFareByBorough[b]
        : maxTripsByBorough[b];
      drawRow(b, scale, minV, maxV, y0);
    });
  }
}


// ——— AGGREGATE A RANGE ————————————————————————————————————————————————————
async function updateDataForRange(start, end) {
  showLoading();

  // 1) build the list of YYYY-MM-DD strings
  const days = [];
  for (let m = moment(start); m.isSameOrBefore(end); m.add(1, "days")) {
    days.push(m.format("YYYY-MM-DD"));
  }

  // 2) fetch pickup or dropoff aggregates
  const loader = currentMode === "dropoff" ? loadDropoff : loadPickup;
  const batches = await Promise.all(
    days.map(d => loader(d).catch(() => []))
  );

  // 3) aggregate counts & weighted sums
  tripCounts = {};
  sumFareByZone = {};
  batches.flat().forEach(r => {
    const id = +r.zone_id,
          n  = r.num_trips,
          f  = r.avg_fare || 0;
    tripCounts[id]    = (tripCounts[id]    || 0) + n;
    sumFareByZone[id] = (sumFareByZone[id] || 0) + f * n;
  });

  // 4) compute average fares
  avgFareByZone = {};
  Object.entries(sumFareByZone).forEach(([id, tot]) => {
    avgFareByZone[id] = tot / (tripCounts[id] || 1);
  });

  // 5) per-borough min/max (only non-zero) & overall max
  const minTripsByBorough = {}, minFareByBorough = {};
  maxTripsByBorough = {}; maxFareByBorough = {};

  geoDataGlobal.features.forEach(f => {
    if (f.properties.zone.includes("Airport")) return;
    const b  = f.properties.borough,
          id = f.properties.LocationID,
          ct = tripCounts[id]    || 0,
          av = avgFareByZone[id] || 0;

    // maxima
    maxTripsByBorough[b] = Math.max(maxTripsByBorough[b] || 0, ct);
    maxFareByBorough[b]  = Math.max(maxFareByBorough[b]  || 0, av);

    // minima only for >0
    if (ct > 0) minTripsByBorough[b] = Math.min(minTripsByBorough[b] || Infinity, ct);
    if (av > 0) minFareByBorough[b]  = Math.min(minFareByBorough[b]  || Infinity, av);
  });

  // stash minima for the legend
  currentMinTripsByBorough = { ...minTripsByBorough };
  currentMinFareByBorough  = { ...minFareByBorough  };

  // 6) global min/max across all zones
  const allCounts = Object.values(tripCounts).filter(v => v > 0),
        allFares  = Object.values(avgFareByZone).filter(v => v > 0);
  globalMinCount = allCounts.length ? d3.min(allCounts) : 1;
  globalMaxCount = allCounts.length ? d3.max(allCounts) : 1;
  globalMinFare  = allFares.length  ? d3.min(allFares)  : 0.01;
  globalMaxFare  = allFares.length  ? d3.max(allFares)  : 1;

  // 7) rebuild boroughScales & boroughFareScales (threshold scales)
  const boroughKeys = Object.keys(boroughScales);

  // helpers to get splits
  function linearSplits(min, max) {
    return d3.range(0, BINS + 1).map(i => min + (max - min) * (i / BINS));
  }
  function logSplits(min, max) {
    const m = Math.max(min, 1e-6);
    return d3.range(0, BINS + 1).map(i => m * Math.pow(max / m, i / BINS));
  }

  // precompute local color ramps for each borough
  const LOCAL_COUNT_RAMPS = {}, LOCAL_FARE_RAMPS = {};
  boroughKeys.forEach(b => {
    const [c0, c1] = colorCfg[b] || colorCfg.default;
    const interp = d3.interpolateRgb(c0, c1);
    LOCAL_COUNT_RAMPS[b] = d3.range(BINS).map(i => interp(i / (BINS - 1)));
    LOCAL_FARE_RAMPS[b]  = d3.range(BINS).map(i => interp(i / (BINS - 1)));
  });

  // rebuild count scales
  boroughKeys.forEach(b => {
    let lo = useGlobalScale ? globalMinCount : (minTripsByBorough[b] || 0);
    let hi = useGlobalScale ? globalMaxCount : (maxTripsByBorough[b] || 1);
    if (useLogScale) lo = Math.max(lo, 1e-6);

    const splits     = useLogScale ? logSplits(lo, hi) : linearSplits(lo, hi);
    const thresholds = splits.slice(1, BINS);
    const colors     = useGlobalScale
      ? GLOBAL_COUNT_COLORS
      : (LOCAL_COUNT_RAMPS[b] || LOCAL_COUNT_RAMPS.default);

    boroughScales[b] = d3.scaleThreshold()
      .domain(thresholds)
      .range(colors);
  });

  // rebuild fare scales
  boroughKeys.forEach(b => {
    let lo = useGlobalScale ? globalMinFare : (minFareByBorough[b] || 0);
    let hi = useGlobalScale ? globalMaxFare : (maxFareByBorough[b] || 1);
    if (useLogScale) lo = Math.max(lo, 1e-6);

    const splits     = useLogScale ? logSplits(lo, hi) : linearSplits(lo, hi);
    const thresholds = splits.slice(1, BINS);
    const colors     = useGlobalScale
      ? GLOBAL_FARE_COLORS
      : (LOCAL_FARE_RAMPS[b] || LOCAL_FARE_RAMPS.default);

    boroughFareScales[b] = d3.scaleThreshold()
      .domain(thresholds)
      .range(colors);
  });

  // 8) repaint map & hide spinner
  recolorMap();
  hideLoading();
}
async function updateODForRange(start, end, originZone) {
  showLoading();

  const days = [];
  for (let m = moment(start); m.isSameOrBefore(end); m.add(1, "days")) {
    days.push(m.format("YYYY-MM-DD"));
  }

  const batches = await Promise.all(
    days.map(d => loadOD(d, originZone).catch(() => []))
  );

  hideLoading();
  drawFlows(originZone, batches.flat());
  return batches.flat();   // ← return data so click‐handler can reuse it
}

// ─── recolor map by distribution from one origin ────────────────────────
function recolorDistribution(destCounts) {
  // 1) max trips from this origin
  const counts = Object.values(destCounts);
  const maxCount = counts.length ? Math.max(...counts) : 1;

  // 2) build a linear 0→maxCount split into BINS buckets
  const splits = d3.range(0, BINS + 1).map(i => (maxCount * i) / BINS);
  const thresholds = splits.slice(1, BINS);  // drop first and last
  const scale = d3.scaleThreshold()
    .domain(thresholds)
    .range(GLOBAL_COUNT_COLORS);

  // 3) apply to every zone path
  gBase.selectAll("path").attr("fill", d => {
    const cnt = destCounts[d.properties.LocationID] || 0;
    return cnt > 0
      ? scale(cnt)
      : grayFill;   // keep grey for zero trips
  });
}

function drawFlows(originZone, destCounts) {
  clearFlows();

  const zoneId = +originZone;
  // find origin feature and centroid
  const originFeat = geoDataGlobal.features
    .find(f => f.properties.LocationID === zoneId);
  if (!originFeat) return;
  const [x0, y0] = path.centroid(originFeat);
  
  // build stroke‐width scale: final width 1→8px
  const counts   = Object.values(destCounts);
  const maxCount = counts.length ? Math.max(...counts) : 1;
  const strokeScale = scalePow()
    .exponent(2)                 // square the input
    .domain([0, maxCount])       // 0 → maxCount
    .range([0.4, 8])             // 0.1px at the base → 8px max
    .clamp(true);                // optional: never exceed 8 or go below .1
  const opacityScale = scalePow()
    .exponent(0.5)
    .domain([0, maxCount])
    .range([0.1, 0.6])
    .clamp(true);

  // draw one tapered polygon per destination
  Object.entries(destCounts).forEach(([destId, count]) => {
    const destZone = +destId;
    if (destZone === zoneId) return;   // skip self

    const destFeat = geoDataGlobal.features
      .find(f => f.properties.LocationID === destZone);
    if (!destFeat) return;
    const [x1, y1] = path.centroid(destFeat);

    // control‐point for Bézier curve
    const dx = x1 - x0, dy = y1 - y0;
    const mx = x0 + dx/2, my = y0 + dy/2;
    const dist   = Math.hypot(dx, dy) || 1;
    const offset = dist * 0.1;
    const cx = mx + (dy/dist)*offset;
    const cy = my - (dx/dist)*offset;

    // sample the curve, compute normals and widths
    const steps    = 20;
    const leftPts  = [];
    const rightPts = [];
    const fullW    = strokeScale(count);
    const baseW    = 0.1;
    for (let i = 0; i <= steps; i++) {
      const u  = i/steps;
      const om = 1 - u;
      // point on curve
      const bx = om*om*x0 + 2*om*u*cx + u*u*x1;
      const by = om*om*y0 + 2*om*u*cy + u*u*y1;
      // tangent
      const tx = 2*om*(cx - x0) + 2*u*(x1 - cx);
      const ty = 2*om*(cy - y0) + 2*u*(y1 - cy);
      const len = Math.hypot(tx, ty) || 1;
      const nx  = -ty/len, ny = tx/len;
      // linear taper from baseW→fullW
      const w  = baseW + (fullW - baseW)*u;
      const h2 = w/2;
      leftPts .push([bx + nx*h2, by + ny*h2]);
      rightPts.push([bx - nx*h2, by - ny*h2]);
    }

    // build closed-path string
    const pts = leftPts.concat(rightPts.reverse());
    const d   = pts.map((p,i) =>
      (i===0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1)
    ).join(" ") + " Z";

    gFlows.append("path")
      .attr("d", `M${x0},${y0} Q${cx},${cy} ${x1},${y1}`)
      .attr("stroke", "steelblue")
      .attr("fill", "none")
      .attr("marker-end", "url(#arrowhead)")
      // choose your width:
      .attr("stroke-width", count === 0 ? 0.1 : strokeScale(count))
      // scale opacity by count:
      .attr("opacity", count === 0 ? 0.1 : opacityScale(count))
      .style("pointer-events", "none");
    });
}







// ——— INITIAL DRAW & HOOKUPS —————————————————————————————————————————————————
(async ()=>{
  geoDataGlobal = await json("/static/js/data/taxi_zones.geojson");
  const boroughs = Array.from(new Set(geoDataGlobal.features.map(f => f.properties.borough)));

  // Initialize both count‐ and fare‐scales for each borough
  boroughs.forEach(b => {
    const cols = colorCfg[b] || colorCfg.default;
    boroughScales[b]     = scaleLinear().domain([0,1]).range(cols);
    boroughFareScales[b] = scaleLinear().domain([0,1]).range(cols);
  });
  // ─── hook up the DateRangePicker ─────────────────────────────
  $('#daterange').daterangepicker({
    showDropdowns: true,
    startDate: moment('2024-01-01'),
    endDate:   moment('2024-01-31'),
    minDate:   '2024-01-01',
    maxDate:   '2024-12-31',
    locale:    { format: 'MM/DD/YYYY' }
  }, async (start, end) => {
    // update the input’s visible text
    $('#daterange').val(
      `${start.format('MM/DD/YYYY')} – ${end.format('MM/DD/YYYY')}`
    );
    // re-run the aggregation over the newly-picked range
    await updateDataForRange(start, end);
  });

  // initialize boroughScales
  new Set(geoDataGlobal.features.map(f => f.properties.borough))
  .forEach(b => {
    const cols = colorCfg[b] || colorCfg.default;    // default if missing
    boroughScales[b] = scaleLinear()
      .domain([0, 1])
      .range(cols);
  });

  // draw zones once
  basePaths = gBase.selectAll("path")
    .data(geoDataGlobal.features)
    .join("path")
      .attr("d", path)
      .attr("stroke","#000")
      .attr("stroke-width",0.5)
      .on("click",(ev,d)=>{
        selectedLocation = selectedLocation===d.properties.LocationID
                          ? null
                          : d.properties.LocationID;
      })
      .on("mouseover",(ev,d)=>{
        const id = d.properties.LocationID;
        let html = `<strong>${d.properties.zone}</strong><br/>`;

          if (currentDistribution) {
            const cnt = currentDistribution[id] || 0;
            // in dropoff mode these are pickups, otherwise dropoffs
            const label = currentMode === "dropoff" ? "Pickups" : "Dropoffs";
            html += `${label}: ${cnt.toLocaleString()}`;
          } else {
          // normal tooltip
          const cnt  = tripCounts[id]    || 0;
          const fare = avgFareByZone[id] || 0;
          if (currentMode === "dropoff") {
            html += `Drop-offs: ${cnt.toLocaleString()}<br/>`;
          } else {
            html += `Pickups: ${cnt.toLocaleString()}<br/>`;
          }
          if (currentMode === "avgFare") {
            html += `Avg Fare: $${fare.toFixed(2)}`;
          }
        }

        tooltip
          .style("opacity", 1)
          .html(html);
      })
      .on("mousemove", function(event, d) {
        const [x, y] = pointer(event, svg.node());
        tooltip
          .style("left",  (x + 12) + "px")
          .style("top",   (y + 12) + "px");
      })
      .on("mouseout",()=>{
        tooltip.style("opacity",0);
      })
      .on("click", async (ev, d) => {
        showLoading();
      
        const zone = +d.properties.LocationID;
      
        if (selectedLocation === zone) {
          // deselect
          selectedLocation = null;
          currentDistribution = null;
          clearFlows();
          recolorMap();
        } else {
          selectedLocation = zone;
      
          // build date list
          const dr = $('#daterange').data('daterangepicker');
          const days = [];
          for (let m = moment(dr.startDate); m.isSameOrBefore(dr.endDate); m.add(1, "days")) {
            days.push(m.format("YYYY-MM-DD"));
          }
      
          // pick the right loader for OD based on mode
          const odLoader = currentMode === "dropoff"
            ? loadReverseOD  // your new reverse endpoint
            : loadOD;        // original OD
      
          // fetch and flatten
          const batches = await Promise.all(
            days.map(day => odLoader(day, zone).catch(() => []))
          );
          // console.log(batches)
          // sum up into destCounts/originCounts
          const destCounts = {};
          batches.flat().forEach(r => {
            destCounts[r.zone_id] = (destCounts[r.zone_id] || 0) + r.num_trips;
          });
          currentDistribution = destCounts;


          clearFlows();

          drawFlows(zone, destCounts);
          recolorDistribution(destCounts);
        }
      
        hideLoading();
      });
      
  
  


  // add labels
  gLabels.selectAll("text")
    .data(geoDataGlobal.features)
    .join("text")
      .attr("x", d=> path.centroid(d)[0])
      .attr("y", d=> path.centroid(d)[1])
      .attr("font-size","4px")
      .attr("text-anchor","middle")
      .attr("pointer-events","none")
      .text(d=> d.properties.LocationID);

  // zoom/pan
  svg.call( zoom()
    .scaleExtent([1,8])
    .on("zoom", ev => {
      gBase .attr("transform", ev.transform);
      gFlows.attr("transform", ev.transform);
      gLabels.attr("transform", ev.transform);
    })
  );

  select("#mode-controls").selectAll("button")
  .on("click", function() {
    // highlight
    select("#mode-controls").selectAll("button").classed("active", false);
    select(this).classed("active", true);

    // change mode
    currentMode = this.dataset.mode;  // pickup | dropoff | avgFare

    const dr = $('#daterange').data('daterangepicker');
    if (currentMode === "avgFare") {
      // we already have sumFareByZone + tripCounts loaded
      recolorMap();
    } else {
      updateDataForRange(dr.startDate, dr.endDate);
    }
  });

// ——— SCALE SCOPE BUTTONS ———————————————————————
select("#scale-controls").selectAll("button")
  .on("click", function() {
    select("#scale-controls").selectAll("button").classed("active", false);
    select(this).classed("active", true);

    useGlobalScale = this.dataset.scale === "global";

    // re-aggregate to rebuild domains
    const dr = $('#daterange').data('daterangepicker');
    updateDataForRange(dr.startDate, dr.endDate);
  });
  select("#toggle-flows").on("click", () => {
    flowsVisible = !flowsVisible;
    gFlows.style("display", flowsVisible ? null : "none");
    select("#toggle-flows")
      .text(flowsVisible ? "Hide Flows" : "Show Flows");
  });
// ——— SCALE TRANSFORM BUTTONS —————————————————————
select("#transform-controls").selectAll("button")
  .on("click", function() {
    select("#transform-controls").selectAll("button").classed("active", false);
    select(this).classed("active", true);

    useLogScale = this.dataset.transform === "log";

    // re-aggregate to rebuild scales as log or linear
    const dr = $('#daterange').data('daterangepicker');
    updateDataForRange(dr.startDate, dr.endDate);
  });

  // initial load
  const dr = $('#daterange').data('daterangepicker');
  $('#daterange').val(`${dr.startDate.format("MM/DD/YYYY")} – ${dr.endDate.format("MM/DD/YYYY")}`);
  await updateDataForRange(dr.startDate, dr.endDate);

  select("#toggle-direction").on("click", function() {
    currentDirection = currentDirection === "pickup" ? "dropoff" : "pickup";
    this.textContent = currentDirection === "pickup" ? "Pickups" : "Drop-offs";
    // re-fetch the currently selected range & redraw
    const dr = $('#daterange').data('daterangepicker');
    updateDataForRange(dr.startDate, dr.endDate);
  });
  
  // toggle scale button
  select("#toggle-scale").on("click", function() {
    currentScale = currentScale === "count" ? "fare" : "count";
    this.textContent = currentScale === "count" ? "Count" : "Avg Fare";
    // just recolor the already-loaded data
    recolorMap();
  });
select("#toggle-flows").on("click", () => {
  flowsVisible = !flowsVisible;
  gFlows.style("display", flowsVisible ? null : "none");
  select("#toggle-flows")
    .text(flowsVisible ? "Hide Flows" : "Show Flows");
});
})();
>>>>>>> master
