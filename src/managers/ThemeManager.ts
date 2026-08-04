/**
 * 主题管理器
 *
 * 负责主题变化监听和通知
 */

/**
 * 主题管理器
 */
export class ThemeManager {
	private unregisterFn?: () => void;

	/**
	 * 初始化主题监听
	 * @param callback 主题切换时的回调函数
	 */
	initialize(callback: () => void): void {
		// 仅当主题（theme-dark/theme-light）真正切换时才触发回调。
		// body class 还会因拖拽状态、其他插件等行为变化，
		// 若对所有 class 变化都触发全量刷新，会导致视图无故重建（如拖拽释放时滚动条跳动）
		let lastIsDark = this.isDarkTheme();

		const observer = new MutationObserver(() => {
			const currentIsDark = this.isDarkTheme();
			if (currentIsDark !== lastIsDark) {
				lastIsDark = currentIsDark;
				callback();
			}
		});

		observer.observe(activeDocument.body, {
			attributes: true,
			attributeFilter: ['class']
		});

		// 保存取消监听的函数
		this.unregisterFn = () => observer.disconnect();
	}

	/**
	 * 当前是否为深色主题
	 */
	private isDarkTheme(): boolean {
		return activeDocument.body.classList.contains('theme-dark');
	}

	/**
	 * 销毁主题监听器
	 */
	destroy(): void {
		if (this.unregisterFn) {
			this.unregisterFn();
			this.unregisterFn = undefined;
		}
	}
}
