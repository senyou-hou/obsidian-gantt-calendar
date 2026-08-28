/**
 * 周期任务规则工具（纯函数）
 *
 * 从 BaseTaskModal 抽取，供 React 版任务表单使用。
 */

export interface RepeatConfig {
	frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | '';
	interval: number;
	days?: number[]; // 每周模式：选中的星期（0=周日, 1=周一, ..., 6=周六）
	monthDay?: number | string; // 每月模式：几号（1-31）或 'last'
	whenDone: boolean;
}

/**
 * 解析 repeat 字符串为配置对象
 */
export function parseRepeatToConfig(rule: string): RepeatConfig | null {
	const lower = rule.toLowerCase().trim();

	// 解析 when done
	const whenDone = lower.includes('when done');
	const baseRule = lower.replace(/\s*when\s+done\s*$/, '').trim();

	// 星期名称映射
	const dayNameToIndex: Record<string, number> = {
		sunday: 0,
		monday: 1,
		tuesday: 2,
		wednesday: 3,
		thursday: 4,
		friday: 5,
		saturday: 6,
	};

	// 解析 daily
	const dailyMatch = baseRule.match(/^every\s+(\d+)\s*(days|day)$/);
	if (dailyMatch) {
		return { frequency: 'daily', interval: parseInt(dailyMatch[1]), whenDone };
	}
	if (baseRule === 'every day' || baseRule === 'every weekday' || baseRule === 'every weekend') {
		return { frequency: 'daily', interval: 1, whenDone };
	}

	// 解析 weekly（带星期）
	const weeklyWithDaysMatch = baseRule.match(/^every\s+(\d+)\s*weeks?\s+on\s+(.+)$/);
	if (weeklyWithDaysMatch) {
		const interval = parseInt(weeklyWithDaysMatch[1]);
		const daysPart = weeklyWithDaysMatch[2].trim();
		const dayNames = daysPart.split(',').map(d => d.trim().toLowerCase());
		const days = dayNames.map(name => dayNameToIndex[name]).filter(d => d !== undefined);
		if (days.length > 0) {
			return { frequency: 'weekly', interval, days, whenDone };
		}
	}

	const weeklyWithDaysMatchSimple = baseRule.match(/^every\s+week\s+on\s+(.+)$/);
	if (weeklyWithDaysMatchSimple) {
		const daysPart = weeklyWithDaysMatchSimple[1].trim();
		const dayNames = daysPart.split(',').map(d => d.trim().toLowerCase());
		const days = dayNames.map(name => dayNameToIndex[name]).filter(d => d !== undefined);
		if (days.length > 0) {
			return { frequency: 'weekly', interval: 1, days, whenDone };
		}
	}

	// 解析 weekly（不带星期）
	const weeklyMatch = baseRule.match(/^every\s+(\d+)\s*(weeks|week)$/);
	if (weeklyMatch) {
		return { frequency: 'weekly', interval: parseInt(weeklyMatch[1]), whenDone };
	}
	if (baseRule === 'every week') {
		return { frequency: 'weekly', interval: 1, whenDone };
	}

	// 解析 monthly（带日期）
	const monthlyWithDayMatch = baseRule.match(/^every\s+(\d+)\s*months?\s+on\s+the\s+(\d+)(?:st|nd|rd|th)?$/);
	if (monthlyWithDayMatch) {
		const interval = parseInt(monthlyWithDayMatch[1]);
		const monthDay = parseInt(monthlyWithDayMatch[2]);
		return { frequency: 'monthly', interval, monthDay, whenDone };
	}

	const monthlyWithDayMatchSimple = baseRule.match(/^every\s+month\s+on\s+the\s+(\d+)(?:st|nd|rd|th)?$/);
	if (monthlyWithDayMatchSimple) {
		const monthDay = parseInt(monthlyWithDayMatchSimple[1]);
		return { frequency: 'monthly', interval: 1, monthDay, whenDone };
	}

	// 解析 monthly（带 last）
	const monthlyWithLastMatch = baseRule.match(/^every\s+(\d+)\s*months?\s+on\s+the\s+last$/);
	if (monthlyWithLastMatch) {
		return { frequency: 'monthly', interval: parseInt(monthlyWithLastMatch[1]), monthDay: 'last', whenDone };
	}

	const monthlyWithLastMatchSimple = baseRule.match(/^every\s+month\s+on\s+the\s+last$/);
	if (monthlyWithLastMatchSimple) {
		return { frequency: 'monthly', interval: 1, monthDay: 'last', whenDone };
	}

	// 解析 monthly（不带日期）
	const monthlyMatch = baseRule.match(/^every\s+(\d+)\s*(months|month)$/);
	if (monthlyMatch) {
		return { frequency: 'monthly', interval: parseInt(monthlyMatch[1]), whenDone };
	}
	if (baseRule === 'every month') {
		return { frequency: 'monthly', interval: 1, whenDone };
	}

	// 解析 yearly
	const yearlyMatch = baseRule.match(/^every\s+(\d+)\s*(years|year)$/);
	if (yearlyMatch) {
		return { frequency: 'yearly', interval: parseInt(yearlyMatch[1]), whenDone };
	}
	if (baseRule === 'every year') {
		return { frequency: 'yearly', interval: 1, whenDone };
	}

	return null;
}

