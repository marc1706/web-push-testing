/**
 *
 * This file is part of the web-push-testing package.
 *
 * @copyright (c) Marc Alexander <https://www.m-a-styles.de>
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 *
 */

const testingCli = require('../src/cli.js');
const fs = require("fs");
const path = require("path");
const fetch = require('node-fetch');
require('chai').should();

describe('CLI Tests', function() {
    const originalExit = process.exit;
    const originalLog = console.log;
    const originalError = console.error;
    const originalArgv = process.argv;

    let testExitCode = -1;
    let consoleLogs = [];
    let consoleErrors = [];

    before(function () {
        process.exit = (code) => {
            testExitCode = code;
        };
        process.argv = [];
    });

    after(function () {
        process.exit = originalExit;
        process.argv = originalArgv;
    });

    beforeEach(function () {
        consoleLogs = [];
        testExitCode = -1;
        process.argv = [];
    });

    let startLogging = () => {
        console.log = (string) => {
            consoleLogs.push(string);
        };
        console.error = (string) => {
            consoleErrors.push(string);
        }
    };

    let endLogging = () => {
        consoleLogs = [];
        consoleErrors = [];
        console.log = originalLog;
        console.error = originalError;
    };

    /**
     *
     * @param {string[]} arguments
     */
    let setArgv = (arguments) => {
        process.argv = [
            '/usr/bin/node',
            __filename,
        ];

        arguments.forEach((argument) => {
            process.argv.push(argument);
        })
    };

    it('should be able to require the cli from package.json', function() {
        const binValues = require('../package.json').bin;
        const cliPath = binValues['web-push-testing'];
        fs.accessSync(path.join(__dirname, '..', cliPath), fs.F_OK);
    });

    describe('should be able to get help text from cli with help flags', function() {
        ['-h', '--help'].forEach((helpFlag) => {
            it(helpFlag + ' flag', function() {
                startLogging();
                setArgv([helpFlag]);
                new testingCli();
                testExitCode.should.equal(0);
                consoleLogs.length.should.greaterThan(10);
                consoleLogs[0].should.equal('web-push-testing');
                consoleLogs[2].should.equal('Usage:');
                endLogging();
            })
        })
    })

    describe('should be able to get version from cli with version flags', function() {
        ['-v', '--version'].forEach((versionFlag) => {
            it(versionFlag + ' flag', function() {
                startLogging();
                setArgv([versionFlag]);
                new testingCli();
                testExitCode.should.equal(0);
                consoleLogs.length.should.equal(1);
                const version = require('../package.json').version;
                consoleLogs[0].should.contain(version);
                endLogging();
            });
        })
    });

    it('should show message on invalid command', function() {
        startLogging();
        setArgv(['random']);
        new testingCli();
        testExitCode.should.equal(1);
        consoleErrors.length.should.greaterThan(0);
        consoleErrors[0].should.contain('Invalid command');
        endLogging();
    });

    it('should show message on invalid flag', function() {
        startLogging();
        setArgv(['--foo']);
        new testingCli();
        testExitCode.should.equal(1);
        consoleErrors.length.should.greaterThan(0);
        consoleErrors[0].should.contain('unknown');
        endLogging();
    });

    it('should show message on missing command', function() {
        startLogging();
        setArgv(['--port=1234']);
        new testingCli();
        testExitCode.should.equal(1);
        consoleErrors.length.should.greaterThan(0);
        consoleErrors[0].should.contain('No command');
        endLogging();
    });

    const startStopServerTest = function(args) {
        return function() {
            let port = 8090;
            if (args) {
                const portFlag = args.find(element => element === '-p' || element === '--port');
                if (portFlag) {
                    const portFlagIndex = args.indexOf(portFlag);
                    args.length.should.greaterThan(portFlagIndex + 1);
                    const portString = args[portFlagIndex + 1];
                    port = parseInt(portString, 10);
                }
            } else {
                args = [];
            }

            return new Promise((resolve) => {
                process.exit = (code) => {
                    testExitCode = code;
                    resolve();
                };

                setArgv(args.concat(['start']));

                new testingCli();
            })
            .then(() => {
                const getStatus = () => {
                    return fetch('http://localhost:' + port + '/status', {
                        method: 'POST',
                    }).catch(() => {
                        setTimeout(() => {}, 200);
                        return getStatus();
                    });
                }

                return getStatus();
            })
            .then((response) => {
                response.status.should.equal(200);

                return new Promise((resolve) => {
                    testExitCode = -1;

                    process.exit = (code) => {
                        testExitCode = code;
                        resolve();
                    };

                    setArgv(args.concat(['stop']));
                    new testingCli();
                });
            })
            .then(() => {
                testExitCode.should.equal(0);
            });
        };
    };

    it('should be able to run server with default values', startStopServerTest());
    it('should be able to run server with -p flag', startStopServerTest(['-p', '8999']));
    it('should be able to run server with --port flag', startStopServerTest(['--port', '8099']));
});