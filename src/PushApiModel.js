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

class SubscriptionExpiredError extends Error {
	constructor(message) {
		super(message);
		this.name = 'SubscriptionExpiredError';
		this.message = 'Subscription expired';
	}
}

class PushApiModel {
	constructor() {
		this.notifyUrl = '';
		this.subscriptions = {};
		this.messages = {};
	}

	async subscribe(options) {
		return this.validateSubscribeOptions(options)
			.then(() => this.createSubscription(options));
	}

	async validateSubscribeOptions(options) {
		// eslint-disable-next-line guard-for-in
		for (const parameter in options) {
			const value = options[parameter];
			if (parameter !== 'userVisibleOnly' && parameter !== 'applicationServerKey') {
				throw new RangeError('Invalid property ' + parameter.toString() + ' sent.');
			}

			if (parameter === 'userVisibleOnly' && value !== 'true' && value !== 'false') {
				throw new RangeError('Parameter userVisibleOnly is not of type boolean: ' + value);
			}

			// eslint-disable-next-line no-await-in-loop
			if (parameter === 'applicationServerKey' && (await this.isValidVapidKey(value)) === false) {
				throw new Error('Parameter applicationServerKey does not seem to be a valid VAPID key.');
			}
		}
	}

	bytesArrayToKeyString(bytesArray) {
		return Buffer.from(bytesArray).toString('base64');
	}

	async exportPemKey(key) {
		const {subtle} = require('crypto').webcrypto;
		const exported = await subtle.exportKey(
			'spki',
			key,
		);

		let pemString = this.bytesArrayToKeyString(exported);
		pemString = '-----BEGIN ' + key.type.toUpperCase() + ' KEY-----\n' + pemString;
		pemString = pemString + '\n-----END ' + key.type.toUpperCase() + ' KEY-----\n';

		return pemString;
	}

	async importVapidKey(keyString) {
		const bytes = this.base64UrlDecode(keyString);
		const {subtle} = require('crypto').webcrypto;

		try {
			return await subtle.importKey(
				'raw',
				bytes,
				{
					name: 'ECDSA',
					namedCurve: 'P-256',
				},
				true,
				[],
			);
		} catch {
			return undefined;
		}
	}

	async generateSubscriptionEcdh() {
		const crypto = require('crypto');
		const ecdh = crypto.createECDH('prime256v1');
		ecdh.generateKeys();
		return ecdh;
	}

	base64UrlDecode(input) {
		const urlSafeBase64 = require('urlsafe-base64');
		return urlSafeBase64.decode(input);
	}

	base64UrlEncode(input) {
		const urlSafeBase64 = require('urlsafe-base64');
		return urlSafeBase64.encode(input);
	}

	/**
     * Decode string from base64url format according to RFC 7515:
     * https://www.rfc-editor.org/rfc/rfc7515#appendix-C
     *
     * @param string Base64url encoded string
     * @returns {string} Base64 encoded string
     */
	decodeBase64UrlString(string) {
		return this.base64UrlDecode(string).toString('base64');
	}

	/**
     * Encode string from base64url format according to RFC 7515:
     * https://www.rfc-editor.org/rfc/rfc7515#appendix-C
     *
     * @param {string} string Base64 encoded string
     * @returns {string} Base64url encoded string
     */
	encodeBase64UrlString(string) {
		return this.base64UrlEncode(string).toString('base64');
	}

	async isValidVapidKey(key) {
		key = this.decodeBase64UrlString(key);
		return this.importVapidKey(key)
			.then(cryptoKey => typeof cryptoKey !== 'undefined' && cryptoKey.type === 'public');
	}

