var OMXPlayer = require('./lib/omxplayer');

var configuration = {

};

var omxplayer = new OMXPlayer(configuration);
omxplayer.start("movie.mkv");

omxplayer._sessionBus.getInterface('org.mpris.MediaPlayer2.omxplayer', '/org/mpris/MediaPlayer2', 'interface',
		function(error, iface) {
			if (error) {
				console.error("Get interface error:", error);
				return;
			}
			iface.getProperties(function(error, props) {
				console.log('Properties:');
				console.log(props);
			});
		});
