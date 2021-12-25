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

            if (parameter === 'applicationServerKey' && !(await this.isValidVapidKey(value))) {
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

    async exportCryptoKey(key) {
        const { subtle } = require('crypto').webcrypto;
        const exported = await subtle.exportKey(
            "raw",
            key
        );

        return this.bytesArrayToKeyString(exported);
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
                false,
                []
            );
        } catch (err) {
            console.log(err);
            return {};
        }
    }

    async generateSubscriptionDhKeypair() {
        const { subtle } = require('crypto').webcrypto;
        return await subtle.generateKey(
            {
                name: "ECDH",
                namedCurve: "P-256"
            },
            true,
            ["deriveBits", "deriveKey"]
        );
    }

    async isValidVapidKey(key) {
        let cryptoKey = await this.importVapidKey(key);
        return cryptoKey.hasOwnProperty('type') && cryptoKey.type === 'public';
    }

    async createSubscription(options) {
        const { randomBytes } = require('crypto');
        const uniqueClientHash = randomBytes(32).toString('hex');
        const uniqueAuthKey = this.bytesArrayToKeyString(randomBytes(16));
        const subscriptionDh = await this.generateSubscriptionDhKeypair();

        let subscriptionData = {
            publicKey: subscriptionDh.publicKey,
            privateKey: subscriptionDh.privateKey,
            auth: uniqueAuthKey
        };
        this.subscriptions[uniqueClientHash] = subscriptionData;
        return {
            endpoint: this.notifyUrl + uniqueClientHash,
            key: {
                p256dh: await this.exportCryptoKey(subscriptionDh.publicKey),
                auth: subscriptionData.auth,
            }
        };
    }
}

module.exports = PushApiModel;