	async createSubscription(options) {
		const {randomBytes} = require('crypto');
		const uniqueClientHash = randomBytes(32).toString('hex');
		const uniqueAuthKey = this.base64UrlEncode(randomBytes(16));
		return this.generateSubscriptionEcdh()
			.then(subscriptionDh => {
				const subscriptionData = {
					applicationServerKey: options.applicationServerKey,
					publicKey: subscriptionDh.getPublicKey('base64'),
					subscriptionDh,
					auth: uniqueAuthKey,
					isExpired: false,
				};
				this.subscriptions[uniqueClientHash] = subscriptionData;
				return {
					endpoint: this.notifyUrl + uniqueClientHash,
					keys: {
						p256dh: this.encodeBase64UrlString(subscriptionData.publicKey),
						auth: this.encodeBase64UrlString(subscriptionData.auth),
					},
					clientHash: uniqueClientHash,
				};
			});
	}

	/**
	 * Expire subscription with specified client hash
	 * @param {string} clientHash Unique client hash
	 * @returns {void}
	 */
	expireSubscription(clientHash) {
		if (typeof this.subscriptions[clientHash] === 'undefined') {
			throw new RangeError('Subscription with specified client hash does not exist');
		} else {
			this.subscriptions[clientHash].isExpired = true;
		}
	}

	/**
	 * Check if subscription with specified client hash is expired
	 * @param {string} clientHash Unique client hash
	 * @returns {boolean} True if subscription is expired, false if not
	 */
	isSubscriptionExpired(clientHash) {
		if (typeof this.subscriptions[clientHash] !== 'undefined') {
			return this.subscriptions[clientHash].isExpired;
		}

		return false;
	}

	async validateAuthorizationHeader(clientHash, jwt) {
		const jsonwebtoken = require('jsonwebtoken');
		try {
			const publicKeyPem = await this.importVapidKey(
				this.decodeBase64UrlString(this.subscriptions[clientHash].applicationServerKey),
			).then(applicationKey => this.exportPemKey(applicationKey));
			jsonwebtoken.verify(jwt, publicKeyPem, {algorithms: ['ES256']}, null);
		} catch (err) {
			// Err
			console.error(err);
			throw new RangeError('Invalid authentication token supplied');
		}
	}

	/**
	 * Get parameters from header fields array (split by delimiter)
	 * @param {string[]} headerFields
	 * @returns {Object} Header fields object {key: value}
	 */
	getParametersFromHeaderFields(headerFields) {
		const parameters = {};
		headerFields.forEach(field => {
			field = field.trim();
			const [parameter, value] = field.split('=');
			parameters[parameter] = value;
		});

		return parameters;
	}

	getCryptoKeyHeaderFields(headerString, isVapid) {
		const cryptoKeyParameters = this.getParametersFromHeaderFields(headerString.split(';'));

		if (!Object.prototype.hasOwnProperty.call(cryptoKeyParameters, 'dh')
			|| (isVapid && !Object.prototype.hasOwnProperty.call(cryptoKeyParameters, 'p256ecdsa'))) {
			throw new Error('Invalid Crypto-Key header sent');
		}

		const notificationDhBytes = this.base64UrlDecode(cryptoKeyParameters.dh);
		if (notificationDhBytes.length !== 65 || notificationDhBytes[0] !== 4) {
			throw new Error('Invalid Crypto-Key header sent');
		}

		return [cryptoKeyParameters.dh, cryptoKeyParameters.p256ecdsa];
	}

	getVapidHeaderFields(headerString) {
		if (headerString.substr(0, 'vapid'.length) !== 'vapid') {
			throw new Error('Invalid Authorization header sent');
		}

		headerString = headerString.substr('vapid'.length);

		const authenticationParameters = this.getParametersFromHeaderFields(headerString.split(','));

		if (!Object.prototype.hasOwnProperty.call(authenticationParameters, 't')
			|| !Object.prototype.hasOwnProperty.call(authenticationParameters, 'k')) {
			throw new Error('Invalid Authorization header sent');
		}

		return [authenticationParameters.t, authenticationParameters.k];
	}

