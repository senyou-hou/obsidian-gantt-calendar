import { useEffect, useRef, type RefObject } from 'react';
import flatpickr from 'flatpickr';
import type { Options as FlatpickrOptions } from 'flatpickr/dist/types/options';

/**
 * Flatpickr React 封装
 *
 * 将 flatpickr 实例绑定到 ref 元素。options 保存在 ref 中始终取最新值，
 * 实例仅在挂载时创建一次，卸载时销毁（避免每次渲染重建）。
 *
 * 初始化时机：延迟到浏览器空闲时执行（等弹窗入场动画完成后），
 * 避免挂载瞬间同步构建多个日历 DOM 阻塞主线程、拖慢弹窗弹出。
 * 若用户在延迟初始化前点击输入框，则立即初始化并打开日历（兜底）。
 */
export function useFlatpickr<T extends HTMLElement>(
	options: FlatpickrOptions
): RefObject<T | null> {
	const ref = useRef<T | null>(null);
	const optionsRef = useRef<FlatpickrOptions>(options);
	optionsRef.current = options;

	useEffect(() => {
		const el = ref.current;
		if (!el) return;

		let instance: flatpickr.Instance | null = null;
		let cancelled = false;

		const ensureInstance = (): flatpickr.Instance | null => {
			if (instance || !ref.current) return instance;
			instance = flatpickr(ref.current, optionsRef.current);
			return instance;
		};

		// 兜底：延迟初始化完成前用户点击输入框 → 立即初始化并打开日历
		const handlePointerDown = () => {
			const created = !instance;
			const inst = ensureInstance();
			if (created && inst) {
				window.setTimeout(() => inst.open(), 0);
			}
		};
		el.addEventListener('pointerdown', handlePointerDown);

		// 空闲时初始化（无 requestIdleCallback 时退化为延时）
		const w = window as Window & {
			requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
			cancelIdleCallback?: (id: number) => void;
		};
		let idleId: number | null = null;
		let timerId: number | null = null;
		const initIdle = () => {
			if (cancelled) return;
			ensureInstance();
		};
		if (typeof w.requestIdleCallback === 'function') {
			idleId = w.requestIdleCallback(initIdle, { timeout: 400 });
		} else {
			timerId = window.setTimeout(initIdle, 350);
		}

		return () => {
			cancelled = true;
			el.removeEventListener('pointerdown', handlePointerDown);
			if (idleId !== null && w.cancelIdleCallback) w.cancelIdleCallback(idleId);
			if (timerId !== null) window.clearTimeout(timerId);
			instance?.destroy();
			instance = null;
		};
	}, []);

	return ref;
}

/**
 * 获取已绑定到元素的 flatpickr 实例（手动调用 clear/setDate 等）
 */
export function getFlatpickrInstance<T extends HTMLElement>(
	ref: RefObject<T | null>
): flatpickr.Instance | null {
	return (ref.current as unknown as { _flatpickr?: flatpickr.Instance } | null)?._flatpickr ?? null;
}
