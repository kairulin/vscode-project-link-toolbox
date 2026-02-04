// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

const LINKS_SETTING_KEY = 'projectLinkToolbox.links';
const DEFAULT_LINKS = [{ label: 'Example', url: 'https://example.com' }];
let extensionContext;
let activeFolderKey;

function getWebviewHtml(webview, context, nonce) {
	const htmlPath = path.join(context.extensionPath, 'webview', 'managerView.html');
	const cssPath = path.join(context.extensionPath, 'webview', 'managerView.css');
	const jsPath = path.join(context.extensionPath, 'webview', 'managerView.js');

	const styleUri = webview.asWebviewUri(vscode.Uri.file(cssPath));
	const scriptUri = webview.asWebviewUri(vscode.Uri.file(jsPath));

	let html = fs.readFileSync(htmlPath, 'utf8');
	html = html.replace(/{{cspSource}}/g, webview.cspSource);
	html = html.replace(/{{nonce}}/g, nonce);
	html = html.replace(/{{styleUri}}/g, String(styleUri));
	html = html.replace(/{{scriptUri}}/g, String(scriptUri));

	return html;
}

function getConfiguredLinks(folderKey = activeFolderKey) {
	if (!extensionContext) {
		return DEFAULT_LINKS;
	}

	const resolvedKey = folderKey || LINKS_SETTING_KEY;
	const links = extensionContext.globalState.get(resolvedKey);

	if (!Array.isArray(links)) {
		return DEFAULT_LINKS;
	}

	const normalized = links
		.filter((link) => link && typeof link.label === 'string' && typeof link.url === 'string')
		.map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
		.filter((link) => link.label.length > 0 && link.url.length > 0);

	return normalized.length > 0 ? normalized : DEFAULT_LINKS;
}

async function updateConfiguredLinks(nextLinks, folderKey = activeFolderKey) {
	if (!extensionContext) {
		return;
	}

	// 使用 workspaceState 儲存，不寫入 .vscode/settings.json
	const resolvedKey = folderKey || LINKS_SETTING_KEY;
	await extensionContext.globalState.update(resolvedKey, nextLinks);
}

function isValidUrl(url) {
	try {
		// eslint-disable-next-line no-new
		new URL(url);
		return true;
	} catch (error) {
		return false;
	}
}

class ToolboxTreeDataProvider {
	constructor() {
		this._onDidChangeTreeData = new vscode.EventEmitter();
		this.onDidChangeTreeData = this._onDidChangeTreeData.event;
	}
	refresh() {
		this._onDidChangeTreeData.fire(undefined);
	}

	getTreeItem(element) {
		return element;
	}

	getChildren() {
		const links = getConfiguredLinks();
		return links.map((link, index) => {
			const item = new vscode.TreeItem(link.label, vscode.TreeItemCollapsibleState.None);
			item.id = `${index}:${link.label}:${link.url}`;
			item.tooltip = link.url;
			item.contextValue = 'projectToolboxLink';
			item.command = {
				command: 'project-link-toolbox.openLink',
				title: 'Open Link',
				arguments: [link.url]
			};
			item.linkIndex = index;
			return item;
		});
	}
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log('context', context)
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "project-link-toolbox" is now active!');

	extensionContext = context;
	let managerPanel;

	function getActiveFolder() {
		const activeUri = vscode.window.activeTextEditor?.document?.uri;
		if (activeUri) {
			const folder = vscode.workspace.getWorkspaceFolder(activeUri);
			if (folder) {
				return folder;
			}
		}

		const folders = vscode.workspace.workspaceFolders;
		return folders && folders.length > 0 ? folders[0] : null;
	}

	function getFolderKey(folder) {
		if (!folder?.uri) {
			return LINKS_SETTING_KEY;
		}
		if (folder.uri.scheme === 'file') {
			const normalizedPath =
				process.platform === 'win32'
					? path.normalize(folder.uri.fsPath).toLowerCase()
					: path.normalize(folder.uri.fsPath);
			return `${LINKS_SETTING_KEY}:file:${normalizedPath}`;
		}
		return `${LINKS_SETTING_KEY}:${String(folder.uri.toString())}`;
	}

