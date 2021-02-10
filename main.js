// Read JSON data from a local source and create
// the necessary auxiliary variables inside cache.
var cache = {};
var initialize = async function (url) {
  await getData(`${url}/location_data.json`, 'json', organizeData);
  await getData(`${url}/location_info.txt`, 'text', organizeInfo);

  plotMap();
  /*var url = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
  var svg = d3.select('#map-svg');
  d3.json(url, function(error, topology) {
    if (error) throw error;

    console.log("topojson", topology)
    var geojson = topojson.feature(topology, topology.objects.countries);
    console.log(geojson);

    svg.selectAll('path')
      .data(geojson.features)
      .enter()
      .append('path')
      .attr('d', d3.geo.path());
  });*/
}

// Create the initial map view
var plotMap = function () {
  let svg = d3.select('#map-svg');
  let boundingBox = d3.select('#map-canvas').node().getBoundingClientRect();
  let width = boundingBox.width;
  let height = boundingBox.height;

  // let long = d3.scaleLinear()
  //             .domain([0, width])
  //             .range([-180, 180]);

  // let lat = d3.scaleLinear()
  //             .domain([0, height])
  //             .range([90, -90]);

  // svg.on('mousemove', function() {
  //   var p = d3.mouse(this);
  //   projection.rotate([λ(p[0]), φ(p[1])]);
  //   svg.selectAll('path').attr('d', path);
  // });

  d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
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
      svg.selectAll('path')
        .data(geojson.features) // We only want the features from the geojson
        .enter().append('path')
        .attr('d', path);
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