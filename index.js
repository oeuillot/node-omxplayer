var OMXPlayer = require('./lib/omxplayer');

var configuration = {};

var omxplayer = new OMXPlayer(configuration);
console.log(omxplayer);
omxplayer.start("movie.mkv", function(error) {
	if (error) {
		console.error("Start: ", error);
		return;
	}
});
