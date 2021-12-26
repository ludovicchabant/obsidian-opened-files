import {
	OpenedFilesPlugin
} from './main';

export class FileOpenPatch {
	private plugin: OpenedFilesPlugin | null;
	private keyupEventHandled: boolean = false;

	constructor(plugin: OpenedFilesPlugin) {
		this.plugin = plugin;
	}

	public register() {
		var ws = this.plugin.app.workspace;
		ws._origPushClosable = ws.pushClosable;
		ws.pushClosable = (c) => { this.onPushClosable(c); };
		console.debug("Registered file-open modal patch.");
	}

	public unregister() {
		var ws = this.plugin.app.workspace;
		ws.pushClosable = ws._origPushClosable;
		delete ws._origPushClosable;
		console.debug("Unregistered file-open modal patch.");
	}

	private onPushClosable(c) {
		var ws = this.plugin.app.workspace;
		ws._origPushClosable(c);

		// Ugly way to detect the modal's type.
		if (c.emptyStateText &&
			c.emptyStateText.startsWith("No notes found.")) {
			this.keyupEventHandled = true;
			c.containerEl.addEventListener("keyup", (e) => { this.onKeyup(e); });
			this.updateModalCapsules(ws);
		}
	}

	private onKeyup(e) {
		this.updateModalCapsules();
	}

	private updateModalCapsules() {
		var openedFileMap = {};
		this.plugin.data.openedFiles.forEach((data) => {
			var fileDisplayName = data.path.substring(
				0, data.path.length - data.extension.length - 1);
			openedFileMap[fileDisplayName] = true;
		});

		var ws = this.plugin.app.workspace;
		var closeable = ws.closeables[ws.closeables.length - 1];
		var items = Array.from(
			closeable.containerEl.getElementsByClassName('suggestion-item'));
		items.forEach((item) => {
			var children = Array.from(item.childNodes);
			var textChild = children.find((c) => { return c.nodeType == document.TEXT_NODE; });
			var capsules = item.getElementsByClassName("opened-file-capsule");
			if (textChild && textChild.wholeText in openedFileMap) {
				if (capsules.length == 0) {
					item.createSpan({cls:"opened-file-capsule", text:"open"});
				}
			} else {
				if (capsules.length > 0) {
					item.removeChild(capsules[0]);
				}
			}
		});
	}
}
