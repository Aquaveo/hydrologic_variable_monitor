const App = (() => {
    'use strict';
    // Global variables from base.html
    // URL_GETMAPID - string, url of api call to get tile layer url
    // SOURCES - JSON of ee sources by variable
    const URL_OPENSTREETMAP = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    const eeTile = "COPERNICUS/S2_SR/20210109T185751_20210109T185931_T10SEG"

    const csrftoken = document.querySelector('[name=csrfmiddlewaretoken]').value

    ////////////////////////////////////////////////// DOM Elements
    const selectVariable = document.getElementById("select-variable")
    const selectSource = document.getElementById("select-source")
    const btnLoadMap = document.getElementById("load-map")
    const btnClearMap = document.getElementById("clear-map")
    const btnPlotSeries = document.getElementById("plot-series")
    const btnCompare = document.getElementById("compare")
    const btnInstructions = document.getElementById("instructions")
    const btnDownload = document.getElementById("download")
    const btnLatLong = document.getElementById("lat-lon")
    const usrLat = document.getElementById('lat')
    const usrLon = document.getElementById('lon')
    //const btnComparePrecip = document.getElementById('compare-humedad')
    const btnRegion = document.getElementById('region')
    const selectRegion = document.getElementById('regions')
    const year = document.getElementById("select-year")


    const download = function (data, file_name) {

        // Creating a Blob for having a csv file format
        // and passing the data with type
        const blob = new Blob([data], {type: 'text/csv'});

        // Creating an object for downloading url
        const url = window.URL.createObjectURL(blob)

        // Creating an anchor(a) tag of HTML
        const a = document.createElement('a')

        // Passing the blob downloading url
        a.setAttribute('href', url)

        // Setting the anchor tag attribute for downloading
        // and passing the download file name
        a.setAttribute('download', file_name);

        // Performing a download with click
        a.click()
    }

    ////////////////////////////////////////////////// Map and Map Layers

    let image_layer;
    let map;
    let controlL;
    let input_spatial = "";
    let isPoint = false;
    let point;
    let definedRegion = false;

    L.Control.Layers.include({
        getOverlays: function () {
            // create hash to hold all layers
            let control, layers;
            layers = {};
            control = this;

            // loop thru all layers in control
            control._layers.forEach(function (obj) {
                let layerName;

                // check if layer is an overlay
                if (obj.overlay) {
                    // get name of overlay
                    layerName = obj.name;
                    // store whether it's present on the map or not
                    return layers[layerName] = control._map.hasLayer(obj.layer);
                }
            });

            return layers;
        }
    });

    map = L.map('map').setView([20, -40], 3);

    image_layer = L.tileLayer('', {
        opacity: 0.5, attribution: '<a href="https://earthengine.google.com" target="_">' + 'Google Earth Engine</a>;'
    }).addTo(map);

    const positron = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '©OpenStreetMap, ©CartoDB'
    }).addTo(map);

    let baseMaps = {"Basemap": positron}
    let varMaps = {"Satellite Observation": image_layer}

    controlL = L.control.layers(baseMaps, varMaps, {position: 'bottomleft'})
    controlL.addTo(map);

    // FeatureGroup is to store editable layers
    let drawnItems = new L.FeatureGroup().addTo(map);
    //allow people to enter a region on the map - as for now only a point
    let drawControl = new L.Control.Draw({
        edit: {
            featureGroup: drawnItems, edit: true,
        }, draw: {
            marker: false,
            polyline: false,
            circle: false,
            polygon: true,
            rectangle: true,
            trash: true,
        },
    });
    map.addControl(drawControl);

    btnInstructions.onclick = () => {
        $('#myModal').modal()
    }

    const getVarSourceJSON = () => {
        return {
            "variable": selectVariable.value,
            "source": selectSource.value,
            "region": input_spatial,
            "isPoint": isPoint,
            "year": year.value,
            "definedRegion": false
        }
    }
    let province_json = L.geoJSON(false)

    selectRegion.onchange = () => {
        if (isPoint === true) {
            map.removeLayer(point);
            isPoint = false;
        }
        drawnItems.clearLayers()
        //get geojson url and add it to my map using fetch
        province_json.clearLayers();
        let geojsons = selectRegion.value
        if (geojsons != "") {
            let url = staticGeoJSON + geojsons + ".json"
            fetch(url)
                .then(response => response.json())
                .then(json => province_json.addData(json).addTo(map))
            map.flyTo([-0.987891, -80.834077], 6)
        }
        if (geojsons == "") {
            map.flyTo([20, -40], 3)
        }
    }


    btnRegion.onclick = () => {
        const dataParams = getVarSourceJSON()
        if (dataParams.variable === "" || dataParams.source === "") return
        dataParams.region = selectRegion.value
        //check that it is a variable that can be compared
        $("#loading-icon").addClass("appear");
        $.ajax({
            type: "GET", url: URL_GETPREDEFINED, datatype: "JSON", data: dataParams, success: function (data) {
                $("#loading-icon").removeClass("appear");
                $('#chart_modal').modal("show")

                const averages = JSON.parse(data['avg'])
                const y2d = JSON.parse(data['y2d'])
                const title = data['title']
                const yaxis = data['yaxis']

                const temp_extracted_avg = Object.values(averages.data_values)
                const temp_extracted_y2d = Object.values(y2d.data_values)

                const date_extracted_avg = Object.values(averages.date)
                const date_extracted_y2d = Object.values(y2d.date)

                const year_2_date = {
                    x: date_extracted_y2d, y: temp_extracted_y2d, mode: 'lines', name: "El año hasta la fecha"
                };

                const average = {
                    x: date_extracted_avg,
                    y: temp_extracted_avg,
                    mode: 'lines',
                    name: "Los promedios de los últimos 30 años"
                };

                const date_plt = [year_2_date, average];
                const layout = {
                    legend: {
                        x: 0, y: 1, traceorder: 'normal', font: {
                            family: 'sans-serif', size: 12, color: '#000'
                        }, bgcolor: '#E2E2E2', bordercolor: '#FFFFFF', borderwidth: 2
                    }, title: title, xaxis: {
                        title: 'día del año'
                    }, yaxis: {
                        title: yaxis
                    }
                };
                Plotly.newPlot('chart', date_plt, layout);
                btnDownload.onclick = () => {
                    let list_avg = ['date,value']
                    average.x.forEach((num1, index) => {
                        const num2 = average.y[index];
                        list_avg.push((num1 + "," + num2));
                    })
                    let csvContent_avg = list_avg.join("\n");
                    download(csvContent_avg, "averages")
                    let list_y2d = ['date,value']
                    year_2_date.x.forEach((num1, index) => {
                        const num2 = year_2_date.y[index];
                        list_y2d.push((num1 + "," + num2));
                    })
                    let csvContent_y2d = list_y2d.join("\n");
                    download(csvContent_y2d, "year-to-date")
                }

            }
        })
    }


    btnLatLong.onclick = () => {
        drawnItems.clearLayers()
        if (isPoint === true) {
            map.removeLayer(point);
            isPoint = false;
        }
        $('#lat-lon-modal').modal()
        const btnSave = document.getElementById('save')
        btnSave.onclick = () => {
            point = L.marker([usrLon.value, usrLat.value]).addTo(map);
            map.flyTo([usrLon.value, usrLat.value], 5)
            isPoint = true;
            $('#lat-lon-modal').modal("hide");


        }
    }

    btnLoadMap.onclick = () => {
        const dataParams = getVarSourceJSON()
        if (dataParams.variable === "" || dataParams.source === "") return
        $("#loading-icon").addClass("appear");

        $.ajax({
            type: "GET", url: URL_GETMAPID, datatype: "JSON", data: dataParams, success: function (data) {
                $("#loading-icon").removeClass("appear");
                if (data["success"] === true) {
                    //get url and set it then add it to the map
                    image_layer.setUrl(data.water_url)
                    map.addLayer(image_layer)
                }
            }
        })
    }

    selectVariable.onchange = (e) => selectSource.innerHTML = SOURCES[e.target.value].map(src => `<option value="${src}">${src}</option>`).join("")

    btnClearMap.onclick = () => {
        //remove image by deleting url
        image_layer.setUrl('')
        map.removeLayer(image_layer)
    }

    btnCompare.onclick = () => {
        const dataParams = getVarSourceJSON()
        province_json.clearLayers();
        if (selectRegion.value != "") {
            dataParams.definedRegion = true
            dataParams.region = selectRegion.value
            //get geojson url and add it to my map using fetch
            let geojsons = selectRegion.value
            let url = staticGeoJSON + geojsons + ".json"
            fetch(url)
                .then(response => response.json())
                .then(json => province_json.addData(json).addTo(map))
        }
        if (dataParams.isPoint == true) {
            dataParams.region = JSON.stringify([usrLat.value, usrLon.value])
        }
        //check that it is a variable that can be compared
        if (dataParams.variable === "" || dataParams.variable === "soil_moisture" || dataParams.region === "") return
        $("#loading-icon").addClass("appear");

        $.ajax({
            type: "GET", url: URL_COMPARE, datatype: "JSON", data: dataParams, success: function (data) {
                $("#loading-icon").removeClass("appear");
                $('#chart_modal').modal("show")


                //get variables from json for graph - all comparisons have gldas and era5
                const era5 = JSON.parse(data['era5'])
                const gldas = JSON.parse(data['gldas'])
                const title = data['title']
                const yaxis = data['yaxis']

                const era5_extracted_val = Object.values(era5.data_values)
                const gldas_extracted_val = Object.values(gldas.data_values)

                const era5_extracted_date = Object.values(era5.date)
                const gldas_extracted_date = Object.values(gldas.date)

                const era5_plt = {
                    x: era5_extracted_date, y: era5_extracted_val, mode: 'lines', name: "era5"
                };

                const gldas_plt = {
                    x: gldas_extracted_date, y: gldas_extracted_val, mode: 'lines', name: "gldas"
                };

                let data_plt = [era5_plt, gldas_plt]

                //add imerg and chirps if it is precipitation
                if (dataParams.variable == "precip") {
                    const imerg = JSON.parse(data['imerg'])
                    const chirps = JSON.parse(data['chirps'])
                    const imerg_extracted_val = Object.values(imerg.data_values)
                    const imerg_extracted_date = Object.values(imerg.date)
                    const imerg_plt = {
                        x: imerg_extracted_date, y: imerg_extracted_val, mode: 'lines', name: "imerg"
                    };
                    const chirps_extracted_val = Object.values(chirps.data_values)
                    const chirps_extracted_date = Object.values(chirps.date)
                    const chirps_plt = {
                        x: chirps_extracted_date, y: chirps_extracted_val, mode: 'lines', name: "chirps"
                    };
                    data_plt = [era5_plt, gldas_plt, chirps_plt, imerg_plt];
                }

                const layout = {
                    legend: {
                        x: 0, y: 1, traceorder: 'normal', font: {
                            family: 'sans-serif', size: 12, color: '#000'
                        }, bgcolor: '#E2E2E2', bordercolor: '#FFFFFF', borderwidth: 2
                    }, title: title, xaxis: {
                        title: 'day of year'
                    }, yaxis: {
                        title: yaxis
                    }

                };
                Plotly.newPlot('chart', data_plt, layout);
                btnDownload.onclick = () => {
                    let list_era5 = ['date,value']
                    era5_plt.x.forEach((num1, index) => {
                        const num2 = era5_plt.y[index];
                        list_era5.push((num1 + "," + num2));
                    })
                    let csvContent_era5 = list_era5.join("\n");
                    download(csvContent_era5, "era5_averages")
                    let list_gldas = ['date,value']
                    gldas_plt.x.forEach((num1, index) => {
                        const num2 = gldas_plt.y[index];
                        list_gldas.push((num1 + "," + num2));
                    })
                    let csvContent_gldas = list_gldas.join("\n");
                    download(csvContent_gldas, "gldas_averages")
                    if (dataParams.variable === "precip") {
                        const imerg = JSON.parse(data['imerg'])
                        const chirps = JSON.parse(data['chirps'])
                        const imerg_extracted_val = Object.values(imerg.data_values)
                        const imerg_extracted_date = Object.values(imerg.date)
                        const imerg_plt = {
                            x: imerg_extracted_date, y: imerg_extracted_val, mode: 'lines', name: "imerg"
                        };
                        const chirps_extracted_val = Object.values(chirps.data_values)
                        const chirps_extracted_date = Object.values(chirps.date)
                        const chirps_plt = {
                            x: chirps_extracted_date, y: chirps_extracted_val, mode: 'lines', name: "chirps"
                        };
                        let list_imerg = ['date,value']
                        imerg_plt.x.forEach((num1, index) => {
                            const num2 = imerg_plt.y[index];
                            list_imerg.push((num1 + "," + num2));
                        })
                        let csvContent_imerg = list_imerg.join("\n");
                        download(csvContent_imerg, "imerg_averages")
                        let list_chirps = ['date,value']
                        chirps_plt.x.forEach((num1, index) => {
                            const num2 = chirps_plt.y[index];
                            list_chirps.push((num1 + "," + num2));
                        })
                        let csvContent_chirps = list_chirps.join("\n");
                        download(csvContent_chirps, "chirps_averages")
                    }
                }
            }
        })
        isPoint = false;
    }

    btnPlotSeries.onclick = () => {
        const dataParams = getVarSourceJSON()
        if (dataParams.isPoint === true) {
            dataParams.region = JSON.stringify([usrLat.value, usrLon.value])
        }
        if (dataParams.variable === "" || dataParams.source === "" || dataParams.region === "") return
        $("#loading-icon").addClass("appear");

        $.ajax({
            type: "GET", url: URL_GETPLOT, datatype: "JSON", data: dataParams, success: data => {
                $('#chart_modal').modal("show")
                $("#loading-icon").removeClass("appear");
                //data = JSON.parse(data)
                //get variable for plan from json
                const averages = JSON.parse(data['avg'])
                const y2d = JSON.parse(data['y2d'])
                const title = data['title']
                const yaxis = data['yaxis']

                const temp_extracted_avg = Object.values(averages.data_values)
                const temp_extracted_y2d = Object.values(y2d.data_values)

                const date_extracted_avg = Object.values(averages.date)
                const date_extracted_y2d = Object.values(y2d.date)

                const year_2_date = {
                    x: date_extracted_y2d, y: temp_extracted_y2d, mode: 'lines', name: "El año hasta la fecha"
                };

                const average = {
                    x: date_extracted_avg,
                    y: temp_extracted_avg,
                    mode: 'lines',
                    name: "Los promedios de los últimos 30 años"
                };

                const date_plt = [year_2_date, average];
                const layout = {
                    legend: {
                        x: 0, y: 1, traceorder: 'normal', font: {
                            family: 'sans-serif', size: 12, color: '#000'
                        }, bgcolor: '#E2E2E2', bordercolor: '#FFFFFF', borderwidth: 2
                    }, title: title, xaxis: {
                        title: 'día del año'
                    }, yaxis: {
                        title: yaxis
                    }
                };
                Plotly.newPlot('chart', date_plt, layout);
                btnDownload.onclick = () => {
                    let list_avg = ['date,value']
                    average.x.forEach((num1, index) => {
                        const num2 = average.y[index];
                        list_avg.push((num1 + "," + num2));
                    })
                    let csvContent_avg = list_avg.join("\n");
                    download(csvContent_avg, "averages")
                    let list_y2d = ['date,value']
                    year_2_date.x.forEach((num1, index) => {
                        const num2 = year_2_date.y[index];
                        list_y2d.push((num1 + "," + num2));
                    })
                    let csvContent_y2d = list_y2d.join("\n");
                    download(csvContent_y2d, "year-to-date")
                }

            }
        })
        isPoint = false;
    }

    map.on(L.Draw.Event.CREATED, e => {
        province_json.clearLayers()
        if (isPoint === true) {
            map.removeLayer(point);
            isPoint = false;
        }
        drawnItems.clearLayers()
        drawnItems.addLayer(e.layer);
        input_spatial = JSON.stringify(e.layer.toGeoJSON());
    });

    return {}
})();
