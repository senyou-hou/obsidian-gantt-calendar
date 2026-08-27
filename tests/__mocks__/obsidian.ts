// Minimal mock for Obsidian module used in tests
export class App {}
export class TFile {
	path = "";
}
export class Plugin {}
export class MarkdownRenderer {
	static render(_app: App, _markdown: string, _el: HTMLElement, _path: string): void {}
}
