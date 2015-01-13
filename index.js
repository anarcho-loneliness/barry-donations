'use strict';

var express = require('express'),
    app = express(),
    bodyParser = require('body-parser'),
    getPort = require('get-port'),
    request = require('request'),
    util = require('util'),
    Q = require('q'),
    EventEmitter = require('events').EventEmitter,
    cache = require('./lib/cache'),
    pjson = require('./package.json');

var MAX_RECONNECT_INTERVAL = 600;
var INITIAL_RECONNECT_INTERVAL = 2;

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
    options.reconnect = (typeof(options.reconnect) === 'undefined' ?  true : options.reconnect);

    this.options = {
        username: options.username,
        password: options.password,
        hostname: options.hostname,
        port: options.port,
        reconnect: options.reconnect
    };

    this._version = 'bd-' + pjson.version;
    this._endpoint = '';
    this._pingtimer = null;
    this._reconnectInterval = INITIAL_RECONNECT_INTERVAL;

    var self = this;
    cache.add(this);

    // If a port was provided, use that
    // Otherwise, find a random open one
    if (this.port) {
        gotPort(this.port);
    } else {
        getPort(function(err, port) {
            gotPort(port);
        });
    }

    function gotPort(port) {
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
                if (data) self.emit('newdonations', data);
            } else {
                res.status(400).send('Bad request');
            }
        });

        self._endpoint = 'http://' + self.options.hostname + ':' + port + '/bd';

        self.validate();
    }
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
        var estr = null;
        if (error) estr = util.format("Failed to validate:", error.message);
        else if (response.statusCode != 200) estr = util.format("Failed to validate, response code:", response.statusCode);

        if (estr) {
            self.emit('connectfail', new Error(estr));
            self.reconnect();
            return;
        }

        var bodyJSON = JSON.parse(body);
        if (bodyJSON.status !== 'ok') {
            self.emit('connectfail', new Error(util.format("Failed to validate, API returned status:", bodyJSON.status)));
            return;
        }

        self.settings = bodyJSON.settings;
        self._reconnectInterval = INITIAL_RECONNECT_INTERVAL;
        self.emit('connected');
        self.init();
    });
};

BarryDonations.prototype.init = function() {
    var self = this;

    var url = 'http://don.barrycarlyon.co.uk/nodecg.php?method=initial' +
        '&username=' + this.options.username +
        '&password=' + this.options.password +
        '&version=' + this._version;

    request(url, function (error, response, body) {
        var estr = null;
        if (error) estr = util.format("Failed to get initial data:", error.message);
        else if (response.statusCode != 200) estr = util.format("Failed to get initial data, response code:", response.statusCode);

        if (estr) {
            self.emit('connectfail', new Error(estr));
            self.reconnect();
            return;
        }

        var bodyJSON = JSON.parse(body);
        self.emit('initialized', bodyJSON.data);

        //kill any existing ping timers
        self._killtimer();

        //fetch new data (delta) from the api every 300 seconds
        self._pingtimer = setInterval(self.ping.bind(self), 300 * 1000);
    });
};

BarryDonations.prototype.ping = function() {
    var self = this;
    var url = 'http://don.barrycarlyon.co.uk/nodecg.php?method=ping' +
        '&username=' + this.options.username +
        '&password=' + this.options.password +
        '&version=' + this._version;

    request(url, function (error, response, body) {
        var estr = null;
        if (error) estr = util.format("Failed to keepalive:", error.message);
        else if (response.statusCode != 200) estr = util.format("Failed to keepalive, response code:", response.statusCode);

        if (estr) {
            self.emit('disconnected', new Error(estr));
            try {
                self.reconnect();
            } catch (e) {
                self.emit('reconnectfail', new Error('Failed to reconnect:', e.message))
            }
            return;
        }
    });
};

BarryDonations.prototype.reconnect = function() {
    if (this.options.reconnect === false) return;

    this._killtimer();

    // To avoid hammering Barry's API, each reconnect attempt will wait twice as long as the previous one
    // up to a maximum duration of MAX_RECONNECT_INTERVAL (10 minutes)
    this._reconnectInterval = (this._reconnectInterval >= MAX_RECONNECT_INTERVAL)
        ? MAX_RECONNECT_INTERVAL
        : this._reconnectInterval * 2;

    this.emit('reconnecting', this._reconnectInterval);
    var self = this;
    setTimeout(function () {
        try {
            self.validate.bind(self);
        } catch (e) {
            self.emit('reconnectfail', new Error('Failed to reconnect:', e.message));
        }
    }, self._reconnectInterval * 1000);
};

BarryDonations.prototype.resetCategory = function(category) {
    var url = 'http://don.barrycarlyon.co.uk/nodecg.php?method=reset' +
        '&username=' + this.options.username +
        '&password=' + this.options.password +
        '&reset=' + category;

    var deferred = Q.defer();
    request(url, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            var bodyJSON = JSON.parse(body);
            bodyJSON.status === 'ok'
                ? deferred.resolve(category)
                : deferred.reject(new Error('Failed to reset %s:', category, bodyJSON.status));
        } else {
            deferred.reject(new Error('Failed to reset', category));
        }
    });
    return deferred.promise;
};

BarryDonations.prototype.logout = function() {
    this._killtimer();
    var self = this;

    var url = 'http://don.barrycarlyon.co.uk/nodecg.php?method=logout' +
        '&username=' + this.options.username +
        '&password=' + this.options.password +
        '&version=' + this.options.version;

    request(url, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var bodyJSON = JSON.parse(body);

            if (bodyJSON.status !== 'ok') {
                self.emit('error', new Error('Failed to logout, API returned status:', bodyJSON.status));
            } else {
                cache.remove(self.options.uesrname);
            }
        } else {
            self.emit('error', new Error('Failed to logout:', error.message));
        }
    });
};

BarryDonations.prototype._killtimer = function() {
    if(this._pingtimer !== null) {
        clearInterval(this._pingtimer);
        this._pingtimer = null;
    }
};

module.exports = BarryDonations;
