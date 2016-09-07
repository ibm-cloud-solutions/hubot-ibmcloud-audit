// Description:
//   Audits the incoming and outgoing requests

'use strict';

const path = require('path');
const TAG = path.basename(__filename);

const gRequestLogger = require('global-request-logger');

let bot = null;
const uuid = process.env.uuid || 'DEFAULT_UUID';
const spaceId = process.env.space_id || 'DEFAULT_SPACE';
const groupId = process.env.group_id || 'DEFAULT_GROUP';

const adapterIndexName = 'hubotadapterrequest';
const httpIndexName = 'hubothttprequest';

const incomingAdapterStr = 'AdapterLogEntry';
const incomingHttpStr = 'HttpLogEntry';

const es = require('./lib/es');
const esClient = es.init();

const esHost = es.audit_endpoint;

const blacklistedHosts = [removeProtocol(esHost), 'api.slack.com/api/'];

gRequestLogger.initialize();

if (auditDisabled()) {
	if (bot) {
		bot.logger.error(`${TAG}: Auditing is disabled. To enable auditing, ensure HUBOT_AUDIT_ENDPOINT is defined and HUBOT_BLUEMIX_AUDIT_DISABLED is not set to true`);
	}
}

gRequestLogger.on('success', function(request, response) {
	saveLog(request, response, false, 'success');
});

gRequestLogger.on('error', function(request, response) {
	saveLog(request, response, false, 'error');
});

function auditDisabled() {
	let isDisabled = (process.env.HUBOT_BLUEMIX_AUDIT_DISABLED && (process.env.HUBOT_BLUEMIX_AUDIT_DISABLED === 'TRUE' || process.env.HUBOT_BLUEMIX_AUDIT_DISABLED === 'true'));
	let isNotDefined = !es.audit_endpoint;
	return isDisabled || isNotDefined;
}

function removeProtocol(url) {
	if (url) {
		let newUrl = url;
		if (url.indexOf('http://') >= 0) {
			newUrl = url.substring(7, url.length);
		}
		if (url.indexOf('https://') >= 0) {
			newUrl = url.substring(8, url.length);
		}
		return newUrl;
	}
}

function transformToAdapterLogEntry(name, userId, text, room, roomName, adapterName, robotName, timestamp) {
	let entry = {
		uuid: uuid,
		spaceId: spaceId,
		groupId: groupId,
		isIncomingRequest: true,
		userName: name,
		userId: userId,
		text: text,
		adapter: adapterName,
		robot: robotName,
		room: room,
		roomName: roomName,
		timestamp: timestamp};
	return entry;
}

function transformToHttpLogEntry(request, response, isIncoming) {
	let protocol = request.protocol || 'http:';

	if (protocol.endsWith(':')) {
		protocol = protocol.substring(0, (protocol.length) - 1);
	}

	let host = request.headers.host;
	let entry = {
		uuid: uuid,
		spaceId: spaceId,
		groupId: groupId,
		statusCode: (response.statusCode ? response.statusCode : -1),
		protocol: protocol,
		url: host.concat(request.path),
		host: host,
		method: request.method,
		isIncomingRequest: isIncoming,
		timestamp: new Date().getTime()
	};

	if (request.headers['user-agent']) {
		entry.userAgent = request.headers['user-agent'];
	}

	if (isIncoming) {
		let body = JSON.stringify(request.body);
		entry.body = body;
	}
	return entry;
}

function isValidHRef(entryHost) {

	for (let i = 0; i < blacklistedHosts.length; i++) {
		if (entryHost.indexOf(blacklistedHosts[i]) >= 0) {
			return false;
		}
	}
	return true;
}

function saveLog(request, response, isIncoming, type) {
	if (!auditDisabled()) {
		let entryBody = transformToHttpLogEntry(request, response, isIncoming);
		if (typeof entryBody.host !== 'undefined' && isValidHRef(entryBody.url)) {
			// Request was not to ES so persist it
			let body =
				{index: httpIndexName,
					type: incomingHttpStr,
					body: entryBody};
			if (bot) {
				bot.logger.debug(`${TAG}: Logging outgoing HTTP ${type} for url ${entryBody.url}`);
			}
			esClient.index(body, function(error, response) {
				if (error && bot) {
					// handle error
					bot.logger.error(`${TAG}: ` + error);
				}
			});
		}
	}
}

function recordAdapterCall(context, next, done) {
	if (!auditDisabled()) {
		if (bot) {
			bot.logger.debug(`${TAG}:  recordAdapterCall with context.response.message.isLogged of ` + JSON.stringify(context.response.message.isLogged));
		}

		if (context.response.message.isLogged === undefined) {
			// ignore messages that don't have text or that come from the user hubot which runs tests
			if (context.response.message.text && context.response.message.user && context.response.message.user.name !== 'hubot') {
				if (bot) {
					bot.logger.debug(`${TAG}: setting context.response.message.isLogged to true`);
				}
				context.response.message.isLogged = true;

				let adapterName = 'unknown';
				if (bot && bot.adapterName !== null) {
					adapterName = bot.adapterName;
				}

				if (bot) {
					bot.logger.debug(`${TAG}: setting adapter name to ` + adapterName);
				}

				let robotName = 'unknown';
				if (bot) {
					robotName = bot.name;
				}

				if (bot) {
					bot.logger.debug(`${TAG}: setting robotName to ` + robotName);
				}

				let roomName = 'unknown';
				if (bot && bot.adapter && bot.adapter.client && bot.adapter.client.rtm && bot.adapter.client.rtm.dataStore) {
					let roomObj = bot.adapter.client.rtm.dataStore.getChannelGroupOrDMById(context.response.message.user.room);
					if (roomObj.name) {
						roomName = roomObj.name;
					}
				}

				if (bot) {
					bot.logger.debug(`${TAG}: setting room name to ` + roomName);
				}

				let currTime = new Date().getTime();

				let emailAddress = context.response.message.user.email_address;

				if (!emailAddress && context.response.message.user.profile) {
					emailAddress = context.response.message.user.profile.email;
				}

				let body = {
					index: adapterIndexName,
					type: incomingAdapterStr,
					body:
						transformToAdapterLogEntry(context.response.message.user.name,
							emailAddress,
							context.response.message.text,
							context.response.message.user.room,
							roomName,
							adapterName, robotName, currTime)
				};
				if (bot) {
					let jsonBody = JSON.stringify(body);
					bot.logger.debug(`${TAG}: Attempting to send audit message to elasticsearch with body: ${jsonBody}`);
				}

				esClient.index(body, function(error, response) {
					if (error && bot) {
						// handle error
						bot.logger.error(`${TAG}: ` + error);
					}
				});
			}
		}
		else {
			if (bot) {
				bot.logger.debug(`${TAG}: No text detected so no audit message sent`);
			}
		}
	}
	next(done);
};


module.exports = function(robot) {
	bot = robot;
	robot.listenerMiddleware(recordAdapterCall);

	robot.on('ibmcloud-nlc-to-audit', (res) => {
		bot.logger.debug(`${TAG}: IBMCLOUD_NLC_TO_AUDIT`);
		recordAdapterCall({response: res}, function next(){
		}, function done() {
		});
	});
};
