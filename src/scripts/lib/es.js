/*
 * Licensed Materials - Property of IBM
 * (C) Copyright IBM Corp. 2015. All Rights Reserved.
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
 */

'use strict';

const elasticsearch = require('elasticsearch');
const AUDIT_ENDPOINT = process.env.HUBOT_AUDIT_ENDPOINT;
const groupId = process.env.group_id || 'DEFAULT_GROUP';

const url = require('url');

var client;

module.exports = {
	init: function() {
		if (!client && AUDIT_ENDPOINT) {
			const esUrl = url.parse(AUDIT_ENDPOINT);
			client = new elasticsearch.Client({
				maxSockets: 1000,
				requestTimeout: 60000,
				host: {
					protocol: 'https',
					host: esUrl.hostname,
					port: 443,
					headers: {
						'X-HUBOT-AUTH-TOKEN': groupId
					}
				}
			});
		}
		return client;
	},
	audit_endpoint: AUDIT_ENDPOINT
};
