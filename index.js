var OMXPlayer = require('./lib/omxplayer');

var configuration = {};

var omxplayer = new OMXPlayer(configuration);
console.log(omxplayer);
omxplayer.start("movie.mkv", function(error) {
	if (error) {
		console.error("Start: ", error);
		return;
	}

	setInterval(function() {

		omxplayer.getPosition(function(error, position) {
			if (error) {
				console.error("GetPosition returns error", error);
				return;
			}
			console.log("Position=", position);
		});

	}, 1000);
});
