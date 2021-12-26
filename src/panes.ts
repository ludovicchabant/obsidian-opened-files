import {
	FilePath,
	FileView,
	ItemView,
	Menu,
	WorkspaceLeaf,
} from 'obsidian';

import {
	OpenedFilesData,
	OpenedFilesPlugin
} from './main';


// View type for the opened files pane.
export const OpenedFilesListViewType = 'opened-files';

// Opened files pane.
export class OpenedFilesListView extends ItemView {
	private readonly plugin: OpenedFilesPlugin;
	private data: OpenedFilesData;

	constructor(
		leaf: WorkspaceLeaf,
		plugin: OpenedFilesPlugin,
		data: OpenedFilesData,
	) {
		super(leaf);

		this.plugin = plugin;
		this.data = data;
		this.redraw();
	}

	public getViewType(): string {
		return OpenedFilesListViewType;
	}

	public getDisplayText(): string {
		return 'Opened Files';
	}

	public getIcon(): string {
		return 'sheets-in-box';
	}

	public onHeaderMenu(menu: Menu): void {
		menu
		.addItem((item) => {
			item
			.setTitle('Clear list')
			.setIcon('sweep')
			.onClick(async () => {
				this.data.openedFiles = [];
				this.redraw();
			});
		})
		.addItem((item) => {
			item
			.setTitle('Close')
			.setIcon('cross')
			.onClick(() => {
				this.app.workspace.detachLeavesOfType(OpenedFilesListViewType);
			});
		});
	}

	public readonly redraw = (): void => {
		const openFile = this.app.workspace.getActiveFile();

		const rootEl = createDiv({cls: 'nav-folder mod-root opened-files-pane'});
		const childrenEl = rootEl.createDiv({cls: 'nav-folder-children'});

		this.data.openedFiles.forEach((curFile) => {
			const navFile = childrenEl.createDiv({cls: 'nav-file'});
			const navFileTitle = navFile.createDiv({cls: 'nav-file-title'});

			if (openFile && curFile.path === openFile.path) {
				navFileTitle.addClass('is-active');
			}

			navFileTitle.createDiv({
				cls: 'nav-file-title-content',
				text: curFile.basename,
			});

			const navFileClose = navFileTitle.createDiv(
				{cls: 'nav-file-close'});
			const navFileCloseLink = navFileClose.createEl(
				'a', {cls: 'view-action mod-close-file', 'aria-label': 'Close'});
			navFileCloseLink.innerHTML = SVG_CLOSE_ICON;

			navFile.setAttr('draggable', 'true');
			navFile.addEventListener('dragstart', (event: DragEvent) => {
				const file = this.app.metadataCache.getFirstLinkpathDest(
					curFile.path, '');
				const dragManager = this.app.dragManager;
				const dragData = dragManager.dragFile(event, file);
				dragManager.onDragStart(event, dragData);
			});

			navFile.addEventListener('mouseover', (event: MouseEvent) => {
				this.app.workspace.trigger('hover-link', {
					event,
					source: OpenedFilesListViewType,
					hoverParent: rootEl,
					targetEl: navFile,
					linktext: curFile.path,
				});
			});

			navFile.addEventListener('contextmenu', (event: MouseEvent) => {
				const menu = new Menu(this.app);
				const file = this.app.vault.getAbstractFileByPath(curFile.path);
				this.app.workspace.trigger(
					'file-menu',
					menu,
					file,
					'link-context-menu',
					this.leaf,
				);
				menu.showAtPosition({x: event.clientX, y: event.clientY});
			});

			navFile.addEventListener('click', (event: MouseEvent) => {
				this.openFile(curFile, event.ctrlKey || event.metaKey);
			});

			navFileCloseLink.addEventListener('click', (event: MouseEvent) => {
				// Don't propagate this event to the parent, because the
				// parent div handles the click event as opening the file
				// we want to close!
				event.stopPropagation();

				this.closeFile(curFile);
			});
		});

		const contentEl = this.containerEl.children[1];
		contentEl.empty();
		contentEl.appendChild(rootEl);
	};

	private readonly openFile = (file: FilePath, shouldSplit = false): void => {
		const targetFile = this.app.vault
			.getFiles()
			.find((f) => f.path === file.path);

		if (targetFile) {
			let leaf = this.app.workspace.getMostRecentLeaf();

			const createLeaf = shouldSplit || leaf.getViewState().pinned;
			if (createLeaf) {
				leaf = this.app.workspace.createLeafBySplit(leaf);
			}
			leaf.openFile(targetFile);
		} else {
			new Notice('Cannot find a file with that name');
			this.data.openedFiles = this.data.openedFiles.filter(
				(fp) => fp.path !== file.path,
			);
			this.redraw();
		}
	};

	private readonly closeFile = (file: FilePath): void => {
		var existingIndex = this.data.openedFiles.findIndex(
			(curFile) => curFile.path == file.path
		);
		if (existingIndex >= 0) {
			console.debug("Closing file:", file.path);
			this.data.openedFiles.splice(existingIndex, 1);
		}

		var leavesToClose = [];
		this.app.workspace.iterateRootLeaves((leaf: WorkspaceLeaf) => {
			if (!(leaf.view instanceof FileView)) {
				return;
			}
			
			const filePath = leaf.view.file.path;
			if (filePath == file.path) {
				leavesToClose.push(leaf);
			}
		});
		console.debug(`Closing ${leavesToClose.length} leaves for file:`, file.path);
		leavesToClose.forEach((leaf) => {
			leaf.detach();
		});

		this.redraw();
	};
}

const SVG_CLOSE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" class="cross" width="16" height="16"><path fill="currentColor" stroke="currentColor" d="M15.4,12.6l-2.9,2.9L47.1,50L12.6,84.6l2.9,2.9L50,52.9l34.6,34.6l2.9-2.9L52.9,50l34.6-34.6l-2.9-2.9L50,47.1L15.4,12.6z "></path></svg>';

