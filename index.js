var OMXPlayer = require('./lib/omxplayer');

var configuration = {};

var omxplayer = new OMXPlayer(configuration);
console.log(omxplayer);
omxplayer.start("movie.mkv");
