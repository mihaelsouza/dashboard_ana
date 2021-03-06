'use strict';

// Global variables
var cache = {}; // Global cache to hold the loaded data
var selected = ''; // Global var to hold the selected location
                  // Necessary when resizing the body

// Read JSON data from a local source and create
// the necessary auxiliary variables inside cache.
var initialize = async function () {
  const [jsonFile, textFile] = getDataSource();
  await getData(`data/${jsonFile}`, 'json', organizeData);
  await getData(`data/${textFile}`, 'text', organizeInfo);

  populateFilterBox();
  plotMapCanvas(window.selected);
  populateAutocomplete(d3.select('#id-search'), cache.autocompleteList);
  CountsByPropertyPlot();

  // Create a catch all in the body to escape the
  // autocomplete search box if clicking outside of it
  d3.select('body')
    .on('click', (event) => {
      if (event.path[0] !== d3.select('#id-search')._groups[0][0]) {
        d3.select('.autocomplete')
          .select('.dropdown-content')
          .style('display', 'none');
      }
  });
};

// Plot the map canvas with all the currently filtered
// sediment cores available
var plotMapCanvas = function (selected) {
  // Data variables
  let land110, land50; // Variables to hold the topojson data
  let pointsGeoCoords = getLatLon(cache); // Gather coordinates of sediment cores
  let pointRadius = 8; // Define point radius for visualization and click recognition
  let sphere = {type: 'Sphere'}; // Create sphere for canvas plotting
  let width = d3.select('#map-canvas').node().getBoundingClientRect().width;
  let height = d3.select('#map-canvas').node().getBoundingClientRect().height;

  // D3 map variables
  let canvas = d3.select('#map-canvas')
                .attr('width', width)
                .attr('height', height);
  let context = canvas.node().getContext('2d');
  let projection = d3.geoOrthographic()
                      .rotate([0, -90])
                      .scale(width / 1.5)
                      .translate([width / 2, height / 2])
                      .precision(.1);
  let graticule = d3.geoGraticule()
                    .step([10,10]);

  // Function to select a sediment core within the shown globe on click,
  // and populate the variable dropdown menu with available properties
  canvas.on('click', (event) => click(event));
  function click(event) {
    // Convert sediment core coordinates to map
    // coordinates in current view/zoom
    let mouse = d3.pointer(event); // Clicked point
    let pointsMapCoords = pointsGeoCoords.coordinates.map((el) => projection(el));

    // Calculate distance between the click point and all
    // available sediment core identifications in the canvas
    let distanceMatrix = []
    pointsMapCoords.forEach((el) => {
      distanceMatrix.push(euclideanDistance(...mouse,...el));
    });

    // Register selected sediment core when click distance
    // and point distance is smaller or equal than pointRadius
    let clickedPoint = ['', 1000000];
    pointsGeoCoords.id.filter((el,id) => {
      if (distanceMatrix[id] <= pointRadius) {
        distanceMatrix[id] < clickedPoint[1] ? clickedPoint = [el, distanceMatrix[id]] : {};
      }
    });

    if (clickedPoint[0] !== '') {
      window.selected = clickedPoint[0]; // Updates the selected variable
      updateStateAfterSelection(); // Updates the visualizaiton & info box
      chart(land110, land50, pointsGeoCoords, window.selected); // Redraw canvas
    }
  };

  // Zoom function (copied exactly from https://observablehq.com/@d3/versor-zooming)
  function zoom(projection, {
    // Capture the projection’s original scale, before any zooming.
    scale = projection._scale === undefined
      ? (projection._scale = projection.scale())
      : projection._scale,
    scaleExtent = [-1, 100]
  } = {}) {
    let v0, q0, r0, a0, tl;

    const zoom = d3.zoom()
        .scaleExtent(scaleExtent.map(x => x * scale))
        .on('start', zoomstarted)
        .on('zoom', zoomed);

    function point(event, that) {
      const t = d3.pointers(event, that);

      if (t.length !== tl) {
        tl = t.length;
        if (tl > 1) a0 = Math.atan2(t[1][1] - t[0][1], t[1][0] - t[0][0]);
        zoomstarted.call(that, event);
      }

      return tl > 1
        ? [
            d3.mean(t, p => p[0]),
            d3.mean(t, p => p[1]),
            Math.atan2(t[1][1] - t[0][1], t[1][0] - t[0][0])
          ]
        : t[0];
    }

    function zoomstarted(event) {
      v0 = versor.cartesian(projection.invert(point(event, this)));
      q0 = versor((r0 = projection.rotate()));
    }

    function zoomed(event) {
      projection.scale(event.transform.k);
      const pt = point(event, this);
      const v1 = versor.cartesian(projection.rotate(r0).invert(pt));
      const delta = versor.delta(v0, v1);
      let q1 = versor.multiply(q0, delta);

      // For multitouch, compose with a rotation around the axis.
      if (pt[2]) {
        const d = (pt[2] - a0) / 2;
        const s = -Math.sin(d);
        const c = Math.sign(Math.cos(d));
        q1 = versor.multiply([Math.sqrt(1 - s * s), 0, 0, c * s], q1);
      }

      projection.rotate(versor.rotation(q1));

      // In vicinity of the antipode (unstable) of q0, restart.
      if (delta[0] < 0.7) zoomstarted.call(this, event);
    }

    return Object.assign(selection => selection
        .property('__zoom', d3.zoomIdentity.scale(projection.scale()))
        .call(zoom), {
      on(type, ...options) {
        return options.length
            ? (zoom.on(type, ...options), this)
            : zoom.on(type);
      }
    });
  }

  // Draw function to create a global map with the position of available data
  function chart (landLowRes, landHighRes, points) {
    const rect = canvas.node().getBoundingClientRect();
    const grid = graticule();
    const path = d3.geoPath()
                  .projection(projection)
                  .context(context)
                  .pointRadius(pointRadius);

    const lakes = {id: [], coordinates: [], type: 'MultiPoint'};
    const oceans = {id: [], coordinates: [], type: 'MultiPoint'};
    points.source.forEach((source, index) => {
      if (source === 'lakes') {
        lakes.id.push(points.id[index])
        lakes.coordinates.push(points.coordinates[index])
      } else {
        oceans.id.push(points.id[index])
        oceans.coordinates.push(points.coordinates[index])
      }
    })

    function render(land) {
      context.clearRect(0, 0, width, height);
      context.beginPath(), path(sphere), context.fillStyle = '#fff', context.fill();
      context.beginPath(), path(grid), context.lineWidth = .5, context.strokeStyle = '#aaa', context.stroke();
      context.beginPath(), path(land), context.fillStyle = '#000', context.fill();
      context.beginPath(), path(lakes), context.fillStyle = 'tomato', context.fill(), context.border = 1,
                                         context.strokeStyle = 'red', context.stroke();
      context.beginPath(), path(oceans), context.fillStyle = 'steelblue', context.fill(), context.border = 1,
                                         context.strokeStyle = 'blue', context.stroke();
      context.beginPath(), path(sphere), context.strokeStyle = '#000', context.stroke();

      // If a location was selected, highlight it
      if (window.selected.length > 1) {
        selected = {
          coordinates: [cache[window.selected].longitude, cache[window.selected].latitude],
          id: window.selected,
          type: 'Point'
        };

        context.beginPath(), path(selected), context.fillStyle = 'gold', context.fill(), context.border = 1,
                                             context.lineWidth = 1.5, context.strokeStyle = 'red', context.stroke();
      }
    }

    return canvas
          .call(zoom(projection)
            .on('zoom.render', () => render(landLowRes, selected))
            .on('end.render', () => render(landHighRes, selected)))
          .call(() => render(landHighRes))
          .node();
  }

  // Load the topojson data to render the initial map
  Promise.all([
    d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'),
    d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json'),
  ]).then(([topology110, topology50]) => {
    land110 = topojson.feature(topology110, topology110.objects.countries)
    land50 = topojson.feature(topology50, topology50.objects.countries)

    chart(land110, land50, pointsGeoCoords);
  });
};

