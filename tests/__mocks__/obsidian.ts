// Minimal mock for Obsidian module used in tests
export class App {}
export class TFile {
	path = "";
}
export class Plugin {}
export class Notice {
	constructor(public message?: unknown) {}
}
export function getLanguage(): string {
	return "en";
}
export class MarkdownRenderer {
	static render(_app: App, _markdown: string, _el: HTMLElement, _path: string): void {}
}
