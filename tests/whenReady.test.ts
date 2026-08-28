/**
 * TaskStore.whenReady 初始化门闩行为：
 * - 初始化前 await 阻塞，initialize 完成后唤醒
 * - 已初始化时立即返回
 * - 并发 initialize 等待同一门闩
 * - clear() 后重新等待
 */
import { TaskStore } from '../src/TaskStore';

// 最小 App mock：initializeInternal 路径需要 vault.getMarkdownFiles
function makeApp(): ConstructorParameters<typeof TaskStore>[0] {
	// 非空文件列表：空列表会触发 initializeInternal 的 vault-未就绪重试；
	// getAbstractFileByPath 返回 null → parseFileForScan 返回 null → 零任务快速路径
	return {
		vault: {
			getMarkdownFiles: () => [{ path: 'a.md', extension: 'md', stat: { ctime: 0, mtime: 0, size: 0 } }],
			getAbstractFileByPath: () => null,
			// setupFileWatchers 需要 on/offref
			on: () => ({}),
			offref: () => {},
		},
		metadataCache: { on: () => ({}) },
	} as unknown as ConstructorParameters<typeof TaskStore>[0];
}

describe('TaskStore.whenReady', () => {
	it('初始化完成前处于 pending，完成后唤醒', async () => {
		const store = new TaskStore(makeApp());
		let settled = false;
		const waiting = store.whenReady().then(() => { settled = true; });

		// 门闩未开
		await new Promise(r => setTimeout(r, 10));
		expect(settled).toBe(false);

		await (store as unknown as { initializeInternal: (f: string, e?: string[]) => Promise<void> })
			.initializeInternal('', undefined);
		await waiting;
		expect(settled).toBe(true);
	});

	it('已初始化后 whenReady 立即返回', async () => {
		const store = new TaskStore(makeApp());
		await (store as unknown as { initializeInternal: (f: string, e?: string[]) => Promise<void> })
			.initializeInternal('', undefined);
		await Promise.race([
			store.whenReady(),
			new Promise((_, rej) => setTimeout(() => rej(new Error('whenReady blocked')), 50)),
		]);
	});

	it('并发 initialize 调用等待同一门闩，不重复扫描', async () => {
		const store = new TaskStore(makeApp());
		const anyStore = store as unknown as {
			initializeInternal: (f: string, e?: string[]) => Promise<void>;
			initialize: (f: string, e?: string[]) => Promise<void>;
		};
		let scanCount = 0;
		// 拦截内部初始化以计数
		anyStore.initializeInternal = async () => {
			scanCount++;
			await new Promise(r => setTimeout(r, 20));
			// 模拟 initialize 内部成功路径的门闩结算
			(store as unknown as { initResolve: (() => void) | null }).initResolve?.();
		};

		await Promise.all([anyStore.initialize(''), anyStore.initialize(''), anyStore.initialize('')]);
		expect(scanCount).toBe(1);
	});

	it('clear() 后 whenReady 重新阻塞', async () => {
		const store = new TaskStore(makeApp());
		const anyStore = store as unknown as {
			initializeInternal: (f: string, e?: string[]) => Promise<void>;
			initialize: (f: string, e?: string[]) => Promise<void>;
			clear: () => void;
		};
		anyStore.initializeInternal = async () => {
			(store as unknown as { initResolve: (() => void) | null }).initResolve?.();
		};

		await anyStore.initialize('');
		anyStore.clear();

		let settled = false;
		const waiting = store.whenReady().then(() => { settled = true; });
		await new Promise(r => setTimeout(r, 10));
		expect(settled).toBe(false);

		await anyStore.initialize('');
		await waiting;
		expect(settled).toBe(true);
	});
});
