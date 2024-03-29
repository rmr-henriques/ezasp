const { COMMENT, EMPTY, SHOW_STATEMEMENT, getRuleType, INVALID_RULE } = require('../parser/getRuleType');

function extractPredicatesAux(rule, ruleType) {

  const predicates = [];
  const predicatePattern = /([a-z][a-zA-Z0-9_"]*)\s*(?:\(([^)]*)\))?/g;

  const isShowStatement = ruleType == SHOW_STATEMEMENT;

  let matches = rule.match(predicatePattern);

  const indexes = [];
  let match;

  while ((match = predicatePattern.exec(rule)) !== null) {
    indexes.push(match.index);
  }

  if (!matches)
    matches = []; 

  for(let i = 0; i<matches.length; i++){
    const match = matches[i];
    const char = rule[indexes[i] - 1];
    if(char == "#" || /^[A-Z]$/.test(char)){
      matches.splice(matches.indexOf(match), 1);
      indexes.splice(i,1);
      i--;
    }
  }

  if (isShowStatement && rule[rule.length-2].match(/[0-9]/)) {
    let split = rule.substring(rule.indexOf("show") + 4).split(",")
    if (!split || split[0] == "")
      split = rule.substring(rule.indexOf("show") + 4)
    for (const elem of split) {
      const number = elem.split('/');
      if (number[1].includes('.'))
        number[1].replace('.', '')
      predicates.push({
        name: number[0].trim(),
        arguments: parseInt(number[1])
      });
    }
  }

  else {
    if (matches) {
      for (const match of matches) {
        if (match.trim() == "not") { }
        else {
          let hasArgs = false;

          if (match.includes('('))
            hasArgs = true;

          let predicateName = match.trim();
          if (hasArgs)
            predicateName = match.split('(')[0].trim();

          const objects = [];

          if (hasArgs) {
            const args = match.split('(')[1].split(')')[0];
            if (args.includes(";")) {
              const temp = args.split(";");
              objects.push(temp[0]);
            }
            else
              objects.push(args)
          }

          if (!hasArgs)
            predicates.push({
              name: predicateName,
              arguments: 0
            });

          else
            for (const object of objects)
              predicates.push({
                name: predicateName,
                arguments: object.split(',').length
              });
        }
      }
    }
  }

  return predicates;
}

/**
 * @param {string} rule
 */
function extractPredicates(rule, ruleType) {

  const headPredicates = [];
  const tailPredicates = [];

  const split = rule.split(':-');

  let head = "";
  if (split[0])
    head = split[0];

  let tail = "";
  if (split[1])
    tail = split[1];

  const headResult = extractPredicatesAux(head, ruleType);
  for (const result of headResult)
    headPredicates.push(result);

  if(tail != ""){
  const tailResult = extractPredicatesAux(tail,ruleType);
  for (const result of tailResult)
    tailPredicates.push(result);
  }

  return { head: headPredicates, tail: tailPredicates }

}

/**
 * @param {string[]} formattedText
 */
function getPredicates(formattedText) {

  /*
  Creates an array without comments and empty spaces, where in each position there is an array with 2 positons:
    position 0 -> the rule's type
    position 1 -> the rule's index in the array formattedText
  */
  let nonReductantRules = [];

  for (let i = 0; i < formattedText.length; i++) {
    let ruleType = getRuleType(formattedText[i]);
    if (ruleType == COMMENT || ruleType == EMPTY) { }
    else
      nonReductantRules.push([ruleType, i]);
  }

  const predicates = [];

  for (let i = 0; i < nonReductantRules.length; i++) {
    if(nonReductantRules[i][0] == INVALID_RULE) {
      predicates.push({head:[], tail:[]});
    }
    else{
      const predicate = extractPredicates(formattedText[nonReductantRules[i][1]], nonReductantRules[i][0]);
      predicates.push(predicate);
    }
  }

  return { predicates: predicates, nonReductantRules: nonReductantRules };
}

module.exports = { getPredicates }