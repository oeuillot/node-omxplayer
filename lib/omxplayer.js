/*jslint node: true */
"use strict";

var Util = require('util');
var child_process = require('child_process');
var Events = require('events');
var fs = require('fs');
var assert = require('assert');

var DBus = require('dbus-native');

var DEFAULT_DBUS_ADDRESS_FILENAME = "/tmp/omxplayerdbus";

var DEFAULT_DESTINATION = 'org.mpris.MediaPlayer2.omxplayer';
var DEFAULT_PATH = '/org/mpris/MediaPlayer2';
var DBUS_INTERFACE_PROPERTIES = 'org.freedesktop.DBus.Properties';
var OMXPLAYER_DBUS_INTERFACE_PLAYER = 'org.mpris.MediaPlayer2.Player';

var dbusIdentifier = 0;

function OMXPlayer(configuration) {
	Events.EventEmitter.call(this);

	configuration = configuration || {};

	this._configuration = configuration;

	this.dbusPath = configuration.dbusPath || DEFAULT_PATH;
	this.dbusDestination = configuration.dbusDestination || DEFAULT_DESTINATION;

	configuration.omxPlayerPath = configuration.omxPlayerPath || "omxplayer";
}

Util.inherits(OMXPlayer, Events.EventEmitter);
module.exports = OMXPlayer;

OMXPlayer.prototype.start = function(moviePath, callback) {
	var configuration = this._configuration;

	var sessionBus = this._sessionBus;
	if (sessionBus) {
		this.emit("closeSessionBus");
		this._sessionBus = null;
		try {
			sessionBus.end();
		} catch (x) {
			console.error(x);
		}
	}

	var omxProcess = this._omxProcess;
	if (omxProcess) {
		this._omxProcess = null;

		console.log("Kill OMX process");

		if (omxProcess.connected) {
			this.emit("killOMXPlayer");

			try {
				omxProcess.kill();
				omxProcess.disconnect();
			} catch (x) {
				console.error(x);
			}
		}
	}

	if (!moviePath) {
		if (!callback) {
			return;
		}
		return callback();
	}

	if (configuration.omxPlayerPath) {
		var parameters = [ "-b", "-o", "hdmi", "-p" ];
		if (configuration.omxPlayerParams) {
			parameters = parameters.concat(configuration.omxPlayerParams);
		}

		var dbusName = DEFAULT_DESTINATION + "_" + process.getgid() + "_" + (dbusIdentifier++);
		this.dbusDestination = dbusName;

		parameters.push("--dbus_name", dbusName);

		parameters.push(moviePath);

		console.log("Execute  '" + configuration.omxPlayerPath + "' parameters=", parameters);

		omxProcess = child_process.spawn(configuration.omxPlayerPath, parameters);
		this._omxProcess = omxProcess;

		omxProcess.stderr.on('data', function(data) {
			console.error('omxPlayer: ' + data);
		});

		omxProcess.stdout.on('data', function(data) {
			console.log('omxPlayer: ' + data);
		});

		omxProcess.on('close', function(code) {
			console.log('omxProcess is ended');

			self.emit("exited");

			self.start(null);
		});
	}

	if (!configuration.dbus) {
		configuration.dbus = {};

		var dbusAddressFilename = configuration.dbusAddressFilename || DEFAULT_DBUS_ADDRESS_FILENAME;

		if (!fs.existsSync(dbusAddressFilename)) {

			var dbusAddressFilename2 = dbusAddressFilename + "." + process.env.USER;

			if (!fs.existsSync(dbusAddressFilename2)) {
				throw new Error("Can not get the dbus address  (try content of filename " + dbusAddressFilename2 + ")");
			}

			dbusAddressFilename = dbusAddressFilename2;
		}

		configuration.dbus.busAddress = fs.readFileSync(dbusAddressFilename).toString();

		console.info("Dbus address=", configuration.dbus.busAddress);
	}

	this._sessionBus = DBus.sessionBus(configuration.dbus);

	// console.log("SessionBus=", this._sessionBus);

	var self = this;
	setTimeout(function waitSync() {

		// console.log("Get identity ?");

		self.getIdentity(function(error, id) {
			if (error || !id) {
				console.error("Wait error ", error);
				setTimeout(waitSync, 250);
				return;
			}

			console.log("Success ! ", id);
			return callback();
		});

	}, 100);
}

