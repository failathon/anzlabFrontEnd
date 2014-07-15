// anzlabFrontEnd nodejs server module
// v0.2 18/06/2014

/*
    Changelog:
        * added BUGS (routing)
*/

var fs = require('fs');
var os = require('os');
var path = require('path');
var util = require('util');
var http = require('http');
var url = require('url');
var connect = require('connect');
var exec = require('child_process').exec;

var App_port = 81;
var app_router;

var debug=0;

var timer_getInstanceList_lock = 0;

var basedir = path.resolve(__dirname);
var baseHTML = path.resolve(basedir + '/HTML');
var basepowershell = path.resolve(basedir + '/powershell');
var PSHgetInstanceList = path.resolve(basepowershell + '/getInstanceList.ps1');
var PSHgetInstanceListOutput = path.resolve(basepowershell + '/getInstanceList.txt');

app_router = http.createServer(function(req, res){
    // your normal server code
    var req_path = url.parse(req.url).pathname;
    if(debug) util.puts('app_router: debug: path is ' + req_path);
    switch (req_path){
        case '/':
        	fs.readFile(path.resolve(baseHTML + '/index.html'), function(err, data){
                if (err){ 
                    return send404(res);
                }
                res.writeHead(200, {'Content-Type': 'text/html'});
                res.write(data, 'utf8');
                res.end();
            });
        	break;
        case '/rest':
        	app_getInstanceList(req, res);
        	break;
        default:
    		if(req_path.indexOf("/rdp/")!=-1) {
                app_sendRDPlink(req, res, req_path);
                break;
            }

            var ctype = 'text/html';
            // BUG: this causes Resource interpreted as Image but transferred with MIME type text/css: "http://xxx/css/ui-lightness/images/ui-bg_highlight-soft_100_eeeeee_1x100.png". 
            // probably best that detection be based on extension, not on path
    		if(req_path.indexOf("/css")!=-1) ctype = 'text/css';
    		if(req_path.indexOf("/img")!=-1) ctype = 'image/gif';
    		if(req_path.indexOf("/js")!=-1) ctype = 'application/javascript';

        	fs.readFile(path.resolve(baseHTML + req_path), function(err, data){
                if (err){ 
                	if(debug) util.puts('app_router: debug: failed to send ' + req_path);
                    return send404(res);
                }
                res.writeHead(200, {'Content-Type': ctype});
                res.write(data, 'utf8');
                res.end();
            });
        	break;
    }
}),

send404 = function(res){
    res.writeHead(404);
    res.write('404');
    res.end();
};

function my_exec(command, callback) {
    var proc = exec(command);

    var list = [];
    proc.stdout.setEncoding('utf8');

    proc.stdout.on('data', function (chunk) {
        list.push(chunk);
    });

    proc.stdout.on('end', function () {
        callback(list.join());
    });
}

function timer_getInstanceList() {
    if(debug) util.puts('timer_getInstanceList: triggered');
    if(timer_getInstanceList_lock == 1) {
        util.puts('timer_getInstanceList: lock in-place, exiting...');
    }

    var cmd = 'powershell.exe -Command ' + PSHgetInstanceList + ' -OutputFile ' + PSHgetInstanceListOutput;
    timer_getInstanceList_lock = 1;

	util.puts('timer_getInstanceList: locked');

    child = exec(cmd, function (error, stdout, stderr) {
        var peekresponse = stdout + '\n\nerror: ' + error + '\n\nstderr: ' + stderr;
        if(debug) util.puts('debug: ' + peekresponse);
    });

    // hack from http://stackoverflow.com/questions/8389974/how-to-run-commands-via-nodejs-child-process
    // need this to let powershell exit correctly and stop spawning neverending PSH sessions..
    child.stdin.write('\n');
    child.stdin.end();
    delete child;
    timer_getInstanceList_lock = 0;
    util.puts('timer_getInstanceList: unlocked');
}

function app_getInstanceList(req, res) {
	if(debug) util.puts('app_getInstanceList: triggered');
	if(debug) util.puts('app_getInstanceList: debug: reading ' + PSHgetInstanceListOutput);

	fs.readFile(PSHgetInstanceListOutput, function read(err, data){
		if (err) {
			throw err;
		}

		if(debug) util.puts('app_getInstanceList: debug: sending ' + data);
		res.setHeader('Content-type', 'application/json');
		res.write(data, 'utf8');
		res.end();
	});
     
	util.puts('app_getInstanceList: end');
}

function app_sendRDPlink(req, res, path){
    var address = path.replace('/rdp/', '');
    res.setHeader('Content-Type', 'application/x-rdp');
    res.setHeader('Content-Disposition', 'attachment; filename=' + address + '.rdp');
    res.end("full address:s:" + address + ":3389\r\nprompt for credentials:i:1");
}

// TODO: this is a problem?
app_router.listen(App_port);

util.puts('');
util.puts('***************************************************************************');
util.puts('Listening on http://localhost:' + App_port + '...');
util.puts('\nPaths:');
util.puts('  basedir: ' + basedir);
util.puts('  baseHTML: ' + baseHTML);
util.puts('  basepowershell: ' + basepowershell);
util.puts('');
util.puts('Timers:');
util.puts('  timer_getInstanceList trigger every 1000ms*60s*5m = 5 minutes');
setInterval(timer_getInstanceList, 1000*60*5);
util.puts('');
util.puts('Press Ctrl+C to stop');
util.puts('***************************************************************************');