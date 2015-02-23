var OMXPlayer = require('./lib/omxplayer');

var configuration = {};

var omxplayer = new OMXPlayer(configuration);
omxplayer.start("movie.mkv");
