var fs = require('fs'),
    extend = require('extend');

var config = {
    host: 'localhost',
    port: 9090
};

// Load user config if it exists, and merge it
if (fs.existsSync('config.json')) {
    var userConfig = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    extend (true, config, userConfig);
}

module.exports = config;
