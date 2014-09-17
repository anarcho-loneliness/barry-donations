var request = require('request'),
    util = require("util"),
    EventEmitter = require("events").EventEmitter;

function BarryDonations(options) {
    EventEmitter.call(this);

    this.options = options;

    this.validate();
}

util.inherits(BarryDonations, EventEmitter);

BarryDonations.prototype.validate = function() {
    var self = this;

    var url = 'http://don.barrycarlyon.co.uk/api.php?method=validate' +
        '&username=' + this.options.username +
        '&password=' + this.options.password +
        '&version=' + this.options.version;

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
            console.error("[BARRY-DONATIONS] Failed to validate: " + error);
        }
    });
};

BarryDonations.prototype.init = function() {
    var self = this;

    var url = 'http://don.barrycarlyon.co.uk/api.php?method=initial' +
        '&username=' + this.options.username +
        '&password=' + this.options.password +
        '&version=' + this.options.version;

    request(url, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var bodyJSON = JSON.parse(body);

            bodyJSON.data.Completed.forEach(function(donation) {
                if (donation.utos > self.options.lasttos) {
                    self.options.lasttos = donation.utos;
                }
            });

            self.emitInit(bodyJSON.data, self.options.lasttos);

            //kill any existing fetch timers
            self.kill();

            //fetch new data (delta) from the api every 30 seconds
            self._fetchtimer = setInterval(self.fetch, 30000, self);
        } else {
            console.error("[BARRY-DONATIONS] Failed to get initial data: " + error);
        }
    });
};

BarryDonations.prototype.fetch = function(scope) {
    var url = 'http://don.barrycarlyon.co.uk/api.php?method=update' +
        '&username=' + scope.options.username +
        '&password=' + scope.options.password +
        '&version=' + scope.options.version +
        '&lasttos=' + scope.options.lasttos; //make sure we fetch this freshly from

    request(url, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var bodyJSON = JSON.parse(body);

            // this will be true if any donations have a newer timestamp than "lasttos"
            if (bodyJSON.flag === false) {
                return;
            }

            bodyJSON.data.Completed.forEach(function(donation) {
                if (donation.utos > scope.options.lasttos) {
                    scope.options.lasttos = donation.utos;
                }
            });

            scope.emitNewDonations(bodyJSON.data, scope.options.lasttos);
        } else {
            console.error("[BARRY-DONATIONS] Failed to fetch update: " + error);
        }
    });
};

BarryDonations.prototype.kill = function() {
    if(this._fetchtimer !== null) {
        clearInterval(this._fetchtimer);
        this._fetchtimer = null;
    }
};

BarryDonations.prototype.emitInit = function(data, lasttos) {
    this.emit("initialized", data, lasttos);
};

BarryDonations.prototype.emitNewDonations = function(data, lasttos) {
    this.emit("newdonations", data, lasttos);
};

module.exports = BarryDonations;