	function syncActiveFolderKey() {
		const activeUri = vscode.window.activeTextEditor?.document?.uri;
		if (activeUri) {
			const folder = vscode.workspace.getWorkspaceFolder(activeUri);
			if (folder) {
				activeFolderKey = getFolderKey(folder);
				return folder;
			}
		}

		if (activeFolderKey) {
			return null;
		}

		const fallbackFolder = getActiveFolder();
		activeFolderKey = getFolderKey(fallbackFolder);
		return fallbackFolder;
	}

	async function ensureFolderLinksSeeded(folder, folderKey) {
		if (!extensionContext) {
			return;
		}
		if (!folderKey || folderKey === LINKS_SETTING_KEY) {
			return;
		}

		const existing = extensionContext.globalState.get(folderKey);
		if (Array.isArray(existing)) {
			return;
		}

		const legacyUriKey = folder?.uri ? `${LINKS_SETTING_KEY}:${String(folder.uri.toString())}` : null;
		const baseLinks =
			(legacyUriKey && extensionContext.globalState.get(legacyUriKey)) ||
			extensionContext.workspaceState.get(folderKey) ||
			(legacyUriKey && extensionContext.workspaceState.get(legacyUriKey)) ||
			extensionContext.workspaceState.get(LINKS_SETTING_KEY);
		if (Array.isArray(baseLinks)) {
			await extensionContext.globalState.update(folderKey, baseLinks);
		}
	}

	function broadcastLinks(links) {
		if (managerPanel) {
			managerPanel.webview.postMessage({ type: 'links', links });
		}
	}

	const openLinkCommand = vscode.commands.registerCommand('project-link-toolbox.openLink', function (url) {
		if (!url || typeof url !== 'string' || !isValidUrl(url)) {
			vscode.window.showErrorMessage('錯誤的: ' + url);
			return;
		}

		vscode.env.openExternal(vscode.Uri.parse(url));
	});

	const openManagerCommand = vscode.commands.registerCommand('project-link-toolbox.openManager', async function () {
		const panel = vscode.window.createWebviewPanel(
			'projectLinkToolboxManager',
			'Project Link Toolbox',
			vscode.ViewColumn.One,
			{ enableScripts: true }
		);
		managerPanel = panel;

		const nonce = String(Date.now());
		const folder = syncActiveFolderKey();
		await ensureFolderLinksSeeded(folder, activeFolderKey);

		panel.webview.html = getWebviewHtml(panel.webview, context, nonce);

		panel.webview.onDidReceiveMessage(async (message) => {
			if (message.type === 'ready') {
				panel.webview.postMessage({ type: 'links', links: getConfiguredLinks() });
				return;
			}
			const currentLinks = getConfiguredLinks();

			if (message.type === 'add') {
				const label = String(message.label || '').trim();
				const url = String(message.url || '').trim();
				if (!label || !url) {
					panel.webview.postMessage({ type: 'error', message: 'Label and URL are required.' });
					return;
				}
				if (!isValidUrl(url)) {
					panel.webview.postMessage({ type: 'error', message: 'URL is invalid.' });
					return;
				}
				const nextLinks = [...currentLinks, { label, url }];
				await updateConfiguredLinks(nextLinks);
				broadcastLinks(nextLinks);
				treeDataProvider.refresh();
				return;
			}

			if (message.type === 'edit') {
				const index = typeof message.index === 'number' ? message.index : -1;
				if (index < 0 || index >= currentLinks.length) {
					return;
				}
				const label = String(message.label || '').trim();
				const url = String(message.url || '').trim();
				if (!label || !url) {
					panel.webview.postMessage({ type: 'error', message: 'Label and URL are required.' });
					return;
				}
				if (!isValidUrl(url)) {
					panel.webview.postMessage({ type: 'error', message: 'URL is invalid.' });
					return;
				}
				const updated = currentLinks.slice();
				updated[index] = { label, url };
				await updateConfiguredLinks(updated);
				broadcastLinks(updated);
				treeDataProvider.refresh();
				return;
			}

			if (message.type === 'delete') {
				const index = typeof message.index === 'number' ? message.index : -1;
				if (index < 0 || index >= currentLinks.length) {
					return;
				}
				const target = currentLinks[index];
				const confirmed = await vscode.window.showWarningMessage(
					`Delete "${target.label}"?`,
					{ modal: true },
					'Delete'
				);
				if (confirmed !== 'Delete') {
					panel.webview.postMessage({ type: 'info', message: 'Delete canceled.' });
					return;
				}
				const nextLinks = currentLinks.filter((_, i) => i !== index);
				await updateConfiguredLinks(nextLinks);
				broadcastLinks(nextLinks);
				treeDataProvider.refresh();
			}

			if (message.type === 'move') {
				const index = typeof message.index === 'number' ? message.index : -1;
				if (index < 0 || index >= currentLinks.length) {
					return;
				}
				let toIndex = index;
				if (message.direction === 'up') {
					toIndex = index - 1;
				} else if (message.direction === 'down') {
					toIndex = index + 1;
				} else if (message.direction === 'top') {
					toIndex = 0;
				} else if (message.direction === 'bottom') {
					toIndex = currentLinks.length - 1;
				}
				if (toIndex < 0 || toIndex >= currentLinks.length || toIndex === index) {
					return;
				}
				const updated = moveLink(currentLinks, index, toIndex);
				await updateConfiguredLinks(updated);
				broadcastLinks(updated);
				treeDataProvider.refresh();
			}

			if (message.type === 'moveTo') {
				const fromIndex = typeof message.fromIndex === 'number' ? message.fromIndex : -1;
				const toIndex = typeof message.toIndex === 'number' ? message.toIndex : -1;
				if (fromIndex < 0 || toIndex < 0 || fromIndex >= currentLinks.length || toIndex > currentLinks.length) {
					return;
				}
				if (fromIndex === toIndex) {
					return;
				}
				const updated = moveLink(currentLinks, fromIndex, toIndex);
				await updateConfiguredLinks(updated);
				broadcastLinks(updated);
				treeDataProvider.refresh();
			}
		});

		panel.onDidDispose(() => {
			if (managerPanel === panel) {
				managerPanel = undefined;
			}
		});
	});

