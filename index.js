var OMXPlayer = require('./lib/omxplayer');

var configuration = {

};

var omxplayer = new OMXPlayer(configuration);
omxplayer.start("movie.mkv");

var omxPlayerService = omxplayer._sessionBus.getService('org.mpris.MediaPlayer2.omxplayer');
console.log("Omx player service=", omxPlayerService);

var omxPlayerNotificationsInterface = omxPlayerService.getInterface('/org/mpris/MediaPlayer2',
		'org.freedesktop.Notifications');
console.log("Omx player interface=", omxPlayerNotificationsInterface);
