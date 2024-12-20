// @ts-ignore
const { FACT, CHOICE, DEFINITION, CONSTRAINT, SHOW_STATEMEMENT, INVALID_RULE, CONSTANT, OPTIMIZATION_STATEMENT, COMMENT, getRuleType } = require('../parser/getRuleType');

// @ts-ignore
const { formatText } = require('../parser/formatText');
const { getPredicates } = require('../parser/getPredicates');

const MAC_OS = 1;
const WINDOWS = 2;
const LINUX = 3;

function detectOS() {
	switch (process.platform) {
		case "darwin": return MAC_OS;
		case "win32": return WINDOWS;
		default: return LINUX;
	}
}

function arrayContainsObject(array, object) {
	for (const element of array) {
		if (JSON.stringify(element) == JSON.stringify(object)) {
			return true;
		}
	}

	return false;
}

function arrayOfPredicatesContaintsPredicateInLine(array, line) {
	for (const element of array) {
		if (element.lineStart == line) {
			return true;
		}
	}

	return false;
}

function getPredicatesRanges(predicate, line, start) {
	const results = [];

	let i = 0;
	while (i != -1) {
		const indexStart = line.indexOf(predicate.name, i);
		if (indexStart == -1)
			i = -1;
		else if (indexStart == 0 || line[indexStart - 1].match(/^[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/? ]$/)) {
			results.push({ lineStart: start, lineEnd: start, indexStart: indexStart, indexEnd: indexStart + predicate.name.length })
			i = indexStart + predicate.name.length;
		}
		else
			i = indexStart + predicate.name.length;
	}

	return results;
}

function containtsAggregate(rule){
	return (rule.includes("#sum") || rule.includes("#count") || rule.includes("#min") || rule.includes("#max")) && rule.includes("{") && rule.includes("}")
}

/**
 * @param {string} textRaw
 */
