// Read JSON data from a local source and create
// the necessary auxiliary variables inside cache.
var cache = {};
var initialize = async function (url) {
  await getData(`${url}/location_data.json`, 'json', organizeData);
  await getData(`${url}/location_info.txt`, 'text', organizeInfo);

  plotMap();
}

// Create the initial map view
var plotMap = function () {
  let svg = d3.select('#map-svg');
  let g = svg.append('g'); // General element, necessary to include zooming

  let boundingBox = d3.select('#map-canvas').node().getBoundingClientRect();
  let width = boundingBox.width;
  let height = boundingBox.height;

  // Include zoom & pan functionality on map
  const zoom = d3.zoom()
                .scaleExtent([-1, 100])
                .on('zoom', (event) => {
                  svg.selectAll('path') // The zooming affects the state of the g element inside the svg
                    .attr('transform', event.transform);
                });
  svg.call(zoom);

  // Plot the map by reading the topojson file and appending the path
  // generator to to the general element within svg.
  d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json")
    .then(function (topology) {
      // We first need to create a geojson from the topojson we are loading in.
      let geojson = topojson.feature(topology, topology.objects.countries)

      let projection = d3.geoOrthographic()
                    .rotate([0, -90])
                    .fitSize([width, height], geojson)
                    .precision(.1);

      let path = d3.geoPath()
                  .projection(projection);

      // Add the geojson features to the map SVG, using the path generator.
      g.selectAll('path')
        .data(geojson.features) // We only want the features from the geojson
        .enter().append('path')
        .attr('d', path)
        .attr('fill', '#bdab56')
        .call(zoom);
  });
}

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

// On loading the DOM...
document.addEventListener('DOMContentLoaded', function () {
  initialize('data');
}, false);