	validateNotificationHeaders(subscription, headers) {
		if (!Object.prototype.hasOwnProperty.call(headers, 'encoding') || (headers.encoding !== 'aesgcm' && headers.encoding !== 'aes128gcm')) {
			throw new Error('Unsupported encoding');
		}

		if (!Object.prototype.hasOwnProperty.call(headers, 'ttl') || isNaN(parseInt(headers.ttl, 10))) {
			throw new Error('TTL header is invalid: ' + headers.ttl);
		}

		if (typeof subscription.applicationServerKey !== 'undefined'
			&& (!Object.prototype.hasOwnProperty.call(headers, 'authorization') || headers.authorization === '')) {
			throw new RangeError('Missing or invalid authorization header');
		}
	}

	validateCrypto(publicServerKey, savedPublicServerKey) {
		const crypto = require('crypto');
		const notificationEcdsaBytes = this.base64UrlDecode(publicServerKey);
		const serverKeyBytes = this.base64UrlDecode(savedPublicServerKey);
		if (!crypto.timingSafeEqual(notificationEcdsaBytes, serverKeyBytes)) {
			throw new Error('Invalid Crypto-Key header sent');
		}
	}

	async handleNotification(clientHash, pushHeaders, body) {
		if (!Object.prototype.hasOwnProperty.call(this.subscriptions, clientHash)) {
			throw new RangeError('Client not subscribed');
		}

		if (this.isSubscriptionExpired(clientHash)) {
			throw new SubscriptionExpiredError();
		}

		const currentSubscription = this.subscriptions[clientHash];

		const isVapid = typeof currentSubscription.applicationServerKey !== 'undefined';

		this.validateNotificationHeaders(currentSubscription, pushHeaders);

		const eceParameters = {
			version: pushHeaders.encoding,
		};

		if (pushHeaders.encoding === 'aesgcm') {
			if (isVapid) {
				const [type, jwt] = pushHeaders.authorization.split(' ');
				if (type !== 'WebPush' || typeof jwt === 'undefined') {
					throw new Error('Invalid Authorization header sent');
				}

				await this.validateAuthorizationHeader(clientHash, jwt);
			}

			const [notificationDh, notificationEcdsa] = this.getCryptoKeyHeaderFields(pushHeaders.cryptoKey, isVapid);

			if (isVapid) {
				this.validateCrypto(notificationEcdsa, currentSubscription.applicationServerKey);
			}

			eceParameters.dh = notificationDh;
			eceParameters.salt = pushHeaders.encryption.substr('salt='.length);
		} else if (isVapid && pushHeaders.encoding === 'aes128gcm') {
			const [vapidToken, vapidKey] = this.getVapidHeaderFields(pushHeaders.authorization);

			this.validateCrypto(vapidKey, currentSubscription.applicationServerKey);

			await this.validateAuthorizationHeader(clientHash, vapidToken);
		}

		const crypto = require('crypto');
		const newDh = crypto.createECDH('prime256v1');
		newDh.setPrivateKey(currentSubscription.subscriptionDh.getPrivateKey());

		const ece = require('http_ece');
		eceParameters.privateKey = newDh;
		eceParameters.authSecret = this.base64UrlDecode(currentSubscription.auth);

		const decryptedText = ece.decrypt(body, eceParameters);

		if (Object.prototype.hasOwnProperty.call(this.messages, clientHash)) {
			this.messages[clientHash].push(decryptedText.toString('utf-8'));
		} else {
			this.messages[clientHash] = [decryptedText.toString('utf-8')];
		}
	}

	getNotifications(requestBody) {
		if (!Object.prototype.hasOwnProperty.call(requestBody, 'clientHash')
			|| !Object.prototype.hasOwnProperty.call(this.subscriptions, requestBody.clientHash)) {
			throw new RangeError('Client not subscribed');
		}

		const {clientHash} = requestBody;

		return {
			messages: Object.prototype.hasOwnProperty.call(this.messages, clientHash) ? this.messages[clientHash] : [],
		};
	}
}

module.exports = {
	PushApiModel,
	SubscriptionExpiredError,
};