	const treeDataProvider = new ToolboxTreeDataProvider();

	const treeView = vscode.window.createTreeView('project-link-toolbox.toolboxView', {
		treeDataProvider
	});

	const render = async () => {
		const folder = syncActiveFolderKey() || getActiveFolder();
		await ensureFolderLinksSeeded(folder, activeFolderKey);
		const links = getConfiguredLinks();
		treeDataProvider.refresh();
		broadcastLinks(links);
	};

	const addLinkCommand = vscode.commands.registerCommand('project-link-toolbox.addLink', async function () {
		const label = await vscode.window.showInputBox({
			prompt: '網址名稱',
			placeHolder: '輸入網址名稱'
		});
		if (!label) {
			return;
		}

		const url = await vscode.window.showInputBox({
			prompt: '網址連結',
			placeHolder: '輸入網址 (包含 http:// 或 https://)',
			validateInput: (value) => {
				return isValidUrl(value) ? null : '請輸入有效的網址';
			}
		});

		if (!url) {
			return;
		}

		const currentLink = getConfiguredLinks();
		const nextLinks = [...currentLink, { label: label.trim(), url: url.trim() }];

		await updateConfiguredLinks(nextLinks);
		treeDataProvider.refresh();
		broadcastLinks(nextLinks);
	});

	const editLinkCommand = vscode.commands.registerCommand('project-link-toolbox.editLink', async function (item) {
		console.log('item', item);
		const index = item && typeof item.linkIndex === 'number' ? item.linkIndex : -1;
		console.log('index', index);
		const currentLinks = getConfiguredLinks();
		console.log('currentLinks', currentLinks);
		const linkToEdit = currentLinks[index];
		if (!linkToEdit) {
			vscode.window.showErrorMessage('找不到要編輯的連結。');
			return;
		}
		const newLabel = await vscode.window.showInputBox({
			prompt: '網址名稱',
			placeHolder: '輸入網址名稱',
			value: linkToEdit.label
		});
		if (!newLabel) {
			return;
		}

		const newUrl = await vscode.window.showInputBox({
			prompt: '網址連結',
			placeHolder: '輸入網址 (包含 http:// 或 https://)',
			value: linkToEdit.url,
			validateInput: (value) => {
				return isValidUrl(value) ? null : '請輸入有效的網址';
			}
		});
		if (!newUrl) {
			return;
		}

		const nextLinks = currentLinks.slice();
		nextLinks[index] = { label: newLabel.trim(), url: newUrl.trim() };

		await updateConfiguredLinks(nextLinks);
		treeDataProvider.refresh();
		broadcastLinks(nextLinks);
	});

