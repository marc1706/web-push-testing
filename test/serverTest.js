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

const WebPushTestingServer = require('../src/server.js');
const PushApiModel = require('../src/PushApiModel');
const fetch = require('node-fetch');
const crypto = require('crypto');
const webPush = require('web-push');
require('chai').should();
const {assert} = require('chai');

describe('Push Server tests', () => {
	const originalExit = process.exit;
	const originalLog = console.log;
	const originalError = console.error;
	const originalArgv = process.argv;

	let consoleLogs = [];
	let consoleErrors = [];

	before(() => {
		process.exit = () => {};

		process.argv = [];
	});

	after(() => {
		process.exit = originalExit;
		process.argv = originalArgv;
	});

	beforeEach(() => {
		consoleLogs = [];
		process.argv = [];
	});

	const startLogging = () => {
		console.log = string => {
			consoleLogs.push(string);
		};

		console.error = string => {
			consoleErrors.push(string);
		};
	};

	const endLogging = () => {
		consoleLogs = [];
		consoleErrors = [];
		console.log = originalLog;
		console.error = originalError;
	};

	it('should be able to start server via constructor', async () => {
		const model = new PushApiModel();
		const port = 8990;
		const server = new WebPushTestingServer(model, port);
		startLogging();
		server.startServer();

		const getStatus = () => fetch('http://localhost:' + port + '/status', {
			method: 'POST',
		}).catch(() => {
			setTimeout(() => {}, 200);
			return getStatus();
		});

		await getStatus().then(response => {
			response.status.should.equal(200);
			consoleLogs.length.should.equal(1);
			consoleLogs[0].should.match(/Server running/);
		})
			.then(() => {
				server._server.close();
				endLogging();
			});
	});

	it('should throw error on passing invalid port', () => {
		const model = new PushApiModel();
		const port = 'test';
		const server = new WebPushTestingServer(model, port);
		startLogging();
		server.startServer();
		consoleErrors.length.should.equal(1);
		consoleErrors[0].should.match(/Invalid port supplied/);
	});

	describe('Get notifications from server', () => {
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
				},
			},
		];

		input.forEach(({description, messages, validClientHash, error}) => {
			it(description, async () => {
				const model = new PushApiModel();
				const testClientHash = 'testHash';
				model.subscriptions[testClientHash] = {some: 'data'};
				model.messages[testClientHash] = messages;
				const port = 8990;

				const server = new WebPushTestingServer(model, port);
				startLogging();
				server.startServer();

				await fetch('http://localhost:' + port + '/status', {
					method: 'POST',
				}).then(response => {
					response.status.should.equal(200);
					consoleLogs.length.should.equal(1);
					consoleLogs[0].should.match(/Server running/);
				})
					// eslint-disable-next-line no-return-await
					.then(async () => await fetch('http://localhost:' + port + '/get-notifications', {
						method: 'POST',
						body: JSON.stringify({
							clientHash: validClientHash ? testClientHash : 'wrong',
						}),
						headers: {'Content-Type': 'application/json'},
					}))
					.then(async response => {
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
				success: true,
			},
			{
				description: 'Valid subscription with only userVisibleOnly option',
				options: {userVisibleOnly: 'true'},
				success: true,
			},
			{
				description: 'Valid subscription with userVisibleOnly & applicationServerKey',
				options: {userVisibleOnly: 'true', applicationServerKey: 'BLFs1fhFLaLQ1VUOsQ0gqysdZUigBkR729fgFLO99fTNRr9BJPY02JyOSXVqoPOYkG-nzNu83EEzpmeJgphXCoM'},
				success: true,
			},
			{
				description: 'Invalid application server key',
				options: {applicationServerKey: 'nope'},
				success: false,
			},
			{
				description: 'Invalid userVisibleOnly',
				options: {userVisibleOnly: 'nope', applicationServerKey: 'BLFs1fhFLaLQ1VUOsQ0gqysdZUigBkR729fgFLO99fTNRr9BJPY02JyOSXVqoPOYkG-nzNu83EEzpmeJgphXCoM'},
				success: false,
			},
		];

		input.forEach(({description, options, success}) => {
			it(description, async () => {
				const model = new PushApiModel();
				const port = 8990;

				const server = new WebPushTestingServer(model, port);
				startLogging();
				server.startServer();

				await fetch('http://localhost:' + port + '/status', {
					method: 'POST',
				}).then(response => {
					response.status.should.equal(200);
					consoleLogs.length.should.equal(1);
					consoleLogs[0].should.match(/Server running/);
				})
					// eslint-disable-next-line no-return-await
					.then(async () => await fetch('http://localhost:' + port + '/subscribe', {
						method: 'POST',
						body: JSON.stringify(options),
						headers: {'Content-Type': 'application/json'},
					}))
					.then(async response => {
						endLogging();
						server._server.close();
						response.status.should.equal(success ? 200 : 400);
						if (success) {
							const responseBody = await response.json();
							assert.hasAnyKeys(responseBody, ['data']);
							assert.hasAllKeys(responseBody.data, ['endpoint', 'keys', 'clientHash']); // ClientHash added for convenience
							assert.hasAllKeys(responseBody.data.keys, ['p256dh', 'auth']);
							assert.lengthOf(model.base64UrlDecode(responseBody.data.keys.auth), 16); // Auth must be 16 characters
						}
					});
			});
		});
	});

	describe('Send notifications', () => {
		const input = [
			{
				description: 'Successful notification with aesgcm',
				encoding: 'aesgcm',
				sendAuthorization: true,
				expectedStatus: 201,
			},
			{
				description: 'Successful notification with aes128gcm',
				encoding: 'aes128gcm',
				sendAuthorization: true,
				expectedStatus: 201,
			},
			{
				description: 'Unsuccessful notification with wrong encoding',
				encoding: 'wrong',
				sendAuthorization: true,
				expectedStatus: 410,
				expectedError: 'Unsupported encoding',
			},
			{
				description: 'Unsuccessful notification with invalid authentication header',
				encoding: 'aesgcm',
				sendAuthorization: false,
				expectedStatus: 400,
				expectedError: 'Missing or invalid authorization header',
			},
		];

		input.forEach(({description, encoding, sendAuthorization, expectedStatus, expectedError}) => {
			it(description, async () => {
				const model = new PushApiModel();
				const testClientHash = encoding !== 'aesgcm' && encoding !== 'aes128gcm' ? 'aesgcm' : encoding;
				const aesgcmSubscriptionPrivateKey = 'zs96vCXedR-vvXDsGLQJXeus2Ui2InrWQM1w0bh8O90';
				const aes128gcmSubscriptionPublicKey = 'BLFs1fhFLaLQ1VUOsQ0gqysdZUigBkR729fgFLO99fTNRr9BJPY02JyOSXVqoPOYkG-nzNu83EEzpmeJgphXCoM';
				const aes128gcmSubscriptionPrivateKey = 'PSQe0Tyal7mYQxSWEB8PDE-03rhXabdWqIRPA28oczo';
				const applicationServerKey = 'BJxKEp-nlH4ezWmgipyizTbPGOB6jQIuARETjLNp5wxSbnyzJ6NRgolhMy4CVThCAc1H6l_UC38nkBqcLcQx96c';
				const applicationServerPrivateKey = 'A8PXqnFU9XeF609Y2CsfFMnFCakCaPkCMrifvj2a3KY';

				const ecdh = crypto.createECDH('prime256v1');
				ecdh.setPrivateKey(model.base64UrlDecode(encoding === 'aesgcm' ? aesgcmSubscriptionPrivateKey : aes128gcmSubscriptionPrivateKey));
				model.subscriptions = {
					aesgcm: {
						applicationServerKey,
						publicKey: 'BIanZceKFE49T82cl2HUWK_vLQPVQPq5eZHP7y0zLWP1qDjlWe7Vx7XS8qetnPOJTZyZJrV26FST20e6CvThcmc',
						subscriptionDh: ecdh,
						auth: 'kZTCk82psaREuK7YOM5mHA',
					},
					aes128gcm: {
						applicationServerKey,
						publicKey: aes128gcmSubscriptionPublicKey,
						subscriptionDh: ecdh,
						auth: 'PST6Fru-E4BwgZ-WfuoLEA',
					},
				};
				const salt = '8PYlFauOPQaDkW9QKINEjg';
				const testLocalPublickey = 'BP_jupWySFrZB4vAqGmEJ9ZLlfLpg1fnP0SgBLmkx_e4sWe3b719Q_oh8FXe2nnTER0rmCJvUd6xmVNzUXMoLJQ';
				const vapidHeaders = webPush.getVapidHeaders(
					'http://localhost',
					'http://test.com',
					applicationServerKey,
					applicationServerPrivateKey,
					testClientHash,
				);

				// Create WebPush Authorization header
				const pushHeaders = {
					Authorization: sendAuthorization ? vapidHeaders.Authorization : '',
					TTL: 60,
					'Content-Type': 'application/octet-stream',
				};

				if (encoding !== 'aes128gcm') {
					pushHeaders.Encryption = 'salt=' + salt;
					pushHeaders['Crypto-Key'] = 'dh=' + testLocalPublickey + ';' + vapidHeaders['Crypto-Key'];
				}

				if (encoding === 'aesgcm' || encoding === 'aes128gcm') {
					pushHeaders['Content-Encoding'] = encoding;
				} else {
					pushHeaders['X-Content-Encoding'] = encoding;
				}

				const requestBody = encoding === 'aes128gcm'
					? model.base64UrlDecode('GaEPNjGhZ6YHIpzPgcSTuAAAEABBBNfCvIUmOmJPCM9E8HKQXr2n44RBECF61EiYV9kPlGeTxKwyCuZSl6-UZMWQHN-IFyu1-tytGic-TodexXcy8nOq8ovjJzeLwjQ0taWXJsNYOD8RbQ1p')
					: model.base64UrlDecode('r6gvu5db98El53AoxLdf6qe-Y2fSp9o');

				const port = 8990;

				const server = new WebPushTestingServer(model, port);
				startLogging();
				server.startServer();

				await fetch('http://localhost:' + port + '/status', {
					method: 'POST',
				}).then(response => {
					response.status.should.equal(200);
					consoleLogs.length.should.equal(1);
					consoleLogs[0].should.match(/Server running/);
				});

				await fetch('http://localhost:' + port + '/notify/' + testClientHash, {
					method: 'POST',
					headers: pushHeaders,
					body: requestBody,
				})
					.then(async response => {
						server._server.close();
						endLogging();
						response.status.should.equal(expectedStatus);
						if (expectedStatus === 201) {
							assert.isUndefined(response.body.error);
							const notificationData = model.getNotifications({clientHash: testClientHash});
							assert.hasAllKeys(notificationData, ['messages']);
							notificationData.messages.length.should.equal(1);
							notificationData.messages[0].should.equal('hello');
						} else {
							const responseBody = await response.json();
							assert.hasAllKeys(responseBody, ['error']);
							responseBody.error.message.should.equal(expectedError);
						}
					});

				if (server._server.listening) {
					server._server.close();
					endLogging();
				}
			});
		});
	});
});
