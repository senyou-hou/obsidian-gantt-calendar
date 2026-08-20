import { type JSX } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useCalendarStore } from './store/calendarStore';
import { ToolbarBar } from './components/Toolbar';
import { TooltipProvider } from './components/TooltipProvider';
import { ModalProvider } from './components/ModalProvider';
import { YearView } from './views/YearView';
import { MonthView } from './views/MonthView';
import { WeekView } from './views/WeekView';
import { DayView } from './views/DayView';
import { TaskView } from './views/TaskView';
import { GanttView } from './views/GanttView';
import type { CalendarViewType } from '../types';
import { MOTION, easeOutTransition } from './motion';

function renderView(viewType: CalendarViewType): JSX.Element {
	switch (viewType) {
		case 'year':
			return <YearView />;
		case 'month':
			return <MonthView />;
		case 'week':
			return <WeekView />;
		case 'day':
			return <DayView />;
		case 'task':
			return <TaskView />;
		case 'gantt':
			return <GanttView />;
	}
}

/**
 * React 应用根组件
 * 结构：.gantt-calendar-app > (.calendar-toolbar + .calendar-content)
 */
export function App(): JSX.Element {
	const viewType = useCalendarStore((s) => s.viewType);
	const settingsVersion = useCalendarStore((s) => s.settingsVersion);

	const isGantt = viewType === 'gantt';
	const isWaterfall = viewType === 'day' || viewType === 'week' || viewType === 'task' || viewType === 'year';

	return (
		<ModalProvider>
			<TooltipProvider>
				<div
					className={`gantt-calendar-app${isGantt ? ' gantt-root' : ''}`}
					style={{ overflow: isWaterfall ? 'auto' : undefined, height: '100%' }}
				>
					<ToolbarBar />
					<AnimatePresence mode="wait" initial={false}>
						{!isGantt ? (
							<motion.div
								key={`${viewType}-${settingsVersion}`}
								className={`calendar-content${isGantt ? ' gantt-mode' : ''}`}
								style={{ overflow: isWaterfall ? 'visible' : undefined }}
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={easeOutTransition(MOTION.dur.normal)}
							>
								{renderView(viewType)}
							</motion.div>
						) : (
							<div
								key={`gantt-${settingsVersion}`}
								className="calendar-content gantt-mode"
							>
								<GanttView />
							</div>
						)}
					</AnimatePresence>
				</div>
			</TooltipProvider>
		</ModalProvider>
	);
}