	const deleteLinkCommand = vscode.commands.registerCommand('project-link-toolbox.deleteLink', async function (item) {
		const index = item && typeof item.linkIndex === 'number' ? item.linkIndex : -1;
		const currentLinks = getConfiguredLinks();
		if (index < 0 || index >= currentLinks.length) {
			vscode.window.showErrorMessage('無法刪除此專案工具箱連結。');
			return;
		}

		const confirmed = await vscode.window.showWarningMessage(`確定要刪除 "${currentLinks[index].label}" 嗎？`, { modal: true }, 'Delete');

		if (confirmed !== 'Delete') {
			return;
		}

		const nextLinks = currentLinks.filter((_, i) => i !== index);
		await updateConfiguredLinks(nextLinks);
		treeDataProvider.refresh();
		broadcastLinks(nextLinks);
	});

	function moveLink(links, fromIndex, toIndex) {
		const updated = [...links];
		const [movedItem] = updated.splice(fromIndex, 1);
		console.log('movedItem', movedItem);
		updated.splice(toIndex, 0, movedItem);
		return updated;
	}

	const moveLinkUpCommand = vscode.commands.registerCommand('project-link-toolbox.moveLinkUp', async function (item) {
		const index = item && typeof item.linkIndex === 'number' ? item.linkIndex : -1;
		const currentLinks = getConfiguredLinks();
		if (index <= 0 || index >= currentLinks.length) {
			return;
		}

		const nextLinks = moveLink(currentLinks, index, index - 1);
		await updateConfiguredLinks(nextLinks);
		treeDataProvider.refresh();
		broadcastLinks(nextLinks);
	});

	const moveLinkDownCommand = vscode.commands.registerCommand('project-link-toolbox.moveLinkDown', async function (item) {
		const index = item && typeof item.linkIndex === 'number' ? item.linkIndex : -1;
		const currentLinks = getConfiguredLinks();
		if (index < 0 || index >= currentLinks.length - 1) {
			return;
		}

		const nextLinks = moveLink(currentLinks, index, index + 1);
		await updateConfiguredLinks(nextLinks);
		treeDataProvider.refresh();
		broadcastLinks(nextLinks);
	});
	const moveLinkToTopCommand = vscode.commands.registerCommand('project-link-toolbox.moveLinkToTop', async function (item) {
		const index = item && typeof item.linkIndex === 'number' ? item.linkIndex : -1;
		const links = getConfiguredLinks();
		if (index <= 0 || index >= links.length) {
			return;
		}

		const updated = moveLink(links, index, 0);
		await updateConfiguredLinks(updated);
		treeDataProvider.refresh();
		broadcastLinks(updated);
	});
	const moveLinkToBottomCommand = vscode.commands.registerCommand('project-link-toolbox.moveLinkToBottom', async function (item) {
		const index = item && typeof item.linkIndex === 'number' ? item.linkIndex : -1;
		const links = getConfiguredLinks();
		if (index < 0 || index >= links.length - 1) {
			return;
		}

		const updated = moveLink(links, index, links.length - 1);
		await updateConfiguredLinks(updated);
		treeDataProvider.refresh();
		broadcastLinks(updated);
	});

	const editorChangeSub = vscode.window.onDidChangeActiveTextEditor(() => {
		void render();
	});
	const folderChangeSub = vscode.workspace.onDidChangeWorkspaceFolders(() => {
		void render();
	});

	void render();

	context.subscriptions.push(
		openLinkCommand,
		openManagerCommand,
		addLinkCommand,
		editLinkCommand,
		deleteLinkCommand,
		moveLinkUpCommand,
		moveLinkDownCommand,
		moveLinkToTopCommand,
		moveLinkToBottomCommand,
		treeView,
		editorChangeSub,
		folderChangeSub
	);
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
};
