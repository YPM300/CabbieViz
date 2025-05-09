const margin = { top: 50, right: 50, bottom: 50, left: 70 };
const width = 800 - margin.left - margin.right;
const height = 400 - margin.top - margin.bottom;

const svg = d3.select("svg")
  .append("g")
  .attr("transform", `translate(${margin.left}, ${margin.top})`);

const yLabel = svg.append("text")
  .attr("class", "y-axis-label")
  .attr("text-anchor", "middle")
  .attr("transform", `rotate(-90)`)
  .attr("x", -height / 2)
  .attr("y", -50)
  .attr("font-size", "14px")
  .text("");

const xScale = d3.scalePoint().range([0, width]).padding(0.5);
const yScale = d3.scaleLinear().range([height, 0]);

const line = d3.line()
  .x(d => xScale(d.Timeframe))
  .y(d => yScale(d.Value))
  .curve(d3.curveMonotoneX);

const xAxis = svg.append("g").attr("transform", `translate(0, ${height})`);
const yAxis = svg.append("g");

function makeYGridlines() {
  return d3.axisLeft(yScale).ticks(5).tickSize(-width).tickFormat("");
}

function makeXGridlines() {
  return d3.axisBottom(xScale).ticks(5).tickSize(-height).tickFormat("");
}

function calculateMovingAverage(data, windowSize) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const subset = data.slice(start, i + 1);
    const avg = d3.mean(subset, d => d.Value);
    result.push({ Timeframe: data[i].Timeframe, Value: avg });
  }
  return result;
}

d3.csv("static/js/data/taxi_price_population_combined.csv").then(data => {
  data.forEach(d => d.Value = +d.Value);

  const months = ["January", "February", "March", "April", "May", "June", 
                  "July", "August", "September", "October", "November", "December"];
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  function updateInsights(filteredData, label, timeframe) {
    if (!filteredData.length) {
      document.getElementById("insights-text").innerText = "No data available.";
      return;
    }

    const highest = d3.max(filteredData, d => d.Value);
    const lowest = d3.min(filteredData, d => d.Value);

    const highEntry = filteredData.find(d => d.Value === highest);
    const lowEntry = filteredData.find(d => d.Value === lowest);

    document.getElementById("insights-text").innerText = 
      `Highest ${label} in ${highEntry.Timeframe} (${highest}), lowest in ${lowEntry.Timeframe} (${lowest})`;
  }

  function updateChart() {
    const type = document.getElementById("dataType1").value;
    const timeframe = document.getElementById("timeframe").value;
    const order = timeframe === "Months" ? months : days;

    const filtered = data.filter(d => d.Type === type && order.includes(d.Timeframe));
    filtered.sort((a, b) => order.indexOf(a.Timeframe) - order.indexOf(b.Timeframe));

    const movingAvg = calculateMovingAverage(filtered, 3);

    updateInsights(filtered, type, timeframe);

    xScale.domain(order);
    const minVal = d3.min(filtered, d => d.Value);
    const maxVal = d3.max(filtered, d => d.Value);
    const padding = (maxVal - minVal) * 0.2;  // 20% padding

    yScale.domain([minVal - padding, maxVal + padding]);


    xAxis.transition().duration(500).call(d3.axisBottom(xScale));
    yAxis.transition().duration(500).call(d3.axisLeft(yScale));

    svg.selectAll(".x-grid").remove();
    svg.selectAll(".y-grid").remove();

    svg.append("g").attr("class", "x-grid")
        .attr("transform", `translate(0,${height})`)
        .call(makeXGridlines());

    svg.append("g").attr("class", "y-grid")
        .call(makeYGridlines());

    svg.selectAll(".line-path").data([filtered]).join("path")
      .attr("class", "line-path")
      .attr("fill", "none")
      .attr("stroke", "steelblue")
      .attr("stroke-width", 2)
      .transition().duration(500)
      .attr("d", line);

    svg.selectAll(".trend-line").data([movingAvg]).join("path")
      .attr("class", "trend-line")
      .attr("fill", "none")
      .attr("stroke", "orange")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "4 2")
      .transition().duration(500)
      .attr("d", line);

    svg.selectAll(".annotation").remove();
    const max = d3.max(filtered, d => d.Value);
    const min = d3.min(filtered, d => d.Value);
    filtered.forEach(d => {
      if (d.Value === max || d.Value === min) {
        svg.append("text")
          .attr("class", "annotation")
          .attr("x", xScale(d.Timeframe))
          .attr("y", yScale(d.Value) - 10)
          .attr("text-anchor", "middle")
          .attr("font-size", "12px")
          .attr("font-weight", "bold")
          .attr("fill", d.Value === max ? "green" : "red")
          .text(d.Value === max ? "Peak" : "Lowest");
      }
    });

    // Dynamic Y-axis label
    let yLabelText = "";
    if (type.includes("Price")) {
        yLabelText = "Average Fare per Trip ($)";
    } else if (type.includes("Population")) {
        yLabelText = "Passengers per Day";
    }
    yLabel.text(yLabelText);


    // Tooltip + Side Card
    svg.selectAll("circle").remove();
    const tooltip = d3.select("#tooltip");

    svg.selectAll("circle")
      .data(filtered)
      .enter()
      .append("circle")
      .attr("r", 4)
      .attr("fill", "steelblue")
      .attr("cx", d => xScale(d.Timeframe))
      .attr("cy", d => yScale(d.Value))
      .on("mouseover", function (event, d) {
        d3.select(this).transition().attr("r", 7);
        const idx = filtered.indexOf(d);
        const prev = idx > 0 ? filtered[idx - 1] : null;
        const change = prev ? ((d.Value - prev.Value) / prev.Value * 100).toFixed(2) : "N/A";

        tooltip.transition().style("opacity", 1);
        tooltip.html(`
          <strong>${timeframe}: ${d.Timeframe}</strong><br/>
          ${type}: $${d.Value}<br/>
          Change: ${change}%
        `)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
      })
      .on("mouseout", function () {
        d3.select(this).transition().attr("r", 4);
        tooltip.transition().style("opacity", 0);
      })
      .on("click", function (event, d) {
        const idx = filtered.indexOf(d);
        const prev = idx > 0 ? filtered[idx - 1] : null;
        const change = prev ? ((d.Value - prev.Value) / prev.Value * 100).toFixed(2) : "N/A";

        const max = d3.max(filtered, d => d.Value);
        const min = d3.min(filtered, d => d.Value);
        const insight = d.Value === max ? "Peak Value" : d.Value === min ? "Lowest Value" : "Normal Range";

        document.getElementById("card-timeframe").innerText = `${timeframe}: ${d.Timeframe}`;
        document.getElementById("card-value").innerText = `${type}: $${d.Value}`;
        document.getElementById("card-change").innerText = `Change from prev: ${change}%`;
        document.getElementById("card-insight").innerText = `Insight: ${insight}`;

        document.getElementById("side-card").style.display = "block";
      });
  }

  updateChart();
  document.getElementById("dataType1").addEventListener("change", updateChart);
  document.getElementById("timeframe").addEventListener("change", updateChart);
});