function loadErrors(textRaw, fileName, extraTextRaw, disableFeatures) {

	if (textRaw == '' || textRaw == '\r\n' || textRaw == '\n')
		return [[], []];

	const OS = detectOS();

	const extraTextExists = JSON.stringify(extraTextRaw) != JSON.stringify([[], []]);

	let SPLIT_CODE;

	if (OS == WINDOWS)
		SPLIT_CODE = '\r\n';
	else
		SPLIT_CODE = '\n';

	let syntax;
	let orderErrors;
	let predicateErrors;
	let warnings;
	let hover;

	if (disableFeatures) {
		syntax = disableFeatures.syntaxChecking;
		orderErrors = disableFeatures.orderErrors;
		predicateErrors = disableFeatures.predicateErrors;
		warnings = disableFeatures.commentWarnings;
		hover = disableFeatures.hoverPredicates;
	}
	else{
		warnings = "true";
	}

	/*
	* ---------- GET DATA FROM PARSER CLASSES ----------
	*/

	const text = textRaw.split(SPLIT_CODE);

	const result1 = formatText(text);
	const formattedText = result1.formattedText;
	const lines = result1.lines;

	const result2 = getPredicates(formattedText);
	const predicates = result2.predicates;
	const nonReductantRules = result2.nonReductantRules;

	const extraText = [];
	const extraPredicates = [];
	const extraFormattedText = [];
	const extraNonReductantRules = [];
	const extraLines = [];

	if (extraTextRaw != [])
		for (const text of extraTextRaw[1]) {
			extraText.push(text.split(SPLIT_CODE));
			const extraResult1 = formatText(text.split(SPLIT_CODE));
			extraFormattedText.push(extraResult1.formattedText);
			extraLines.push(extraResult1.lines);
			const extraResult2 = getPredicates(extraResult1.formattedText);
			extraPredicates.push(extraResult2.predicates);
			extraNonReductantRules.push(extraResult2.nonReductantRules);

		}

	/*
	* ---------- CALCULATE ORDER ERRORS ----------
	*/


	//invalid rules

	let syntaxRanges = [];
	let syntaxMessages = [];

	if (syntax != "true") {
		for (let i = 0; i < nonReductantRules.length; i++) {
			if (nonReductantRules[i][0] == INVALID_RULE) {
				const range = lines[nonReductantRules[i][1]];
				syntaxRanges.push(range);
				syntaxMessages.push("Invalid Rule.")
			}
		}
	}

	let errorRanges = [];
	let errorMessages = [];

	if (orderErrors != "true") {

		for (let i = 0; i < nonReductantRules.length; i++) {
			if (nonReductantRules[i][0] == INVALID_RULE) {
				nonReductantRules.splice(i, 1);
			}
		}

		//constants

		let lastLineisConstant = true;
		for (let i = 0; i < nonReductantRules.length; i++) {
			if (lastLineisConstant && nonReductantRules[i][0] != CONSTANT) {
				lastLineisConstant = false;
			}
			if (nonReductantRules[i][0] == CONSTANT && !lastLineisConstant) {
				const range = lines[nonReductantRules[i][1]];
				errorRanges.push(range);
				errorMessages.push("Error, all constants must be at the beginning.")
			}
		}

		//facts

		let lastLineisFact = true;
		for (let i = 0; i < nonReductantRules.length; i++) {
			if (nonReductantRules[i][0] == CONSTANT) { }
			else if (lastLineisFact && nonReductantRules[i][0] != FACT) {
				lastLineisFact = false;
			}
			if (nonReductantRules[i][0] == FACT && !lastLineisFact) {
				const range = lines[nonReductantRules[i][1]];
				errorRanges.push(range);

				let isFact = true;
				let isConstant = false;
				for (let j = i - 1; j >= 0 && isFact; j--) {
					if (nonReductantRules[j][0] != FACT)
						isFact = false;
					if (nonReductantRules[j][0] == CONSTANT)
						isConstant = true;
				}
				if (isConstant)
					errorMessages.push("Error, this block of facts is in between a block of other rules.")
				else
					errorMessages.push("Error, all facts must be at the beginning, or between constants and choices.")
			}
		}

		//choices

		let lastLineisChoice = true;
		for (let i = 0; i < nonReductantRules.length; i++) {
			if (nonReductantRules[i][0] == CONSTANT) { }
			else if (nonReductantRules[i][0] == FACT) { }
			else if (lastLineisChoice && nonReductantRules[i][0] != CHOICE) {
				lastLineisChoice = false;
			}
			if (nonReductantRules[i][0] == CHOICE && !lastLineisChoice) {
				const range = lines[nonReductantRules[i][1]];
				errorRanges.push(range);

				let isChoice = true;
				let isFact = false;
				for (let j = i - 1; j >= 0 && isChoice; j--) {
					if (nonReductantRules[j][0] != CHOICE)
						isChoice = false;
					if (nonReductantRules[j][0] == FACT)
						isFact = true;
				}
				if (isFact)
					errorMessages.push("Error, this block of choices is in between a block of other rules.")
				else
					errorMessages.push("Error, all choices must be at the beginning, or between facts and definitions.")
			}
		}

		//definitions

		let lastLineisDefinition = true;
		for (let i = 0; i < nonReductantRules.length; i++) {
			if (nonReductantRules[i][0] == CONSTANT) { }
			else if (nonReductantRules[i][0] == FACT) { }
			else if (nonReductantRules[i][0] == CHOICE) { }
			else if (lastLineisDefinition && nonReductantRules[i][0] != DEFINITION) {
				lastLineisDefinition = false;
			}
			if (nonReductantRules[i][0] == DEFINITION && !lastLineisDefinition) {
				const range = lines[nonReductantRules[i][1]];
				errorRanges.push(range);

				let isDefinition = true;
				let isChoice = false;
				for (let j = i - 1; j >= 0 && isDefinition; j--) {
					if (nonReductantRules[j][0] != DEFINITION)
						isDefinition = false;
					if (nonReductantRules[j][0] == CHOICE)
						isChoice = true;
				}
				if (isChoice)
					errorMessages.push("Error, this block of definitions is in between a block of other rules.")
				else
					errorMessages.push("Error, all definitions must be between choices and constraints.")
			}
		}

		//constraints

		let lastLineisConstraint = true;
		for (let i = 0; i < nonReductantRules.length; i++) {
			if (nonReductantRules[i][0] == CONSTANT) { }
			else if (nonReductantRules[i][0] == FACT) { }
			else if (nonReductantRules[i][0] == CHOICE) { }
			else if (nonReductantRules[i][0] == DEFINITION) { }
			else if (lastLineisConstraint && nonReductantRules[i][0] != CONSTRAINT) {
				lastLineisConstraint = false;
			}
			if (nonReductantRules[i][0] == CONSTRAINT && !lastLineisConstraint) {
				const range = lines[nonReductantRules[i][1]];
				errorRanges.push(range);

				let isConstraint = true;
				let isDefinition = false;
				for (let j = i - 1; j >= 0 && isConstraint; j--) {
					if (nonReductantRules[j][0] != CONSTRAINT)
						isConstraint = false;
					if (nonReductantRules[j][0] == DEFINITION)
						isDefinition = true;
				}
				if (isDefinition)
					errorMessages.push("Error, this block of constraints is in between a block of other rules.")
				else
					errorMessages.push("Error, all constraints must be between definitions and either optimization or show statements.")
			}
		}

		//all choice rules before constraints

		let foundChoice = false;
		let constraintsEnded = false;
		for (let i = 0; i < nonReductantRules.length && !constraintsEnded; i++) {
		    if (nonReductantRules[i][0] == CONSTANT) { }
			else if (nonReductantRules[i][0] == FACT) { }
			else if (nonReductantRules[i][0] == CHOICE) {
				foundChoice = true;
			}
			else if (nonReductantRules[i][0] == DEFINITION) { }
			else if (nonReductantRules[i][0] == CONSTRAINT && !foundChoice) {
				for (let j = i; j < nonReductantRules.length && !constraintsEnded; j++) {
					if (nonReductantRules[j][0] != CONSTRAINT) {
						constraintsEnded = true;
					}
					else {
						const range = lines[nonReductantRules[j][1]];
						errorRanges.push(range);
						errorMessages.push("Error, constraints must be preceded by choice rules.")
					}
				}
			}
		}

		//optimization statements

		let lastLineisOptimization = true;
		for (let i = 0; i < nonReductantRules.length; i++) {
			if (nonReductantRules[i][0] == CONSTANT) { }
			else if (nonReductantRules[i][0] == FACT) { }
			else if (nonReductantRules[i][0] == CHOICE) { }
			else if (nonReductantRules[i][0] == DEFINITION) { }
			else if (nonReductantRules[i][0] == CONSTRAINT) { }
			else if (lastLineisOptimization && nonReductantRules[i][0] != OPTIMIZATION_STATEMENT) {
				lastLineisOptimization = false;
			}
			if (nonReductantRules[i][0] == OPTIMIZATION_STATEMENT && !lastLineisOptimization) {
				const range = lines[nonReductantRules[i][1]];
				errorRanges.push(range);

				let isOptimization = true;
				let isConstraint = false;
				for (let j = i - 1; j >= 0 && isOptimization; j--) {
					if (nonReductantRules[j][0] != OPTIMIZATION_STATEMENT)
						isOptimization = false;
					if (nonReductantRules[j][0] == CONSTRAINT)
						isConstraint = true;
				}
				if (isConstraint)
					errorMessages.push("Error, this block of optimization statements is in between a block of other rules.")
				else
					errorMessages.push("Error, all optimization statements must be between definitions and show statements.")
			}
		}

		//show statements

		let lastLineisShowStatement = true;
		for (let i = 0; i < nonReductantRules.length; i++) {
			if (nonReductantRules[i][0] == CONSTANT) { }
			else if (nonReductantRules[i][0] == FACT) { }
			else if (nonReductantRules[i][0] == CHOICE) { }
			else if (nonReductantRules[i][0] == DEFINITION) { }
			else if (nonReductantRules[i][0] == CONSTRAINT) { }
			else if (nonReductantRules[i][0] == OPTIMIZATION_STATEMENT) { }
			else if (lastLineisShowStatement && nonReductantRules[i][0] != SHOW_STATEMEMENT) {
				lastLineisShowStatement = false;
			}
			if (nonReductantRules[i][0] == SHOW_STATEMEMENT && !lastLineisShowStatement) {
				const range = lines[nonReductantRules[i][1]];
				errorRanges.push(range);

				let isShow = true;
				let isConstraint = false;
				for (let j = i - 1; j >= 0 && isShow; j--) {
					if (nonReductantRules[j][0] != SHOW_STATEMEMENT)
						isShow = false;
					if (nonReductantRules[j][0] == OPTIMIZATION_STATEMENT)
						isConstraint = true;
				}
				if (isConstraint)
					errorMessages.push("Error, this block of show statements is in between a block of other rules.")
				else
					errorMessages.push("Error, all show statements must be after constraints or optimization statements.")
			}
		}

	}
	/*
	* ---------- CALCULATE DEFINITION ERRORS ----------
	*/

	const definedPredicates = [];
	const undefinedPredicates = new Map();

	for (let j = 0; j < extraNonReductantRules.length; j++) {
		for (let i = 0; i < extraNonReductantRules[j].length; i++) {
			if (extraNonReductantRules[j][i][0] != INVALID_RULE) {
				for (const predicate of extraPredicates[j][i].head) {
					const tmp = extraFormattedText[j][extraNonReductantRules[j][i][1]].split(':-')[0];
					if (extraNonReductantRules[j][i][0] != SHOW_STATEMEMENT) {
						if (!tmp.includes(':'))
							definedPredicates.push(predicate)
						else if (!tmp.split(':')[1].includes(predicate.name))
							definedPredicates.push(predicate)
					}
				}
			}
		}
	}

	for (let i = 0; i < nonReductantRules.length; i++) {
		if (nonReductantRules[i][0] != INVALID_RULE) {
			for (const predicate of predicates[i].head) {
				let tmp = formattedText[nonReductantRules[i][1]].split(':-')[0];
				if (nonReductantRules[i][0] != SHOW_STATEMEMENT) {
					if (!tmp.includes(':') && !containtsAggregate(tmp)) {
						let a = formattedText[nonReductantRules[i][1]].indexOf('{');
						let b = formattedText[nonReductantRules[i][1]].indexOf(predicate.name);
						let c = formattedText[nonReductantRules[i][1]].indexOf('}');
						if (!(a != -1 && c != -1 && a < b && b < c) && nonReductantRules[i][0] == CHOICE) {
							if (!arrayContainsObject(definedPredicates, predicate))
								if (undefinedPredicates.has(lines[nonReductantRules[i][1]]) && !arrayContainsObject(undefinedPredicates.get(lines[nonReductantRules[i][1]]), predicate))
									undefinedPredicates.get(lines[nonReductantRules[i][1]]).push(predicate);
								else
									undefinedPredicates.set(lines[nonReductantRules[i][1]], [predicate]);
						}
						else
							definedPredicates.push(predicate)
					}
					else if (containtsAggregate(formattedText[nonReductantRules[i][1]])) {
						if (formattedText[nonReductantRules[i][1]].indexOf('}') > formattedText[nonReductantRules[i][1]].indexOf(predicate.name)) {
							if (!arrayContainsObject(definedPredicates, predicate))
								if (undefinedPredicates.has(lines[nonReductantRules[i][1]]))
									undefinedPredicates.get(lines[nonReductantRules[i][1]]).push(predicate);
								else
									undefinedPredicates.set(lines[nonReductantRules[i][1]], [predicate]);
						}
						else
							definedPredicates.push(predicate)
					}
					else if (!tmp.split(':')[1].includes(predicate.name)) {
						definedPredicates.push(predicate)
					}
					else if (tmp.split(':')[0].includes(predicate.name)) {
						definedPredicates.push(predicate)
					}
					else if (!arrayContainsObject(definedPredicates, predicate)) {
						if (undefinedPredicates.has(lines[nonReductantRules[i][1]])) {
							if (!undefinedPredicates.get(lines[nonReductantRules[i][1]]).includes(predicate))
								undefinedPredicates.get(lines[nonReductantRules[i][1]]).push(predicate);
						}
						else
							undefinedPredicates.set(lines[nonReductantRules[i][1]], [predicate]);
					}
				}
				else if (predicate.name == "attr" && predicate.arguments == 4) { }
				else {
					if (!arrayContainsObject(definedPredicates, predicate))
						if (undefinedPredicates.has(lines[nonReductantRules[i][1]]))
							undefinedPredicates.get(lines[nonReductantRules[i][1]]).push(predicate);
						else
							undefinedPredicates.set(lines[nonReductantRules[i][1]], [predicate]);
				}
			}

			for (const predicate of predicates[i].tail) {
				if (!arrayContainsObject(definedPredicates, predicate)) {
					if (undefinedPredicates.get(lines[nonReductantRules[i][1]])) {
						if (!arrayContainsObject(undefinedPredicates.get(lines[nonReductantRules[i][1]]), predicate))
							undefinedPredicates.get(lines[nonReductantRules[i][1]]).push(predicate);
					}
					else
						undefinedPredicates.set(lines[nonReductantRules[i][1]], [predicate]);
				}
			}
		}
	}

	let predicateErrorRanges = [];
	let predicateErrorMessages = [];

	if (predicateErrors != "true") {

		for (const key of undefinedPredicates.keys()) {
			predicateErrorRanges.push(key);

			const predicates = undefinedPredicates.get(key);

			if (predicates.length == 1)
				predicateErrorMessages.push("Error, predicate " + predicates[0].name + "/" + predicates[0].arguments + " is not defined yet.")

			else {
				let names = "";
				for (let j = 0; j < predicates.length; j++)
					if (j == 0)
						names = names + " " + predicates[j].name + "/" + predicates[j].arguments;

					else if (j == predicates.length - 1)
						names = names + " and " + predicates[j].name + "/" + predicates[j].arguments;
					else
						names = names + ", " + predicates[j].name + "/" + predicates[j].arguments;

				predicateErrorMessages.push("Error, predicates" + names + " are not defined yet.")
			}
		}

		const seen = new Set();
		for (let i = 0; i < errorRanges.length; i++) {
			if (!seen.has(errorRanges[i]))
				seen.add(errorRanges[i]);
			else {
				const index = errorRanges.indexOf(errorRanges[i]);
				errorMessages[index] = errorMessages[index] + " " + errorMessages[i];
				errorRanges.splice(i, 1);
				errorMessages.splice(i, 1);
				i--;
			}
		}

	}

	/*
	* ---------- CALCULATE PREDICATE ON-HOVER MESSAGES & WARNING RANGES ----------
	*/

	const definitionMessages = new Map();
	const noCommentLines = new Map();


	let symbol;

	if (detectOS() == WINDOWS) {
		symbol = "\\";
	}
	else
		symbol = "/";

	let name;

	if (extraTextExists) {
		const split = fileName.split(symbol)

		name = split[split.length - 1];
	}


	function calculateOnHoverMessage(i) {
		if (!extraTextExists)
			if (!definitionMessages.has(JSON.stringify(predicates[i].head[0])))
				definitionMessages.set(JSON.stringify(predicates[i].head[0]), [formattedText[nonReductantRules[i][1] - 1].replace('%', '').replace('%*', '').replace('*%', '') + " (line " + (lines[nonReductantRules[i][1]].lineStart + 1) + ")."])
			else
				definitionMessages.get(JSON.stringify(predicates[i].head[0])).push(formattedText[nonReductantRules[i][1] - 1].replace('%', '').replace('%*', '').replace('*%', '') + " (line " + (lines[nonReductantRules[i][1]].lineStart + 1) + ").")

		else
			if (!definitionMessages.has(JSON.stringify(predicates[i].head[0])))
				definitionMessages.set(JSON.stringify(predicates[i].head[0]), [formattedText[nonReductantRules[i][1] - 1].replace('%', '').replace('%*', '').replace('*%', '') + " (" + name + ": line " + (lines[nonReductantRules[i][1]].lineStart + 1) + ")."])
			else
				definitionMessages.get(JSON.stringify(predicates[i].head[0])).push(formattedText[nonReductantRules[i][1] - 1].replace('%', '').replace('%*', '').replace('*%', '') + " (" + name + ": line " + (lines[nonReductantRules[i][1]].lineStart + 1) + ").")
	}


	function extraCalculateOnHoverMessage(j, i) {
		if (!definitionMessages.has(JSON.stringify(extraPredicates[j][i].head[0])))
			definitionMessages.set(JSON.stringify(extraPredicates[j][i].head[0]), [extraFormattedText[j][extraNonReductantRules[j][i][1] - 1].replace('%', '').replace('%*', '').replace('*%', '') + " (" + extraTextRaw[0][j] + ": line " + (extraLines[j][extraNonReductantRules[j][i][1]].lineStart + 1) + ")."])
		else
			definitionMessages.get(JSON.stringify(extraPredicates[j][i].head[0])).push(extraFormattedText[j][extraNonReductantRules[j][i][1] - 1].replace('%', '').replace('%*', '').replace('*%', '') + " (" + extraTextRaw[0][j] + ": line " + (extraLines[j][extraNonReductantRules[j][i][1]].lineStart + 1) + ").")
	}


	function createDoubleKey(var1, var2) {
		return { predicate: var1, name: var2 };
	}

	for (let j = 0; j < extraNonReductantRules.length; j++) {
		for (let i = 0; i < extraNonReductantRules[j].length; i++) {
			let hasDefinedMessage = false;
			if ((extraNonReductantRules[j][i][0] == FACT || extraNonReductantRules[j][i][0] == CHOICE) && !definitionMessages.has(JSON.stringify(extraPredicates[j][i].head[0]))) {
				if (extraNonReductantRules[j][i][1] != 0 && getRuleType(extraFormattedText[j][extraNonReductantRules[j][i][1] - 1]) == COMMENT)
					extraCalculateOnHoverMessage(j, i);
				else {
					if (!noCommentLines.has(JSON.stringify(createDoubleKey(extraPredicates[j][i].head[0], extraTextRaw[0][j]))))
						noCommentLines.set(JSON.stringify(createDoubleKey(extraPredicates[j][i].head[0], extraTextRaw[0][j])), [extraLines[j][extraNonReductantRules[j][i][1]].lineStart + 1]);
				}
				hasDefinedMessage = true;
			}
			else if (extraNonReductantRules[j][i][0] == FACT || extraNonReductantRules[j][i][0] == CHOICE) {
				if (extraNonReductantRules[j][i][1] != 0 && getRuleType(extraFormattedText[j][extraNonReductantRules[j][i][1] - 1]) == COMMENT) {
					extraCalculateOnHoverMessage(j, i);
				}
				else {
					if (!noCommentLines.has(JSON.stringify(createDoubleKey(extraPredicates[j][i].head[0], extraTextRaw[0][j]))))
						noCommentLines.set(JSON.stringify(createDoubleKey(extraPredicates[j][i].head[0], extraTextRaw[0][j])), ([extraLines[j][extraNonReductantRules[j][i][1]].lineStart + 1]))
					else
						noCommentLines.get(JSON.stringify(createDoubleKey(extraPredicates[j][i].head[0], extraTextRaw[0][j]))).push(extraLines[j][extraNonReductantRules[j][i][1]].lineStart + 1)
				}
				hasDefinedMessage = true;
			}

			if (extraNonReductantRules[j][i][0] != INVALID_RULE) {
				for (const predicate of extraPredicates[j][i].head) {
					const tmp = extraFormattedText[j][extraNonReductantRules[j][i][1]].split(':-')[0];
					if (extraNonReductantRules[j][i][0] != SHOW_STATEMEMENT) {
						if (!tmp.includes(':')) {
							if (!definitionMessages.has(JSON.stringify(createDoubleKey(extraPredicates[j][i].head[0], extraTextRaw[0][j]))))
								if (extraNonReductantRules[j][i][1] != 0 && getRuleType(extraFormattedText[j][extraNonReductantRules[j][i][1] - 1]) == COMMENT)
									extraCalculateOnHoverMessage(j, i);
								else {
									if (!noCommentLines.has(JSON.stringify(createDoubleKey(extraPredicates[j][i].head[0], extraTextRaw[0][j]))))
										noCommentLines.set(JSON.stringify(createDoubleKey(extraPredicates[j][i].head[0], extraTextRaw[0][j])), [extraLines[j][extraNonReductantRules[j][i][1]].lineStart + 1])
									else
										noCommentLines.get(JSON.stringify(createDoubleKey(extraPredicates[j][i].head[0], extraTextRaw[0][j]))).push(extraLines[j][extraNonReductantRules[j][i][1]].lineStart + 1)
								}
							else if (!hasDefinedMessage) {
								if (extraNonReductantRules[j][i][1] != 0 && getRuleType(extraFormattedText[j][extraNonReductantRules[j][i][1] - 1]) == COMMENT) {
									if (!noCommentLines.has(JSON.stringify(createDoubleKey(extraPredicates[j][i].head[0], extraTextRaw[0][j]))))
										noCommentLines.set(JSON.stringify(createDoubleKey(extraPredicates[j][i].head[0], extraTextRaw[0][j])), [extraLines[j][extraNonReductantRules[j][i][1]].lineStart + 1])
									else
										noCommentLines.get(JSON.stringify(createDoubleKey(extraPredicates[j][i].head[0], extraTextRaw[0][j]))).push(extraLines[j][extraNonReductantRules[j][i][1]].lineStart + 1)
								}
								else {
									if (!noCommentLines.has(JSON.stringify(createDoubleKey(extraPredicates[j][i].head[0], extraTextRaw[0][j]))))
										noCommentLines.set(JSON.stringify(createDoubleKey(extraPredicates[j][i].head[0], extraTextRaw[0][j])), [extraLines[j][extraNonReductantRules[j][i][1]].lineStart + 1])
									else
										noCommentLines.get(JSON.stringify(createDoubleKey(extraPredicates[j][i].head[0], extraTextRaw[0][j]))).push(extraLines[j][extraNonReductantRules[j][i][1]].lineStart + 1)
								}
							}
						}
						else if (!tmp.split(':')[1].includes(predicate.name)) {
							if (!definitionMessages.has(JSON.stringify(createDoubleKey(extraPredicates[j][i].head[0], extraTextRaw[0][j]))))
								if (extraNonReductantRules[j][i][1] != 0 && getRuleType(extraFormattedText[j][extraNonReductantRules[j][i][1] - 1]) == COMMENT)
									extraCalculateOnHoverMessage(j, i);
								else {
									if (!noCommentLines.has(JSON.stringify(createDoubleKey(extraPredicates[j][i].head[0], extraTextRaw[0][j]))))
										noCommentLines.set(JSON.stringify(createDoubleKey(extraPredicates[j][i].head[0], extraTextRaw[0][j])), [extraLines[j][extraNonReductantRules[j][i][1]].lineStart + 1])
									else
										noCommentLines.get(JSON.stringify(createDoubleKey(extraPredicates[j][i].head[0], extraTextRaw[0][j]))).push(extraLines[j][extraNonReductantRules[j][i][1]].lineStart + 1)
								}
							else if (!hasDefinedMessage) {
								if (extraNonReductantRules[j][i][1] != 0 && getRuleType(extraFormattedText[j][extraNonReductantRules[j][i][1] - 1]) == COMMENT) {
									extraCalculateOnHoverMessage(j, i);
								}
								else {
									if (!noCommentLines.has(JSON.stringify(createDoubleKey(extraPredicates[j][i].head[0], extraTextRaw[0][j]))))
										noCommentLines.set(JSON.stringify(createDoubleKey(extraPredicates[j][i].head[0], extraTextRaw[0][j])), [extraLines[j][extraNonReductantRules[j][i][1]].lineStart + 1])
									else
										noCommentLines.get(JSON.stringify(createDoubleKey(extraPredicates[j][i].head[0], extraTextRaw[0][j]))).push(extraLines[j][extraNonReductantRules[j][i][1]].lineStart + 1)
								}
							}
						}
					}
				}
			}
		}
	}

	let warningRanges = [];

	function pushWarningRange(i) {
		if (nonReductantRules[i][0] != OPTIMIZATION_STATEMENT)
			warningRanges.push(lines[nonReductantRules[i][1]])
	}

	for (let i = 0; i < nonReductantRules.length; i++) {
		let hasDefinedMessage = false;
		if ((nonReductantRules[i][0] == FACT || nonReductantRules[i][0] == CHOICE) && !definitionMessages.has(JSON.stringify(predicates[i].head[0]))) {
			if (nonReductantRules[i][1] != 0 && getRuleType(formattedText[nonReductantRules[i][1] - 1]) == COMMENT)
				calculateOnHoverMessage(i);
			else {
				if (!noCommentLines.has(JSON.stringify(createDoubleKey(predicates[i].head[0], name))))
					noCommentLines.set(JSON.stringify(createDoubleKey(predicates[i].head[0], name)), [lines[nonReductantRules[i][1]].lineStart + 1]);
				pushWarningRange(i);
			}
			hasDefinedMessage = true;
		}
		else if (nonReductantRules[i][0] == FACT || nonReductantRules[i][0] == CHOICE) {
			if (nonReductantRules[i][1] != 0 && getRuleType(formattedText[nonReductantRules[i][1] - 1]) == COMMENT) {
				calculateOnHoverMessage(i);
			}
			else {
				if (!noCommentLines.has(JSON.stringify(createDoubleKey(predicates[i].head[0], name))))
					noCommentLines.set(JSON.stringify(createDoubleKey(predicates[i].head[0], name)), ([lines[nonReductantRules[i][1]].lineStart + 1]))
				else
					noCommentLines.get(JSON.stringify(createDoubleKey(predicates[i].head[0], name))).push(lines[nonReductantRules[i][1]].lineStart + 1)
				pushWarningRange(i);
			}
			hasDefinedMessage = true;
		}

		if (nonReductantRules[i][0] != INVALID_RULE) {
			for (const predicate of predicates[i].head) {
				const tmp = formattedText[nonReductantRules[i][1]].split(':-')[0];
				if (nonReductantRules[i][0] != SHOW_STATEMEMENT) {
					if (!tmp.includes(':')) {
						if (!hasDefinedMessage && !definitionMessages.has(JSON.stringify(createDoubleKey(predicates[i].head[0], name))))
							if (nonReductantRules[i][1] != 0 && getRuleType(formattedText[nonReductantRules[i][1] - 1]) == COMMENT)
								calculateOnHoverMessage(i);
							else {
								if (!noCommentLines.has(JSON.stringify(createDoubleKey(predicates[i].head[0], name))))
									noCommentLines.set(JSON.stringify(createDoubleKey(predicates[i].head[0], name)), [lines[nonReductantRules[i][1]].lineStart + 1])
								else
									noCommentLines.get(JSON.stringify(createDoubleKey(predicates[i].head[0], name))).push(lines[nonReductantRules[i][1]].lineStart + 1)
								pushWarningRange(i);
							}
						else if (!hasDefinedMessage) {
							if (nonReductantRules[i][1] != 0 && getRuleType(formattedText[nonReductantRules[i][1] - 1]) == COMMENT) {
								if (!noCommentLines.has(JSON.stringify(createDoubleKey(predicates[i].head[0], name))))
									noCommentLines.set(JSON.stringify(createDoubleKey(predicates[i].head[0], name)), ([lines[nonReductantRules[i][1]].lineStart + 1]))
								else
									noCommentLines.get(JSON.stringify(createDoubleKey(predicates[i].head[0], name))).push(lines[nonReductantRules[i][1]].lineStart + 1)
								pushWarningRange(i);
							}
							else {
								if (!noCommentLines.has(JSON.stringify(createDoubleKey(predicates[i].head[0], name))))
									noCommentLines.set(JSON.stringify(createDoubleKey(predicates[i].head[0], name)), ([lines[nonReductantRules[i][1]].lineStart + 1]))
								else
									noCommentLines.get(JSON.stringify(createDoubleKey(predicates[i].head[0], name))).push(lines[nonReductantRules[i][1]].lineStart + 1)
								pushWarningRange(i);
							}
						}
					}
					else if (!tmp.split(':')[1].includes(predicate.name)) {
						if (!definitionMessages.has(JSON.stringify(createDoubleKey(predicates[i].head[0], name))))
							if (nonReductantRules[i][1] != 0 && getRuleType(formattedText[nonReductantRules[i][1] - 1]) == COMMENT)
								calculateOnHoverMessage(i);
							else {
								if (!noCommentLines.has(JSON.stringify(createDoubleKey(predicates[i].head[0], name))))
									noCommentLines.set(JSON.stringify(createDoubleKey(predicates[i].head[0], name)), ([lines[nonReductantRules[i][1]].lineStart + 1]))
								else
									noCommentLines.get(JSON.stringify(createDoubleKey(predicates[i].head[0], name))).push(lines[nonReductantRules[i][1]].lineStart + 1)
								pushWarningRange(i);
							}
						else if (!hasDefinedMessage) {
							if (nonReductantRules[i][1] != 0 && getRuleType(formattedText[nonReductantRules[i][1] - 1]) == COMMENT) {
								calculateOnHoverMessage(i);
							}
							else {
								if (!noCommentLines.has(JSON.stringify(createDoubleKey(predicates[i].head[0], name))))
									noCommentLines.set(JSON.stringify(createDoubleKey(predicates[i].head[0], name)), ([lines[nonReductantRules[i][1]].lineStart + 1]))
								else
									noCommentLines.get(JSON.stringify(createDoubleKey(predicates[i].head[0], name))).push(lines[nonReductantRules[i][1]].lineStart + 1)
								pushWarningRange(i);
							}
						}
					}
				}
			}
		}
	}

	for (const key of [...definitionMessages.keys()]) {
		const checker = [];
		const array = definitionMessages.get(key);

		for (const message of array)
			if (!checker.includes(message))
				checker.push(message)

		definitionMessages.set(key, checker);
	}

	const noCommentLinesKeys = [...noCommentLines.keys()];

	const noCommentMessages = new Map();

	for (const key of noCommentLinesKeys) {

		const parsedKey = JSON.parse(key)

		let tmp = "No comment where this predicate is defined (";
		const arrayOfLines = noCommentLines.get(key);

		const checker = [];

		for (const line of arrayOfLines)
			if (!checker.includes(line))
				checker.push(line)

		if (checker.length == 1)
			if (!extraTextExists) {
				tmp = tmp + "line " + checker[0] + ").";
			}
			else {
				if (noCommentMessages.has(JSON.stringify(parsedKey.predicate))) {
					tmp = noCommentMessages.get(JSON.stringify(parsedKey.predicate))
					tmp = tmp.split(").")[0] + ", " + parsedKey.name + ": line " + checker[0] + ").";
				}
				else
					tmp = tmp + parsedKey.name + ": line " + checker[0] + ").";
			}

		else {
			if (!extraTextExists) {
				tmp = tmp + "lines ";
				for (const line of checker) {
					if (line != checker[checker.length - 1])
						tmp = tmp + line + ", ";
					else
						tmp = tmp + line + ").";
				}

				if (!tmp.includes(")."))
					tmp = tmp + ").";
			}

			else {
				if (noCommentMessages.has(JSON.stringify(parsedKey.predicate))) {
					tmp = noCommentMessages.get(JSON.stringify(parsedKey.predicate));
					tmp = tmp.split(").")[0] + "; " + parsedKey.name + ": lines ";
					for (const line of checker) {
						if (line != checker[checker.length - 1])
							tmp = tmp + line + ", ";
						else
							tmp = tmp + line + ").";
					}
				}
				else {
					tmp = tmp + parsedKey.name + ": lines ";
					for (const line of checker) {
						if (line != checker[checker.length - 1])
							tmp = tmp + line + ", ";
						else
							tmp = tmp + line + ").";
					}
				}
			}
		}
		noCommentMessages.set(JSON.stringify(parsedKey.predicate), tmp);
	}

	for (const predicate of [...noCommentMessages.keys()]) {
		if (definitionMessages.has(predicate))
			definitionMessages.get(predicate).push(noCommentMessages.get(predicate))
		else
			definitionMessages.set(predicate, [noCommentMessages.get(predicate)])
	}

	const linesWithPredicates = new Map();

	for (let i = 0; i < nonReductantRules.length; i++) {
		for (const predicate of predicates[i].head) {
			if (definitionMessages.has(JSON.stringify(predicate))) {
				const ranges = getPredicatesRanges(predicate, formattedText[nonReductantRules[i][1]], lines[nonReductantRules[i][1]].lineStart);
				for (const range of ranges)
					if (!linesWithPredicates.has(JSON.stringify(range)))
						linesWithPredicates.set(JSON.stringify(range), JSON.stringify(predicate))
			}
		}

		for (const predicate of predicates[i].tail) {
			if (definitionMessages.has(JSON.stringify(predicate))) {
				const ranges = getPredicatesRanges(predicate, formattedText[nonReductantRules[i][1]], lines[nonReductantRules[i][1]].lineStart)
				for (const range of ranges)
					if (!linesWithPredicates.has(JSON.stringify(predicate)))
						linesWithPredicates.set(JSON.stringify(range), JSON.stringify(predicate))
			}
		}
	}

	let predicateRanges = [];
	let predicateMessages = [];

	if (hover != "true") {

		const keys = [...linesWithPredicates.keys()];

		for (const key of keys) {
			if (!arrayOfPredicatesContaintsPredicateInLine(errorRanges, JSON.parse(key).lineStart) && !arrayOfPredicatesContaintsPredicateInLine(warningRanges, JSON.parse(key).lineStart)) {
				predicateRanges.push(JSON.parse(key));
				const messages = definitionMessages.get(linesWithPredicates.get(key));

				if (messages.length == 1)
					predicateMessages.push(messages[0]);

				else {
					let tmp = "";
					for (const message of messages) {
						if (message != messages[messages.length - 1])
							tmp = tmp + message + " | ";
						else
							tmp = tmp + message;
					}

					predicateMessages.push(tmp);
				}
			}
		}

	}

	let warningMessages = [];

	const checker = [];

	for (const range of warningRanges) {
		const tmp = JSON.stringify(range);
		if (!checker.includes(JSON.stringify(range)))
			checker.push(tmp)
	}

	let warningRangesFinal = [];

	if (warnings != "true") {

		for (const range of checker)
			warningRangesFinal.push(JSON.parse(range))

		for (const range of warningRangesFinal) {
			warningMessages.push("Warning. This line is defining a predicate without proper commenting (line " + range.lineStart + ").");
		}

	}

	return [syntaxRanges.concat(errorRanges.concat(predicateErrorRanges)), syntaxMessages.concat(errorMessages.concat(predicateErrorMessages)), predicateRanges, predicateMessages, warningRangesFinal, warningMessages];
}

module.exports = { loadErrors }