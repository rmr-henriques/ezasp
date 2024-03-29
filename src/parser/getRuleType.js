const EMPTY = 0;
const COMMENT = 1;
const FACT = 2;
const CHOICE = 3;
const DEFINITION = 4;
const CONSTRAINT = 5;
const SHOW_STATEMEMENT = 6;
const CONSTANT = 7;
const OPTIMIZATION_STATEMENT = 8;
const INVALID_RULE = -1;

/**
 * @param {string} rule
 */
function getRuleType(rule) {

	rule = rule.replace(/\s+/g, "");

	if (rule == '' || rule == '\r' || rule == '\n')
		return EMPTY;
	else if (rule[0] == '%')
		return COMMENT;
	else if (rule.includes('%'))
		rule = rule.split('%')[0].trim();
	if (!rule.match(/^[a-zA-Z0-9_#+\-/*":{}(),.|<>=;!\\@]+$/))
		return INVALID_RULE;
	let a = 0;
	for (let i = 0; i < rule.length; i++) {
		if (rule[i] == '(')
			a++;
		if (rule[i] == ')')
			a--;
	}
	if (a != 0)
		return INVALID_RULE;
	a = 0;
	for (let i = 0; i < rule.length; i++) {
		if (rule[i] == '{')
			a++;
		if (rule[i] == '}')
			a--;
	}
	if (a != 0)
		return INVALID_RULE;
	if (rule.startsWith("#show") && rule.includes('/') && rule[rule.length - 2].match(/[0-9]/))
		return SHOW_STATEMEMENT;
	else if (rule.startsWith("#show") && getRuleType(rule.split("#show")[1]) == FACT)
		return SHOW_STATEMEMENT;
	else if (rule.startsWith("#show") && getRuleType(rule.split("#show")[1].split(":")[0]) == FACT && getRuleType(rule.split("#show")[1].split(":")[1]) == FACT)
		return SHOW_STATEMEMENT;
	if (rule.startsWith("#const") && rule.includes('='))
		return CONSTANT;
	if (rule.startsWith("#maximize") && rule.split("#maximize")[1].includes('{') && rule[rule.length - 2] == '}')
		return OPTIMIZATION_STATEMENT;
	if (rule.startsWith("#minimize") && rule.split("#maximize")[1].includes('{') && rule[rule.length - 2] == '}')
		return OPTIMIZATION_STATEMENT;
	else if (!rule.includes(':-') && !rule.includes('{') && !rule.includes('}') && rule[0].match(/[a-z]/)) {
		if (rule[rule.length - 2].match(/[a-zA-Z"]/) || rule[rule.length - 2].match(/[0-9"]/))
			return FACT;
		else if (rule[rule.length - 3] == '(' && rule[rule.length - 2] == ')')
			return FACT;
		else {
			for (let i = rule.length - 2; i > 0; i--)
				if (rule[i] != ')')
					if (rule[i].match(/[a-zA-Z"]/) || rule[i].match(/[0-9"]/))
						return FACT;
					else
						return INVALID_RULE;
		}
	}
	else if (rule.split(':-')[0].includes('{') && rule.split(':-')[0].includes('}')) {
		if (rule.includes(':-') && (!rule.split(':-')[0].includes('{') || !rule.split(':-')[0].includes('}')))
			return INVALID_RULE;
		else {
			const char3 = rule[rule.indexOf('{') + 1];
			const char4 = rule[rule.indexOf('}') - 1];

			if (/[a-zA-Z0-9]/.test(char3) && /^[a-zA-Z)0-9]$/.test(char4))
				return CHOICE;
			else
				return INVALID_RULE;
		}
	}
	else if (rule.includes(':-') && rule.split(':-')[0] != ""
		&& /[a-zA-Z]/.test(rule.split(':-')[0])
		&& /[a-zA-Z]/.test(rule.split(':-')[1].substring(0, rule.split(':-')[1].length - 1)))
		return DEFINITION;
	else if (rule.includes(':-') && rule.split(':-')[0] == ""
		&& /[a-zA-Z]/.test(rule.split(':-')[1].substring(0, rule.split(':-')[1].length - 1)))
		return CONSTRAINT;
	else
		return INVALID_RULE;	
}

module.exports = { getRuleType, EMPTY, COMMENT, FACT, CHOICE, DEFINITION, CONSTRAINT, OPTIMIZATION_STATEMENT, SHOW_STATEMEMENT, CONSTANT, INVALID_RULE };