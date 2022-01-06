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

let apiModel = {};

class WebPushTestingServer {
	constructor(pushApiModel, port) {
		const express = require('express');

		this._port = port;
		apiModel = pushApiModel;
		this._host = 'localhost';
		apiModel.notifyUrl = 'http://' + this._host + ':' + this._port + '/notify/';
		this._app = express();
		this._app.use(express.urlencoded({extended: true}));
		this._app.use(express.json());
		// Workaround to allow content-encoding outside bodyParser defaults
		this._app.use((req, res, next) => {
			if (Object.prototype.hasOwnProperty.call(req.headers, 'content-encoding')
				&& (req.headers['content-encoding'] === 'aesgcm' || req.headers['content-encoding'] === 'aes128gcm')) {
				req.headers['x-content-encoding'] = req.headers['content-encoding'];
				delete req.headers['content-encoding'];
			}

			next();
		});
		this._app.use(express.raw());
	}

	startServer() {
		if (typeof this._port !== 'number') {
			console.error('Invalid port supplied: ' + this._port);
			process.exit(1);
		}

		this._server = this._app.listen(this._port, () => {
			console.log('Server running on port ' + this._port);
		});

		this._server.on('error', err => {
			console.log(err);
			process.exit(1);
		});

		this.setRequestHandlers();
	}

	setRequestHandlers() {
		this._app.post('/status', this.getStatus);
		this._app.post('/subscribe', this.subscribe);
		this._app.post('/notify/:clientHash', this.handleNotification);
		this._app.post('/get-notifications', this.getNotifications);
	}

	getNotifications(req, res) {
		try {
			const notificationsData = apiModel.getNotifications(req.body);
			res.status(200).send({data: notificationsData});
		} catch (err) {
			res.status(400).send({
				error: {
					message: err.message,
				},
			});
		}
	}

	getStatus(req, res) {
		res.sendStatus(200);
	}

	subscribe(req, res) {
		const subscriptionOptions = req.body;
		apiModel.subscribe(subscriptionOptions)
			.then(subscriptionData => {
				res.status(200).send({data: subscriptionData});
			})
			.catch(err => {
				res.status(400).send({
					error: {
						message: err.message,
					},
				});
			});
	}

	handleNotification(req, res) {
		const {clientHash} = req.params;
		const pushHeaders = {
			encoding: req.get('X-Content-Encoding'),
			encryption: req.get('Encryption'),
			cryptoKey: req.get('Crypto-Key'),
			authorization: req.get('Authorization'),
			ttl: req.get('TTL'),
		};
		return apiModel.handleNotification(
			clientHash,
			pushHeaders,
			req.body,
		).then(notificationReturn => {
			res.status(201).send(notificationReturn);
		})
			.catch(err => {
				const status = err instanceof RangeError ? 400 : 410;
				res.status(status).send({
					error: {
						message: err.message,
					},
				});
			});
	}
}

module.exports = WebPushTestingServer;
