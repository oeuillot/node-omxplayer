var OMXPlayer = require('./lib/omxplayer');

var configuration = {

};

var omxplayer = new OMXPlayer(configuration);
omxplayer.start("movie.mkv");

var omxPlayerService = sessionBus.getService('org.mpris.MediaPlayer2.omxplayer');
console.debug("Omx player service=", omxPlayerService);

var omxPlayerNotificationsInterface = omxPlayerService.getInterface('/org/mpris/MediaPlayer2',
		'org.freedesktop.Notifications');
console.debug("Omx player interface=", omxPlayerNotificationsInterface);
