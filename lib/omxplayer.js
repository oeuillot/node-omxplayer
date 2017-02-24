/*jslint node: true */
"use strict";

var Util = require('util');
var child_process = require('child_process');
var Events = require('events');
var fs = require('fs');
var assert = require('assert');
var Path = require('path');
const debug = require('debug')('omxplayer');

var DBus = require('dbus-native');

var invokeSemaphore = require('semaphore')(1);

var NO_CACHE_CONTROL = "no-cache, private, no-store, must-revalidate, max-stale=0, max-age=1, post-check=0, pre-check=0";

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

	this._log = configuration.log || console.log;
	this._error = configuration.error || console.error;

	this.dbusPath = configuration.dbusPath || DEFAULT_PATH;
	this.dbusDestination = configuration.dbusDestination || DEFAULT_DESTINATION;
	this.poolIntervalMs = configuration.poolIntervalMs || 1000;

	configuration.omxPlayerPath = configuration.omxPlayerPath || "omxplayer";

	this._liveProperties = configuration.liveProperties || [ "Volume", "Position", "PlaybackStatus" ];

	configuration.expressPath = configuration.expressPath || "/omx";
	this.express = this._express.bind(this);

	this.properties = {
		Volume: 0,
		Position: -1,
		PlaybackStatus: "Stopped"
	};

	var self = this;
	process.on('exit', function(code) {
		var omxProcess = self._omxProcess;
		if (!omxProcess) {
			return;
		}
		self._omxProcess = undefined;

		self._log("Kill processus");

		try {
			omxProcess.kill('SIGKILL');
			omxProcess.disconnect();
		} catch (x) {
			self._error("EXIT event: kill omxProcess error", x);
		}
	});
}

Util.inherits(OMXPlayer, Events.EventEmitter);
module.exports = OMXPlayer;

OMXPlayer.prototype.stream = function(stream, options, callback) {
	if (!stream) {
		throw new Error("Stream is NULL");
	}
	if (typeof (options) === "function") {
		callback = options;
		options = null;
	}

	if (!options) {
		options = {};
	}

	options.spawnOptions = options.spawnOptions || {};

	options.spawnOptions.stdio = [ stream, "pipe", "pipe" ];

	return this.start("pipe:0", options, callback);
};

