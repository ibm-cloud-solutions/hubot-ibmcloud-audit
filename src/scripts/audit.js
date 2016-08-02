// Description:
//   Audits the incoming and outgoing requests

'use strict';

var path = require('path');
var TAG = path.basename(__filename);

const gRequestLogger = require('global-request-logger');

var bot = null;
var uuid = process.env.uuid || 'DEFAULT_UUID';
var spaceId = process.env.space_id || 'DEFAULT_SPACE';
var groupId = process.env.group_id || 'DEFAULT_GROUP';

var adapterIndexName = 'hubotadapterrequest';
var httpIndexName = 'hubothttprequest';

var incomingAdapterStr = 'AdapterLogEntry';
var incomingHttpStr = 'HttpLogEntry';

var es = require('./lib/es');
var esClient = es.init();

var esHost = es.audit_endpoint;

var blacklistedHosts = [removeProtocol(esHost), 'api.slack.com/api/'];

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
	var isDisabled = (process.env.HUBOT_BLUEMIX_AUDIT_DISABLED && (process.env.HUBOT_BLUEMIX_AUDIT_DISABLED === 'TRUE' || process.env.HUBOT_BLUEMIX_AUDIT_DISABLED === 'true'));
	var isNotDefined = !es.audit_endpoint;
	return isDisabled || isNotDefined;
}

function removeProtocol(url) {
	if (url) {
		var newUrl = url;
		if (url.indexOf('http://') >= 0) {
			newUrl = url.substring(7, url.length);
		}
		if (url.indexOf('https://') >= 0) {
			newUrl = url.substring(8, url.length);
		}
		return newUrl;
	}
}

function transformToAdapterLogEntry(name, userId, text, room, adapterName, robotName, timestamp) {
	var entry = {
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
		timestamp: timestamp};
	return entry;
}

function transformToHttpLogEntry(request, response, isIncoming) {
	var protocol = request.protocol || 'http:';

	if (protocol.endsWith(':')) {
		protocol = protocol.substring(0, (protocol.length) - 1);
	}

	var host = request.headers.host;
	var entry = {
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
		var body = JSON.stringify(request.body);
		entry.body = body;
	}
	return entry;
}

function isValidHRef(entryHost) {

	for (var i = 0; i < blacklistedHosts.length; i++) {
		if (entryHost.indexOf(blacklistedHosts[i]) >= 0) {
			return false;
		}
	}
	return true;
}

function saveLog(request, response, isIncoming, type) {
	if (!auditDisabled()) {
		var entryBody = transformToHttpLogEntry(request, response, isIncoming);
		if (typeof entryBody.host !== 'undefined' && isValidHRef(entryBody.url)) {
			// Request was not to ES so persist it
			var body =
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
			if (context.response.message.text) {
				if (bot) {
					bot.logger.debug(`${TAG}: setting context.response.message.isLogged to true`);
				}
				context.response.message.isLogged = true;

				var adapterName = 'unknown';
				if (bot && bot.adapterName !== null) {
					adapterName = bot.adapterName;
				}

				var robotName = 'unknown';
				if (bot) {
					robotName = bot.name;
				}

				var currTime = new Date().getTime();

				var body = {
					index: adapterIndexName,
					type: incomingAdapterStr,
					body:
						transformToAdapterLogEntry(context.response.message.user.name,
							context.response.message.user.email_address,
							context.response.message.text,
							context.response.message.user.room,
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
