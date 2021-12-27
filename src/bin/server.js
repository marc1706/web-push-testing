#! /usr/bin/env node

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

const testingServer = require('../server.js');

const serverPort = JSON.parse(process.argv[2]);
const pushApiModel = require('../pushApiModel.js');
const apiModel = new pushApiModel();

const server = new testingServer(apiModel, serverPort);
server.startServer();