OMXPlayer.prototype.start = function(moviePath, options, callback) {
	var configuration = this._configuration;

	if (typeof (options) === "function") {
		callback = options;
		options = null;
	}
	if (!options) {
		options = {};
	}

	var self = this;

	this.stop(function(error) {

		if (!moviePath) {
			if (!callback) {
				return;
			}
			return callback();
		}

		if (configuration.omxPlayerPath) {
			var parameters = [ "--no-keys" ];
			if (configuration.omxPlayerParams) {
				parameters = parameters.concat(configuration.omxPlayerParams);
			}
			if (configuration.blank) {
				parameters.push('-b');
			}
			if (configuration.genlog) {
				parameters.push('--genlog');
			}
			if (configuration.adev) {
				parameters.push('--adev', configuration.adev);
			}
			if (configuration.passthrough) {
				parameters.push('--passthrough');
			}
			if (configuration.hdmiclocksync) {
				parameters.push('--hdmiclocksync');
			}
			if (configuration.nohdmiclocksync) {
				parameters.push('--nohdmiclocksync');
			}
			if (configuration.timeout) {
				parameters.push('--timeout', configuration.timeout);
			}

			if (options.orientation) {
				parameters.push('--orientation', options.orientation);

			} else if (configuration.orientation) {
				parameters.push('--orientation', configuration.orientation);
			}

			if (options["3d"]) {
				parameters.push('--3d', options["3d"]);
			}
			if (options.audioStreamIndex) {
				parameters.push('--aidx', options.audioStreamIndex);
			}
			if (options.showSubtitleIndex) {
				parameters.push('--sid', options.showSubtitleIndex);
			}
			if (options.positionSeconds) {
				parameters.push('--pos', options.positionSeconds);
			}
			if (options.subtitles) {
				parameters.push('--subtitles', options.subtitles);
			}

			if (self.properties.Volume !== undefined) {
				parameters.push('--vol', self.properties.Volume);

			} else if (options.volume !== undefined) {
				parameters.push('--vol', options.volume);

			} else if (configuration.vol || configuration.volume) {
				parameters.push('--vol', configuration.vol || configuration.volume);
			}

			var sessionBus;

			var dbusName = DEFAULT_DESTINATION + "_" + process.getgid() + "_" + (dbusIdentifier++);
			self.dbusDestination = dbusName;

			parameters.push("--dbus_name", dbusName);

			parameters.push(moviePath);

			self._log("Execute  '" + configuration.omxPlayerPath + "' parameters=", parameters, " spawnOptions=",
					options.spawnOptions);

			var omxProcess = child_process.spawn(configuration.omxPlayerPath, parameters, options.spawnOptions);
			self._omxProcess = omxProcess;

			if (options.spawnFunc) {
				options.spawnFunc(omxProcess);
			}

			omxProcess.stderr.on('data', function(data) {
				self._error('omxPlayer.err: ' + data);
			});

			omxProcess.stdout.on('data', function(data) {
				self._log('omxPlayer.out: ' + data);
			});

			omxProcess.on('close', function(code) {
				self._log('omxProcesss exited with code ' + code);

				self._destroy(omxProcess, sessionBus);
				omxProcess = null;
				sessionBus = null;
				self._sessionBus=null;
			});

			self.emit("omxPlayerLaunched", omxProcess);
		}

		var tryCount = 5;
		setTimeout(function waitDbus() {
			if (!configuration.dbus) {

				var dbusAddressFilename = configuration.dbusAddressFilename || DEFAULT_DBUS_ADDRESS_FILENAME;

				if (!fs.existsSync(dbusAddressFilename)) {

					var dbusAddressFilename2 = dbusAddressFilename + "." + process.env.USER;

					if (!fs.existsSync(dbusAddressFilename2)) {
						if (!tryCount--) {
							return callback("Can not get the dbus address  (try content of filename " + dbusAddressFilename2 + ")");
						}

						setTimeout(waitDbus, 50);
						return;
					}

					dbusAddressFilename = dbusAddressFilename2;
				}

				var addr = fs.readFileSync(dbusAddressFilename).toString();
				if (!addr) {
					if (!tryCount--) {
						return callback("Can not get the dbus address  (Empty content for filename " + dbusAddressFilename2 + ")");
					}

					setTimeout(waitDbus, 50);
					return;
				}

				configuration.dbus = {
					busAddress: addr
				};

				self._log("Dbus address=", configuration.dbus.busAddress);
			}

			sessionBus = DBus.sessionBus(configuration.dbus);
			self._sessionBus = sessionBus;

			self.emit("sessionBusOpened", sessionBus);

			// console.log("SessionBus=", this._sessionBus);

			setTimeout(function waitSync() {

				// console.log("Get identity ?");

				if (!sessionBus) {
					// Big Problem !
					return callback("Can not launch omxplayer");
				}

				self.getIdentity(function(error, id) {
					if (error || !id) {
						self._error("Waiting omxplayer launch throws error=", error);

						setTimeout(waitSync, 50);
						return;
					}

					debug("waitDBUS", "Success to attach dbus");
					
					self.properties = {
						Volume: self.properties.Volume,
						Filename: moviePath
					};
					self.emit("prop:Filename", moviePath, null);
					self.emit("property", {
						Filename: moviePath
					}, {
						Filename: null
					});

					var ps = [].concat(dbusProperties, omxProperties);
					self._poolProperties(ps, function() {
						self._notificationsIntervalId = setInterval(function() {
							self._poolProperties(self._liveProperties);
						}, self.poolIntervalMs);
					});

					self.emit("playing", moviePath, options);

					// console.log("Success ! ", id);
					return callback(null, id);
				});

			}, 50);
		}, 50);
	});
}

