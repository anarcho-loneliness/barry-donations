'use strict';

module.exports = function(grunt) {
    grunt.initConfig({
        jshint: {
            files: ['index.js', 'lib/**/*.js'],
            options: {
                jshintrc: true
            }
        },
        watch: {
            files: ['<%= jshint.files %>'],
            tasks: ['jshint']
        }
    });

    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-watch');

    grunt.registerTask('default', ['jshint']);
};