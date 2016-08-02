/*
 * Licensed Materials - Property of IBM
 * (C) Copyright IBM Corp. 2015. All Rights Reserved.
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
 */

'use strict';

var elasticsearch = require('elasticsearch');
var AUDIT_ENDPOINT = process.env.HUBOT_AUDIT_ENDPOINT;

var client;

module.exports = {
	init: function() {
		if (!client && AUDIT_ENDPOINT) {
			client = new elasticsearch.Client({
				host: AUDIT_ENDPOINT,
				maxSockets: 1000,
				requestTimeout: 60000
			});
		}
		return client;
	},
	audit_endpoint: AUDIT_ENDPOINT
};
