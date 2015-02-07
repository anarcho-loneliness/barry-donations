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
    pjson = require('./package.json'),
    querystring = require('querystring');

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
            if (req.query.method === 'ping') {
                res.status(200).send('pong');
            } else {
                res.status(400).send('Bad request');
            }
        });

        app.post('/bd', function(req, res) {
            var data = req.body.data;
            if (req.query.method === 'donation') {
                if (data) self.emit('newdonations', data);
            } else {
                res.status(400).send('Bad request');
            }
        });

        self._endpoint = 'http://' + self.options.hostname + ':' + port + '/bd';

        self.validate();
    }

    this._apiCall = function (method, options, cb) {
        // If only two params were provided, assume second param is the callback and
        // that options will be just the defaults.
        if (typeof(cb) === 'undefined') {
            cb = options;
            options = {};
        }

        // Add default options
        options.version = this._version;
        options.username = this.options.username;
        options.password = this.options.password;

        // Turn query options into a query string
        options = querystring.stringify(options);

        // Combine everything into a URL for the desired API call
        var url = 'http://don.barrycarlyon.co.uk/nodecg.php?method=' + method +
            (options ? '&' + options : '');

        // Execute the request
        request(url, function (error, response, body) {
            if (error) {
                cb(error);
            } else if (response.statusCode !== 200) {
                cb(new Error('Status code for "'+method+'" was not "200": ' + response.statusCode));
            } else {
                cb(null, JSON.parse(body));
            }
        });
    };
}

util.inherits(BarryDonations, EventEmitter);

BarryDonations.prototype.validate = function() {
    var self = this;

    this._apiCall('validate', { endpoint: this._endpoint }, function(err, data) {
        if (err) {
            self.emit('connectfail', err);
            self.reconnect();
            return;
        }

        if (data.status !== 'ok') {
            self.emit('connectfail', new Error('Failed to validate, API returned status:' + data.status));
            return;
        }

        self.settings = data.settings;
        self._reconnectInterval = INITIAL_RECONNECT_INTERVAL;
        self.emit('connected');
        self.init();
    });
};

BarryDonations.prototype.init = function() {
    var self = this;

    this._apiCall('initial', function(err, data) {
        if (err) {
            self.emit('connectfail', err);
            self.reconnect();
            return;
        }

        if (data.status !== 'ok') {
            self.emit('connectfail', new Error('Failed to get initial data, API returned status:' + data.status));
            return;
        }

        self.emit('initialized', data);

        // Kill existing ping timer (if any)
        clearInterval(self._pingtimer);

        // Send a keepalive to Barry's server every 5 minutes
        self._pingtimer = setInterval(self.ping.bind(self), 300 * 1000);
    });
};

BarryDonations.prototype.ping = function() {
    var self = this;

    this._apiCall('ping', function(err) {
        if (err) {
            self.emit('disconnected', new Error('Failed to keepalive: ' + err.message));
            self.reconnect();
        }
    });
};

BarryDonations.prototype.reconnect = function() {
    if (this.options.reconnect === false) return;

    clearInterval(this._pingtimer);

    // To avoid hammering Barry's API, each reconnect attempt will wait twice as long as the previous one
    // up to a maximum duration of MAX_RECONNECT_INTERVAL (10 minutes)
    this._reconnectInterval = (this._reconnectInterval >= MAX_RECONNECT_INTERVAL)
        ? MAX_RECONNECT_INTERVAL
        : this._reconnectInterval * 2;

    this.emit('reconnecting', this._reconnectInterval);
    var self = this;
    setTimeout(function () {
        // Run validate() with the appropriate 'this' context
        self.validate.call(self);
    }, self._reconnectInterval * 1000);
};

BarryDonations.prototype.resetCategory = function(category) {
    var deferred = Q.defer();
    this._apiCall('reset', function(err, data) {
        if (err) {
            deferred.reject('error', new Error('Failed to reset: ' + err.message));
            return;
        }

        if (data.status !== 'ok') {
            deferred.reject('error', new Error('Failed to reset ' + category + ': ' + data.status));
        } else {
            deferred.resolve(category);
        }
    });
    return deferred.promise;
};

BarryDonations.prototype.logout = function() {
    clearInterval(this._pingtimer);
    var self = this;

    this._apiCall('logout', function(err, data) {
        if (err) {
            self.emit('error', new Error('Failed to logout: ' + err.message));
            return;
        }

        if (data.status !== 'ok') {
            self.emit('error', new Error('Failed to logout, API returned status: ' + data.status));
        } else {
            cache.remove(self.options.username);
        }
    });
};

module.exports = BarryDonations;
