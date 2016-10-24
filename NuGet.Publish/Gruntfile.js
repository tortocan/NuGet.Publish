/// <binding Clean='clean' />
/*global module */
module.exports = function (grunt) {
    'use strict';
    var getConfigurationName = require('edge').func(function () {
        /*
            using System.Threading.Tasks;
            using System.Runtime.InteropServices;
            #r "C:\Program Files (x86)\Common Files\Microsoft Shared\MSEnv\PublicAssemblies\envdte.dll"

            public class Startup
            {
                public async Task<object> Invoke(dynamic input)
                {
                    var dte = (EnvDTE.DTE)Marshal.GetActiveObject("VisualStudio.DTE");
                    return dte.Solution.SolutionBuild.ActiveConfiguration.Name;
                }
            }
        */
    });
    function getConfigurationNameFromCSharp() {
        var value = '';
        getConfigurationName(null, function (error, result) {
            if (error) throw error;
            value = result;
        });
        return value;
    }

    const nugetExt = '.nupkg';
    const path = require('path');
    var configurationName = getConfigurationNameFromCSharp();

    var options = {
        paths : {
            csprojDirectory: path.resolve(),
            nugetDirectory: '.nupkg',
            csproj: grunt.file.expand({ filter: 'isFile', cwd: "./" }, ['*.csproj'])[0],
            nuspec: grunt.file.expand({ filter: 'isFile', cwd: "./" }, ['*.nuspec'])[0],
            assemblyT4: path.join('Properties', 'AssemblyInfo.t4'),
            assembly: path.join('Properties', 'AssemblyInfo.cs')
        },
        nugetPushConfigurations: [
            {
                source: 'https://www.nuget.org/api/v2/package',
                appKey: process.env.NUGETKEY,
                isActive: true
            },
            {
                source: 'http://w28sdev05uat/Nuget/',
                appKey: process.env.NUGETKEYDEV,
                isActive : true
            }
        ],
        msBuildConfiguration : {
            projectConfigurations: configurationName,
            OutputPath: path.join('bin' , configurationName),
            targets: ['Rebuild'],
            verbosity : 'normal'
        }
    }

    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        clean: {
        nugetDirectory: [path.join(options.paths.nugetDirectory ,'/**/*')]
        },
        msbuild: {
            project: {
                src: [options.paths.csproj],
                options: {
                    projectConfigurations: options.msBuildConfiguration.projectConfigurations,
                    targets: options.msBuildConfiguration.targets,
                    stdout: true,
                    buildParameters: {
                        WarningLevel: 2,
                        OutputPath: options.msBuildConfiguration.OutputPath
                    },
                    nodeReuse: false,
                    verbosity: options.msBuildConfiguration.verbosity,
                    execOptions: {
                        maxBuffer: 1000 * 1024
                    }
                }
            }
        }
    });

    grunt.registerTask('getConfigurationName', 'Test', function () {
        var done = this.async();
        console.log(configurationName);
    });

    grunt.registerTask('updateAssembly', 'Triggers transform on t4 file.', function () {
        var done = this.async();
        grunt.util.spawn({
            cmd: path.join(process.env.CommonProgramFiles,
                'Microsoft Shared/TextTemplating/',
                process.env.VisualStudioVersion,
                '/texttransform.exe'),
            args: [
                path.join(options.paths.csprojDirectory, options.paths.assemblyT4)
            ]
        }, function (error, result) {
            if (error) {
                grunt.log.error(error);
            } else {
                grunt.log.write(result);
            }
            done();
        });
        if (options.paths.nuspec !== undefined | null) {
            //Get version from AssemblyInfo file.
            var assembly = grunt.file.read(path.join(options.paths.csprojDirectory, options.paths.assembly));
            var major = assembly.split('\n')[0].replace('// Major= ', '');
            var minor = assembly.split('\n')[1].replace('// Minor= ', '');
            var build = assembly.split('\n')[2].replace('// Build= ', '');
            var revision = assembly.split('\n')[3].replace('// Revision= ', '');
            var assemblyVersion = [major, minor, build, revision].join('.').replace(/(\r\n|\n|\r)/gm, '');
            //Edit nuspec file.
            var xpath = require('xpath');
            var dom = require('xmldom').DOMParser;
            var xml = grunt.file.read(path.join(options.paths.csprojDirectory, options.paths.nuspec));
            var doc = new dom().parseFromString(xml);
            var version = xpath.select("//package/metadata/version", doc);
            //Update if not the same.
            if (assemblyVersion !== version[0].textContent) {
                version[0].textContent = assemblyVersion;
                grunt.file.write(path.join(options.paths.csprojDirectory, options.paths.nuspec), doc);
            }
        }
    });

    grunt.registerTask('nugetPack', 'Create a nuget package', function () {
        var done = this.async();
        if (!(grunt.file.exists(options.paths.nugetDirectory))) {
            grunt.util.spawn({
                cmd: 'powershell.exe',
                args: [
                    'mkdir ' + options.paths.nugetDirectory
                ]
            }, function (error, result) {
                if (error) {
                    grunt.log.error(error);
                } else {
                    grunt.log.write(result);
                }
            });
        }
        var packPath = options.paths.csproj;
        if (options.paths.nuspec !== null & options.paths.nuspec !== undefined) {
            packPath = options.paths.nuspec;
        }
        grunt.util.spawn({
            cmd: 'nuget.exe',
            args: [
                'pack',
                packPath,
                '-OutputDirectory',
                options.paths.nugetDirectory,
                '-Prop',
                'Configuration=' + configurationName
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
        var dll = path.join
                     (
                     options.msBuildConfiguration.OutputPath,
                     options.paths.csproj.replace(".csproj", ".dll")
                     );
        console.log(dll);
        grunt.util.spawn({
            cmd: 'nuget.exe',
            args: [
                'spec',
                '-a',
                dll
                ,
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
                    cmd: 'nuget.exe',
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
                        grunt.log.write('\nYour configuration mode is: ' + configurationName + '.\n')
                    }
                    callback();
                });
            } else {
                callback();
            }
        }, function(error) {
            done(!error);
        });
    });

    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-msbuild');
    grunt.registerTask('specDll', ['updateAssembly', 'msbuild:project',"nugetSpec"]);
    grunt.registerTask('build', ['updateAssembly', 'msbuild:project' ]);
    grunt.registerTask('publish', ['clean:nugetDirectory', 'build', 'nugetPack', 'nugetPush']);
};