OMXPlayer.prototype._poolProperties = function(ps, callback) {
	var self = this;
	var properties = self.properties;
	var oldValues = {};
	var newValues = {};
	var modifiedCount = 0;

	ps = ps.slice();

	function property() {
		if (!ps.length) {
			if (modifiedCount) {
				// self._log("Emit 'property' newValues=", newValues, " oldValues=",
				// oldValues);
				self.emit("property", newValues, oldValues);
			}

			if (callback) {
				callback();
			}
			return;
		}

		var name = ps.shift();

		self["get" + name].call(self, function(error, value) {
			if (error) {
				self._error("Can not get property '" + name + "'", error);

				setImmediate(property);
				return;
			}

			if (properties[name] !== value) {
				oldValues[name] = properties[name];
				properties[name] = value;
				newValues[name] = value;
				modifiedCount++;

				// console.log("Property '" + name + "' changed to " + value);

				// self._log("Emit 'prop:" + name + "' newValue=", value, " oldValue=",
				// oldValues[name]);
				self.emit("prop:" + name, value, oldValues[name]);
			}

			setImmediate(property);
		});
	}

	property();
};

OMXPlayer.prototype._dbusInvoke = function(interf, memberName, signature, body, callback) {

	var params = {
		destination: this.dbusDestination,
		path: this.dbusPath,
		'interface': interf,
		member: memberName
	};
	if (signature) {
		params.signature = signature;
	}
	if (body) {
		params.body = body;
	}

	var self = this;
	invokeSemaphore.take(function() {
		var sessionBus = self._sessionBus;
		if (!sessionBus) {
			invokeSemaphore.leave();
			callback("SessionBus is null");
			return;
		}
		return sessionBus.invoke(params, function(error, value) {
			invokeSemaphore.leave();

			if (error) {
				if (!callback) {
					self._error("DBus command error", error);
					return;
				}
				return callback(error);
			}

			if (!callback) {
				return;
			}

			return callback(null, value);
		});
	});
};

var dbusProperties = [ "CanQuit",
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
	"Volume" ];
dbusProperties.forEach(function(name) {
	OMXPlayer.prototype["get" + name] = function(callback) {
		assert(typeof (callback) === "function", "Invalid callback parameter");

		return this._dbusInvoke(DBUS_INTERFACE_PROPERTIES, name, null, null, callback);
	};
});

var omxProperties = [ "ListSubtitles", "ListAudio", "ListVideo" ];
omxProperties.forEach(function(name) {
	OMXPlayer.prototype["get" + name] = function(callback) {
		assert(typeof (callback) === "function", "Invalid callback parameter");

		return this._dbusInvoke(OMXPLAYER_DBUS_INTERFACE_PLAYER, name, null, null, callback);
	};
});

var dbusCommandsParameter0 = [ "Mute", "Unmute" ];
var dbusCommandsParameter1 = [ "Volume" ];
dbusCommandsParameter0.forEach(function(name) {
	OMXPlayer.prototype[name.substring(0, 1).toLowerCase() + name.substring(1)] = function(callback) {
		return this._dbusInvoke(DBUS_INTERFACE_PROPERTIES, name, null, null, callback);
	};
});

var omxCommandsParameter0 = [ "Next",
	"Previous",
	"Pause",
	"PlayPause",
	"Stop",
	"HideVideo",
	"UnHideVideo",
	"ShowSubtitles",
	"HideSubtitles",
	"Quit" ];
var omxCommandsParameter1 = [ 'Position',
	'Seek',
	'VideoPos',
	'SelectSubtitle',
	'SelectAudio',
	'Action',
	'Start',
	'Play' ];

var systemCommands = [ "Reboot", "Halt" ];

var commands = [].concat(dbusCommandsParameter0, dbusCommandsParameter1, omxCommandsParameter0, omxCommandsParameter1,
		systemCommands);

omxCommandsParameter0.forEach(function(name) {
	OMXPlayer.prototype[name.substring(0, 1).toLowerCase() + name.substring(1)] = function(callback) {
		return this._dbusInvoke(OMXPLAYER_DBUS_INTERFACE_PLAYER, name, null, null, callback);
	};
});

OMXPlayer.prototype.seek = function(offset, callback) {
	if (typeof (offset) === "string") {
		offset = parseInt(offset, 10);
	}
	return this._dbusInvoke(OMXPLAYER_DBUS_INTERFACE_PLAYER, 'Seek', "x", [ offset ], callback);
};

