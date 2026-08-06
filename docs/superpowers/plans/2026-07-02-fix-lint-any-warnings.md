# Fix `@typescript-eslint/no-explicit-any` Warnings Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all 25 `@typescript-eslint/no-explicit-any` lint warnings by replacing `any` with proper types.

**Architecture:** Each fix is a localized type annotation change. No behavioral changes. The types already exist in the codebase — we just need to reference them.

**Tech Stack:** TypeScript, Obsidian API types

---

## Fix Summary

| File | # | Root Cause | Fix Strategy |
|---|---|---|---|
| `src/data-layer/EventBus.ts` | 2 | `EventHandler` uses `any` in data param | Change `EventHandler` to use `unknown`, propagate |
| `src/data-layer/types.ts` | 1 | `EventHandler` type definition | Change `data?: any` → `data?: unknown` |
| `src/data-layer/feishu-sync/FeishuTaskSync.ts` | 1 | `listItems: any[]` param | Change to `ListItemCache[]` (already imported) |
| `src/data-layer/sources/api/providers/feishu/FeishuTypes.ts` | 1 | `custom_fields: Record<string, any>` | Change to `Record<string, unknown>` |
| `src/data-layer/sources/caldav/CalDAVClient.ts` | 1 | Generic default `T = any` | Change to `T = unknown` |
| `src/data-layer/sources/caldav/providers/AppleCalendarProvider.ts` | 1 | Return type `Promise<any[]>` | Use inline type `{ id: string; name: string; color?: string }[]` |
| `src/settings/builders/SyncSettingsBuilder.ts` | 12 | `syncConfig: any` params, `getSyncConfiguration(): any` | Use `SyncConfiguration` from `settings/types` |
| `src/types.ts` | 1 | `dailyNoteIndex?: any` | Use `DailyNoteIndex` type |
| `src/views/EmbeddedNoteEditor.ts` | 4 | `InternalWorkspaceSplit` uses `any` | Use proper Obsidian internal types |

---

### Task 1: Fix `EventHandler` type and `EventBus.ts`

**Files:**
- Modify: `src/data-layer/types.ts:99`
- Modify: `src/data-layer/EventBus.ts:47,66`

The `EventHandler` type is the root cause — changing it to `unknown` fixes EventBus and is the correct type-safe approach (callers already handle unknown data).

- [ ] **Step 1: Change EventHandler type**

In `src/data-layer/types.ts:99`, change:
```ts
export type EventHandler = (data?: any) => void | Promise<void>;
```
to:
```ts
export type EventHandler = (data?: unknown) => void | Promise<void>;
```

- [ ] **Step 2: Update EventBus.emit and EventBus.once**

In `src/data-layer/EventBus.ts:47`, change:
```ts
emit(eventName: string, data?: any): void {
```
to:
```ts
emit(eventName: string, data?: unknown): void {
```

In `src/data-layer/EventBus.ts:66`, change:
```ts
const wrappedHandler = (data?: any) => {
```
to:
```ts
const wrappedHandler = (data?: unknown) => {
```

- [ ] **Step 3: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: No new errors from this change. Any callers passing typed data will still work since `unknown` accepts all values.

---

### Task 2: Fix `FeishuTaskSync.ts` listItems param

**Files:**
- Modify: `src/data-layer/feishu-sync/FeishuTaskSync.ts:416`

`ListItemCache` is already imported at line 10. The param just needs the correct type.

- [ ] **Step 1: Fix param type**

Change line 416:
```ts
private async parseObsidianFile(file: TFile, listItems: any[]): Promise<GCTask[]> {
```
to:
```ts
private async parseObsidianFile(file: TFile, listItems: ListItemCache[]): Promise<GCTask[]> {
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

---

### Task 3: Fix `FeishuTypes.ts` custom_fields

**Files:**
- Modify: `src/data-layer/sources/api/providers/feishu/FeishuTypes.ts:270`

- [ ] **Step 1: Fix type**

Change line 270:
```ts
custom_fields?: Record<string, any>;
```
to:
```ts
custom_fields?: Record<string, unknown>;
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

---

### Task 4: Fix `CalDAVClient.ts` generic default

**Files:**
- Modify: `src/data-layer/sources/caldav/CalDAVClient.ts:34`

- [ ] **Step 1: Fix generic default**

