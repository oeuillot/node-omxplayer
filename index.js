var OMXPlayer = require('./lib/omxplayer');
var commander;
try {
	commander = require('commander');

} catch (x) {
	console.error("You must install the package 'commander' for this sample !  (npm install commander)");
	process.exit(1);
}

commander.version(require("./package.json").version);

commander.option("-b, --blank", "Set background to black");
commander.option("-o, --adev <device>", "Audio out device");
commander.option("-p, --passthrough", "Audio passthrough");
commander.option("-d, --deinterlace", "Deinterlacing");
commander.option("-y, --hdmiclocksync", "Display refresh rate to match video");
commander.option("-z, --nohdmiclocksync", "Do not adjust display refresh rate to match video");
commander.option("--timeout <float>", "Timeout for stalled file/network operations (seconds)", parseFloat);
commander.option("--orientation <int>", "Set orientation of video (0, 90, 180 or 270)", parseInt);
// commander.option(" --loop", "Loop file. Ignored if file not seekable");
commander.option("--vol <volume>", "Set initial volume in millibels (default 0)", parseFloat);
commander.option("--path <omxPlayerPath>", "Path of omxplayer");

commander.command('*').description("node-omxplayer <filename> [filenames ...]").action(function(fileNames) {

	var omxplayer = new OMXPlayer(commander);

	var list = Array.prototype.slice.call(arguments);

	function start() {
		var next = list.shift();

		console.log("Start movie", next);

		omxplayer.start(next, function(error) {
			if (error) {
				console.error("Start: ", error);
				return;
			}
		});
	}

	omxplayer.on("stopped", start);

	start();
});

commander.parse(process.argv);
