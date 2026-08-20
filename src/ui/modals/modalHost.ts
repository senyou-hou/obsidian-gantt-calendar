import { createElement, type JSX, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ModalProvider, useModal, type ModalProviderContextValue } from '../components/ModalProvider';

/**
 * 插件级全局 Modal 宿主
 *
 * 设置面板、命令等非 React 环境也需打开 React 模态框，
 * 因此在插件加载时挂载一个独立的 React root（ModalProvider），
 * 并通过 openReactModal() 命令式桥接打开模态框。
 */

let openModalFn: ModalProviderContextValue['openModal'] | null = null;
let hostRoot: ReturnType<typeof createRoot> | null = null;
let hostEl: HTMLElement | null = null;

/** 桥接子组件：挂载后把 ModalProvider 的 openModal 注册到全局 */
function ModalHostBridge(): JSX.Element | null {
	const ctx = useModal();
	openModalFn = ctx.openModal;
	return null;
}

/**
 * 挂载全局 Modal 宿主（插件 onload 时调用一次）
 */
export function initModalHost(): void {
	if (hostRoot) return;
	hostEl = activeDocument.body.createDiv({ cls: 'gc-modal-host' });
	hostRoot = createRoot(hostEl);
	hostRoot.render(
		createElement(
			ModalProvider,
			null,
			createElement(ModalHostBridge)
		)
	);
}

/**
 * 卸载全局 Modal 宿主（插件 onunload 时调用）
 */
export function destroyModalHost(): void {
	hostRoot?.unmount();
	hostRoot = null;
	hostEl?.remove();
	hostEl = null;
	openModalFn = null;
}

/**
 * 命令式打开一个 React 模态框元素，返回关闭函数
 * 供非 React 环境（设置面板、命令、工具函数）调用
 */
export function openReactModal(element: ReactElement): () => void {
	if (!openModalFn) {
		throw new Error('Modal host not initialized. Call initModalHost() on plugin load.');
	}
	return openModalFn(element);
}

/** 宿主是否已初始化（测试/诊断用） */
export function isModalHostReady(): boolean {
	return openModalFn !== null;
}