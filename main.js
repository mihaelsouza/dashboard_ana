// Read JSON data from a local source and create
// the necessary auxiliary variables inside cache.
var cache = {};
var initialize = async function (url) {
  await getData(`${url}/location_data.json`, 'json', organizeData);
  await getData(`${url}/location_info.txt`, 'text', organizeInfo);

  plotMapCanvas();
}

// Create the initial map view
var plotMapCanvas = function () {
  // Data variables
  let land110, land50; // Variables to hold the topojson data
  let pointsGeoCoords = getLatLon(cache); // Gather coordinates of sediment cores
  let pointRadius = 8; // Define point radius for visualization and click recognition
  let sphere = {type: 'Sphere'}; // Create sphere for canvas plotting
  let width = d3.select('#map-container').node().getBoundingClientRect().width;
  let height = d3.select('#map-container').node().getBoundingClientRect().height;

  // D3 map variables
  let canvas = d3.select('#map-canvas')
                .attr('width', width)
                .attr('height', height);
  let context = canvas.node().getContext('2d');
  let projection = d3.geoOrthographic()
                      .rotate([0, -90])
                      .scale(width / 2.3)
                      .translate([width / 2, height / 2])
                      .precision(.1);
  let graticule = d3.geoGraticule()
                    .step([10,10]);

  // Function to select a sediment core within the shown globe on click,
  // and populate the variable dropdown menu with available properties
  canvas.on('click', (event) => click(event));
  function click(event) {
    let mouse = d3.pointer(event); // Clicked point

    // Convert sediment core coordinates to map
    // coordinates in current view/zoom
    let pointsMapCoords = pointsGeoCoords.coordinates.map((el) => projection(el));

    // Calculate distance between the click point and all
    // available sediment core identifications in the canvas
    let distanceMatrix = []
    pointsMapCoords.forEach((el) => {
      distanceMatrix.push(euclideanDistance(...mouse,...el));
    });

    // Register selected sediment core when click distance
    // and point distance is smaller or equal than pointRadius
    let clickedPoint = [];
    pointsGeoCoords.id.filter((el,id) => {
      if (distanceMatrix[id] <= pointRadius) {
        clickedPoint.push([el, distanceMatrix[id]]);
      }
    });

    if (clickedPoint.length >= 1) {
      //console.log(clickedPoint.length)
      populateDropdown(clickedPoint[0][0])

      // Redraw chart to identified the selected sediment core
      chart(land110, land50, pointsGeoCoords, clickedPoint[0][0]);
    }
  };

  // Zoom function (copied exactly from https://observablehq.com/@d3/versor-zooming)
  function zoom(projection, {
    // Capture the projection’s original scale, before any zooming.
    scale = projection._scale === undefined
      ? (projection._scale = projection.scale())
      : projection._scale,
    scaleExtent = [1, 100]
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
  function chart (landLowRes, landHighRes, points, selected = '') {
    const grid = graticule();
    const path = d3.geoPath()
                  .projection(projection)
                  .context(context)
                  .pointRadius(pointRadius);

    function render(land, selected) {
      context.clearRect(0, 0, width, height);
      context.beginPath(), path(sphere), context.fillStyle = '#fff', context.fill();
      context.beginPath(), path(grid), context.lineWidth = .5, context.strokeStyle = '#aaa', context.stroke();
      context.beginPath(), path(land), context.fillStyle = '#000', context.fill();
      context.beginPath(), path(points), context.fillStyle = 'tomato', context.fill(), context.border = 1,
                                         context.strokeStyle = 'red', context.stroke();
      context.beginPath(), path(sphere), context.strokeStyle = '#000', context.stroke();
      if (selected.length > 1) {
        selected = {
          coordinates: [cache[selected].longitude, cache[selected].latitude],
          id: selected,
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
          .call(() => render(landHighRes, selected))
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
}

// getLatLon creates a MultiPoint object with the longitude
// and latitude coordinate pairs for each sediment core available
var getLatLon = function (cache) {
  let outerArray = [], id = [];
  Object.entries(cache).forEach((arr) => {
    id.push(arr[0]);
    outerArray.push([arr[1].longitude, arr[1].latitude]);
  });

  return {
    id: id,
    type: 'MultiPoint',
    coordinates: outerArray
  };
};

// getData reads json and text data from a local source to
// fill cache with the sediment core available information
var getData = async function (url, methodFunc, callback) {
  let response = await fetch(url);
  let resolve = await response[methodFunc]();
  callback(resolve);
};

// organizeData gets the available age and value axis pairs
// from location_data.json for all sediment cores.
var organizeData = function (dataIn) {
  for (key in dataIn) {
    let [id, property] = key.split('_');
    id in cache ? {} : cache[id] = {};
    property in cache[id] ? {} : cache[id][property] = {};

    cache[id][property]['age'] = dataIn[key].Age_CE;
    cache[id][property]['values'] = dataIn[key].Value;
  }
};

// organizeInfo adds to each sediment core ID in the cache
// the respective lat/lon coordinates and any additional info.
var organizeInfo = function (textIn) {
  let text = textIn.split('\n').slice(1,);
  text.forEach((e) => {
    let [id, name, lake, lat, lon] = e.split('\t');
    id = `ID${String(id).padStart(2,0)}`;

    if (id in cache) {
      cache[id]['name'] = name;
      cache[id]['lake'] = lake;
      cache[id]['latitude'] = Number(lat);
      cache[id]['longitude'] = Number(lon);
    }
  });
};

// Populate the contents of the dropdown menu with the
// available properties for the selected sediment core
var populateDropdown = function (id) {
  data = [];
  Object.entries(cache[id]).forEach((el) => {
    if (typeof el[1] === 'object' & el[1] !== null) {
      data.push(el[0]);
    }
  });

  d3.select('.dropdown-content')
    .html('')
    .selectAll('a')
    .data(data).enter()
    .append('a')
      .attr('href', '#')
      .on('click', (val) => populateInfo(id, val.target.innerText))
      .append('text')
        .text(el => String(el));
};

// Populate information box
var populateInfo = function (id, property) {
  let lakeName = cache[id].lake;
  let longitude = cache[id].longitude;
  let latitude = cache[id].latitude;
  let ageData = cache[id][property].age;
  let valueData = cache[id][property].values;

  var infoText = [
    `<strong>ID:</strong> ${id}&emsp;<strong>Lake:</strong> ${lakeName}&emsp;<strong>Property:</strong> ${property}`,
    `<strong>Longitude:</strong> ${formatLongitude(longitude.toFixed(2))}&emsp;
     <strong>Latitude:</strong> ${formatLatitude(latitude.toFixed(2))}`,
    `<strong>Date Range:</strong> ${d3.min(ageData)} until ${d3.max(ageData)}`,
    `<strong>Min. Value:</strong> ${d3.min(valueData).toFixed(2)}<strong>&emsp;Max. Value:</strong> ${d3.max(valueData).toFixed(2)}`,
  ];

  // Start by removing any <p> tags inside the box
  // to reset its content
  d3.select('#info-container')
    .selectAll('p')
    .remove()

  // Now, we add the new information
  d3.select('#info-container')
    .selectAll('p')
    .remove()
    .data(infoText).enter()
    .append('p')
      .html((val) => val);
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
  initialize('data');
}, false);