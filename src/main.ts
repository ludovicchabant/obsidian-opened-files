import {
	Editor, 
	FileView,
	MarkdownView,
	Plugin, 
} from 'obsidian';

import {
	DEFAULT_SETTINGS,
	OpenedFilesPluginSettings,
	OpenedFilesPluginSettingTab
} from './settings';

import {
	OpenedFilesListView,
	OpenedFilesListViewType
} from './panes';

import {
	FileOpenPatch
} from './fileopenpatch';

import {
	PluginType,
	CodeMirrorStateManager,
	OpenedFilesCodeMirrorViewPlugin
} from './cmplugin';

// Interface for an opened file.
interface OpenedFileData {
	basename: string;
	path: string;
	extension: string;
	lastOpenedTime: number;
	cmPlugin: OpenedFilesCodeMirrorViewPlugin | null;
	state: Object;
}

// Interface for all currently opened files.
interface OpenedFilesData {
	openedFiles: OpenedFileData[];
}

// Default empty list of opened files.
const DEFAULT_DATA: OpenedFilesData = {
	openedFiles: []
};

export default class OpenedFilesPlugin extends Plugin {
	settings: OpenedFilesPluginSettings;
	view: OpenedFilesListView;
	data: OpenedFilesData;

	private fileOpenPatch: FileOpenPatch | null;

	private pendingCodeMirrorPlugin: OpenedFilesCodeMirrorViewPlugin | null;
	private isResettingState: boolean = false;

	async onload() {
		console.log("Loading OpenedFiles plugin");

		await this.loadSettings();

		this.data = Object.assign({}, DEFAULT_DATA);

		const ws = this.app.workspace;

		OpenedFilesCodeMirrorViewPlugin.register(this);

		this.fileOpenPatch = new FileOpenPatch(this);
		this.fileOpenPatch.register();

		this.registerEvent(ws.on('file-open', this.onFileOpen));
		this.registerEvent(this.app.vault.on('rename', this.onFileRename));
		this.registerEvent(this.app.vault.on('delete', this.onFileDelete));

		this.registerView(
			OpenedFilesListViewType,
			(leaf) => (this.view = new OpenedFilesListView(leaf, this, this.data)),
		);

		this.addCommand({
			id: 'show-opened-files-pane',
			name: 'Show opened files pane',
			callback: () => { this.activateView(true); }
		});
		this.addCommand({
			id: 'close-active-file',
			name: 'Close active file',
			editorCheckCallback: (checking, editor, view) => { 
				return this.closeActiveFile(checking, editor, view); }
		});

		this.app.workspace.registerHoverLinkSource(
			OpenedFilesListViewType,
			{
				display: 'Recent Files',
				defaultMod: true,
			});

		this.addSettingTab(new OpenedFilesPluginSettingTab(this.app, this));

		this.gatherAlreadyOpenedFiles();
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(OpenedFilesListViewType);

		if (this.fileOpenPatch) {
			this.fileOpenPatch.unregister();
		}
	}

