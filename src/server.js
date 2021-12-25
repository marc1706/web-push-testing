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
        const express = require("express");

        this._port = port;
        apiModel = pushApiModel;
        this._host = 'localhost';
        apiModel.notifyUrl = 'http://' + this._host + ':' + this._port + '/notify/';
        this._app = express();
        this._app.use(express.json());
        this._app.use(express.urlencoded({ extended: true }));
    }

    startServer() {
        if (typeof this._port !== 'number') {
            console.error('Invalid port supplied: ' + this._port);
            process.exit(1);
        }

        this._app.listen(this._port, () => {
            console.log("Server running on port " + this._port);
        });

        this.setRequestHandlers();
    }

    setRequestHandlers() {
        this._app.post('/start-test-suite', this.startTestSuite);
        this._app.post('/status', this.getStatus);
        this._app.post('/stop-test-suite', this.stopTestSuite);
        this._app.post('/subscribe', this.subscribe);
    }

    startTestSuite(req, res, next) {

    }

    stopTestSuite(req, res, next) {

    }

    getStatus(req, res) {
        res.sendStatus(200);
    }

    async subscribe(req, res) {
        try {
            const subscriptionOptions = req.body;
            const subscriptionData = await apiModel.subscribe(subscriptionOptions);
            res.status(200).send(subscriptionData);
        } catch (err) {
            res.status(400).send({
                error: {
                    message: err.message,
                }
            });
            // @todo: return error response
        }
    }
}

module.exports = WebPushTestingServer;