OMXPlayer.prototype.setPosition = function(position, callback) {
	if (typeof (position) === "string") {
		position = parseInt(position, 10);
	}
	return this._dbusInvoke(OMXPLAYER_DBUS_INTERFACE_PLAYER, 'Position', "sx", [ '/not/used', position ], callback);
};

OMXPlayer.prototype.setVolume = function(volume, callback) {
	if (typeof (volume) === "string") {
		volume = parseFloat(volume);
	}
	if (!this._sessionBus) {
		this.properties.Volume = volume;

		if (!callback) {
			return;
		}
		return callback(null, volume);
	}

	return this._dbusInvoke(DBUS_INTERFACE_PROPERTIES, 'Volume', "d", [ volume ], callback);
};

OMXPlayer.prototype.setVideoPos = function(win, callback) {
	return this._dbusInvoke(OMXPLAYER_DBUS_INTERFACE_PLAYER, 'VideoPos', "os", [ '/not/used', win ], callback);
};

OMXPlayer.prototype.selectSubtitle = function(index, callback) {
	if (typeof (index) === "string") {
		index = parseInt(index, 10);
	}
	return this._dbusInvoke(OMXPLAYER_DBUS_INTERFACE_PLAYER, 'SelectSubtitle', "i", [ index ], callback);
};

OMXPlayer.prototype.selectAudio = function(index, callback) {
	if (typeof (index) === "string") {
		index = parseInt(index, 10);
	}
	return this._dbusInvoke(OMXPLAYER_DBUS_INTERFACE_PLAYER, 'SelectAudio', "i", [ index ], callback);
};

OMXPlayer.prototype.action = function(action, callback) {
	if (typeof (action) === "string") {
		action = parseInt(action, 10);
	}
	return this._dbusInvoke(OMXPLAYER_DBUS_INTERFACE_PLAYER, 'Action', "i", [ action ], callback);
};

OMXPlayer.prototype.stop = function(callback) {
	var self = this;

	if (!this._sessionBus) {
		if (callback) {
			callback();
		}
		return;
	}

	this._dbusInvoke(OMXPLAYER_DBUS_INTERFACE_PLAYER, "Stop", null, null, function(error) {
		if (error) {
			self._error("Stop error", error);
		}

		if (callback) {
			callback();
		}
	});
};

OMXPlayer.prototype.reboot = function(callback) {
	this._exec("sudo reboot", callback);
};

OMXPlayer.prototype.halt = function(callback) {
	this._exec("sudo halt", callback);
};

OMXPlayer.prototype._exec = function(cmd, callback) {
	child_process.exec(cmd, callback);
};

OMXPlayer.prototype._destroy = function(omxProcess, sessionBus) {

	var notificationsIntervalId = this._notificationsIntervalId;
	if (notificationsIntervalId) {
		this._notificationsIntervalId = undefined;
		clearInterval(notificationsIntervalId);
	}

	if (sessionBus) {
		try {
			sessionBus.end();
		} catch (x) {
			this._error("Bus end() error", x);
		}
		this.emit("sessionBusClosed", sessionBus);
	}

	if (omxProcess) {
		var oldPlaybackStatus = this.properties.PlaybackStatus;
		if (oldPlaybackStatus !== "Stopped") {
			var oldPosition = this.properties.Position;
			var oldFilename = this.properties.Filename;

			this.properties.PlaybackStatus = "Stopped";
			this.properties.Position = -1;
			this.properties.Filename = null;

			this.emit("prop:PlaybackStatus", "Stopped", oldPlaybackStatus);
			this.emit("prop:Position", 0, oldPosition);
			this.emit("prop:Filename", null, oldFilename);
			this.emit("property", {
				PlaybackStatus: "Stopped",
				Position: -1,
				Filename: null
			}, {
				PlaybackStatus: oldPlaybackStatus,
				Position: oldPosition,
				Filename: oldFilename
			});

			// this._log("Emit 'stopped' event");
			this.emit("stopped");
		}

		this._log("Kill OMX process connected=", omxProcess.connected);

		if (omxProcess.connected) {
			try {
				omxProcess.kill();
			} catch (x) {
				this._error("Kill omxProcess error", x);
			}

			this.emit("omxPlayerKilled", omxProcess);
		}
	}
}

