import { useEffect, useRef, type RefObject } from 'react';
import flatpickr from 'flatpickr';
import type { Options as FlatpickrOptions } from 'flatpickr/dist/types/options';

/**
 * Flatpickr React 封装
 *
 * 将 flatpickr 实例绑定到 ref 元素。options 保存在 ref 中始终取最新值，
 * 实例仅在挂载时创建一次，卸载时销毁（避免每次渲染重建）。
 */
export function useFlatpickr<T extends HTMLElement>(
	options: FlatpickrOptions
): RefObject<T | null> {
	const ref = useRef<T | null>(null);
	const optionsRef = useRef<FlatpickrOptions>(options);
	optionsRef.current = options;

	useEffect(() => {
		if (!ref.current) return;
		const instance = flatpickr(ref.current, optionsRef.current);
		return () => {
			instance.destroy();
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