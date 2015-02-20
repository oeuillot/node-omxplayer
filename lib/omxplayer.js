/*jslint node: true */
"use strict";

var Util = require('util');
var Exec = require('child_process').exec;
var Events = require('events');
var dbus = require('dbus-native');

function OMXPlayer(configuration) {
	configuration = configuration || {};

	this.configuration = configuration;

	this._sessionBus = dbus.sessionBus();
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