OMXPlayer.prototype._dbusProperty = function(propertyName, callback) {
	assert(typeof (callback) === "function", "Invalid callback parameter");

	var params = {
		destination: this.dbusDestination,
		path: this.dbusPath,
		'interface': DBUS_INTERFACE_PROPERTIES,
		member: propertyName
	};

	return this._sessionBus.invoke(params, function(error, value) {
		if (error) {
			return callback(error);
		}

		return callback(null, value);
	});
};

OMXPlayer.prototype._dbusCommand = function(memberName, signature, body, callback) {

	var params = {
		destination: this.dbusDestination,
		path: this.dbusPath,
		'interface': OMXPLAYER_DBUS_INTERFACE_PLAYER,
		member: memberName
	};
	if (signature) {
		params.signature = signature;
	}
	if (body) {
		params.body = body;
	}

	return this._sessionBus.invoke(params, function(error, value) {
		if (error) {
			if (!callback) {
				console.error("DBus command error", error);
				return;
			}
			return callback(error);
		}

		if (!callback) {
			return;
		}

		return callback(null, value);
	});
};

[ "Position",
	"PlaybackStatus",
	"CanQuit",
	"Fullscreen",
	"CanSetFullscreen",
	"CanRaise",
	"HasTrackList",
	"Identity",
	"SupportedUriSchemes",
	"SupportedMimeTypes",
	"CanGoNext",
	"CanGoPrevious",
	"CanSeek",
	"CanControl",
	"CanPlay",
	"CanPause",
	"PlaybackStatus",
	"Position",
	"Aspect",
	"VideoStreamCount",
	"ResWidth",
	"ResHeight",
	"Duration",
	"MinimumRate",
	"MaximumRate",
	"Volume",
	"ListSubtitles",
	"ListAudio",
	"ListVideo" ].forEach(function(name) {
	OMXPlayer.prototype["get" + name] = function(callback) {
		return this._dbusProperty(name, callback);
	};
});

[ "Next",
	"Previous",
	"Pause",
	"PlayPause",
	"Stop",
	"Mute",
	"Unmute",
	"HideVideo",
	"UnHideVideo",
	"ShowSubtitles",
	"HideSubtitles",
	"Quit" ].forEach(function(name) {
	OMXPlayer.prototype[name.substring(0, 1).toLowerCase() + name.substring(1)] = function(callback) {
		return this._dbusCommand(name, null, null, callback);
	};
});

OMXPlayer.prototype.seek = function(offset, callback) {
	return this._dbusCommand('Seek', "x", [ offset ], callback);
};

OMXPlayer.prototype.setPosition = function(position, callback) {
	return this._dbusCommand('Position', "sx", [ '', position ], callback);
};

OMXPlayer.prototype.setVolume = function(volume, callback) {
	return this._dbusCommand('Volume', "d", [ volume ], callback);
};

OMXPlayer.prototype.setVideoPos = function(win, callback) {
	return this._dbusCommand('VideoPos', "os", [ '', win ], callback);
};

OMXPlayer.prototype.selectSubtitle = function(index, callback) {
	return this._dbusCommand('SelectSubtitle', "i", [ index ], callback);
};

OMXPlayer.prototype.selectAudio = function(index, callback) {
	return this._dbusCommand('SelectAudio', "i", [ index ], callback);
};

OMXPlayer.prototype.action = function(action, callback) {
	return this._dbusCommand('Action', "i", [ action ], callback);
};

OMXPlayer.prototype.release = function() {

};
