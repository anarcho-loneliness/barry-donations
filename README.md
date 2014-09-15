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

var options = {
    username: "user",
    password: "pass",
    version: "ver"
};
var bd = new BarryDonations(options);

bd.on('initialized', function (data, lasttos) {
    console.log("[init]" + data);
});
bd.on('newdonations', function (data, lasttos) {
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