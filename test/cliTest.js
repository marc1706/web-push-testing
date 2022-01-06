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

const WebPushTestingCli = require('../src/cli.js');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const {assert} = require('chai');
require('chai').should();

describe('CLI Tests', () => {
	const originalExit = process.exit;
	const originalLog = console.log;
	const originalError = console.error;
	const originalArgv = process.argv;

	let testExitCode = -1;
	let consoleLogs = [];
	let consoleErrors = [];

	before(() => {
		process.exit = code => {
			testExitCode = code;
		};

		process.argv = [];
	});

	after(() => {
		process.exit = originalExit;
		process.argv = originalArgv;
	});

	beforeEach(() => {
		consoleLogs = [];
		testExitCode = -1;
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

	const setArgv = args => {
		process.argv = [
			'/usr/bin/node',
			__filename,
		];

		args.forEach(arg => {
			process.argv.push(arg);
		});
	};

	it('should be able to require the cli from package.json', () => {
		const binValues = require('../package.json').bin;
		const cliPath = binValues['web-push-testing'];
		fs.accessSync(path.join(__dirname, '..', cliPath), fs.F_OK);
	});

	describe('should be able to get help text from cli with help flags', () => {
		['-h', '--help'].forEach(helpFlag => {
			it(helpFlag + ' flag', () => {
				startLogging();
				setArgv([helpFlag]);

				new WebPushTestingCli();
				testExitCode.should.equal(0);
				consoleLogs.length.should.greaterThan(10);
				consoleLogs[0].should.equal('web-push-testing');
				consoleLogs[2].should.equal('Usage:');
				endLogging();
			});
		});
	});

	describe('should be able to get help text from cli with help flags via src/bin/cli.js', () => {
		['-h', '--help'].forEach(helpFlag => {
			it(helpFlag + ' flag', () => {
				const {spawnSync} = require('child_process');
				const testingCliOutput = spawnSync('node', [path.join(__dirname, '../src/bin/cli.js'), helpFlag], {});
				testingCliOutput.status.should.equal(0);
				const textDecoder = new TextDecoder();
				consoleLogs = textDecoder.decode(testingCliOutput.stdout).toString().split('\n');
				consoleLogs.length.should.greaterThan(10);
				consoleLogs[0].should.equal('web-push-testing');
				consoleLogs[2].should.equal('Usage:');
				endLogging();
			});
		});
	});

	it('should throw error when passing invalid data to flags', () => {
		startLogging();
		setArgv(['-p=wrong', 'start']);

		new WebPushTestingCli();
		testExitCode.should.equal(1);
		consoleErrors.length.should.greaterThan(1);
		consoleErrors[0].should.contain('Invalid or unexpected input');
		endLogging();
	});

	describe('should be able to get version from cli with version flags', () => {
		['-v', '--version'].forEach(versionFlag => {
			it(versionFlag + ' flag', () => {
				startLogging();
				setArgv([versionFlag]);

				new WebPushTestingCli();
				testExitCode.should.equal(0);
				consoleLogs.length.should.equal(1);
				const {version} = require('../package.json');
				consoleLogs[0].should.contain(version);
				endLogging();
			});
		});
	});

	it('should show message on invalid command', () => {
		startLogging();
		setArgv(['random']);

		new WebPushTestingCli();
		testExitCode.should.equal(1);
		consoleErrors.length.should.greaterThan(0);
		consoleErrors[0].should.contain('Invalid command');
		endLogging();
	});

	it('should show error on more than one command', () => {
		startLogging();
		setArgv(['start', 'stop']);

		new WebPushTestingCli();
		testExitCode.should.equal(1);
		consoleErrors.length.should.greaterThan(0);
		consoleErrors[0].should.contain('Maximum of one command is supported');
		endLogging();
	});

	it('should show message on invalid flag', () => {
		startLogging();
		setArgv(['--foo']);

		new WebPushTestingCli();
		testExitCode.should.equal(1);
		consoleErrors.length.should.greaterThan(0);
		consoleErrors[0].should.contain('unknown');
		endLogging();
	});

	it('should show message on missing command', () => {
		startLogging();
		setArgv(['--port=1234']);

		new WebPushTestingCli();
		testExitCode.should.equal(1);
		consoleErrors.length.should.greaterThan(0);
		consoleErrors[0].should.contain('No command');
		endLogging();
	});

	const startStopServerTest = function (args) {
		return function () {
			let port = 8090;
			if (args) {
				const portFlag = args.find(element => element === '-p' || element === '--port');
				if (portFlag) {
					const portFlagIndex = args.indexOf(portFlag);
					args.length.should.greaterThan(portFlagIndex + 1);
					const portString = args[portFlagIndex + 1];
					port = parseInt(portString, 10);
				}
			} else {
				args = [];
			}

			return new Promise(resolve => {
				process.exit = code => {
					testExitCode = code;
					resolve();
				};

				setArgv(args.concat(['start']));

				new WebPushTestingCli();
			})
				.then(() => {
					const getStatus = () => fetch('http://localhost:' + port + '/status', {
						method: 'POST',
					}).catch(() => {
						setTimeout(() => {
						}, 200);
						return getStatus();
					});

					return getStatus();
				})
				.then(response => {
					response.status.should.equal(200);

					return new Promise(resolve => {
						testExitCode = -1;

						process.exit = code => {
							testExitCode = code;
							resolve();
						};

						setArgv(args.concat(['stop']));

						new WebPushTestingCli();
					});
				})
				.then(() => {
					testExitCode.should.equal(0);
				});
		};
	};

	it('should be able to run server with default values', startStopServerTest());
	it('should be able to run server with -p flag', startStopServerTest(['-p', '8999']));
	it('should be able to run server with --port flag', startStopServerTest(['--port', '8099']));

	it('should fail when trying to start server more than once', () => {
		const port = 8090;

		return new Promise(resolve => {
			process.exit = code => {
				testExitCode = code;
				resolve();
			};

			setArgv(['start']);

			new WebPushTestingCli();
		})
			.then(() => {
				const getStatus = () => fetch('http://localhost:' + port + '/status', {
					method: 'POST',
				}).catch(() => {
					setTimeout(() => {
					}, 200);
					return getStatus();
				});

				return getStatus();
			})
			.then(response => {
				response.status.should.equal(200);

				return new Promise(resolve => {
					testExitCode = -1;

					process.exit = code => {
						testExitCode = code;
						resolve();
					};

					startLogging();
					setArgv(['start']);

					new WebPushTestingCli();
				});
			})
			.then(() => {
				testExitCode.should.equal(1);
				consoleLogs.length.should.greaterThan(0);
				consoleLogs[0].should.contain('Server seems to already run on port');
				endLogging();

				return new Promise(resolve => {
					testExitCode = -1;

					process.exit = code => {
						testExitCode = code;
						resolve();
					};

					setArgv(['stop']);

					new WebPushTestingCli();
				});
			})
			.then(() => {
				testExitCode.should.equal(0);
			});
	});

	it('should fail when trying to stop unknown server', () => new Promise(resolve => {
		process.exit = code => {
			testExitCode = code;
			resolve();
		};

		setArgv(['stop']);
		startLogging();

		new WebPushTestingCli();
	})
		.then(() => {
			testExitCode.should.equal(1);
			consoleLogs.length.should.greaterThan(0);
			consoleLogs[0].should.contain('Server does not seem to run');
			endLogging();
		}));

	it('should fail when trying to stop unknown server with non-existing processData', () => {
		let cli;
		return new Promise(resolve => {
			process.exit = code => {
				testExitCode = code;
				resolve();
			};

			setArgv(['stop']);
			startLogging();
			cli = new WebPushTestingCli();
		})
			.then(() => {
				testExitCode.should.equal(1);
				consoleLogs.length.should.greaterThan(0);
				consoleLogs[0].should.contain('Server does not seem to run');
				endLogging();
			})
			.then(() => {
				startLogging();
				cli.storage.removeItemSync('processData');
				try {
					cli.stopService();
					testExitCode.should.equal(1);
					consoleLogs.length.should.greaterThan(0);
					consoleLogs[0].should.contain('Server does not seem to run');
					endLogging();
				} catch {
					assert.fail('Threw unexpected exception');
				}
			});
	});

	it('should fail to start if port is already used', () => {
		const http = require('http');
		const testPort = 8999;
		const server = http.createServer((req, res) => {
			res.statusCode = 200;
			res.end();
		});
		server.listen(testPort);

		const isServerRunning = resolve => {
			if (server.listening) {
				resolve();
			} else {
				setTimeout(() => {
				}, 200);
				isServerRunning(resolve);
			}
		};

		return new Promise(isServerRunning)
			.then(() => new Promise(resolve => {
				process.exit = code => {
					testExitCode = code;
					resolve();
				};

				setArgv(['--port=' + testPort, 'start']);
				startLogging();
				new WebPushTestingCli();
			}))
			.then(() => new Promise(resolve => {
				setTimeout(resolve, 1000);
			}))
			.then(() => {
				testExitCode.should.equal(1);
				consoleLogs.length.should.greaterThan(0);
				consoleErrors.length.should.greaterThan(0);
				consoleErrors[0].should.contain('Failed running testing server');
				endLogging();
				server.close();
			});
	});
});
