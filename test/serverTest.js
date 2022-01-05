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

const testingServer = require('../src/server.js');
const pushApiModel = require('../src/pushApiModel');
const fetch = require("node-fetch");
require('chai').should();
const assert = require('chai').assert;

describe('Push Server tests', function() {
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

    it('should be able to start server via constructor', function() {
        const model = new pushApiModel();
        const port = 8990;
        const server = new testingServer(model, port);
        startLogging();
        server.startServer();

        const getStatus = () => {
            return fetch('http://localhost:' + port + '/status', {
                method: 'POST',
            }).catch(() => {
                setTimeout(() => {}, 200);
                return getStatus();
            });
        };

        getStatus().then((response) => {
            response.status.should.equal(200);
            consoleLogs.length.should.equal(1);
            consoleLogs[0].should.match(/Server running/);
        })
        .then(() => {
            server._server.close();
            endLogging();
        });
    });

    it('should throw error on passing invalid port', function() {
        const model = new pushApiModel();
        const port = 'test';
        const server = new testingServer(model, port);
        startLogging();
        server.startServer();
        consoleErrors.length.should.equal(1);
        consoleErrors[0].should.match(/Invalid port supplied/);
    });
});
