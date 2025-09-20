/* Calendar month view rendering from stored tasks */
(function() {
    "use strict";

    const STORAGE_KEYS = {
        tasks: "taskManagerTasks",
        theme: "taskManagerTheme",
        subjectColors: "taskManagerSubjectColors"
    };

    function safelyParseJson(text, fallback) { try { return JSON.parse(text); } catch { return fallback; } }

    const Theme = {
        get() {
            const saved = localStorage.getItem(STORAGE_KEYS.theme);
            if (saved) return saved;
            return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        },
        apply(theme) {
            document.documentElement.setAttribute("data-theme", theme);
            const icon = document.getElementById("themeIcon");
            if (icon) icon.className = theme === "dark" ? "fas fa-sun" : "fas fa-moon";
        },
        toggle() {
            const current = Theme.get();
            const next = current === "light" ? "dark" : "light";
            localStorage.setItem(STORAGE_KEYS.theme, next);
            Theme.apply(next);
        }
    };

    function formatMonthTitle(year, monthIndex) {
        const d = new Date(year, monthIndex, 1);
        return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    function getDaysInMonth(year, monthIndex) {
        return new Date(year, monthIndex + 1, 0).getDate();
    }

    function getWeekdayIndex(year, monthIndex, day) {
        // Return 0..6 (Sun..Sat)
        return new Date(year, monthIndex, day).getDay();
    }

    function loadTasks() {
        const raw = localStorage.getItem(STORAGE_KEYS.tasks);
        const tasks = safelyParseJson(raw, []);
        const list = Array.isArray(tasks) ? tasks : [];
        return list.filter(t => !t.completed);
    }

    function loadSubjectColors() {
        const raw = localStorage.getItem(STORAGE_KEYS.subjectColors);
        const colors = safelyParseJson(raw, {});
        return colors && typeof colors === 'object' ? colors : {};
    }

    function groupTasksByDate(tasks) {
        const map = new Map();
        for (const t of tasks) {
            if (!t.dueDate) continue;
            const key = t.dueDate; // yyyy-mm-dd
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(t);
        }
        return map;
    }

    function formatLocalISO(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function renderMonth(gridEl, titleEl, year, monthIndex, tasks, subjectColors) {
        titleEl.textContent = formatMonthTitle(year, monthIndex);
        gridEl.innerHTML = '';

        // Weekday headers
        const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        for (const name of weekdays) {
            const w = document.createElement('div');
            w.className = 'cal-weekday';
            w.textContent = name;
            gridEl.appendChild(w);
        }

        const daysInMonth = getDaysInMonth(year, monthIndex);
        const firstWeekday = getWeekdayIndex(year, monthIndex, 1);
        const tasksByDate = groupTasksByDate(tasks);

        // Leading blanks
        for (let i = 0; i < firstWeekday; i++) {
            const blank = document.createElement('div');
            blank.className = 'cal-cell cal-blank';
            gridEl.appendChild(blank);
        }

        const todayStr = formatLocalISO(new Date());
        for (let day = 1; day <= daysInMonth; day++) {
            const d = new Date(year, monthIndex, day);
            const iso = formatLocalISO(d);

            const cell = document.createElement('div');
            cell.className = 'cal-cell';
            if (iso === todayStr) cell.classList.add('cal-today');

            const header = document.createElement('div');
            header.className = 'cal-cell-header';
            header.textContent = String(day);
            cell.appendChild(header);

            const list = document.createElement('div');
            list.className = 'cal-cell-tasks';

            const items = tasksByDate.get(iso) || [];
            items.sort((a,b) => {
                const pri = { high: 0, medium: 1, low: 2 };
                return (pri[a.priority||'medium'] - (pri[b.priority||'medium']));
            });
            for (const t of items) {
                const chip = document.createElement('div');
                chip.className = `cal-task-chip priority-${(t.priority||'medium').toLowerCase()}`;
                const color = subjectColors[t.subject];
                if (color) chip.style.borderLeftColor = color;
                chip.title = `${t.subject} • ${t.name}`;
                chip.innerHTML = `<span class="cal-chip-subject" style="${color ? `color:${color}` : ''}">${t.subject || ''}</span> <span class="cal-chip-name">${t.name}</span>`;
                list.appendChild(chip);
            }
            cell.appendChild(list);

            // Click to open modal with tasks for this day
            cell.addEventListener('click', () => openDayModal(iso, tasksByDate.get(iso) || [], subjectColors));
            gridEl.appendChild(cell);
        }
    }

    function openDayModal(isoDate, items, subjectColors) {
        const overlay = document.getElementById('dayModal');
        const title = document.getElementById('dayModalTitle');
        const list = document.getElementById('dayTasksList');
        const closeBtn = document.getElementById('closeDayModal');
        if (!overlay || !title || !list) return;
        const d = new Date(isoDate);
        title.textContent = d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        list.innerHTML = '';
        const sorted = [...items].sort((a,b) => {
            const pri = { high: 0, medium: 1, low: 2 };
            return (pri[a.priority||'medium'] - (pri[b.priority||'medium']));
        });
        if (sorted.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.innerHTML = '<p>No tasks for this day.</p>';
            list.appendChild(empty);
        } else {
            for (const t of sorted) {
                const row = document.createElement('div');
                row.className = 'day-task-item';
                const color = subjectColors[t.subject];
                if (color) row.style.borderLeftColor = color;
                row.innerHTML = `
                    <span class="day-task-subject" style="${color ? `color:${color}` : ''}">${t.subject || ''}</span>
                    <span class="day-task-name">${t.name}</span>
                    <span class="day-task-priority priority-${(t.priority||'medium').toLowerCase()}">${(t.priority||'medium').toUpperCase()}</span>
                `;
                list.appendChild(row);
            }
        }
        overlay.removeAttribute('hidden');
        function onClose() { overlay.setAttribute('hidden', ''); document.removeEventListener('keydown', onKey); }
        function onKey(e) { if (e.key === 'Escape') onClose(); }
        if (closeBtn) closeBtn.onclick = onClose;
        overlay.onclick = (e) => { if (e.target === overlay) onClose(); };
        document.addEventListener('keydown', onKey);
    }

    document.addEventListener('DOMContentLoaded', () => {
        // Theme init
        Theme.apply(Theme.get());
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) themeToggle.addEventListener('click', Theme.toggle);

        const titleEl = document.querySelector('.calendar-title');
        const gridEl = document.getElementById('calendarGrid');
        const prevBtn = document.getElementById('prevMonth');
        const nextBtn = document.getElementById('nextMonth');
        const todayBtn = document.getElementById('goToday');

        let current = new Date();
        let year = current.getFullYear();
        let monthIndex = current.getMonth();

        function refresh() {
            const tasks = loadTasks();
            const subjectColors = loadSubjectColors();
            renderMonth(gridEl, titleEl, year, monthIndex, tasks, subjectColors);
        }

        prevBtn.addEventListener('click', () => { monthIndex--; if (monthIndex < 0) { monthIndex = 11; year--; } refresh(); });
        nextBtn.addEventListener('click', () => { monthIndex++; if (monthIndex > 11) { monthIndex = 0; year++; } refresh(); });
        todayBtn.addEventListener('click', () => { const now = new Date(); year = now.getFullYear(); monthIndex = now.getMonth(); refresh(); });

        refresh();
    });
})();