/**
 * 构建规则字符串
 */
export function buildRepeatRule(config: RepeatConfig): string {
	const { frequency, interval, days, monthDay, whenDone } = config;

	let rule = '';

	// 英文星期名称
	const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	// 英文序数词
	const ordinal = (n: number): string => {
		const s = ['th', 'st', 'nd', 'rd'];
		const v = n % 100;
		return n + (s[(v - 20) % 10] || s[v] || s[0]);
	};

	switch (frequency) {
		case 'daily':
			rule = interval === 1 ? 'every day' : `every ${interval} days`;
			break;
		case 'weekly':
			if (days && days.length > 0) {
				// 有选择具体星期
				const selectedDayNames = days
					.map(d => dayNames[d])
					.sort((a, b) => dayNames.indexOf(a) - dayNames.indexOf(b));
				rule = interval === 1
					? `every week on ${selectedDayNames.join(', ')}`
					: `every ${interval} weeks on ${selectedDayNames.join(', ')}`;
			} else {
				// 没有选择具体星期，使用默认的 every week
				rule = interval === 1 ? 'every week' : `every ${interval} weeks`;
			}
			break;
		case 'monthly':
			if (monthDay !== undefined) {
				if (monthDay === 'last') {
					rule = interval === 1 ? 'every month on the last' : `every ${interval} months on the last`;
				} else {
					rule = interval === 1
						? `every month on the ${ordinal(monthDay as number)}`
						: `every ${interval} months on the ${ordinal(monthDay as number)}`;
				}
			} else {
				// 没有选择具体日期，使用默认的 every month
				rule = interval === 1 ? 'every month' : `every ${interval} months`;
			}
			break;
		case 'yearly':
			rule = interval === 1 ? 'every year' : `every ${interval} years`;
			break;
	}

	if (whenDone && rule) {
		rule += ' when done';
	}

	return rule;
}

/**
 * 验证周期规则
 */
export function validateRepeatRule(rule: string): boolean {
	if (!rule) return true;
	const trimmed = rule.trim().toLowerCase();
	if (!trimmed.startsWith('every ')) return false;

	// 检查基本结构
	const validEndings = [
		// daily patterns
		/^every\s+day\s*(when\s+done)?$/,
		/^every\s+weekday\s*(when\s+done)?$/,
		/^every\s+weekend\s*(when\s+done)?$/,
		/^every\s+\d+\s+days?\s*(when\s+done)?$/,
		// weekly patterns
		/^every\s+week\s*(when\s+done)?$/,
		/^every\s+\d+\s+weeks?\s*(when\s+done)?$/,
		/^every\s+week\s+on\s+.+\s*(when\s+done)?$/,
		/^every\s+\d+\s+weeks?\s+on\s+.+\s*(when\s+done)?$/,
		// monthly patterns
		/^every\s+month\s*(when\s+done)?$/,
		/^every\s+\d+\s+months?\s*(when\s+done)?$/,
		/^every\s+month\s+on\s+.+\s*(when\s+done)?$/,
		/^every\s+\d+\s+months?\s+on\s+.+\s*(when\s+done)?$/,
		// yearly patterns
		/^every\s+year\s*(when\s+done)?$/,
		/^every\s+\d+\s+years?\s*(when\s+done)?$/,
		/^every\s+\w+\s+on\s+.+\s*(when\s+done)?$/, // every January on the 15th
	];

	for (const pattern of validEndings) {
		if (pattern.test(trimmed)) return true;
	}

	return false;
}