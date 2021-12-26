import {
	Editor
} from 'codemirror';

import {
	historyField,
	BranchName
} from '@codemirror/history';

import {
	EditorState
} from '@codemirror/state';

import {
	EditorView,
	PluginValue,
	ViewPlugin
} from '@codemirror/view';

export var PluginType: ViewPlugin<OpenedFilesCodeMirrorViewPlugin> | null = null;

// CodeMirror6 plugin that captures when a file is closed, so we can save
// its state (history, selection, scrolling position, etc).
export class OpenedFilesCodeMirrorViewPlugin implements PluginValue {
	plugin: OpenedFilesPlugin;
	view: EditorView;

	constructor(readonly plugin: OpenedFilesPlugin, readonly view: EditorView) {
		this.plugin = plugin;
		this.view = view;

		// We use this plugin instance as a key to know what file is being
		// closed (see destroy() method below).
		this.plugin.registerCodeMirrorPlugin(this);
	}

	destroy() {
		// Save the document state to JSON and hand it over to the Obsidian 
		// plugin for safe-keeping until the file is re-opened.
		var viewStateJson = this.view.state.toJSON({"historyField": historyField});
		var savedState = {
			'viewState': viewStateJson, 
			'scrollTop': this.view.scrollDOM.scrollTop
		};
		this.plugin.unregisterCodeMirrorPlugin(this, savedState);
	}

	public static register(plugin: OpenedFilesPlugin) {
		const cmPlugin = ViewPlugin.define(
			(view: EditorView) => {
				return new OpenedFilesCodeMirrorViewPlugin(plugin, view);
			});
		plugin.registerEditorExtension(cmPlugin);
		PluginType = cmPlugin;
	}
}

export class CodeMirrorStateManager {
	static restore(state: Object, editor: Editor) {
		//var transaction = editor.cm.state.update([{
		//	selection: savedState.selection,
		//	annotations: [
		//		fromHistory.of({side: BranchName.Done, rest: savedState.done}),
		//		fromHistory.of({side: BranchName.Undone, rest: savedSate.undone})
		//	]
		//}]);
		//editor.cm.dispatch(transaction);
		//editor.cm.setState(allState);

		// Restore history by stomping it with JSON deserialization.
		// (probably mega unsafe and unsupported...)
		var histFieldValue = editor.cm.state.field(historyField);
		Object.assign(
			histFieldValue, 
			historyField.spec.fromJSON(state.viewState.historyField));

		// No need to deserialize the history field now, we just want the selection.
		var viewStateObj = EditorState.fromJSON(state.viewState);
		var transaction = editor.cm.state.update({
			selection: viewStateObj.selection,
			scrollIntoView: true
		});
		editor.cm.dispatch(transaction);

		// Restore scrolling position.
		editor.cm.scrollDOM.scrollTop = state.scrollTop;
	}
}

