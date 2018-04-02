var fs = require("fs"),
  d3 = require("d3"),
  debug = require("debug")("fs");

console.log("*" + " Procesing data");

var csvPath = "../hackatino_2017_bicicoruna.csv",
  stationsPath = "../estaciones.json",
  outputPath = "./data/data.json";

d3
  .queue()
  .defer(fs.readFile, stationsPath)
  .defer(fs.readFile, csvPath)
  .awaitAll(function(error, files) {
    if (error) throw debug(error);
    else console.log("* Files loaded");

    console.log("* Processing...");
    var json = JSON.parse(files[0].toString()).data,
      data = files[1].toString();

    var dsv = d3.dsvFormat(";", "utf-8"),
      csv = dsv.parse(data);

    csv = csv.filter(function(d) {
      var inicio = new Date(d.INICIO_TRAYECTO),
        fin = new Date(d.FIN_TRAYECTO),
        isTravel = true;

      // 60000 = 1 minutes
      if (fin - inicio < 60000) {
        isTravel = false;
      }

      return !isNaN(d.ID_DESTINO) && isTravel;
    });

    var stations = json.map(function(d) {
      return {
        id: d.Feed.assetId,
        name: d.Feed.assetName,
        0: d.Feed.geometry.coordinates[0],
        1: d.Feed.geometry.coordinates[1],
        dest: []
      };
    });

    var stationsData = d3.map(stations, function(d) {
      return d.id;
    });

    var comb = {},
      maxByStation = {},
      stops = {};

    // hasmap to get all possible combinations
    for (var i = 0; i < csv.length; i++) {
      var combination = [csv[i].ID_ORIGEN, csv[i].ID_DESTINO],
        row = csv[i],
        stop = row.ID_ORIGEN,
        goal = row.ID_DESTINO;

      var source = stationsData.get(row.ID_ORIGEN),
        target = stationsData.get(row.ID_DESTINO);

      // to calculate max travels in each combination
      if (combination in comb) {
        comb[combination].count += 1;
      } else {
        comb[combination] = {
          count: 1,
          origen: row.ORIGEN,
          destino: row.DESTINO,
          id_origen: row.ID_ORIGEN,
          id_destino: row.ID_DESTINO
        };
        source.dest.push([source, target]);
      }

      // to calculate prop
      if (stop in maxByStation) {
        maxByStation[stop].total += 1;
        if (comb[combination].count > maxByStation[stop].max) {
          maxByStation[stop].max = comb[combination].count;
        }
      } else {
        maxByStation[stop] = { max: 1, total: 1 };
      }
    }
    var combArray = d3.entries(comb);

    var combById = [];

    combArray.forEach(function(d) {
      combById[d.value.id_origen] = {
        Origen: d.value.origen,
        id_origen: d.value.id_origen,
        Destino: d.value.destino,
        id_destino: d.value.id_destino,
        value: maxByStation[d.value.id_origen].total
      };
    });

    // final file
    stations.forEach(function(z) {
      z.dest = z.dest
        .map(function(d) {
          return {
            from: d[0].name,
            to: d[1].name,
            from_id: d[0].id,
            to_id: d[1].id,
            from_lat_lng: [d[0][0], d[0][1]],
            to_lat_lng: [d[1][0], d[1][1]],
            max_combin: comb[d[0].id + "," + d[1].id].count,
            max_travels: maxByStation[d[0].id].max,
            prop:
              comb[d[0].id + "," + d[1].id].count / maxByStation[d[0].id].max
          };
        })
        .sort(function(a, b) {
          return d3.descending(a.prop, b.prop);
        });
    });
    fs.writeFile(outputPath, JSON.stringify(stations), function(err) {
      if (err) console.err(error);
      else console.log("* File successfully created");
    });
  });
