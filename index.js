// TODO: Detect if the server is down and attempt to re-validate on an increasing timer, like how Twitch chat reconnects

var express = require('express'),
    app = express(),
    bodyParser = require('body-parser'),
    portscanner = require('portscanner'),
    request = require('request'),
    util = require("util"),
    EventEmitter = require("events").EventEmitter;

app.use(bodyParser.json());

function BarryDonations(options) {
    EventEmitter.call(this);

    this.options = {
        username: options.username,
        password: options.password,
        hostname: options.hostname
    };

    this._version = 'asper';
    this._endpoint = '';
    this._pingtimer = null;

    var self = this;

    // Find the first available port. Asynchronously checks, so first port
    // determined as available is returned.
    portscanner.findAPortNotInUse(3000, 60000, '127.0.0.1', function(error, port) {
        app.listen(port);

        app.get('/bd', function(req, res) {
            if (req.param('method') === 'ping') {
                res.status(200).send('pong');
            } else {
                res.status(400).send('Bad request');
            }
        });

        app.post('/bd', function(req, res) {
            if (req.param('method') === 'donation') {
                self.emitNewDonations(req.body.data);
            } else {
                res.status(400).send('Bad request');
            }
        });

        self._endpoint = 'http://' + self.options.hostname + ':' + port + '/bd';

        self.validate();
    });
}

util.inherits(BarryDonations, EventEmitter);

BarryDonations.prototype.validate = function() {
    var self = this;

    var url = 'http://don.barrycarlyon.co.uk/nodecg.php?method=validate' +
        '&username=' + this.options.username +
        '&password=' + this.options.password +
        '&version=' + this._version +
        '&endpoint=' + this._endpoint;

    request(url, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var bodyJSON = JSON.parse(body);

            if (bodyJSON.status !== "ok") {
                console.error("[BARRY-DONATIONS] Failed to validate, API returned status: " + bodyJSON.status);
                return;
            }

            self.settings = bodyJSON.settings;

            self.init();
        } else {
            console.error("[BARRY-DONATIONS] Failed to validate (" + response.statusCode + "): " + error);
        }
    });
};

BarryDonations.prototype.init = function() {
    var self = this;

    var url = 'http://don.barrycarlyon.co.uk/nodecg.php?method=initial' +
        '&username=' + this.options.username +
        '&password=' + this.options.password +
        '&version=' + this._version;

    request(url, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var bodyJSON = JSON.parse(body);

            // process lasttos from all transaction types to minimize data packet size
            for (var key in bodyJSON.data) {
                if (bodyJSON.data.hasOwnProperty(key)) {
                    bodyJSON.data[key].forEach(function(donation) {
                        if (donation.utos > self.options.lasttos) {
                            self.options.lasttos = donation.utos;
                        }
                    });
                }
            }
            
            self.emitInit(bodyJSON.data, self.options.lasttos);

            //kill any existing ping timers
            self._killtimer();

            //fetch new data (delta) from the api every 300 seconds
            self._pingtimer = setInterval(self.ping, 300 * 1000, self);
        } else {
            console.error("[BARRY-DONATIONS] Failed to get initial data: " + error);
        }
    });
};

BarryDonations.prototype.ping = function(scope) {
    var url = 'http://don.barrycarlyon.co.uk/nodecg.php?method=ping' +
        '&username=' + scope.options.username +
        '&password=' + scope.options.password +
        '&version=' + scope._version;

    request(url, function (error, response, body) {
        if (error || response.statusCode != 200) {
            console.error("[BARRY-DONATIONS] Failed to keepalive: " + error);
        }
    });
};

BarryDonations.prototype.logout = function() {
    this._killtimer();

    var url = 'http://don.barrycarlyon.co.uk/nodecg.php?method=logout' +
        '&username=' + this.options.username +
        '&password=' + this.options.password +
        '&version=' + this.options.version;

    request(url, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var bodyJSON = JSON.parse(body);

            if (bodyJSON.status !== "ok") {
                console.error("[BARRY-DONATIONS] Failed to logout, API returned status: " + bodyJSON.status);
            }
        } else {
            console.error("[BARRY-DONATIONS] Failed to get logout: " + error);
        }
    });
};

BarryDonations.prototype._killtimer = function() {
    if(this._pingtimer !== null) {
        clearInterval(this._pingtimer);
        this._pingtimer = null;
    }
};

BarryDonations.prototype.emitInit = function(data, lasttos) {
    this.emit("initialized", data, lasttos);
};

BarryDonations.prototype.emitNewDonations = function(data, lasttos) {
    this.emit("newdonations", data, lasttos);
};

module.exports = BarryDonations;
