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

class PushApiModel {
    constructor() {
        this.notifyUrl = '';
        this.subscriptions = {};
        this.messages = {};
    }

    async subscribe(options) {
        await this.validateSubscribeOptions(options);
        return this.createSubscription(options);
    }

    async validateSubscribeOptions(options) {
        for (const parameter in options) {
            const value = options[parameter];
            if (parameter !== 'userVisibleOnly' && parameter !== 'applicationServerKey') {
                throw new RangeError('Invalid property ' + parameter.toString() + ' sent.');
            }

            if (parameter === 'userVisibleOnly' && value !== 'true' && value !== 'false') {
                throw new RangeError('Parameter userVisibleOnly is not of type boolean: ' + value);
            }

            if (parameter === 'applicationServerKey' && (await this.isValidVapidKey(value)) === false) {
                throw new Error('Parameter applicationServerKey does not seem to be a valid VAPID key.');
            }
        }
    }

    stringToBytesArray(keyString) {
        const rawString = atob(keyString);
        const len = rawString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i += 1) {
            bytes[i] = rawString.charCodeAt(i);
        }

        return bytes;
    }

    bytesArrayToKeyString(bytesArray) {
        let res = '';
        const buf = new Uint8Array(bytesArray);
        buf.forEach(function(octet) {
            res += String.fromCharCode(octet)
        });
        return btoa(res);
    }

    async exportPemKey(key) {
        const { subtle } = require('crypto').webcrypto;
        const exported = await subtle.exportKey(
            "spki",
            key
        );

        let pemString = this.bytesArrayToKeyString(exported);
        pemString = "-----BEGIN " + key.type.toUpperCase() + " KEY-----\n" + pemString;
        pemString = pemString + "\n-----END " + key.type.toUpperCase() + " KEY-----\n"

        return pemString;
    }

    async importVapidKey(keyString) {
        const bytes = this.stringToBytesArray(keyString);
        const { subtle } = require('crypto').webcrypto;

        try {
            return await subtle.importKey(
                'raw',
                bytes,
                {
                    name: 'ECDSA',
                    namedCurve: 'P-256'
                },
                true,
                []
            );
        } catch (err) {
            console.error(err);
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
        let cryptoKey = await this.importVapidKey(key);
        return typeof cryptoKey !== "undefined" && cryptoKey.type === 'public';
    }

    async createSubscription(options) {
        const { randomBytes } = require('crypto');
        const uniqueClientHash = randomBytes(32).toString('hex');
        const uniqueAuthKey = this.bytesArrayToKeyString(randomBytes(16));
        const subscriptionDh = await this.generateSubscriptionEcdh();

        let subscriptionData = {
            applicationServerKey: options.applicationServerKey,
            publicKey: subscriptionDh.getPublicKey('base64'),
            subscriptionDh: subscriptionDh,
            auth: uniqueAuthKey
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
    }

    async validateAuthorizationHeader(clientHash, jwt) {
        const jsonwebtoken = require('jsonwebtoken');
        try {
            const applicationKey = await this.importVapidKey(this.decodeBase64UrlString(this.subscriptions[clientHash].applicationServerKey));
            const publicKeyPem = await this.exportPemKey(applicationKey);
            jsonwebtoken.verify(jwt, publicKeyPem, {algorithms: ['ES256']}, null);
        } catch (err) {
            // err
            console.error(err);
            throw new RangeError('Invalid authentication token supplied');
        }
    }

    validateNotificationHeaders(headers) {
        if (!headers.hasOwnProperty('encoding') || (headers.encoding !== 'aesgcm' && headers.encoding !== 'aes128gcm')) {
            throw new Error('Unsupported encoding');
        }

        if (!headers.hasOwnProperty('ttl') || headers.ttl === '') {
            throw new Error('TTL header is invalid: ' + headers.ttl);
        }

        if (!headers.hasOwnProperty('authorization') || headers.authorization === '') {
            throw new RangeError('Missing authorization header');
        }
    }

    validateCrypto(type, publicServerKey, savedPublicServerKey) {
        if (type !== 'p256ecdsa') {
            throw new Error('Invalid Crypto-Key header sent');
        }

        const crypto = require('crypto');
        const notificationEcdsaBytes = this.base64UrlDecode(publicServerKey);
        const serverKeyBytes = this.base64UrlDecode(savedPublicServerKey);
        if (!crypto.timingSafeEqual(notificationEcdsaBytes, serverKeyBytes)) {
            throw new Error('Invalid Crypto-Key header sent');
        }
    }

    async handleNotification(clientHash, pushHeaders, body) {
        if (!this.subscriptions.hasOwnProperty(clientHash)) {
            throw new RangeError('Client not subscribed');
        }
        const currentSubscription = this.subscriptions[clientHash];

        this.validateNotificationHeaders(pushHeaders);

        let eceParameters = {
            version: pushHeaders.encoding,
        };

        if (pushHeaders.encoding === 'aesgcm') {
            const [type, jwt] = pushHeaders.authorization.split(' ');
            if (type !== 'WebPush' || typeof jwt === 'undefined') {
                throw new Error('Invalid Authorization header sent');
            }
            await this.validateAuthorizationHeader(clientHash, jwt);

            let [dhType, notificationDh, ecdsaType, notificationEcdsa] = pushHeaders.cryptoKey.split(/[;=]/);
            const notificationDhBytes = this.base64UrlDecode(notificationDh);
            if (dhType !== 'dh' || this.base64UrlDecode(notificationDh).length !== 65  || notificationDhBytes[0] !== 4) {
                throw new Error('Invalid Crypto-Key header sent');
            }
            this.validateCrypto(ecdsaType, notificationEcdsa, currentSubscription.applicationServerKey);

            eceParameters.dh = notificationDhBytes;
            eceParameters.salt = pushHeaders.encryption.substr('salt='.length);
        } else if (pushHeaders.authorization.substr(0, 'key='.length) !== 'key=') {
            let [vapidHeaderString, notificationApplicationServerKey] = pushHeaders.authorization.split(',');
            notificationApplicationServerKey = notificationApplicationServerKey.trim();
            if (vapidHeaderString.substr(0, 'vapid t='.length) !== 'vapid t='
                || notificationApplicationServerKey.substr(0, 'k='.length) !== 'k=') {
                throw new Error('Invalid Authorization header sent');
            }

            this.validateCrypto(
                'p256ecdsa',
                notificationApplicationServerKey.substr('k='.length),
                currentSubscription.applicationServerKey
            );

            await this.validateAuthorizationHeader(clientHash, vapidHeaderString.substr('vapid t='.length));
        }

        const crypto = require('crypto');
        const newDh = crypto.createECDH('prime256v1');
        newDh.setPrivateKey(currentSubscription.subscriptionDh.getPrivateKey());

        const ece = require('http_ece');
        eceParameters.privateKey = newDh;
        eceParameters.authSecret = this.base64UrlDecode(currentSubscription.auth);

        const decryptedText = ece.decrypt(body, eceParameters);

        if (!this.messages.hasOwnProperty(clientHash)) {
            this.messages[clientHash] = [decryptedText.toString('utf-8')];
        } else {
            this.messages[clientHash].push(decryptedText.toString('utf-8'));
        }
    }

    getNotifications(requestBody) {
        if (!requestBody.hasOwnProperty('clientHash') || !this.subscriptions.hasOwnProperty(requestBody.clientHash)) {
            throw new RangeError('Client not subscribed');
        }
        const clientHash = requestBody.clientHash;

        return {
            messages: this.messages.hasOwnProperty(clientHash) ? this.messages[clientHash] : [],
        }
    }
}

module.exports = PushApiModel;
