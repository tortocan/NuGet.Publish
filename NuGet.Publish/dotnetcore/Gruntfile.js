/// <binding Clean='clean' />
/*global module */
module.exports = function (grunt) {
    'use strict';

    const nugetExt = '.nupkg';
    const path = require('path');

    var options = {
        paths: {
            xprojDirectory: path.resolve(),
            nugetDirectory: '.nupkg',
            xproj: grunt.file.expand({ filter: 'isFile', cwd: "./" }, ['*.xproj'])[0],
            nuspec: grunt.file.expand({ filter: 'isFile', cwd: "./" }, ['*.nuspec'])[0],
            projectJSON: grunt.file.expand({ filter: 'isFile', cwd: "./" }, ['project.json'])[0],
            projectJSONBak: grunt.file.expand({ filter: 'isFile', cwd: "./" }, ['project.bak'])[0],
            nuget: grunt.file.expand({ filter: 'isFile', cwd: "./" }, ['NuGet.exe'])[0]
        },
        nugetPushConfigurations: [
            {
                source: 'https://www.nuget.org/api/v2/package',
                appKey: process.env.NUGETKEY,
                isActive: false
            },
            {
                source: 'http://w28sdev05uat/Nuget/',
                appKey: process.env.NUGETKEYDEV,
                isActive: true
            }
        ]
    }
    function upadateVersion(projectJSONFile) {
        var versionArray = projectJSONFile.version.split('.');
        var date = new Date(projectJSONFile.dateCreated);
        var oneDay = 24 * 60 * 60 * 1000;
        var totalDays = Math.round(Math.abs((new Date(new Date().toLocaleDateString()).getTime() - date.getTime()) / (oneDay)))
        var major = parseInt(versionArray[0]);
        var minor = parseInt(versionArray[1]);
        var build = parseInt(versionArray[2]) + 1;
        var revision = totalDays;
        var version = [major, minor, build, revision].join('.');
        projectJSONFile.version = version;
        return version;
    }
    function updateNuSpec(assemblyVersion) {
        if (options.paths.nuspec !== undefined | null) {

            //Edit nuspec file.
            var xpath = require('xpath');
            var dom = require('xmldom').DOMParser;
            var xml = grunt.file.read(path.join(options.paths.xprojDirectory, options.paths.nuspec));
            var doc = new dom().parseFromString(xml);
            var version = xpath.select("//package/metadata/version", doc);
            //Update if not the same.
            if (assemblyVersion !== version[0].textContent) {
                version[0].textContent = assemblyVersion;
                grunt.file.write(path.join(options.paths.xprojDirectory, options.paths.nuspec), doc);
            }
        }
    }
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        clean: {
            nugetDirectory: [path.join(options.paths.nugetDirectory, '/**/*')]
        }
    });

    grunt.registerTask('updateVersion', 'Updates the version inside project.json', function () {
        if (options.paths.projectJSON !== undefined) {
            var projectJSONFile = grunt.file.readJSON(options.paths.projectJSON);
            if (options.paths.projectJSONBak === undefined) {
                grunt.file.write('project.bak', JSON.stringify(projectJSONFile, null, 2));
            }

            if (projectJSONFile.dateCreated === undefined) {
                projectJSONFile.dateCreated = new Date().toLocaleDateString();
                projectJSONFile.version = "1.0.0.0";
            } else {
                var version = updateVersion(projectJSONFile);
                updateNuSpec(version);
            }
            grunt.file.write('project.json', JSON.stringify(projectJSONFile, null, 2));
        }
    });

    grunt.registerTask('dotnetPack', 'Pack a nuget package', function () {
        var done = this.async();
        var nupkg = grunt.file.expand({ filter: 'isFile', cwd: options.paths.nugetDirectory }, ['*' + nugetExt]);
        grunt.util.spawn({
            cmd: 'dotnet',
            args: [
                'pack',
                '-o',
                options.paths.nugetDirectory
            ]
        }, function (error, result) {
            if (error) {
                grunt.log.error(error);
            } else {
                grunt.log.write(result);
            }
            done();
        });
    });

    grunt.registerTask('nugetSpec', 'Spec a nuget package', function () {
        var done = this.async();
        var nupkg = grunt.file.expand({ filter: 'isFile', cwd: options.paths.nugetDirectory }, ['*' + nugetExt]);
        grunt.util.spawn({
            cmd: path.join(options.paths.xprojDirectory, options.paths.nuget),
            args: [
                'spec',
                options.paths.xproj,
                '-f'
            ]
        }, function (error, result) {
            if (error) {
                grunt.log.error(error);
            } else {
                grunt.log.write(result);
            }
            done();
        });
    });

    grunt.registerTask('nugetPush', 'Publish a nuget package', function () {
        var nupkg = grunt.file.expand({ filter: 'isFile', cwd: options.paths.nugetDirectory }, ['*' + nugetExt]);
        var done = this.async();
        var async = grunt.util.async;
        async.forEach(options.nugetPushConfigurations, function (nugetPushConfiguration, callback) {
            if (nugetPushConfiguration.isActive) {
                grunt.util.spawn({
                    cmd: path.join(options.paths.xprojDirectory, options.paths.nuget),
                    args: [
                        'push',
                        path.join(options.paths.nugetDirectory, nupkg[0]),
                        nugetPushConfiguration.appKey,
                        '-Source',
                        nugetPushConfiguration.source

                    ]
                }, function (error, result) {
                    if (error) {
                        grunt.log.error(error);
                        return callback(error);
                    } else {
                        grunt.log.write(result);
                    }
                    callback();
                });
            } else {
                callback();
            }
        }, function (error) {
            done(!error);
        });
    });

    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.registerTask('publish', ['clean:nugetDirectory', 'dotnetPack', 'nugetPush']);
};