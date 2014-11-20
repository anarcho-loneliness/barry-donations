# barry-donations
An evented API wrapper for [Barry's Donation Tracker](http://don.barrycarlyon.co.uk/), a service that makes tracking donations 
easier for Twitch broadcasters.

### Installation
```
npm install barry-donations
```

### Usage
```javascript
var BarryDonations = require('barry-donations');

// Barry's API pushes new donations to an endpoint located at 'hostname'
// barry-donations takes care of making and listening to the endpoint, but you must supply the hostname
var options = {
    username: 'user',
    password: 'pass',
    hostname: 'yourserver.com', // don't add "http://", https currently unsupported
    port: 1234,                 // optional, will use a random port if not supplied
    reconnect: true             // optional, attempt to automatically reconnect when disconnected. defaults to true.
};
var bd = new BarryDonations(options);

bd.on('connected', function (e) {
    console.log('connected');
});

bd.on('connectfail', function (e) {
    console.error(e);
});

bd.on('error', function (e) {
    console.error(e);
});

bd.on('disconnected', function (e) {
    console.error(e);
});

bd.on('initialized', function (data) {
    console.log("[init]" + data);
});
bd.on('newdonations', function (data) {
    console.log("[newdonations] " + data);
});
```

### Contributing
1. Fork it ( http://github.com/langeh/barry-donations/fork )
2. Create your feature branch (`git checkout -b my-new-feature`)
3. Commit your changes (`git commit -am 'Add some feature'`)
4. Push to the branch (`git push origin my-new-feature`)
5. Create a new Pull Request

### License
barry-donations is provided under the MIT license, which is available to read in the [LICENSE][] file.

### Credits
[Barry Carlyon](http://barrycarlyon.co.uk/), developer of [Barry's Donation Tracker](http://don.barrycarlyon.co.uk/)
