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

class WebPushTestingCli
{
    constructor() {
        this.port = 8090;
        this.storage = require('node-persist');
        this.storage.initSync();

        this.parseCliArguments();
    }

    parseCliArguments() {
        const arg = require('arg');
        let $this = this;

        try {
            const cliArgs = arg(
                {
                    '--version': Boolean,
                    '--help': Boolean,
                    '--port': Number,
                    '-v': '--version',
                    '-h': '--help',
                    '-p': '--port',
                }
            );

            $this.handleCliArguments(cliArgs);
        } catch (err) {
            if (err.code === 'ARG_UNKNOWN_OPTION') {
                console.error(err.message);
                process.exit(1);
            } else {
                throw err;
            }
        }
    }

    handleCliArguments(cliArgs) {
        if (cliArgs.hasOwnProperty('--help')) {
            return this.printHelpText();
        }

        if (cliArgs.hasOwnProperty('--version')) {
            return this.printVersion();
        }

        if (cliArgs.hasOwnProperty('--port')) {
            this.port = cliArgs['--port'];
        }

        if (cliArgs.hasOwnProperty('_') && cliArgs._.length > 0) {
            return this.handleCommand(cliArgs);
        } else {
            console.error('No command passed.');
            process.exit(1);
        }
    }

    printHelpText() {
        console.log('web-push-testing');
        console.log('');
        console.log('Usage:');
        console.log('    web-push-testing [options] [command]');
        console.log('');
        console.log('Command:');
        console.log('    start                         Start web-push-testing server');
        console.log('    stop                          Stop web-push-testing server');
        console.log('');
        console.log('Options:');
        console.log('    -h --help                     Show the help screen');
        console.log('    -p --port <Port Number>       Set port the service will run on');
        console.log('       --version                  Output current version of web-push-testing');
        console.log('');
        process.exit(0);
    }

    printVersion() {
        const packageJson = require('../package.json');
        console.log(packageJson.name + ': ' + packageJson.version);
        process.exit(0);
    }

    handleCommand(cliArgs) {
        // Ensure we only get one command
        if (cliArgs._.length > 1) {
            console.error("Maximum of one command is supported, passed " + cliArgs._.length + ':');
            for (const command of cliArgs._) {
                console.error('    ' + command);
            }
            return;
        }

        const command = cliArgs._.pop();

        if (command === 'start') {
            this.startService();
        } else if (command === 'stop') {
            this.stopService();
        } else {
            console.error('Invalid command: ' + command);
            process.exit(1);
        }
    }

    getProcessData() {
        let processData = this.storage.getItemSync('processData');
        if (typeof processData === 'undefined') {
            processData = {};
        }

        return processData;
    }

    startService() {
        let processData = this.getProcessData();
        if (processData.hasOwnProperty(this.port)) {
            console.log('Server seems to already run on port ' + this.port);
            console.log('Stop server first before starting it on the same port.');
            process.exit(1);
        }

        console.log('Starting server on port ' + this.port);
        const { spawn } = require('child_process');
        const childProcessOptions = {
            detached: true,
        }
        const path = require('path');
        const testingServer = spawn('node', [path.join(__dirname, 'bin/server.js'), this.port], childProcessOptions);

        testingServer.stdout.on('data', (data) => {
            console.log(data.toString());
            processData[this.port] = testingServer.pid;
            this.storage.setItemSync('processData', processData);
            process.exit(0);
        });

        testingServer.on('error', (err) => {
            console.error('Failed to start testing server.');
            console.log(err);
            process.exit(1);
        });
    }

    stopService() {
        let processData = this.getProcessData();
        const port = this.port;
        const storage = this.storage;

        if (!processData.hasOwnProperty(port)) {
            console.log('Server does not seem to run on port ' + port);
            process.exit(0);
        }

        const ps = require('ps-node');

        ps.kill(processData[port], function() {
            // Assume we were successful, no way of knowing e.g. on WSL2
            console.log('Server at port %d has been stopped.', port);
            delete processData[port];
            storage.setItemSync('processData', processData);
            process.exit(0);
        });
    }
}

module.exports = WebPushTestingCli;
