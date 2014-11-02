var cache = [];

module.exports = {
    add: function(bdObj) {
        var index = this.find(bdObj.options.username);

        if (index >= 0)
            return false;

        cache.push(bdObj);
        return true;
    },

    // Returns -1 if username not found in any cached barry-donations objects
    // Else, returns position of cached object in cache array
    find: function(username) {
        var len = cache.length;
        for (var i = 0; i < len; i++) {
            if (cache[i].options.username === username) {
                return i;
            }
        }

        return -1;
    },

    remove: function(username) {
        var index = this.find(username);

        if (index < 0)
            return false;

        cache.splice(index, 1);
        return true;
    },

    get: function(index) {
        return cache[index];
    }
};

