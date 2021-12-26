import {
	PluginSettingTab,
	Setting
} from 'obsidian';

import {
	OpenedFilesPlugin
} from './main'

export interface OpenedFilesPluginSettings {
	keepMaxOpenFiles: number;
}

export const DEFAULT_SETTINGS: OpenedFilesPluginSettings = {
	keepMaxOpenFiles: 0
}

export class OpenedFilesPluginSettingTab extends PluginSettingTab {
	plugin: OpenedFilesPlugin;

	constructor(app: App, plugin: OpenedFilesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Keep maximum open files')
			.setDesc('How many files to keep open at most ' +
					 '(set to 0 to keep all files open until explicitly closed)')
			.addText(text => text
				.setValue(this.plugin.settings.keepMaxOpenFiles?.toString()))
				.onChange(async (value) => {
					const intValue = parseInt(value);
					if (!isNaN(intValue)) {
						this.plugin.settings.keepMaxOpenFiles = intValue;
						await this.plugin.saveSettings();
					}
				});
	}
}