OMXPlayer.prototype.play = function(path, callback) {
  if (/^http:/.exec(path)) {
    return this.start(path, {}, callback);
  }

	path = path.replace("/", Path.sep);

	if (this._configuration.moviesBasePath) {
		path = this._configuration.moviesBasePath + path;
	}

	if (!fs.existsSync(path)) {
		return callback("File is not exist '" + path + "'");
	}

	return this.start(path, {}, callback);
};

OMXPlayer.prototype._express = function(req, res, next) {
	var expressPath = this._configuration.expressPath;

	// console.log("Get request ", req.path);

	if (!expressPath) {
		console.error("No express path");
		return next();
	}

	if (req.path.indexOf(expressPath)) {
		return next();
	}

	// replace + and decode
	var path = req.path.substring(expressPath.length);

	path = decodeURIComponent(path.replace(/\+/g, ' '));

	// remove leading and trailing /
	path = path.replace(/^\/|\/$/g, '');

	var cmdName = path;
	var idx = path.indexOf('/');
	if (idx >= 0) {
		cmdName = cmdName.substring(0, idx);
		path = path.substring(idx + 1);
	} else {
		path = null;
	}

	// console.log("Perform command cmdName=", cmdName, " path=", path, "
	// reqPath=", req.path);

	var self = this;

	function resEnd(error, value) {
		var ret = {
			returnCode: "OK"
		};
		if (error) {
			ret.returnCode = "error";
			ret.error = error;
		}
		if (value !== undefined) {
			ret.value = value;
		}
		res.end(JSON.stringify(ret));
	}

	if (this.properties && this.properties[cmdName] !== undefined) {
		res.writeHead(200, {
			'Content-Type': 'application/json',
			'Cache-Control': NO_CACHE_CONTROL
		});

		var setter = "set" + cmdName;
		if (path && this[setter]) {
			console.log("Call setter of '" + cmdName + "' parameter=", path);

			this[setter].call(this, path, resEnd);
			return;
		}

		return resEnd(null, this.properties[cmdName]);
	}

	if (dbusProperties.indexOf(cmdName) >= 0) {
		res.writeHead(200, {
			'Content-Type': 'application/json',
			'Cache-Control': NO_CACHE_CONTROL
		});

		return resEnd("Player not launched");
	}

	if (commands.indexOf(cmdName) >= 0) {
		var c2 = cmdName.substring(0, 1).toLowerCase() + cmdName.substring(1);

		res.writeHead(200, {
			'Content-Type': 'application/json',
			'Cache-Control': NO_CACHE_CONTROL
		});

		if (omxCommandsParameter0.indexOf(cmdName) >= 0 || dbusCommandsParameter0.indexOf(cmdName) >= 0 ||
				systemCommands.indexOf(cmdName) >= 0) {
			return this[c2].call(this, resEnd);
		}

		return this[c2].call(this, path, resEnd);
	}

	if (cmdName === "Properties") {
		res.writeHead(200, {
			'Content-Type': 'application/json',
			'Cache-Control': NO_CACHE_CONTROL
		});

		return resEnd(null, this.properties);
	}

	console.log('Unknown command', cmdName);
	next();
};

OMXPlayer.fillCommanderOptions = function(commander) {
	commander.option("-b, --blank", "Set background to black");
	commander.option("-o, --adev <device>", "Audio out device");
	commander.option("-p, --passthrough", "Audio passthrough");
	commander.option("-d, --deinterlace", "Deinterlacing");
	commander.option("-y, --hdmiclocksync", "Display refresh rate to match video");
	commander.option("-z, --nohdmiclocksync", "Do not adjust display refresh rate to match video");
	commander.option("--timeout <float>", "Timeout for stalled file/network operations (seconds)", parseFloat);
	commander.option("--orientation <int>", "Set orientation of video (0, 90, 180 or 270)", parseInt);
	commander.option(" --loop", "Loop file. Ignored if file not seekable");
	commander.option("--vol <volume>", "Set initial volume in millibels (default 0)", parseFloat);
	commander.option("--path <omxPlayerPath>", "Path of omxplayer");
}
