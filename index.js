var express = require('express'),
    app = express(),
    bodyParser = require('body-parser'),
    getPort = require('get-port'),
    request = require('request'),
    util = require('util'),
    cache = require('./lib/cache'),
    EventEmitter = require('events').EventEmitter,
    pjson = require('./package.json');

app.use(bodyParser.json());

function BarryDonations(options) {
    // Check if a BarryDonations object with this username has already been made
    // If it has, returns that existing object instead of making a new one
    var cacheIndex = cache.find(options.username);
    if (cacheIndex >= 0) {
        return cache.get(cacheIndex);
    }

    EventEmitter.call(this);

    // Reconnect defaults to true
    options.reconnect = typeof options.reconnect !== 'undefined' ?  options.reconnect : true;

    this.options = {
        username: options.username,
        password: options.password,
        hostname: options.hostname,
        reconnect: options.reconnect
    };

    this._version = 'bd-' + pjson.version;
    this._endpoint = '';
    this._pingtimer = null;
    this._reconnectInterval = 1;

    var self = this;
    cache.add(this);

    getPort(function gotPort(err, port) {
        app.listen(port);

        app.get('/bd', function(req, res) {
            if (req.param('method') === 'ping') {
                res.status(200).send('pong');
            } else {
                res.status(400).send('Bad request');
            }
        });

        app.post('/bd', function(req, res) {
            var data = req.body.data;
            if (req.param('method') === 'donation') {
                self.emitNewDonations(data);
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

            if (bodyJSON.status !== 'ok') {
                console.error('[BARRY-DONATIONS] Failed to validate, API returned status:', bodyJSON.status);
                return;
            }

            self.settings = bodyJSON.settings;
            self._reconnectInterval = 1;
            self.init();
        } else {
            console.error('[BARRY-DONATIONS] Failed to validate ("' + response.statusCode + '"):', error);
            self.reconnect();
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
            self.emitInit(bodyJSON.data);

            //kill any existing ping timers
            self._killtimer();

            //fetch new data (delta) from the api every 300 seconds
            self._pingtimer = setInterval(self.ping.bind(self), 300 * 1000);
        } else {
            console.error('[BARRY-DONATIONS] Failed to get initial data:', error);
        }
    });
};

BarryDonations.prototype.ping = function() {
    var self = this;
    var url = 'http://don.barrycarlyon.co.uk/nodecg.php?method=ping' +
        '&username=' + this.options.username +
        '&password=' + this.options.password +
        '&version=' + this._version;

    request(url, function (error, response, body) {
        if (error || response.statusCode != 200) {
            console.error('[BARRY-DONATIONS] Failed to keepalive:', error);
            self.reconnect();
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

            if (bodyJSON.status !== 'ok') {
                console.error('[BARRY-DONATIONS] Failed to logout, API returned status:', bodyJSON.status);
            } else {
                cache.remove(this.options.uesrname);
            }
        } else {
            console.error('[BARRY-DONATIONS] Failed to get logout:', error);
        }
    });
};

BarryDonations.prototype._killtimer = function() {
    if(this._pingtimer !== null) {
        clearInterval(this._pingtimer);
        this._pingtimer = null;
    }
};

BarryDonations.prototype.emitInit = function(data) {
    this.emit('initialized', data);
};

BarryDonations.prototype.emitNewDonations = function(data) {
    this.emit('newdonations', data);
};

BarryDonations.prototype.resetCategory = function(category) {
    var url = 'http://don.barrycarlyon.co.uk/nodecg.php?method=reset' +
        '&username=' + this.options.username +
        '&password=' + this.options.password +
        '&reset=' + category;

    request(url, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var bodyJSON = JSON.parse(body);
            console.log('[BARRY-DONATIONS] Successfully reset', category);

            if (bodyJSON.status !== 'ok') {
                console.error('[BARRY-DONATIONS] Failed to logout, API returned status:', bodyJSON.status);
            }
        } else {
            console.error('[BARRY-DONATIONS] Failed to get logout:', error);
        }
    });
};

BarryDonations.prototype.reconnect = function() {
    if (this.options.reconnect === false) {
        return;
    }

    this._killtimer();
    this._reconnectInterval = this._reconnectInterval * 2;
    setTimeout(this.validate.bind(this), this._reconnectInterval * 1000);
    console.log('[BARRY-DONATIONS] Connection lost. Reconnecting in', this._reconnectInterval, 'seconds.');
};

module.exports = BarryDonations;
