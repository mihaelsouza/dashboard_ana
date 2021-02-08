// Read JSON data from a local source and create
// the necessary auxiliary variables inside cache.
var cache = {};
var getData = async function (url) {
  // Start with organizeData()
  let response = await fetch(`${url}/location_data.json`);
  let resolve = await response.json();
  organizeData(resolve);

  // Now amend the proper lat/lon coordinates and some
  // additional miscellanious info for all sediment cores.
  response = await fetch(`${url}/location_info.txt`);
  resolve = await response.text();
  organizeInfo(resolve);

  //console.log(cache);
}

document.addEventListener('DOMContentLoaded', function () {
  getData('data');
}, false);

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