// Update the state of all responsive elements in the website
// when a selection is made, either through clicking or text input
var updateStateAfterSelection = function () {
  populateDropdown(window.selected);
  d3.select('#graph-svg').html('');

  d3.select('#id-search')
    .property('value', cache[window.selected].name);

  // Update tooltip in the information box and enable property dropdown
  d3.select('#info-data')
    .selectAll('p')
    .remove();

  d3.select('#info-data')
    .append('p')
    .attr('class', 'centered-p')
    .append('text')
      .text('Select a property in the dropdown menu below.');

  d3.select('.dropdown')
    .style('display', 'inline-block');
};

// Create a plot at initialization/view reset that show the amount of
// available sediment core data within each property found
// Heavily edited from: https://observablehq.com/@d3/horizontal-bar-chart
var CountsByPropertyPlot = function () {
  // Start by creating a counts object for the occurence
  // of each property, ordered alphabetically
  let counts = {}, data = [];
  for (let obj in cache) {
    try {
      cache[obj].properties.forEach((el) => {
        el in counts ? counts[el]++ : counts[el] = 1;
      });
    } catch (error) {
      error.name === 'TypeError' ? {} : console.error(error);
    }
  }

  // Create data array to use for plotting
  for (let key in counts) {
    data.push({name: key, value: counts[key]});
  }

  // Sort array alphabetically
  data.sort((a,b) => {
    return a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1;
  });

  // Create the necessary variables to start plotting the bars
  let svg = d3.select('#graph-svg');
  let width = +svg.style('width').replace('px','');
  let height = +svg.style('height').replace('px','');
  let margins = svg.style('margin').replaceAll('px','').split(' ').map((d) => +d);
  svg.html('') // Clear current graphical contents, if any

  let xScale = d3.scaleLinear()
                .range([margins[3], width - margins[1] - margins[3]])
                .domain([0, d3.max(data, (d) => d.value)]).nice();

  let yScale = d3.scaleBand()
                .rangeRound([margins[0], height - margins[2]])
                .domain(d3.range(data.length))
                .padding(0.1);

  // Plot axes
  svg.append('g')
    .attr('transform', `translate(0,${margins[0]})`)
    .call(d3.axisTop(xScale));

  svg.append('g')
    .attr('transform', `translate(${margins[3]},0)`)
    .call(d3.axisLeft(yScale)
            .tickFormat((tick) => data[tick].name)
    );

  // Plot the bars
  svg.append('g')
      .attr('fill', 'yellowgreen')
    .selectAll('rect')
    .data(data)
    .join('rect')
      .style('opacity', .75)
      .attr('x', xScale(0.1))
      .attr('y', (d, i) => yScale(i))
      .attr('width', (d) => xScale(d.value) - xScale(0.1))
      .attr('height', yScale.bandwidth());

  // Label bars with their direct value
  svg.append('g')
      .attr('fill', 'white')
      .attr('text-anchor', 'end')
      .attr('font-size', '1em')
      .attr('font-weight', 'bold')
    .selectAll('text')
    .data(data)
    .join('text')
      .attr('x', d => xScale(d.value))
      .attr('y', (d, i) => yScale(i) + yScale.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('dx', -4)
      .text(d => `n = ${d.value}`)
    .call(text => text.filter(d => d.value < 5) // short bars
      .attr('dx', +4)
      .attr('text-anchor', 'start'));
};

// Create the SVG time series plot
var timeSeriesPlot = function (id, property) {
  let svg = d3.select('#graph-svg');
  let width = +svg.style('width').replace('px','');
  let height = +svg.style('height').replace('px','');
  let margins = svg.style('margin').replaceAll('px','').split(' ').map((d) => +d);

  // Organize the data for plotting
  let unit = cache[id][property].unit;
  let xvalues = cache[id][property].age;
  let yvalues = cache[id][property].values;
  let data = []
  xvalues.forEach((el,id) => {
    data.push([el, yvalues[id]]);
  });

  // Scale variables to the SVG dimensions
  let xScale = d3.scaleLinear()
                .range([margins[3], width - margins[1] - margins[3]])
                .domain(d3.extent(xvalues)).nice();

  let yScale = d3.scaleLinear()
                .range([height - margins[2], margins[0]])
                .domain(d3.extent(yvalues)).nice();

  svg.html('') // Clear current graphical content

  // Create and draw the plot axes
  svg.append('g')
    .attr('transform', `translate(0,${height - margins[2]})`)
    .call(d3.axisBottom(xScale));

  svg.append('g')
    .attr('transform', `translate(${margins[3]},0)`)
    .call(d3.axisLeft(yScale));

  // Plot the time series
  let line = d3.line()
              .defined((d) => !isNaN(d[1]))
              .x(d => xScale(d[0]))
              .y(d => yScale(d[1]));

  svg.append('path')
    .datum(data)
    .attr('fill', 'none')
    .attr('stroke', 'yellowgreen')
    .attr('stroke-width', 2)
    .attr('stroke-linejoin', 'round')
    .attr('stroke-linecap', 'round')
    .attr('d', line);

  // Create a tooltip above the plot to inspect date.value
  // pair at pointer location
  var tooltip = svg.append('g');

  svg.on('touchmove mousemove', function(event) {
    var [year, value] = getClosestToPointer(d3.pointer(event, this)[0]);

    tooltip.attr('transform', `translate(${xScale(year)},${yScale(value)})`)
          .call(callout, `${property} = ${value} ${unit}\nYear = ${year}`);
  });
  svg.on('touchend mouseleave', () => tooltip.call(callout, null));

  // Get ydata value based on the mouse position along the xAxis
  // Our goal is to show only the actual data values available
  function getClosestToPointer (mouseX) {
    var year = xScale.invert(mouseX);
    var yearId = d3.minIndex(xvalues.map((el) => Math.abs(el - year)));

    return [xvalues[yearId], yvalues[yearId]];
  };

  // Taken more or less straight from https://observablehq.com/@d3/line-chart-with-tooltip
  function callout (g, value) {
    if (!value) return g.style('display', 'none');

    g.style('display', null)
      .style('pointer-events', 'none')
      .style('font', '.6em sans-serif');

    const path = g.selectAll('path')
                  .data([null])
                  .join('path')
                    .style('opacity', .75)
                    .attr('fill', 'white')
                    .attr('stroke', 'black');

    const text = g.selectAll('text')
                  .data([null])
                  .join('text')
                  .call(text => text
                    .selectAll('tspan')
                    .data((value + '').split(/\n/))
                    .join('tspan')
                      .attr('x', 0)
                      .attr('y', (d, i) => `${i * 1.1}em`)
                      .style('font-weight', (_, i) => i ? null : 'bold')
                      .text(d => d));

    const {x, y, width: w, height: h} = text.node().getBBox();

    text.attr('transform', `translate(${-w / 2},${15 - y})`);
    path.attr('d', `M${-w / 2 - 10},5H-5l5,-5l5,5H${w / 2 + 10}v${h + 20}h-${w + 20}z`);
  };
};

// getLatLon creates a MultiPoint object with the longitude
// and latitude coordinate pairs for each sediment core available
// It takes into account the selected filters
var getLatLon = function (cache) {
  // First, we need to see whether any properties are being filtered. If
  //  so, we only return a MultiPoint object that includes the selection.
  let filteredProperty = [];
  d3.selectAll('#filter-options input:checked')
    .each((el) => filteredProperty.push(el));
  if (filteredProperty.length === 0) {
    // However, returns all properties if none are selected
    d3.selectAll('#filter-options input')
    .each((el) => filteredProperty.push(el));
  }

  // Now we build the MultiPoint object to draw over our map
  let outerArray = [], id = [], source = [];
  cache['autocompleteList'] = {};
  Object.entries(cache)
    .filter((arr) => (arr[1].latitude !== undefined | arr[1].longitude !== undefined))
    .forEach((arr) => {
      if (filteredProperty.some((el) => arr[1].properties.includes(el))) {
        id.push(arr[0]);
        source.push(arr[1].source);
        outerArray.push([arr[1].longitude, arr[1].latitude]);

        cache.autocompleteList[arr[1].name] = arr[0];
      }
  });

  return {
    id: id,
    type: 'MultiPoint',
    source: source,
    coordinates: outerArray
  };
};

// Get the desired data source to fill the website information, based on the slider positon
var getDataSource = function () {
  const dataSource = d3.select('#data-source').property('checked');
  if (dataSource) return ['output_2kyr.json', 'Lake_records_coordinates_2kyr_utf8.txt'];
  else return ['output_Holocene.json', 'Lake_records_coordinates_Holocene_utf8.txt'];
};

// getData reads json and text data from a local source to
// fill cache with the sediment core available information
var getData = async function (url, methodFunc, callback) {
  let response = await fetch(url);
  let resolve = await response[methodFunc]();
  callback(resolve);
};

// getProperty parses all attributes inside collection and
// returns a list with its key if they are objects
var getProperties = function (collection) {
  let properties = [];
  Object.entries(collection).forEach((el) => {
    (typeof el[1] === 'object' & el[1] !== null) ? properties.push(el[0]) : {};
  });

  return properties;
};

// organizeData gets the available age and value axis pairs
// from location_data.json for all sediment cores.
var organizeData = function (dataIn) {
  for (let key in dataIn) {
    let [id, property] = key.split('_');
    id in cache ? {} : cache[id] = {};
    property in cache[id] ? {} : cache[id][property] = {};

    cache[id][property]['age'] = dataIn[key].Age_CE;
    cache[id][property]['values'] = dataIn[key].Value;
    cache[id][property]['unit'] = dataIn[key].Unit[0] === 'ppt' ? '\u2030' : dataIn[key].Unit[0];
  }

  // Create a properties object that hold a list of
  // available properties by ID
  for (let id in cache) {
    cache[id]['properties'] = getProperties(cache[id]);
  }
};

// organizeInfo adds to each sediment core ID in the cache
// the respective lat/lon coordinates and any additional info.
var organizeInfo = function (textIn) {
  let text = textIn.split('\n').slice(1,);
  text.forEach((e) => {
    let [id, name, lake, lat, lon, source] = e.split('\t');
    id = `ID${String(id).padStart(2,0)}`;

    if (id in cache) {
      cache[id]['name'] = name;
      cache[id]['lake'] = lake;
      cache[id]['source'] = source;
      cache[id]['latitude'] = Number(lat);
      cache[id]['longitude'] = Number(lon);
    }
  });
};

// Populate the filter panel below the canvas with a set of
// checkboxes with the available properties for all locations
var populateFilterBox = function () {
  let availableProperties = [];
  Object.entries(cache).forEach((values) => {
    if (values[1].properties !== undefined) {
      values[1].properties.forEach((el) => {
        availableProperties.includes(el) ? {} : availableProperties.push(el);
      });
    }
  });

  // Sort properties alphabetically
  availableProperties.sort((a,b) => {
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
  });

  cache['properties'] = availableProperties; // Cache this list

  d3.select('#filter-options')
    .selectAll('input')
    .data(availableProperties).enter()
    .append('label')
      .attr('for', (d) => d)
    .append('input')
      .attr('type', 'checkbox')
      .style('margin-left', '3%')
      .attr('id', (d) => d)
      .on('click', (event) => {
        resetView();
        populateAutocomplete(d3.select('#id-search'), cache.autocompleteList);
      })
      .property('checked', false);

  d3.selectAll('#filter-options label')
    .append('text')
    .text((d) => d);
};

// Populate autocomplete
var populateAutocomplete = function (input, data) {
  var currentFocus;

  function removeClass(HTMLlist) {
    for (let child of HTMLlist) {
      child.classList.remove('autocomplete-active');
    }
  }

  input.on('click', () => {
    input.on('input')();
  })
  .on('input', () => {
    let value = input.property('value'); // Grab current content of the search box
    let target = d3.select('.autocomplete')
                  .select('.dropdown-content');
    target.html(''); // Clear existing lists
    currentFocus = -1;

    let matches = [];
    if (!value) { // Avoid erros when the list empties
      Object.entries(data).forEach((el) => matches.push(el[0]));
      //return false;
    } else {
      // Otherwise, loop over the possible names and shows a dropdown list
      // with the available ids that match the current content of search box
      Object.entries(data).forEach((el) => {
        if (value.toUpperCase() === el[0].substr(0, value.length).toUpperCase()) {
          matches.push(`<strong>${el[0].substr(0,value.length)}</strong>${el[0].substr(value.length)}`);
        }
      });
    }

    // Fill the autocomplete form with the found matches
    target.selectAll('a')
          .data(matches).enter()
          .append('a')
            .attr('href', '#')
            .on('click', (event) => {
              let el = event.target.innerText;
              window.selected = data[el]; // Updates selection

              plotMapCanvas(window.selected); // Redraw canvas
              updateStateAfterSelection(); // Update viz & info boxes
              target.style('display', 'none'); // Hide the autocomplete list
            })
            .on('mouseover', () => {
              let childList = d3.select('.autocomplete')
                      .select('.dropdown-content')
                      .selectChildren()._groups[0];
              removeClass(childList);
            })
            .html((el) => el);

    target.style('display', 'block')
          .style('background-color', '#fff')
          .style('width', input.style('width'))
          .style('z-index', 99);
  })
  .on('keydown', (event) => {
    let childList = d3.select('.autocomplete')
                      .select('.dropdown-content')
                      .selectChildren()._groups[0];
    if (event.keyCode === 40) { // Arrow Down
      currentFocus++;
      currentFocus >= childList.length ? currentFocus = childList.length-1 : {};
    } else if (event.keyCode === 38) { // Arrow Up
      currentFocus--;
      currentFocus < 0 ? currentFocus = 0 : {};
    } else if (event.keyCode === 13) { // Enter key
      event.preventDefault(); // Prevent form being submitted

      // Simulate a mouse click on the selected ID
      // If no option is selected first, does nothing
      if (currentFocus > -1) {
        childList[currentFocus].click();
      }
    }

    if (currentFocus > -1) {
      // Remove the highlight class from all available children elements
      removeClass(childList);

      // Highlight element currently in focus
      childList[currentFocus].classList.add('autocomplete-active');
    }
  });
};

// Populate the contents of the dropdown menu with the
// available properties for the selected sediment core
var populateDropdown = function (id) {
  // Create an anchor element in the dropdown menu for each property found
  let dropdown = d3.select('.dropdown')
                  .select('.dropdown-content')

  dropdown.html('')
          .selectAll('a')
          .data(cache[id].properties).enter()
          .append('a')
            .attr('href', '#')
            .on('click', (val) => {
              populateInfo(id, val.target.innerText);
              timeSeriesPlot(id, val.target.innerText);
              dropdown.style('display', 'none');
            })
            .append('text')
              .text(el => String(el));

  dropdown.style('display', 'inline-block');
};

// Populate information box with some ancillary
// data on the selected location
var populateInfo = function (id, property) {
  let coreName = cache[id].name;
  let lakeName = cache[id].lake;
  let longitude = cache[id].longitude;
  let latitude = cache[id].latitude;
  let ageData = cache[id][property].age;
  let valueData = cache[id][property].values;
  let unit = cache[id][property].unit;

  var infoText = [
    `<strong>ID:</strong> ${coreName}&emsp;<strong>Lake:</strong> ${lakeName}&emsp;<strong>Property:</strong> ${property}`,
    `<strong>Longitude:</strong> ${formatLongitude(longitude.toFixed(2))}&emsp;
     <strong>Latitude:</strong> ${formatLatitude(latitude.toFixed(2))}`,
    `<strong>Date Range:</strong> from ${d3.min(ageData).toFixed(0)} until ${d3.max(ageData).toFixed(0)} of the Current Era`,
    `<strong>Min. Value:</strong> ${d3.min(valueData).toFixed(2)} ${unit}
     <strong>&emsp;Max. Value:</strong> ${d3.max(valueData).toFixed(2)} ${unit}`,
  ];

  // Start by removing any <p> tags inside the box to reset its content
  d3.select('#info-container')
    .selectAll('p')
    .remove();

  // Now, we add the new information
  d3.select('#info-data')
    .selectAll('p')
    .data(infoText).enter()
    .append('p')
      .html((val) => val);
};

// Change data source on slider click
function changeDataSource () {
  cache = {}; // Clear cache to fill with new data
  const state = d3.select('#data-source').property('checked'); // Slider state

  // Put the appropriate text label on the Slider
  if (state) d3.select('.slider-text').text('<2kyr');
  else d3.select('.slider-text').text('Holoc.');

  // Clear content of filter box
  d3.select('#filter-options').html('');
  resetView();

  // Populate the cache and reinitialize website status
  initialize();
}

// Reset view button on click action
function resetView () {
  window.selected = '';
  d3.select('#id-search')
    .property('value', '');

  plotMapCanvas(window.selected);
  clearInfoBox();
  clearVizBox();
  CountsByPropertyPlot();
}

// Clear function for the information box and
// the visualization graphics panel
var clearInfoBox = function () {
  d3.select('#info-container')
    .selectAll('p')
    .remove();

  d3.select('#info-data')
    .append('p')
    .attr('class', 'centered-p')
    .append('text')
      .text('Pan/zoom around the globe and click to select a location and explore the available properties at the selected site. Alternatively, use the search box to select a location based directly on its id.');
};

var clearVizBox = function () {
  d3.select('.dropdown')
    .select('.dropdown-content')
    .html('');

  d3.select('.dropdown')
    .style('display', 'none');

  d3.select('#graph-svg')
    .html('');
};

// Pair of function to format latitude and longitude
// with the hemispherical indication
var formatLatitude = function (latitude) {
  return latitude > 0 ? `${latitude} &degN` : `${-latitude} &degS`;
};

var formatLongitude = function (longitude) {
  return longitude > 0 ? `${longitude} &degE` : `${-longitude} &degW`;
};

// Calculate the distance between two points in
// an arbitrary two dimensional plane
var euclideanDistance = function(x1,y1,x2,y2) {
  return Math.sqrt((x2 - x1)**2 + (y2 - y1)**2);
};

// On loading the DOM...
document.addEventListener('DOMContentLoaded', function () {
  initialize();
}, false);