var fs = require('fs');

var OMXPlayer = require('./lib/omxplayer');
var commander;
try {
	commander = require('commander');

} catch (x) {
	console.error("You must install the package 'commander' for this sample !  (npm install commander)");
	process.exit(1);
}

commander.version(require("./package.json").version);

OMXPlayer.fillCommanderOptions(commander);

commander.command('*').description("node-omxplayer <filename> [filenames ...]").action(function(fileNames) {

	var omxplayer = new OMXPlayer(commander);

	var list = Array.prototype.slice.call(arguments, 0, arguments.length - 1);

	console.log("Arguments=", list);

	function start() {
		if (!list.length) {
			console.log("Last movie done !");
			return;
		}
		var next = list.shift();

		var stream = fs.openSync(next, 'r');

		console.log("Start movie", next, " stream=", stream);

		omxplayer.stream(stream, function(error) {
			fs.close(stream);

			if (error) {
				console.error("Start error: ", error);
				return;
			}

			omxplayer.once("stopped", start);
		});
	}

	start();
});

commander.parse(process.argv);
