/*
  * Licensed Materials - Property of IBM
  * (C) Copyright IBM Corp. 2016. All Rights Reserved.
  * US Government Users Restricted Rights - Use, duplication or
  * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
  */
'use strict';

process.env.HUBOT_AUDIT_ENDPOINT = 'https://estest';

const es = require('../src/scripts/lib/es');
const Helper = require('hubot-test-helper');
const helper = new Helper('../src/scripts');

let room = helper.createRoom({httpd: false, name: 'foobar'});


const chai = require('chai');
const nock = require('nock');
const expect = chai.expect;
const rewire = require('rewire');
const auditAPI = rewire('../src/scripts/audit');

const audit = {};
audit.transformToAdapterLogEntry = auditAPI.__get__('transformToAdapterLogEntry');
audit.transformToHttpLogEntry = auditAPI.__get__('transformToHttpLogEntry');
audit.isValidHref = auditAPI.__get__('isValidHRef');
audit.saveLog = auditAPI.__get__('saveLog');
audit.recordAdapterCall = auditAPI.__get__('recordAdapterCall');

auditAPI.__set__('bot', room.robot);

// Passing arrow functions to mocha is discouraged: https://mochajs.org/#arrow-functions
// return promises from mocha tests rather than calling done() - http://tobyho.com/2015/12/16/mocha-with-promises/
describe('Test test via Slack', function() {


	context('creating log entries', function() {

		it('should create a proper adapter log entry', function() {
			var logEntry = audit.transformToAdapterLogEntry('Test User', 'testuser', 'some text', 'testroom', 'slack', 'testbot');

			var correct = {uuid: 'DEFAULT_UUID', spaceId: 'DEFAULT_SPACE', groupId: 'DEFAULT_GROUP', isIncomingRequest: true,
				userName: 'Test User', userId: 'testuser', text: 'some text', room: 'testroom', adapter: 'slack', robot: 'testbot', timestamp: logEntry.timestamp};
			expect(logEntry).to.deep.equal(correct);
		});

		it('should create a proper HTTP log entry', function() {
			var request = {};
			request.headers = {};
			request.headers.host = 'www.cnn.com';
			request.path = '/requestpath';
			request.method = 'GET';
			request.protocol = 'http';
			request.body = {foo: 'bar'};

			var response = {};
			response.statusCode = 200;

			var logEntry = audit.transformToHttpLogEntry(request, response, true);

			var correct = {uuid: 'DEFAULT_UUID', spaceId: 'DEFAULT_SPACE', groupId: 'DEFAULT_GROUP', statusCode: 200, protocol: 'http', url: 'www.cnn.com/requestpath', host: 'www.cnn.com', method: 'GET',
			isIncomingRequest: true, timestamp: logEntry.timestamp, body: '{"foo":"bar"}'};
			expect(logEntry).to.deep.equal(correct);
		});


	});

	context('dealing with urls', function() {
		it('should reject a slack api url', function() {
			expect(audit.isValidHref('api.slack.com/api/')).to.equal(false);
		});

		it('should accept a valid url', function() {
			expect(audit.isValidHref('www.cnn.com')).to.equal(true);
		});
	});

	context('adding adapter entry to elastic search', function() {
		it('should add an entry to elastic search', function(done) {
			process.env.HUBOT_BLUEMIX_AUDIT_DISABLED = false;
			nock(es.audit_endpoint).log(console.log).post('/hubotadapterrequest/AdapterLogEntry', { uuid: 'DEFAULT_UUID', spaceId: 'DEFAULT_SPACE', groupId: 'DEFAULT_GROUP', isIncomingRequest: true,
			userId: 'testuser@test.com', adapter: 'unknown', robot: 'hubot' }).reply(200, {
			});

			var context = {};
			context.response = {};
			context.response.message = {};
			context.response.message.text = 'Hello World';
			context.response.message.user = {};
			context.response.message.user.profile = {};
			context.response.message.user.profile.email = 'testuser@test.com';
			audit.recordAdapterCall(context, function() {
				expect(context.response.message.isLogged).to.equal(true);
				done();
			}, new function() {});
		});

		it('should not add an adapter entry to elastic search when audit is disabled', function(done) {
			process.env.HUBOT_BLUEMIX_AUDIT_DISABLED = true;
			nock(es.audit_endpoint).post('/hubotadapterrequest/AdapterLogEntry', { uuid: 'DEFAULT_UUID', spaceId: 'DEFAULT_SPACE', isIncomingRequest: true,
			userId: 'testuser@test.com', adapter: 'unknown', robot: 'unknown' }).reply(200, {
			});

			var context = {};
			context.response = {};
			context.response.message = {};
			context.response.message.user = {};
			context.response.message.user.email_address = 'testuser@test.com';
			audit.recordAdapterCall(context, function() {
				expect(context.response.message.isLogged).to.not.equal(true);
				done();
			}, new function() {});
		});
	});

	context('adding http entry to elastic search', function() {
		it('should add an http entry to elastic search', function(done) {
			process.env.HUBOT_BLUEMIX_AUDIT_DISABLED = false;

			var logging = nock(es.audit_endpoint).post('/hubothttprequest/HttpLogEntry', { uuid: 'DEFAULT_UUID', spaceId: 'DEFAULT_SPACE',
			statusCode: 200, protocol: 'http', url: 'www.cnn.com/requestpath', host: 'www.cnn.com', method: 'GET', isIncomingRequest: 'false',
			body: '{"foo":"bar"}'}).reply(200, {
			});

			var request = {};
			request.headers = {};
			request.headers.host = 'www.cnn.com';
			request.path = '/requestpath';
			request.method = 'GET';
			request.protocol = 'http';
			request.body = {foo: 'bar'};

			var response = {};
			response.statusCode = 200;
			audit.saveLog(request, response, 'false');

			setTimeout(function() {
				logging.done();
				done();
			}, 1000);
		});
	});
});
