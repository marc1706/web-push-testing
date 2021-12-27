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

    keyStringToBytesArray(keyString) {
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

    async exportRawKey(key) {
        const { subtle } = require('crypto').webcrypto;
        const exported = await subtle.exportKey(
            "raw",
            key
        );

        return this.bytesArrayToKeyString(exported);
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
        const bytes = this.keyStringToBytesArray(keyString);
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
            console.log(err);
        }
    }

    async generateSubscriptionEcdh() {
        const crypto = require('crypto');
        const ecdh = crypto.createECDH('prime256v1');
        ecdh.generateKeys();
        return ecdh;
    }

    /**
     * Decode string from base64url format according to RFC 7515:
     * https://www.rfc-editor.org/rfc/rfc7515#appendix-C
     *
     * @param string Base64url encoded string
     * @returns {string} Base64 encoded string
     */
    decodeBase64UrlString(string) {
        const urlSafeBase64 = require('urlsafe-base64');

        return urlSafeBase64.decode(string).toString('base64');
    }

    /**
     * Encode string from base64url format according to RFC 7515:
     * https://www.rfc-editor.org/rfc/rfc7515#appendix-C
     *
     * @param {string} string Base64 encoded string
     * @returns {string} Base64url encoded string
     */
    encodeBase64UrlString(string) {
        const urlSafeBase64 = require('urlsafe-base64');
        return urlSafeBase64.encode(string).toString('base64');
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
        const subscriptionReturn = {
            endpoint: this.notifyUrl + uniqueClientHash,
            keys: {
                p256dh: this.encodeBase64UrlString(subscriptionData.publicKey),
                auth: this.encodeBase64UrlString(subscriptionData.auth),
            }
        };
        console.log(subscriptionReturn);
        return subscriptionReturn;
    }

    async validateAuthorizationHeader(clientHash, authorization) {
        const [type, token] = authorization.split(' ');
        if (type !== 'WebPush' || typeof token === 'undefined') {
            return false;
        }

        const jwt = require('jsonwebtoken');
        try {
            const applicationKey = await this.importVapidKey(this.decodeBase64UrlString(this.subscriptions[clientHash].applicationServerKey));
            const publicKeyPem = await this.exportPemKey(applicationKey);
            jwt.verify(token, publicKeyPem, {algorithms: ['ES256']}, null);
        } catch(err) {
            // err
            console.error(err);
            throw new RangeError('Invalid authentication token supplied');
        }
    }

    validateNotificationHeaders(headers) {
        if (!headers.hasOwnProperty('encoding') || headers.encoding !== 'aesgcm') {
            throw new Error('Unsupported encoding');
        }

        if (!headers.hasOwnProperty('ttl') || headers.ttl === '') {
            throw new Error('TTL header is invalid: ' + headers.ttl);
        }

        if (!headers.hasOwnProperty('authorization') || headers.authorization === '') {
            throw new RangeError('Missing authorization header');
        }
    }

    hkdf(salt, ikm, info, length) {
        const crypto = require("crypto");

        // Extract
        const keyHmac = crypto.createHmac('sha256', salt);
        keyHmac.update(ikm);
        const key = keyHmac.digest();

        // Expand
        const infoHmac = crypto.createHmac('sha256', key);
        infoHmac.update(info);

        // A one byte long buffer containing only 0x01
        const ONE_BUFFER = Buffer.alloc(1, 1);
        infoHmac.update(ONE_BUFFER);

        return infoHmac.digest().slice(0, length);
    }

    async handleNotification(clientHash, pushHeaders, body) {
        if (!this.subscriptions.hasOwnProperty(clientHash)) {
            throw new RangeError('Client not subscribed');
        }
        const currentSubscription = this.subscriptions[clientHash];

        this.validateNotificationHeaders(pushHeaders);
        await this.validateAuthorizationHeader(clientHash, pushHeaders.authorization);


        let [dhType, notificationDh, ecdsaType, notificationEcdsa] = pushHeaders.cryptoKey.split(/[;=]/);
        if (dhType !== 'dh' || ecdsaType !== 'p256ecdsa') {
            throw new Error('Invalid Crypto-Key header sent');
        }

        const crypto = require('crypto');
        const notificationEcdsaBytes = this.keyStringToBytesArray(this.decodeBase64UrlString(notificationEcdsa));
        const serverKeyBytes = this.keyStringToBytesArray(this.decodeBase64UrlString(currentSubscription.applicationServerKey));
        if (!crypto.timingSafeEqual(notificationEcdsaBytes, serverKeyBytes)) {
            throw new Error('Invalid Crypto-Key header sent');
        }

        let serverDh = currentSubscription.subscriptionDh;
        const newDh = crypto.createECDH('prime256v1');
        newDh.setPrivateKey(serverDh.getPrivateKey());
        const notificationDhBytes = this.keyStringToBytesArray(this.decodeBase64UrlString(notificationDh));
        const sharedSecret = newDh.computeSecret(notificationDhBytes);

        // Create ikm
        const encoder = new TextEncoder();
        const authEncoding = encoder.encode("Content-Encoding: auth\0");
        const auth = this.keyStringToBytesArray(this.decodeBase64UrlString(currentSubscription.auth));
        const ikm = this.hkdf(auth, sharedSecret, authEncoding, 32);

        // Create context
        const subscriptionPublicArray = serverDh.getPublicKey();
        const subscriptionPubKeyLength = Buffer.alloc(2, "\0" + String.fromCodePoint(subscriptionPublicArray.length));
        const localPublicKeyLength = Buffer.alloc(2, "\0" + String.fromCodePoint(notificationDhBytes.length));
        const context = Buffer.concat([
            encoder.encode('P-256\0'),
            subscriptionPubKeyLength,
            subscriptionPublicArray,
            localPublicKeyLength,
            notificationDhBytes
        ]);

        // Create content encryption key
        const cekEncBuffer = encoder.encode('Content-Encoding: aesgcm\0');
        const contentEncryptionKeyInfo = Buffer.concat([cekEncBuffer, context]);
        const salt = this.keyStringToBytesArray(this.decodeBase64UrlString(pushHeaders.encryption.split('=')[1]));
        const contentEncryptionKey = this.hkdf(salt, ikm, contentEncryptionKeyInfo, 16);

        // Create nonce
        const nonceEncBuffer = encoder.encode('Content-Encoding: nonce\0');
        const nonceInfo = Buffer.concat([nonceEncBuffer, context]);
        const nonce = this.hkdf(salt, ikm, nonceInfo, 12);

        // @todo: now that we have all the data, start implementing the decryption
        console.log(pushHeaders);
        console.log(body);
    }
}

module.exports = PushApiModel;
