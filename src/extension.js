const vscode = require('vscode');

const { loadErrors } = require('./engine/loadErrors');

const { readFileSync, existsSync, writeFileSync } = require('fs');

const path = require('path');
const { dirname } = require('path');

let disableFeatures;

const underlineRed = vscode.window.createTextEditorDecorationType({
	textDecoration: 'underline wavy red'
});

const underlineYellow = vscode.window.createTextEditorDecorationType({
	textDecoration: 'underline wavy rgba(255, 255, 0, 0.5)'
});

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

/**
 * @param {{ lineStart: number; indexStart: number; lineEnd: number; indexEnd: number; }} range
 */
function convertRange(range){
	const startPosition = new vscode.Position(range.lineStart, range.indexStart);
	const endPosition = new vscode.Position(range.lineEnd, range.indexEnd);
	const rangeFinal = new vscode.Range(startPosition, endPosition);
	return rangeFinal;
}

/**
 * @param {string} text
 */
function getRanges(text, name, extraText){
	const data = loadErrors(text, name, extraText, disableFeatures);

	const errorRanges = [];
	const predicateRanges = [];
	const warningRanges = [];

	if(data[0])
	data[0].forEach(range => {
		errorRanges.push(convertRange(range));
	})

	if(data[2])
	data[2].forEach(range => {
		predicateRanges.push(convertRange(range));
	})

	if(data[4])
	data[4].forEach(range => {
		warningRanges.push(convertRange(range));
	})

	return [data,errorRanges,predicateRanges,warningRanges];
}	

function getExtraFiles(activeEditor){
	const fileName = activeEditor.document.fileName;

	const dir = path.dirname(fileName);

	let files = [];

	let text = [];

	if(existsSync(dir+'/config.json')){
		const fileData = readFileSync(dir+'/config.json', 'utf-8');
        const json = JSON.parse(fileData);
		const addFiles = json.additionalFiles;
		
		let split;
		if(detectOS() == WINDOWS)
			split = fileName.split('\\');
		else
			split = fileName.split('/');

		if(json.disableFeatures)
			disableFeatures = json.disableFeatures;
		else
			disableFeatures = undefined;

		if(addFiles.includes(split[split.length])){
			for (const item of addFiles)
				if (item !== split[split.length]) 
					files.push(item);
		}

		else
			files = addFiles;
	}
	else
		disableFeatures = undefined;
  
	for(const file of files){
		if(existsSync(dir+'/'+file))
			text.push(readFileSync(dir+'/'+file, 'utf-8'));
		else
			vscode.window.showErrorMessage('File ' +file+ ' does not exist in this folder, check config.json file.');
	}

	return [files,text];
}

function loadThings(activeEditor, fileName){

	let results = getRanges(activeEditor.document.getText(), fileName, getExtraFiles(activeEditor));
		activeEditor.setDecorations(underlineRed, results[1]);
		activeEditor.setDecorations(underlineYellow, results[3]);

		const errorObjects = results[0][0];
		const predicateObjects = results[0][2];
		const warningObjects = results[0][4];

		const errorRanges = results[1];
		const predicateRanges = results[2];
		const warningRanges = results[3];
		
		const errorMessages = results[0][1];
		const predicateMessages = results[0][3];
		const warningMessages = results[0][5];
 		

		let disposable = vscode.languages.registerHoverProvider('*', {
			provideHover(document, position) {
				for (let i = 0; i<errorObjects.length; i++) {	
					if (errorRanges[i].contains(position)) {
						const hoverMessage = new vscode.Hover(errorMessages[i]);
						return hoverMessage;
					}
				}

				for (let i = 0; i<predicateObjects.length; i++) {	
					if (predicateRanges[i].contains(position)) {
						const hoverMessage = new vscode.Hover(predicateMessages[i]);
						return hoverMessage;
					}
				}

				for (let i = 0; i<warningObjects.length; i++) {	
					if (warningRanges[i].contains(position)) {
						const hoverMessage = new vscode.Hover(warningMessages[i]);
						return hoverMessage;
					}
				}
			}
		});

	return disposable;
}


/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	
	let activeEditor = vscode.window.activeTextEditor;

	let fileName = activeEditor.document.fileName;

	if(fileName.includes('.lp') || fileName.includes('.cl') || fileName.includes('.clp') 
	|| fileName.includes('.iclp') || fileName.includes('.Clp') || fileName.includes('.iClp')
	|| fileName.includes('.blp') || fileName.includes('.iblp')){

		let disposable = loadThings(activeEditor, fileName);
		context.subscriptions.push(disposable);

		vscode.workspace.onDidChangeTextDocument(() => {
			disposable.dispose();
			activeEditor.setDecorations(underlineRed,[]);
			activeEditor.setDecorations(underlineYellow,[]);

			disposable = loadThings(activeEditor, fileName);
			context.subscriptions.push(disposable);
		});

		vscode.window.onDidChangeActiveTextEditor(editor => {

			fileName = editor.document.fileName;
			
			if(fileName.includes('.lp') || fileName.includes('.cl') || fileName.includes('.clp') 
			|| fileName.includes('.iclp') || fileName.includes('.Clp') || fileName.includes('.iClp')
			|| fileName.includes('.blp') || fileName.includes('.iblp')){
				activeEditor = editor;
				disposable.dispose();	
				activeEditor.setDecorations(underlineRed,[]);
				activeEditor.setDecorations(underlineYellow,[]);

				disposable = loadThings(activeEditor, fileName);
				context.subscriptions.push(disposable);
			}
		});	
	}

	const initClingoConfig = vscode.commands.registerCommand('createConfig', function () {

		const sampleConfig = readFileSync(`${context.asAbsolutePath("")}/src/sampleConfig.json`);
		writeFileSync(`${dirname(vscode.window.activeTextEditor.document.fileName)}/config.json`, sampleConfig);
	});

	context.subscriptions.push(initClingoConfig);
}

function deactivate() { }

module.exports = {
	activate,
	deactivate
}
