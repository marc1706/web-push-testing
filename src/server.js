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

class WebPushTestingServer {
    constructor(port) {
        const express = require("express");

        this._port = port;
        this._host = 'localhost';
        this._app = express();
    }

    startServer() {
        if (typeof this._port !== 'number') {
            console.error('Invalid port supplied: ' + this._port);
            process.exit(1);
        }

        this._app.listen(this._port, () => {
            console.log("Server running on port " + this._port);
        });
    }
}

module.exports = WebPushTestingServer;