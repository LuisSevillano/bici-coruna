d3
  .queue()
  .defer(d3.json, "./data/data.json")
  .defer(d3.json, "./data/map.json")
  .await(ready);

var data, map;
var WIDTH;

var results = d3.select("#results");

function ready(error, file1, file2) {
  if (!data || !map) {
    data = file1;
    map = file2;
  }

  var el = d3
    .select(".wrapper")
    .node()
    .getBoundingClientRect().width;

  // Map aspect variabes
  var ratio = el < 590 ? 1.7 : 0.9,
    width = Math.min(el, 950),
    isMobile = width < 480,
    height = width * ratio,
    margin = { top: 20, right: 20, bottom: 30, left: 20 };

  WIDTH = width;

  var svg = d3.select("svg").html("");
  svg.attr("width", width).attr("height", height);

  var defs = svg.append("defs");
  var g = svg.append("g");

  d3.select(".controls").classed("isActive", false);

  defs
    .append("clipPath")
    .attr("id", "clip")
    .append("use")
    .attr("xlink:href", "#limits");

  g
    .append("use")
    .attr("xlink:href", "#limits")
    .attr("class", "limits");

  // Stripe pattern for the station with no data
  defs
    .append("pattern")
    .attr("id", "pattern-stripe")
    .attr("width", "4 ")
    .attr("height", "4")
    .attr("patternUnits", "userSpaceOnUse")
    .attr("patternTransform", "rotate(45)")
    .append("rect")
    .attr("width", "1")
    .attr("height", "4")
    .attr("transform", "translate(0,0)")
    .attr("fill", "white");

  defs
    .append("mask")
    .attr("id", "mask-stripe")
    .append("rect")
    .attr("x", "0")
    .attr("y", "0")
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("fill", "url(#pattern-stripe)");

  // Topology
  var topology = topojson.feature(map, map.objects.coruna),
    coast = topojson.feature(map, map.objects.selection);

  // Map projection
  var projection = d3.geoMercator().translate([width / 2, height / 2]);

  var path = d3
    .geoPath()
    .projection(projection)
    .pointRadius(3);

  // Store stations points as a GeoJSON format
  var points = { type: "MultiPoint", coordinates: data };

  // Calculate the bounding boxes and center of the whole points
  var bounds = d3.geoBounds(points),
    center = d3.geoCentroid(points);

  // Compute the angular distance between bound corners
  var distance = d3.geoDistance(bounds[0], bounds[1]),
    scale = height / distance / Math.sqrt(2);

  scale = isMobile ? scale * 0.7 : scale;

  // Update the projection scale and centroid
  projection.scale(scale).center(center);

  var voronoi = d3.voronoi().extent([[-1, -1], [width + 1, height + 1]]);

  // Base map
  g
    .append("g")
    .append("path")
    .datum(coast)
    .attr("class", "land")
    .attr("d", path);

  // City polygon
  g
    .append("g")
    .append("path")
    .datum(topology)
    .attr("class", "city")
    .attr("id", "limits")
    .attr("d", path);

  // Bike stops
  var stations = g
    .append("g")
    .attr("class", "stations-group")
    .selectAll(".stations")
    .data(data)
    .enter()
    .append("g")
    .attr("class", "stations");

  stations.append("title").text(function(d) {
    return d.name;
  });

  // Scale to set trips lines width
  var scaleLine = d3
    .scaleLinear()
    .domain([0, 1])
    .range([0.5, 5]);

  // Scale to set trips lines color
  var colorScale = d3
    .scaleThreshold()
    .domain([0, 0.3, 0.5, 0.8, 0.9, 1])
    .range(d3.schemeReds[7]);

  // Draw the polygon of the influence area of each stop
  stations
    .append("path")
    .data(voronoi.polygons(data.map(projection)))
    .attr("clip-path", "url(#clip)")
    .attr("class", function(d) {
      var str = this.parentNode.__data__.name;
      return "stations-cell " + str.replace(/\s/g, "_");
    })
    .attr("d", function(d) {
      return d ? "M" + d.join("L") + "Z" : null;
    });

  // Draw the trips of each station (lines)
  var lines = stations
    .append("g")
    .attr("class", "lines")
    .selectAll(".line")
    .data(function(z) {
      return z.dest.sort(function(a, b) {
        return d3.ascending(a.prop, b.prop);
      });
    })
    .enter()
    .append("line")
    .attr("x1", function(d) {
      return projection(d.from_lat_lng)[0];
    })
    .attr("y1", function(d) {
      return projection(d.from_lat_lng)[1];
    })
    .attr("x2", function(d, i) {
      return projection(d.to_lat_lng)[0];
    })
    .attr("y2", function(d, i) {
      return projection(d.to_lat_lng)[1];
    })
    .attr("stroke", function(d) {
      return colorScale(d.prop);
    })
    .attr("stroke-width", function(d) {
      return scaleLine(d.prop);
    })
    .select(function(d) {
      return d.from_id == d.to_id && d.prop == 1 ? this.parentNode : null;
    })
    .append("circle")
    .attr("cx", function(d) {
      return projection(d.from_lat_lng)[0];
    })
    .attr("cy", function(d) {
      return projection(d.from_lat_lng)[1];
    })
    .attr("r", 5)
    .attr("fill", function(d) {
      return colorScale(1);
    });

  var hasTouch = "ontouchstart" in window;

  stations
    .on("mouseenter", hasTouch ? null : mouseenter)
    .on("mouseout", hasTouch ? null : mouseout)
    .on("touchend", mouseenter);

  g
    .append("g")
    .append("path")
    .datum({ type: "MultiPoint", coordinates: data })
    .attr("class", "stations-dots")
    .attr("d", path);

  //legend
  var x = d3
    .scaleLinear()
    .domain([0, 1])
    .range([0, Math.min(width - margin.left - margin.right, 500)]);

  var xAxis = d3
    .axisBottom()
    .scale(x)
    .tickSize(13)
    .tickValues(colorScale.domain())
    .tickFormat(d3.format(",.0%"));

  var legend = g
    .append("g")
    .attr("class", "legend")
    .attr(
      "transform",
      "translate(" + margin.left + "," + (height - margin.bottom) + ")"
    );

  var leg = colorScale.range().map(function(d, i) {
    return {
      x0: i ? x(colorScale.domain()[i - 1]) : x.range()[0],
      x1:
        i < colorScale.domain().length
          ? x(colorScale.domain()[i])
          : x.range()[1],
      z: d
    };
  });

  legend
    .selectAll("rect")
    .data(leg)
    .enter()
    .append("rect")
    .attr("height", 8)
    .attr("x", function(d) {
      return d.x0;
    })
    .attr("width", function(d) {
      return d.x1 - d.x0;
    })
    .style("fill", function(d) {
      return d.z;
    });

  legend.call(xAxis);

  // Store all the stations except which one has no data (id=='25')
  var stationsArray = Array.from(document.querySelectorAll(".stations"))
    .map(function(d) {
      return d;
    })
    .filter(function(d) {
      return d.__data__.id !== "25";
    });

  // Stop any possible animation fired before if the window is resized
  if (window.__interValFc) window.__interValFc.stop();
  window.__interValFc = d3.interval(intervalFn, 1500);

  // Animation function
  function intervalFn(time) {
    var start = stationsArray.shift();

    stationsArray.push(start);

    stations.classed("active", false);
    d3.select(start).classed("active", true);
    d3.select(".controls").classed("isActive", true);
    d3.select(start).dispatch(hasTouch ? "touchend" : "mouseenter");
  }

  // Animation controls
  var play = d3.select(".animation-start");
  var pause = d3.select(".animation-pause");

  play.on("click", function(d) {
    d3.select(".controls").classed("isActive", true);
    window.__interValFc = d3.interval(intervalFn, 1500);
  });

  pause.on("click", function(d) {
    // stations.dispatch("mouseout");
    d3.select(".controls").classed("isActive", false);
    if (window.__interValFc) window.__interValFc.stop();
  });

  g.on("mousemove", function(d) {
    d3.select(".controls").classed("isActive", false);
    if (window.__interValFc) window.__interValFc.stop();
  });

  //
  function mouseenter(d) {
    if (d.id == "25") return; // no data for Castrillon station

    stations.classed("active", false);

    d3
      .select(this)
      .raise()
      .classed("active", true);

    d3.select(".name").html(d.name);

    var stationData = d3
        .select(this)
        .select(".lines")
        .data()[0],
      dest = stationData.dest.sort(function(a, b) {
        return d3.descending(a.prop, b.prop);
      }),
      first = dest[0],
      second = dest[1],
      third = dest[2];

    var totalTravel = d3.sum(stationData.dest, function(d) {
      return d.max_combin;
    });
    // Fill the info Box
    d3.select(".travels .value").html(format(totalTravel));

    d3
      .select(".first .value")
      .html(first.to + "(" + format(first.max_combin) + ")");
    d3
      .select(".second .value")
      .html(second.to + "(" + format(second.max_combin) + ")");
    d3
      .select(".third .value")
      .html(third.to + "(" + format(third.max_combin) + ")");

    d3.select(".first .pill").style("background-color", colorScale(first.prop));

    d3
      .select(".second .pill")
      .style("background-color", colorScale(second.prop));

    d3.select(".third .pill").style("background-color", colorScale(third.prop));

    results.classed("active", true);
  }
  function mouseout(d) {
    stations.classed("active", false);
    results.classed("active", false);
  }
}
function format(x) {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
// Function to avoid calling the same function multiple times if user resize the window
function debounce(fn, delay) {
  var timer = null;
  return function() {
    var context = this,
      args = arguments;
    clearTimeout(timer);
    // We want to redraw the map only if with changes (not height)
    var _width = d3
      .select(".wrapper")
      .node()
      .getBoundingClientRect().width;
    if (WIDTH !== _width) {
      timer = setTimeout(function() {
        fn.apply(context, args);
      }, delay);
    }
  };
}

window.addEventListener("resize", debounce(ready, 300));