	private gatherAlreadyOpenedFiles() {
		this.app.workspace.iterateRootLeaves((leaf) => {
			if (!(leaf.view instanceof MarkdownView)) {
				return;
			}

			var file = leaf.view.file;
			var cmPlugin = leaf.view.editor.cm.plugin(PluginType);

			this.data.openedFiles.unshift({
				basename: file.basename,
				path: file.path,
				extension: file.extension,
				lastOpenedTime: Date.now(),
				cmPlugin: cmPlugin
			});
		});
		console.debug(`Found ${this.data.openedFiles.length} opened files`);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateView(reveal: boolean) {
		let ws: Workspace = this.app.workspace;
		let existingLeaf: WorkspaceLeaf = null;
		for (var leaf of ws.getLeavesOfType(OpenedFilesListViewType)) {
			existingLeaf = leaf;
		}
		if (!existingLeaf) {
			existingLeaf = ws.getLeftLeaf(false);
			await existingLeaf.setViewState({
				type: OpenedFilesListViewType,
				active: true,
			});
		}
		if (reveal && existingLeaf) {
			ws.revealLeaf(existingLeaf);
		}
	}

	async closeActiveFile(checking: boolean, editor: Editor, view: MarkdownView) {
		// Close the opened file matching the current editor.
		var existingIndex = this.data.openedFiles.findIndex(
			curFile => curFile.path == view.file.path
		);
		if (checking) {
			return existingIndex >= 0;
		}
		this.data.openedFiles.splice(existingIndex, 1);

		// Close the active pane too.
		this.app.commands.executeCommandById("workspace:close");
	}

	public registerCodeMirrorPlugin(plugin: OpenedFilesCodeMirrorViewPlugin) {
		if (this.isResettingState) {
			return;
		}

		// On plugin init, if there are already multiple markdown panes 
		// open, we would overwrite the pending plugin reference multiple
		// times and never actually use it. This is handled in the plugin
		// initialization though.
		this.pendingCodeMirrorPlugin = plugin;
		console.debug("Registered CodeMirror view plugin");
	}
	
	public unregisterCodeMirrorPlugin(plugin: OpenedFilesCodeMirrorViewPlugin, state: Object) {
		if (this.isResettingState) {
			return;
		}

		var existingIndex = this.data.openedFiles.findIndex(
			curFile => curFile.cmPlugin == plugin
		);
		if (existingIndex < 0) {
			this.pendingCodeMirrorPlugin = null;
		} else {
			var existingFile = this.data.openedFiles[existingIndex];
			existingFile.cmPlugin = null;
			existingFile.state = state;
		}
		console.debug("Unregistered CodeMirror view plugin");
	}

	private readonly updateData = async (file: TFile, editor: Editor): Promise<void> => {
		var existingFile = this.data.openedFiles.find(
			curFile => curFile.path == file.path
		);
		if (existingFile) {
			const hadPlugin: boolean = (existingFile.cmPlugin != null);
			if (!hadPlugin) {
				// Reopening a file we have previous data for... restore its
				// editing state.
				existingFile.cmPlugin = this.pendingCodeMirrorPlugin;
				this.pendingCodeMirrorPlugin = null;
				if (existingFile.state) {
					this.isResettingState = true;
					CodeMirrorStateManager.restore(existingFile.state, editor);
					console.debug("Restored editing state for file:", file.path);
					this.isResettingState = false;
				} else {
					console.warn("Can't restore editing state for file:", file.path);
				}
			} else {
				// For some reason Obsidian triggers `file-open` when merely
				// switching focus between markdown editor leaves... this
				// would already be hooked up to a CodeMirror view plugin, so
				// we don't have anything to do.
				console.debug("Nothing to do for re-opening:", file.path);
			}
			existingFile.lastOpenedTime = Date.now();
		} else {
			// New file being opened.
			let newOpenedFileData = {
				basename: file.basename,
				path: file.path,
				extension: file.extension,
				lastOpenedTime: Date.now(),
				cmPlugin: this.pendingCodeMirrorPlugin
			};
			this.pendingCodeMirrorPlugin = null;

			this.data.openedFiles.unshift(newOpenedFileData);
			console.debug("Linked pending CodeMirror plugin to:", file.path);
		}
	}

	private readonly onFileOpen = async (
		openedFile: TFile
	): Promise<void> => {
		// Update our list of opened files.
		// If `openedFile` is null, it's because the last pane was closed
		// and there is now an empty pane.
		if (openedFile) {
			var activeView = this.app.workspace.activeLeaf.view;
			await this.updateData(openedFile, activeView.editor);
		}

		// When closing a leaf that had a markdown editor, Obsidian doesn't
		// seem to shutdown the CodeMirror instance so our plugin never 
		// gets destroyed. We have to figure it out ourselves by doing some
		// garbage collection.
		//
		// Thankfully, since closing a leaf changes focus to another leaf,
		// Obsidian triggers a `file-open` event. So we can do this dirty
		// work here.
		this.garbageCollectOpenedFiles();

		// If we need to keep the number of opened files under a maximum,
		// do it now.
		this.closeExcessFiles();

		if (this.view) {
			this.view.redraw();
		}
	}

	private garbageCollectOpenedFiles() {
		var openedFiles = this.data.openedFiles;
		var validIndices = Array.from(
			{length: openedFiles.length}, (v, i) => false);

		// Search all workspace leaves to figure out which opened files
		// are currently visible in a markdown editor.
		this.app.workspace.iterateRootLeaves((leaf) => {
			if (!(leaf.view instanceof FileView)) {
				return;
			}
			
			const filePath = leaf.view.file.path;
			const existingIndex = this.data.openedFiles.findIndex(
				curFile => curFile.path == filePath
			);
			if (existingIndex >= 0) {
				validIndices[existingIndex] = true;
			}
		});

		// Anything that didn't have a markdown editor is leaking their
		// CodeMirror plugin, so let's clear that.
		for (var i = validIndices.length - 1; i >= 0; --i) {
			if (validIndices[i]) {
				continue;
			}
			if (openedFiles[i].cmPlugin) {
				console.debug("Removing garbage CodeMirror plugin:", 
							  i, openedFiles[i].path);
				openedFiles[i].cmPlugin = null;
			}
		}

		var numCmPlugins = 0;
		openedFiles.forEach((curFile) => {
			if (curFile.cmPlugin) {
				++numCmPlugins;
			}
		});
		console.debug("Opened files:", this.data.openedFiles.length);
		console.debug("Files still hooked to CodeMirror:", numCmPlugins);
	}

	private closeExcessFiles() {
		const keepMax = this.settings.keepMaxOpenFiles;
		if (keepMax <= 0) {
			return;
		}

		this.data.openedFiles.sort((a, b) => a.lastOpenedTime < b.lastOpenedTime);

		if (this.data.openedFiles.length > keepMax) {
			this.data.openedFiles.splice(keepMax);
			console.debug("Closing files to keep under:", keepMax);
		}
	}

	private readonly onFileRename = async (
		file: TAbstractFile,
		oldPath: string,
	): Promise<void> => {
		const existingFile = this.data.openedFiles.find(
			(curFile) => curFile.path === oldPath
		);
			if (existingFile) {
				existingFile.basename = file.basename;
				existingFile.path = file.path;
				existingFile.extension = file.extension;

				if (this.view) {
					this.view.redraw();
				}
			}
	};

	private readonly onFileDelete = async (
		file: TAbstractFile,
	): Promise<void> => {
		const previousLength = this.data.openedFiles.length;
		this.data.openedFiles = this.data.openedFiles.filter(
			(curFile) => curFile.path !== file.path
		);

		if (this.view && previousLength != this.data.openedFiles.length) {
			this.view.redraw();
		}
	};
}