Change line 34:
```ts
export interface CalDAVResponse<T = any> {
```
to:
```ts
export interface CalDAVResponse<T = unknown> {
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

---

### Task 5: Fix `AppleCalendarProvider.ts` return type

**Files:**
- Modify: `src/data-layer/sources/caldav/providers/AppleCalendarProvider.ts:65`

- [ ] **Step 1: Fix return type**

Change line 65:
```ts
async getCalendarList(): Promise<any[]> {
```
to:
```ts
async getCalendarList(): Promise<{ id: string; name: string; color?: string }[]> {
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

---

### Task 6: Fix `EmbeddedNoteEditor.ts` InternalWorkspaceSplit

**Files:**
- Modify: `src/views/EmbeddedNoteEditor.ts:16-22`

- [ ] **Step 1: Fix interface**

Change lines 16-22:
```ts
interface InternalWorkspaceSplit extends WorkspaceSplit {
    containerEl: HTMLElement;
    getRoot: () => any;
    getContainer: () => any;
    children: any[];
    replaceChild: (index: number, child: any) => void;
}
```
to:
```ts
interface InternalWorkspaceSplit extends WorkspaceSplit {
    containerEl: HTMLElement;
    getRoot: () => InternalWorkspaceSplit;
    getContainer: () => { containerEl: HTMLElement };
    children: (WorkspaceLeaf | WorkspaceSplit)[];
    replaceChild: (index: number, child: WorkspaceLeaf | WorkspaceSplit) => void;
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

---

### Task 7: Fix `src/types.ts` dailyNoteIndex

**Files:**
- Modify: `src/types.ts:285`

- [ ] **Step 1: Add import and fix type**

Add import at the top of the file:
```ts
import { DailyNoteIndex } from './utils/dailyNoteSettingsBridge';
```

Change line 285:
```ts
dailyNoteIndex?: any;
```
to:
```ts
dailyNoteIndex?: DailyNoteIndex;
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

---

### Task 8: Fix `SyncSettingsBuilder.ts` (12 warnings)

**Files:**
- Modify: `src/settings/builders/SyncSettingsBuilder.ts`

The `syncConfig` parameter throughout this file is the `SyncConfiguration` type from `src/settings/types.ts` (the plugin settings version, not the sync-layer version).

- [ ] **Step 1: Add import**

At the top of the file, ensure this import exists:
```ts
import { SyncConfiguration } from '../types';
```

- [ ] **Step 2: Fix `renderTasklistCards` (line 209)**

Change:
```ts
private renderTasklistCards(container: HTMLElement, syncConfig: any): void {
```
to:
```ts
private renderTasklistCards(container: HTMLElement, syncConfig: SyncConfiguration): void {
```

- [ ] **Step 3: Fix `syncConfig.api = {} as any` casts (lines 277, 295)**

These lines do `syncConfig.api = {} as any`. Change to:
```ts
syncConfig.api = {} as NonNullable<SyncConfiguration['api']>;
```

- [ ] **Step 4: Fix `renderFeishuSettings` (line 332)**

Change:
```ts
private renderFeishuSettings(group: SettingGroup | HTMLElement, syncConfig: any): void {
```
to:
```ts
private renderFeishuSettings(group: SettingGroup | HTMLElement, syncConfig: SyncConfiguration): void {
```

- [ ] **Step 5: Fix `initiateFeishuOAuth` (line 537)**

Change:
```ts
private initiateFeishuOAuth(_syncConfig: any): void {
```
to:
```ts
private initiateFeishuOAuth(_syncConfig: SyncConfiguration): void {
```

- [ ] **Step 6: Fix `exchangeFeishuAuthCode` (line 557)**

Change:
```ts
private async exchangeFeishuAuthCode(_syncConfig: any, code: string): Promise<void> {
```
to:
```ts
private async exchangeFeishuAuthCode(_syncConfig: SyncConfiguration, code: string): Promise<void> {
```

- [ ] **Step 7: Fix `updateData` (line 585)**

Change:
```ts
const updateData: any = {
```
to:
```ts
const updateData: Record<string, unknown> = {
```

- [ ] **Step 8: Fix `refreshFeishuToken` (line 621)**

Change:
```ts
private async refreshFeishuToken(_syncConfig: any): Promise<void> {
```
to:
```ts
private async refreshFeishuToken(_syncConfig: SyncConfiguration): Promise<void> {
```

- [ ] **Step 9: Fix `testFeishuConnection` (line 689)**

Change:
```ts
private async testFeishuConnection(syncConfig: any): Promise<void> {
```
to:
```ts
private async testFeishuConnection(syncConfig: SyncConfiguration): Promise<void> {
```

- [ ] **Step 10: Fix `dateInputEl` cast (line 843)**

Change:
```ts
const dateInputEl = dateSetting.components[0] as any;
```
to:
```ts
const dateInputEl = dateSetting.components[0] as TextComponent;
```

Ensure `TextComponent` is imported from `obsidian`.

- [ ] **Step 11: Fix `getSyncConfiguration` return type (line 951)**

Change:
```ts
private getSyncConfiguration(): any {
```
to:
```ts
private getSyncConfiguration(): SyncConfiguration {
```

- [ ] **Step 12: Fix `updateSyncConfig` (line 968)**

Change:
```ts
private updateSyncConfig(updates: any): void {
```
to:
```ts
private updateSyncConfig(updates: Partial<SyncConfiguration>): void {
```

- [ ] **Step 13: Fix `payload` (line 1214)**

Change:
```ts
const payload: any = {
```
to:
```ts
const payload: Record<string, unknown> = {
```

- [ ] **Step 14: Verify all changes**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errors, 0 warnings

---

### Task 9: Final Verification

- [ ] **Step 1: Run full lint**

Run: `npm run lint`
Expected: 0 problems (0 errors, 0 warnings)

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds
