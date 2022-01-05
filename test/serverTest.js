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

    it('should be able to start server via constructor', async function() {
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

        await getStatus().then((response) => {
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

    describe('Get notifications from server', function() {
        const input = [
            {
                description: '0 messages from server',
                messages: [],
                validClientHash: true,
            },
            {
                description: '1 message from server',
                messages: ['testMessage1'],
                validClientHash: true,
            },
            {
                description: '2 messages from server',
                messages: ['testMessage1', 'testMessage2'],
                validClientHash: true,
            },
            {
                description: '0 messages from server',
                messages: [],
                validClientHash: false,
                error: {
                    status: 400,
                    message: 'Client not subscribed',
                }
            },
        ];

        input.forEach(({description, messages, validClientHash, error}) => {
            it(description, async function() {
                const model = new pushApiModel();
                const testClientHash = 'testHash';
                model.subscriptions[testClientHash] = {some: 'data'};
                model.messages[testClientHash] = messages;
                const port = 8990;

                const server = new testingServer(model, port);
                startLogging();
                server.startServer();

                await fetch('http://localhost:' + port + '/status', {
                    method: 'POST',
                }).then((response) => {
                    response.status.should.equal(200);
                    consoleLogs.length.should.equal(1);
                    consoleLogs[0].should.match(/Server running/);
                })
                .then(async () => {
                    return await fetch('http://localhost:' + port + '/get-notifications', {
                        method: 'POST',
                        body: JSON.stringify({
                            clientHash: validClientHash ? testClientHash : 'wrong',
                        }),
                        headers: {'Content-Type': 'application/json'}
                    });
                })
                .then(async (response) => {
                    endLogging();
                    server._server.close();
                    if (validClientHash) {
                        response.status.should.equal(200);
                        const responseBody = await response.json();
                        assert.hasAnyKeys(responseBody, ['data']);
                        assert.hasAnyKeys(responseBody.data, ['messages']);
                        responseBody.data.messages.length.should.equal(messages.length);
                        for (let i = 0; i < responseBody.data.messages.length; i++) {
                            responseBody.data.messages[i].should.equal(messages[i]);
                        }
                    } else {
                        response.status.should.equal(error.status);
                        const responseBody = await response.json();
                        assert.hasAnyKeys(responseBody, ['error']);
                        assert.hasAnyKeys(responseBody.error, ['message']);
                        responseBody.error.message.should.equal(error.message);
                    }
                });
            });
        });
    });

    describe('Subscribe via server', () => {
        const input = [
            {
                description: 'Valid subscription with empty options',
                options: {},
                expectedReturn: true,
            },
            {
                description: 'Valid subscription with only userVisibleOnly option',
                options: {userVisibleOnly: 'true'},
                expectedReturn: true,
            },
            {
                description: 'Valid subscription with userVisibleOnly & applicationServerKey',
                options: {userVisibleOnly: 'true', applicationServerKey: 'BLFs1fhFLaLQ1VUOsQ0gqysdZUigBkR729fgFLO99fTNRr9BJPY02JyOSXVqoPOYkG-nzNu83EEzpmeJgphXCoM'},
                expectedReturn: true,
            },
            {
                description: 'Invalid application server key',
                options: {'applicationServerKey': 'nope'},
                expectedReturn: false,
                expectedError: {
                    type: Error,
                    match: /Parameter applicationServerKey does not seem to be a valid VAPID key/,
                },
            },
            {
                description: 'Invalid userVisibleOnly',
                options: {userVisibleOnly: 'nope', applicationServerKey: 'BLFs1fhFLaLQ1VUOsQ0gqysdZUigBkR729fgFLO99fTNRr9BJPY02JyOSXVqoPOYkG-nzNu83EEzpmeJgphXCoM'},
                expectedReturn: false,
                expectedError: {
                    type: RangeError,
                    match: /Parameter userVisibleOnly is not of type boolean/,
                },
            },
        ];

        input.forEach(({description, options, expectedReturn, expectedError}) => {
            it(description, async function() {
                const model = new pushApiModel();
                const port = 8990;

                const server = new testingServer(model, port);
                startLogging();
                server.startServer();

                await fetch('http://localhost:' + port + '/status', {
                    method: 'POST',
                }).then((response) => {
                    response.status.should.equal(200);
                    consoleLogs.length.should.equal(1);
                    consoleLogs[0].should.match(/Server running/);
                })
                .then(async () => {
                    return await fetch('http://localhost:' + port + '/subscribe', {
                        method: 'POST',
                        body: JSON.stringify(options),
                        headers: {'Content-Type': 'application/json'}
                    });
                })
                .then((response) => {
                    endLogging();
                    server._server.close();
                    response.status.should.equal(expectedReturn ? 200 : 400);
                })
                .then(() => {

                });
            });
        });
    });
});
