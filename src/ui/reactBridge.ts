import { createRoot, type Root } from 'react-dom/client';
import type { ReactElement } from 'react';

/**
 * 将 React 元素挂载到指定 DOM 容器
 * @returns 卸载函数
 */
export function mountReact(container: HTMLElement, element: ReactElement): () => void {
	container.empty();
	const root: Root = createRoot(container);
	root.render(element);
	return () => {
		root.unmount();
	};
}

/**
 * 重新渲染已挂载的根节点（settings 变化等场景）
 */
export function rerenderRoot(root: Root | null, element: ReactElement): void {
	if (root) {
		root.render(element);
	}
}