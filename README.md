[![Build Status](https://travis-ci.org/ibm-cloud-solutions/hubot-ibmcloud-audit.svg?branch=master)](https://travis-ci.org/ibm-cloud-solutions/hubot-ibmcloud-audit)
[![Coverage Status](https://coveralls.io/repos/github/ibm-cloud-solutions/hubot-ibmcloud-audit/badge.svg?branch=master)](https://coveralls.io/github/ibm-cloud-solutions/hubot-ibmcloud-audit?branch=master)
[![Dependency Status](https://dependencyci.com/github/ibm-cloud-solutions/hubot-ibmcloud-audit/badge)](https://dependencyci.com/github/ibm-cloud-solutions/hubot-ibmcloud-audit)
[![npm](https://img.shields.io/npm/v/hubot-ibmcloud-audit.svg?maxAge=2592000)](https://www.npmjs.com/package/hubot-ibmcloud-audit)

# hubot-ibmcloud-audit

This project is used to keep an audit trail of Hubot activities in Elasticsearch.

## Getting Started
  * [Usage](#usage)
	* [Overview](#overview)
  * [License](#license)
  * [Contribute](#contribute)

## Usage

Steps for adding this to your hubot:

1. cd into your hubot directory
2. Install this package via `npm install hubot-ibmcloud-audit --save`
3. Add `hubot-ibmcloud-audit` to your external-scripts.json
4. Add the necessary environment variables:

`HUBOT_AUDIT_ENDPOINT`=location of Elasticsearch

## Overview
`hubot-ibmcloud-audit` captures both incoming adapter traffic and outgoing HTTP traffic (to other sites and services). Incoming adapter traffic is captured in an type of `AdapterLogEntry` with an index of `hubotadapterrequest`.  The incoming adapter traffic is captured by hooking into the Hubot framework via a [Hubot middleware listener](https://github.com/github/hubot/blob/master/docs/scripting.md#listener-middleware). Logic has been added to the listener so that even if there are multiple matches the input will only be logged once.  

The information captured includes:
* UUID, spaceid, and groupid:  These are applicable to a hubot running inside a docker container.  They will default to `DEFAULT_UUID`, `DEFAULT_SPACE`, and `DEFAULT_GROUP` if the Hubot is not running inside a container.
* userName
* userId (email address)
* message text
* room ID
* adapter name
* robot name
* time of the message

This information is logged to Elasticsearch.  The location of Elasticsearch is determined by the value of the environment variable `HUBOT_AUDIT_ENDPOINT`.   `HUBOT_BLUEMIX_AUDIT_DISABLED` can also be set to true to disable all auditing (both of incoming adapter and outgoing HTTP traffic).

Outgoing HTTP traffic is captured by hooking into Node's default http and https modules by using the [global-request-logger package](https://github.com/meetearnest/global-request-logger).  It is captured in a type of `HttpLogEntry` with an index of `hubothttprequest`.  The following information is captured:
* UUID, spaceid, and groupid: Again, only applicable to a hubot running inside a docker container.  Otherwise they default to `DEFAULT_UUID`, `DEFAULT_SPACE`, and `DEFAULT_GROUP`.
* protocol
* URL
* host
* method
* time of outgoing request
* response status code
In order to prevent an infinite logging loop, traffic to the Elasticsearch `HUBOT_AUDIT_ENDPOINT` is not logged.  Traffic to 'api.slack.com/api' is also not logged.

There is one additional piece to hubot-ibmcloud-audit that allows it to play nice with [hubot-ibmcloud-nlc](https://github.com/ibm-cloud-solutions/hubot-ibmcloud-nlc).  Because `hubot-ibmcloud-nlc` bypasses the normal listener middleware path, `hubot-ibmcloud-audit` reacts to an emit on `ibmcloud-nlc-to-audit` and logs the incoming adapter traffic when it receives that.

## License

See [LICENSE.txt](https://github.com/ibm-cloud-solutions/hubot-ibmcloud-audit/blob/master/LICENSE.txt) for license information.

## Contribute

Please check out our [Contribution Guidelines](https://github.com/ibm-cloud-solutions/hubot-ibmcloud-audit/blob/master/CONTRIBUTING.md) for detailed information on how you can lend a hand.
