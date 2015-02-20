/*jslint node: true */
"use strict";

var Util = require('util');
var Exec = require('child_process').exec;
var Events = require('events');
var fs = require('fs');

var DBus = require('dbus');

var DEFAULT_DBUS_ADDRESS_FILENAME = "/tmp/omxplayerdbus";

function OMXPlayer(configuration) {
	configuration = configuration || {};
	configuration.dbus = configuration.dbus || {};

	this.configuration = configuration;
/*
	if (!configuration.dbus.busAddress) {
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
	*/
	this._dbus=new DBus();

	this._sessionBus = this._dbus.getBus('session');
}

Util.inherits(OMXPlayer, Events.EventEmitter);
module.exports = OMXPlayer;

OMXPlayer.prototype.start = function(newPath) {
};

OMXPlayer.prototype.pause = function() {

};

OMXPlayer.prototype.stop = function() {

};

OMXPlayer.prototype.release = function() {

};
