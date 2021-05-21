# Dashboard for Sediment Core data

It is deployed using github-pages, and can be accessed here: https://mihaelsouza.github.io/paleo_dashboard/

Intended as a small practice on creating a dashboard using HTML/CSS and Javascript (D3.js).
This website aims to provide an easy to use interface to displaying multiple time series of 
historical data derived form sediment core samples. The data can be filtered by desired properties
while a summary of the available data density is displayed on the bar graph on the right. The map is 
fully interactable/zoomable, and different sediment cores can be accessed either by clicking on
the respective dot over the map or searching for the core ID in the information box (with autocomplete
intellisense). Datasets focusing on the Holocene or only on the last 2 thousand years can be browsed
through by flipping the toggle at the center of the map.

The underlining data was compiled by Ana Dauner and represents available sediment core information
from global databases (e.g. PANGEA), focused on the Arctic region. All data is available on the data/ folder  
and the repo can be easily ran as it has no hard dependencies.
