'use strict';

const vscode = require('vscode');
const path = require('path');
const { homedir } = require('os');
const { readHtml, writeFile, getSettings } = require('./util');
//debug
const mylog = vscode.window.createOutputChannel("asep");

const getConfig = () => {
  const editorSettings = getSettings('editor', ['fontLigatures', 'tabSize']);
  const editor = vscode.window.activeTextEditor;
  if (editor) editorSettings.tabSize = editor.options.tabSize;

  const extensionSettings = getSettings('codesnap', [
    'backgroundColor',
    'boxShadow',
    'containerPadding',
    'roundedCorners',
    'showWindowControls',
    'showWindowTitle',
    'showLineNumbers',
    'realLineNumbers',
    'transparentBackground',
    'target',
    'shutterAction'
  ]);

  const selection = editor && editor.selection;
  const startLine = extensionSettings.realLineNumbers ? (selection ? selection.start.line : 0) : 0;

  let windowTitle = '';
  if (editor && extensionSettings.showWindowTitle) {
    const activeFileName = editor.document.uri.path.split('/').pop();
    windowTitle = `${vscode.workspace.name} - ${activeFileName}`;
  }

  return {
    ...editorSettings,
    ...extensionSettings,
    startLine,
    windowTitle
  };
};

const createPanel = async (context) => {
  const panel = vscode.window.createWebviewPanel(
    'codesnap',
    'CodeSnap-Asep 📸',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(context.extensionPath)]
    }
  );
  panel.webview.html = await readHtml(
    path.resolve(context.extensionPath, 'webview/index.html'),
    panel
  );

  return panel;
};

const rootPath = vscode.workspace.rootPath;
const saveImage = async (data) => {
  const uri = vscode.Uri.file(path.resolve(rootPath, 'png',  filename + '-' + linenumber + '.png'));
  mylog.appendLine(uri);
  uri && writeFile(uri.fsPath, Buffer.from(data, 'base64'));
};

const hasOneSelection = (selections) =>
  selections && selections.length === 1 && !selections[0].isEmpty;

let i = 0;
let lines;
let filename;
let linenumber;

const runCommand = async (context) => {
  const panel = await createPanel(context);

  const update = async () => {
    await vscode.commands.executeCommand('editor.action.clipboardCopyWithSyntaxHighlightingAction');
    panel.webview.postMessage({ type: 'update', ...getConfig() });
  };

  const flash = () => panel.webview.postMessage({ type: 'flash' });

  const findAndSelect = async (data) => {
    for (; i < lines.length; i++) {
      if (lines[i].match(/@KDN/)) {
        const start = i - 1;
        let end = i;
        for (; i < lines.length; i++) {
          if (lines[i].match(/^\}$/)) {
            end = i
            i = start + 2;
            break;
          }
        }
        if (i === lines.length) {
          i = start + 2;
        }
        editor.selection = new vscode.Selection(new vscode.Position(start, 0), new vscode.Position(end, 1))
        linenumber = start+1;
        await vscode.commands.executeCommand('workbench.action.focusLeftGroup');
        break;
      }
    }
  };

  panel.webview.onDidReceiveMessage(async ({ type, data }) => {
    if (type === 'save') {
      flash();
      await saveImage(data);
    } else if (type === 'find') {
      await findAndSelect(data);
    } else {
      vscode.window.showErrorMessage(`CodeSnap-Asep 📸: Unknown shutterAction "${type}"`);
    }
  });

  const selectionHandler = vscode.window.onDidChangeTextEditorSelection(
    (e) => hasOneSelection(e.selections) && update()
  );
  panel.onDidDispose(() => selectionHandler.dispose());

  const editor = vscode.window.activeTextEditor;
  if (editor && hasOneSelection(editor.selections)) update();
  lines = editor.document.getText().split('\n');
  i = 0;
  const f = editor.document.fileName.split('/');
  filename = f[f.length-1]
  mylog.appendLine(filename);
};

module.exports.activate = (context) =>
  context.subscriptions.push(
    vscode.commands.registerCommand('codesnap.start', () => runCommand(context))
  );
