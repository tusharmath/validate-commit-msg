#!/usr/bin/env node

/**
 * Git COMMIT-MSG hook for validating commit message
 * See https://docs.google.com/document/d/1rk04jEuGfk9kYzfqCuOlPTSJw3hEDZJTBN5E5f1SALo/edit
 *
 * Installation:
 * >> cd <angular-repo>
 * >> ln -s ../../validate-commit-msg.js .git/hooks/commit-msg
 */

'use strict';

var fs = require('fs');
var util = require('util');
var resolve = require('path').resolve;
var findup = require('findup');
var semverRegex = require('semver-regex')

var config = getConfig();
var MAX_LENGTH = config.maxSubjectLength || 100;
var IGNORED = new RegExp(util.format('(^WIP)|(^%s$)', semverRegex().source));
var TYPES = config.types || ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'chore', 'revert'];

// fixup! and squash! are part of Git, commits tagged with them are not intended to be merged, cf. https://git-scm.com/docs/git-commit
var PATTERN = /^((fixup! |squash! )?(\w+)(?:\(([^\)\s]+)\))?: (.+))(?:\n|$)/;
var MERGE_COMMIT_PATTERN = /^Merge branch \'.*\' into .*$/;
var error = function() {
  // gitx does not display it
  // http://gitx.lighthouseapp.com/projects/17830/tickets/294-feature-display-hook-error-message-when-hook-fails
  // https://groups.google.com/group/gitx/browse_thread/thread/a03bcab60844b812
  console[config.warnOnFail ? 'warn' : 'error']('INVALID COMMIT MSG: ' + util.format.apply(null, arguments));
};


var validateMessage = function(raw) {
  var message = (raw || '').split('\n').filter(function (str) {
    return str.indexOf('#') !== 0;
  }).join('\n');

  if (message === '') {
    console.log('Aborting commit due to empty commit message.');
    return false;
  }

  var isValid = true;

  if(MERGE_COMMIT_PATTERN.test(message)){
    console.log('Merge commit detected.');
    return true
  }

  if (IGNORED.test(message)) {
    console.log('Commit message validation ignored.');
    return true;
  }

  var match = PATTERN.exec(message);

  if (!match) {
    error('does not match "<type>(<scope>): <subject>" !');
    isValid = false;
  } else {
    var firstLine = match[1];
    var squashing = !!match[2];
    var type = match[3];
    var scope = match[4];
    var subject = match[5];

    if (firstLine.length > MAX_LENGTH && !squashing) {
      error('is longer than %d characters !', MAX_LENGTH);
      isValid = false;
    }

    if (TYPES !== '*' && TYPES.indexOf(type) === -1) {
      error('"%s" is not allowed type !', type);
      isValid = false;
    }
  }

  // Some more ideas, do want anything like this ?
  // - Validate the rest of the message (body, footer, BREAKING CHANGE annotations)
  // - allow only specific scopes (eg. fix(docs) should not be allowed ?
  // - auto correct the type to lower case ?
  // - auto correct first letter of the subject to lower case ?
  // - auto add empty line after subject ?
  // - auto remove empty () ?
  // - auto correct typos in type ?
  // - store incorrect messages, so that we can learn

  isValid = isValid || config.warnOnFail;

  if (isValid) { // exit early and skip messaging logics
    return true;
  }

  var argInHelp = config.helpMessage && config.helpMessage.indexOf('%s') !== -1;

  if (argInHelp) {
    console.log(config.helpMessage, message);
  } else if (message) {
    console.log(message);
  }

  if (!argInHelp && config.helpMessage) {
    console.log(config.helpMessage);
  }

  return false;
};


// publish for testing
exports.validateMessage = validateMessage;
exports.config = config;

// hacky start if not run by mocha :-D
// istanbul ignore next
if (process.argv.join('').indexOf('mocha') === -1) {

  var commitMsgFile = process.argv[2] || './.git/COMMIT_EDITMSG';
  var incorrectLogFile = commitMsgFile.replace('COMMIT_EDITMSG', 'logs/incorrect-commit-msgs');

  var hasToString = function hasToString(x) {
    return x && typeof x.toString === 'function';
  };

  fs.readFile(commitMsgFile, function(err, buffer) {
    var msg = firstLineFromBuffer(buffer);

    if (!validateMessage(msg)) {
      fs.appendFile(incorrectLogFile, msg + '\n', function() {
        process.exit(1);
      });
    } else {
      process.exit(0);
    }

    function firstLineFromBuffer(buffer) {
      return hasToString(buffer) && buffer.toString().split('\n').shift();
    }
  });
}

function getConfig() {
  var pkgFile = findup.sync(process.cwd(), 'package.json');
  var pkg = JSON.parse(fs.readFileSync(resolve(pkgFile, 'package.json')));
  return pkg && pkg.config && pkg.config['validate-commit-msg'] || {};
}
