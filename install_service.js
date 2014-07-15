// anzlabFrontEnd nodejs install service
// v0.1 20/05/2014
// needs node-windows

var path = require('path');
var Service = require('node-windows').Service;

var svc = new Service({
	name: 'anzlabFrontEnd',
	description: 'nodeJS Web Server for ANZ LAB Dashboard',
	script: path.resolve(__dirname + '/server.js')
});

svc.on('install', function() {
	svc.start();
});

svc.install();