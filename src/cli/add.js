'use strict';

var fs = require('fs-extra');
var path = require('path');
var untildify = require('untildify');
var inquirer = require('inquirer');
var isThere = require('is-there');
var links = require('../links.js');

exports.command = 'add <src> <dest> [silent]';

exports.describe = 'Adds a link';

exports.builder = {};

function promptForIgnoredFolders(src, rules, silent) {
	var prompts = [];
	let defaults = {};

	rules.forEach((rule) => {
		if (isThere(path.resolve(src, rule.relPath))) {
			prompts.push({
				name: rule.name,
				message: rule.message,
				default: rule.default,
				type: 'confirm'
			});
			let def = {};
			def[rule.name]=rule.default;
			Object.assign(defaults, def);
		}
	});

	return silent==="true" ?
		Promise.resolve(defaults).then((answers) => {
			return setIgnoredFolders(answers, rules);
		})
	:
		inquirer.prompt(prompts).then((answers) => {
			return setIgnoredFolders(answers, rules);
		});
}

function setIgnoredFolders(answers, rules) {
	var ignoredFolders = [];

	rules.forEach((rule) => {
		if (answers[rule.name]) {
			ignoredFolders.push(rule.ignore);
		}
	});

	return ignoredFolders;
}

function dedupeArray(array) {
    var arr = array.concat();

    for (var i = 0; i < arr.length; i++) {
        for(var j = i + 1; j < arr.length; j++) {
            if (arr[i] === arr[j]) {
                arr.splice(j--, 1);
            }
        }
    }

    return arr;
}

exports.handler = function (argv) {
	links.load();
	var i,
	    src = path.resolve(untildify(argv.src)),
		dest = path.resolve(untildify(argv.dest)),
		silent = argv.silent;

	for (i in links.data) {
		if (links.data[i].src === src &&
		    links.data[i].dest === dest) {
			console.log('Error: link already exists');
			return;
		}
	}

	promptForIgnoredFolders(src, [{
		name: 'git',
		relPath: '.git',
		ignore: '.git',
		message: 'Source folder is a git repo, add `.git` to ignored folders?',
		default: true
	}, {
		name: 'npm',
		relPath: 'package.json',
		ignore: 'node_modules',
		message: 'Source folder is an npm package, add `node_modules` to ignored folders?',
		default: true
	}], silent).then((ignoredFolders) => {
		var watchmanConfigPath = path.resolve(src, '.watchmanconfig');

		var watchmanConfig = (() => {
			try {
				return fs.readJsonSync(watchmanConfigPath);
			} catch (err) {
				return {
					ignore_dirs: []
				};
			}
		})();

		ignoredFolders = ignoredFolders.concat(watchmanConfig.ignore_dirs);
		watchmanConfig.ignore_dirs = dedupeArray(ignoredFolders);

		fs.outputJsonSync(watchmanConfigPath, watchmanConfig);

		i = 0;
		while (links.data[i]) i++;

		links.data[i] = {
			src: src,
			dest: dest,
			enabled: true,
			createdTime: new Date()
		};

		links.save();
		console.log(`Added link: (${i}) ${src} -> ${dest}`);
	});
}
