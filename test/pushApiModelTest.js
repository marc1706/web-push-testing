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

const pushApiModel = require('../src/pushApiModel');
require('chai').should();
const assert = require('chai').assert;
const webPush = require('web-push');
const crypto = require("crypto");
const vapidKeys = webPush.generateVAPIDKeys();

describe('Push API Model tests', function() {
    describe('Invalid requests to get notifications', function () {
        const input = [
            {name: 'no body', body: {}},
            {name: 'missing clientHash', body: {someRandomElement: 'test'}},
            {name: 'invalid clientHash', body: {clientHash: 'foo'}},
        ];

        input.forEach((curInput) => {
            it('Error when trying to get notification with ' + curInput.name, function () {
                const model = new pushApiModel();
                assert.throws(
                    () => model.getNotifications(curInput.body),
                    RangeError
                );
            });
        });
    });

    describe('Get messages', function() {
        const input = [
            [],
            ['testMessage1'],
            ['testMessage1', 'testMessage2'],
        ];

        input.forEach((messages) => {
            it(messages.length + (messages.length !== 1 ? ' messages' : ' message') + ' with valid client hash', function() {
                const model = new pushApiModel();
                model.subscriptions['testHash'] = {some: 'data'};
                model.messages['testHash'] = messages;
                const data = model.getNotifications({clientHash: 'testHash'});
                Object.keys(data).length.should.equal(1);
                data.messages.length.should.equal(messages.length);
                for (let i = 0; i < data.messages.length; i++) {
                    data.messages[i].should.equal(messages[i]);
                }
            });
        });
    });

    describe('Validate subscription options', function() {
        const input = [
            {
                description: 'No error with empty options',
                options: {},
            },
            {
                description: 'userVisibleOnly set to true',
                options: {userVisibleOnly: 'true'},
            },
            {
                description: 'userVisibleOnly set to false',
                options: {userVisibleOnly: 'false'},
            },
            {
                description: 'Exception thrown with userVisibleOnly set to invalid value',
                options: {userVisibleOnly: 'notsure'},
                expectedError: {
                    type: RangeError,
                    match: /Parameter userVisibleOnly is not of type boolean/,
                },
            },
            {
                description: 'Exception thrown with unsupported parameter type',
                options: {random: 'foo'},
                expectedError: {
                    type: RangeError,
                    match: /Invalid property random/,
                },
            },
            {
                description: 'Exception thrown with invalid vapid key',
                options: {applicationServerKey: 'foo'},
                expectedError: {
                    type: Error,
                    match: /Parameter applicationServerKey does not seem to be a valid VAPID key/,
                },
            },
            {
                description: 'Valid applicationServerKey',
                options: {applicationServerKey: vapidKeys.publicKey},
            },
        ];

        input.forEach(({description, options, expectedError}) => {
            it(description, async function() {
                const model = new pushApiModel();
                await model.validateSubscribeOptions(options)
                    .then(() => {
                        assert.isUndefined(expectedError, 'validateSubscribeOptions did not fail even though error is expected');
                    })
                    .catch((err) => {
                        assert.isTrue(typeof expectedError !== 'undefined', 'expectedError is not defined but exception is thrown');
                        assert.instanceOf(err, expectedError.type);
                        assert.match(err.message, expectedError.match);
                    });
            })
        })
    });

    describe('Subscribe', function() {
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
                options: {userVisibleOnly: 'true', applicationServerKey: vapidKeys.publicKey},
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
                options: {userVisibleOnly: 'nope', applicationServerKey: vapidKeys.publicKey},
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
                model.notifyUrl = 'https://localhost:12345';
                const subscribeReturn = await model.subscribe(options)
                    .catch((err) => {
                        assert.isTrue(typeof expectedError !== 'undefined', 'expectedError is not defined but exception is thrown');
                        assert.instanceOf(err, expectedError.type);
                        assert.match(err.message, expectedError.match);
                    });
                if (expectedReturn) {
                    assert.notTypeOf(subscribeReturn, 'undefined');
                    assert.hasAllKeys(subscribeReturn, ['endpoint', 'keys', 'clientHash']);
                    assert.hasAllKeys(subscribeReturn.keys, ['p256dh', 'auth']);
                    assert.hasAllKeys(model.subscriptions, [subscribeReturn.clientHash]);
                }
            });
        })
    });

    describe('Validate notification headers', function() {
        const input = [
            {
                description: 'Valid headers with aesgcm',
                headers: {
                    encoding: 'aesgcm',
                    ttl: '3600',
                    authorization: 'placeholder',
                },
            },
            {
                description: 'Valid headers with aes128gcm',
                headers: {
                    encoding: 'aes128gcm',
                    ttl: '3600',
                    authorization: 'placeholder',
                },
            },
            {
                description: 'Missing TTL',
                headers: {
                    encoding: 'aes128gcm',
                    authorization: 'placeholder',
                },
                expectedError: {
                    type: Error,
                    match: /TTL header is invalid/,
                }
            },
            {
                description: 'Empty string TTL',
                headers: {
                    encoding: 'aes128gcm',
                    ttl: '',
                    authorization: 'placeholder',
                },
                expectedError: {
                    type: Error,
                    match: /TTL header is invalid/,
                }
            },
            {
                description: 'NaN TTL',
                headers: {
                    encoding: 'aes128gcm',
                    ttl: 'oops',
                    authorization: 'placeholder',
                },
                expectedError: {
                    type: Error,
                    match: /TTL header is invalid/,
                }
            },
            {
                description: 'Missing authorization',
                headers: {
                    encoding: 'aes128gcm',
                    ttl: '3600',
                },
                expectedError: {
                    type: RangeError,
                    match: /Missing or invalid authorization/,
                }
            },
            {
                description: 'Invalid authorization',
                headers: {
                    encoding: 'aes128gcm',
                    ttl: '3600',
                    authorization: '',
                },
                expectedError: {
                    type: RangeError,
                    match: /Missing or invalid authorization/,
                }
            },
        ];

        input.forEach(({description, headers, expectedError}) => {
            it(description, () => {
                const model = new pushApiModel();
                try {
                    model.validateNotificationHeaders(headers);
                    assert.isUndefined(expectedError, 'validateNotificationHeaders did not fail even though error is expected');
                } catch (err) {
                    assert.isTrue(typeof expectedError !== 'undefined', 'expectedError is not defined but exception is thrown');
                    assert.instanceOf(err, expectedError.type);
                    assert.match(err.message, expectedError.match);
                }
            })
        });
    });

    /*
    describe('Handle notifications', function() {

        it('Successful notification with aesgcm encryption type', async () => {
            const model = new pushApiModel();
            const testClientHash = 'testClientHash';
            const subscriptionPublicKey = 'BIanZceKFE49T82cl2HUWK_vLQPVQPq5eZHP7y0zLWP1qDjlWe7Vx7XS8qetnPOJTZyZJrV26FST20e6CvThcmc';
            const subscriptionPrivateKey = 'zs96vCXedR-vvXDsGLQJXeus2Ui2InrWQM1w0bh8O90';
            const testApplicationServerKey = 'BJxKEp-nlH4ezWmgipyizTbPGOB6jQIuARETjLNp5wxSbnyzJ6NRgolhMy4CVThCAc1H6l_UC38nkBqcLcQx96c';

            const ecdh = crypto.createECDH('prime256v1');
            ecdh.setPrivateKey(model.base64UrlDecode(subscriptionPrivateKey));
            model.subscriptions[testClientHash] = {
                applicationServerKey: testApplicationServerKey,
                publicKey: subscriptionPublicKey,
                subscriptionDh: ecdh,
                auth: 'kZTCk82psaREuK7YOM5mHA'
            };
            const salt = '8PYlFauOPQaDkW9QKINEjg';
            const testLocalPublickey = 'BP_jupWySFrZB4vAqGmEJ9ZLlfLpg1fnP0SgBLmkx_e4sWe3b719Q_oh8FXe2nnTER0rmCJvUd6xmVNzUXMoLJQ';

            const pushHeaders = {
                encoding: 'aesgcm',
                encryption: 'salt=' + salt,
                cryptoKey: 'dh=' + testLocalPublickey + ';p256ecdsa=' + testApplicationServerKey,
                authorization: 'WebPush eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.eyJhdWQiOiJodHRwOi8vbG9jYWxob3N0IiwiZXhwIjoxNjQxMTk1MTkyLCJzdWIiOiJodHRwOi8vdGVzdC5jb20ifQ.s7WG30sx5GFtufk2VMV7V_q92p5E85a-cQQq63qqQBBxFBTllZio9MgN4hteTUnCn_gmKN3WQ4b4ZolEramaOw',
                ttl: 60,
            };

            const requestBody = model.base64UrlDecode('r6gvu5db98El53AoxLdf6qe-Y2fSp9o');

            await model.handleNotification(testClientHash, pushHeaders, requestBody);

            assert.hasAllKeys(model.messages, [testClientHash]);
            model.messages[testClientHash].length.should.equal(1);
            model.messages[testClientHash][0].should.equal('hello');
        });

        it('Successful notification with aes128gcm encryption type', async () => {
            const model = new pushApiModel();
            const testClientHash = 'testClientHash';
            const subscriptionPublicKey = 'BLFs1fhFLaLQ1VUOsQ0gqysdZUigBkR729fgFLO99fTNRr9BJPY02JyOSXVqoPOYkG-nzNu83EEzpmeJgphXCoM';
            const subscriptionPrivateKey = 'PSQe0Tyal7mYQxSWEB8PDE-03rhXabdWqIRPA28oczo';
            const testApplicationServerKey = 'BJxKEp-nlH4ezWmgipyizTbPGOB6jQIuARETjLNp5wxSbnyzJ6NRgolhMy4CVThCAc1H6l_UC38nkBqcLcQx96c';

            const ecdh = crypto.createECDH('prime256v1');
            ecdh.setPrivateKey(model.base64UrlDecode(subscriptionPrivateKey));
            model.subscriptions[testClientHash] = {
                applicationServerKey: testApplicationServerKey,
                publicKey: subscriptionPublicKey,
                subscriptionDh: ecdh,
                auth: 'PST6Fru-E4BwgZ-WfuoLEA'
            };

            const pushHeaders = {
                encoding: 'aes128gcm',
                authorization: 'vapid t=eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.eyJhdWQiOiJodHRwOi8vbG9jYWxob3N0IiwiZXhwIjoxNjQxMTk2MTEzLCJzdWIiOiJodHRwOi8vdGVzdC5jb20ifQ.G4fSpPN7b9HZN_2-HYTVoW2HHz62Rs_qgDmNSEovOKZ-4JNyobiqh-NyBbXuMdVukJUqqnPinilpaTo9IgDixQ, k=BJxKEp-nlH4ezWmgipyizTbPGOB6jQIuARETjLNp5wxSbnyzJ6NRgolhMy4CVThCAc1H6l_UC38nkBqcLcQx96c',
                ttl: 60,
            };

            const requestBody = model.base64UrlDecode('GaEPNjGhZ6YHIpzPgcSTuAAAEABBBNfCvIUmOmJPCM9E8HKQXr2n44RBECF61EiYV9kPlGeTxKwyCuZSl6-UZMWQHN-IFyu1-tytGic-TodexXcy8nOq8ovjJzeLwjQ0taWXJsNYOD8RbQ1p');

            await model.handleNotification(testClientHash, pushHeaders, requestBody);

            assert.hasAllKeys(model.messages, [testClientHash]);
            model.messages[testClientHash].length.should.equal(1);
            model.messages[testClientHash][0].should.equal('hello');
        });
    });
     */
});