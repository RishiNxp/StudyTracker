/* Subjects-based task manager (modular, event-delegated) */
(function() {
    "use strict";

    const STORAGE_KEYS = {
        tasks: "taskManagerTasks",
        subjects: "taskManagerSubjects",
        subjectColors: "taskManagerSubjectColors",
        theme: "taskManagerTheme"
    };

    function safelyParseJson(text, fallback) {
        try { return JSON.parse(text); } catch { return fallback; }
    }

    function escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    function formatLongDate(date) {
        const options = { weekday: "short", year: "numeric", month: "short", day: "numeric" };
        return date.toLocaleDateString("en-US", options);
    }

    function formatLocalISO(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function parseLocalYMD(ymd) {
        if (!ymd || typeof ymd !== 'string') return new Date(NaN);
        const parts = ymd.split('-');
        const y = Number(parts[0]);
        const m = Number(parts[1]);
        const d = Number(parts[2]);
        return new Date(y, (m || 1) - 1, d || 1);
    }

    const Theme = {
        get() {
            const saved = localStorage.getItem(STORAGE_KEYS.theme);
            if (saved) return saved;
            return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        },
        set(theme) { localStorage.setItem(STORAGE_KEYS.theme, theme); },
        apply(theme) {
            document.documentElement.setAttribute("data-theme", theme);
            const icon = document.getElementById("themeIcon");
            if (icon) icon.className = theme === "dark" ? "fas fa-sun" : "fas fa-moon";
        },
        toggle() {
            const next = Theme.get() === "light" ? "dark" : "light";
            Theme.set(next);
            Theme.apply(next);
            Notifications.show(`Switched to ${next === "dark" ? "Dark" : "Light"} mode`, "info");
        }
    };

    const Notifications = {
        container: null,
        ensure() {
            if (!this.container) {
                this.container = document.getElementById("notifications");
                if (!this.container) {
                    this.container = document.createElement("div");
                    this.container.id = "notifications";
                    this.container.className = "notifications";
                    this.container.setAttribute("aria-live", "polite");
                    this.container.setAttribute("aria-atomic", "true");
                    document.body.appendChild(this.container);
                }
            }
            return this.container;
        },
        show(message, type = "info") {
            const c = this.ensure();
            const el = document.createElement("div");
            el.className = `notification notification-${type}`;
            el.style.pointerEvents = "auto";
            el.style.padding = "12px 14px";
            el.style.borderRadius = "8px";
            el.style.color = "#fff";
            el.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
            el.style.background = type === "success" ? "#22c55e" : type === "error" ? "#ef4444" : "#3b82f6";
            el.innerHTML = `<div class="notification-content"><i class="fas ${type === "success" ? "fa-check-circle" : type === "error" ? "fa-exclamation-circle" : "fa-info-circle"}"></i> <span>${message}</span></div>`;
            el.style.transform = "translateY(-10px)";
            el.style.opacity = "0";
            el.style.transition = "transform .2s ease, opacity .2s ease";
            c.appendChild(el);
            requestAnimationFrame(() => { el.style.transform = "translateY(0)"; el.style.opacity = "1"; });
            setTimeout(() => { el.style.transform = "translateY(-10px)"; el.style.opacity = "0"; setTimeout(() => el.remove(), 200); }, 2500);
        }
    };

    const Storage = {
        loadTasks() { return safelyParseJson(localStorage.getItem(STORAGE_KEYS.tasks), []); },
        saveTasks(tasks) { localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks)); },
        loadSubjects() { const s = safelyParseJson(localStorage.getItem(STORAGE_KEYS.subjects), []); return Array.isArray(s) ? s : []; },
        saveSubjects(subjects) { localStorage.setItem(STORAGE_KEYS.subjects, JSON.stringify(subjects)); },
        loadSubjectColors() { const m = safelyParseJson(localStorage.getItem(STORAGE_KEYS.subjectColors), {}); return m && typeof m === 'object' ? m : {}; },
        saveSubjectColors(map) { localStorage.setItem(STORAGE_KEYS.subjectColors, JSON.stringify(map)); }
    };

    const UI = {
        renderSubjects(subjects, tasks, subjectColors) {
            const container = document.getElementById("subjectsContainer");
            const empty = document.getElementById("subjectsEmpty");
            if (!container) return;
            if (!subjects.length) {
                container.innerHTML = "";
                if (empty && !container.contains(empty)) container.appendChild(empty);
                if (empty) empty.style.display = "block";
                return;
            }
            if (empty) empty.style.display = "none";
            container.innerHTML = subjects.map(subject => {
                const subjectTasks = tasks.filter(t => t.subject === subject && !t.completed);
                const tasksHtml = subjectTasks.map(UI.taskHtml).join("");
                const color = subjectColors && subjectColors[subject] ? subjectColors[subject] : '';
                return `
                <div class="subject-card" data-subject="${escapeHtml(subject)}" style="${color ? `--subject-accent: ${escapeHtml(color)};` : ''}">
                    <div class="subject-header">
                        <div class="subject-title"><i class="fas fa-folder" aria-hidden="true"></i>${escapeHtml(subject)}</div>
                        <div class="subject-actions">
                            <input type="color" class="subject-color-input" value="${escapeHtml(color || '#667eea')}" data-action="set-subject-color" data-subject="${escapeHtml(subject)}" aria-label="Subject color" title="Subject color" />
                            <button class="subject-delete-btn" data-action="delete-subject" data-subject="${escapeHtml(subject)}">Delete</button>
                        </div>
                    </div>
                    <div class="task-list">${tasksHtml || `<div class=\"empty-state\"><p>No tasks yet.</p></div>`}</div>
                </div>`;
            }).join("");
        },
        taskHtml(task) {
            const dueDate = parseLocalYMD(task.dueDate);
            const today = new Date(); today.setHours(0,0,0,0);
            const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
            let cls = ""; let txt = formatLongDate(dueDate);
            if (dueDate < today) { cls = "overdue"; txt = `Overdue - ${txt}`; }
            else if (dueDate.toDateString() === today.toDateString()) { cls = "due-soon"; txt = `Due Today - ${txt}`; }
            else if (dueDate.toDateString() === tomorrow.toDateString()) { cls = "due-soon"; txt = `Due Tomorrow - ${txt}`; }
            const priority = (task.priority || 'medium').toLowerCase();
            const priorityLabel = priority.charAt(0).toUpperCase() + priority.slice(1);
            return `
            <div class="task-item ${cls}" data-task-id="${task.id}">
                <div class="task-header">
                    <div class="task-name">${escapeHtml(task.name)}
                        <span class="task-priority priority-${escapeHtml(priority)}">${escapeHtml(priorityLabel)}</span>
                    </div>
                </div>
                <div class="task-due-date"><i class="fas fa-calendar-alt" aria-hidden="true"></i>${txt}</div>
                <div class="task-actions">
                    <button class="complete-btn" data-action="complete" data-task-id="${task.id}"><i class="fas fa-check" aria-hidden="true"></i>Complete</button>
                    <button class="delete-btn" data-action="delete" data-task-id="${task.id}"><i class="fas fa-trash" aria-hidden="true"></i>Delete</button>
                </div>
            </div>`;
        },
        refreshSelect(subjects) {
            const select = document.getElementById("taskSubjectSelect");
            if (!select) return;
            const current = select.value;
            select.innerHTML = `<option value="">Select subject</option>` + subjects.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
            if (subjects.includes(current)) select.value = current;
        }
    };

    const App = {
        tasks: [],
        subjects: [],
        subjectColors: {},
        init() {
            Theme.apply(Theme.get());
            const themeToggle = document.getElementById("themeToggle");
            if (themeToggle) themeToggle.addEventListener("click", Theme.toggle);

            this.tasks = Storage.loadTasks();
            if (!Array.isArray(this.tasks)) this.tasks = [];
            this.subjects = Storage.loadSubjects();
            if (!this.subjects.length && this.tasks.length) {
                const set = new Set(this.tasks.map(t => t.subject).filter(Boolean));
                this.subjects = Array.from(set);
                Storage.saveSubjects(this.subjects);
            }
            // Ensure tasks have priority
            let mutated = false;
            this.tasks = this.tasks.map(t => {
                if (!t.priority) { mutated = true; return { ...t, priority: 'medium' }; }
                return t;
            });
            if (mutated) Storage.saveTasks(this.tasks);

            // Load subject colors and assign defaults
            this.subjectColors = Storage.loadSubjectColors();
            let colorsMutated = false;
            this.subjects.forEach(sub => { if (!this.subjectColors[sub]) { this.subjectColors[sub] = App.generateColorFor(sub); colorsMutated = true; } });
            if (colorsMutated) Storage.saveSubjectColors(this.subjectColors);

            const due = document.getElementById("taskDueDate");
            if (due) due.value = formatLocalISO(new Date());
            UI.refreshSelect(this.subjects);

            UI.renderSubjects(this.subjects, this.tasks, this.subjectColors);

            const form = document.getElementById("taskForm");
            if (form) form.addEventListener("submit", this.onSubmit.bind(this));
            const addSubjectBtn = document.getElementById("addSubjectBtn");
            if (addSubjectBtn) addSubjectBtn.addEventListener("click", this.onAddSubject.bind(this));
            const toggleFormBtn = document.getElementById("toggleTaskFormBtn");
            const formSection = document.getElementById("taskFormSection");
            if (toggleFormBtn && formSection) {
                toggleFormBtn.addEventListener("click", () => {
                    const isHidden = formSection.hasAttribute('hidden');
                    if (isHidden) {
                        formSection.removeAttribute('hidden');
                        formSection.classList.remove('collapsed');
                    } else {
                        formSection.setAttribute('hidden', '');
                        formSection.classList.add('collapsed');
                    }
                    toggleFormBtn.setAttribute('aria-expanded', String(isHidden));
                });
            }

            document.addEventListener("click", (e) => {
                const target = e.target;
                if (!(target instanceof Element)) return;
                const btn = target.closest("[data-action]");
                if (!btn) return;
                const action = btn.getAttribute("data-action");
                if (action === "complete" || action === "delete") {
                    const id = btn.getAttribute("data-task-id");
                    if (!id) return;
                    if (action === "complete") this.completeTask(id);
                    else this.deleteTask(id);
                }
                if (action === "delete-subject") {
                    const subj = btn.getAttribute("data-subject");
                    if (subj) this.deleteSubject(subj);
                }
            });

            // Subject color picker changes: update in place without re-render
            document.addEventListener("input", (e) => {
                const target = e.target;
                if (!(target instanceof Element)) return;
                if (target.classList.contains('subject-color-input')) {
                    const subj = target.getAttribute('data-subject');
                    const color = target.value;
                    if (!subj || !color) return;
                    this.subjectColors[subj] = color;
                    Storage.saveSubjectColors(this.subjectColors);
                    const card = target.closest('.subject-card');
                    if (card) card.style.setProperty('--subject-accent', color);
                }
            });
        },
        onSubmit(e) {
            e.preventDefault();
            const nameEl = document.getElementById("taskName");
            const subjectEl = document.getElementById("taskSubjectSelect");
            const dateEl = document.getElementById("taskDueDate");
            const name = nameEl.value.trim();
            const subject = subjectEl.value.trim();
            const dueDate = dateEl.value;
            const priorityEl = document.getElementById("taskPriority");
            const priority = (priorityEl && priorityEl.value) ? priorityEl.value : 'medium';
            if (!name || !subject || !dueDate || !priority) {
                Notifications.show("Please fill in all fields", "error");
                if (!name) nameEl.focus();
                else if (!subject) subjectEl.focus();
                else if (!dueDate) dateEl.focus();
                return;
            }
            const task = { id: Date.now().toString(), name, subject, dueDate, priority, completed: false, createdAt: new Date().toISOString() };
            this.tasks.push(task);
            Storage.saveTasks(this.tasks);
            UI.renderSubjects(this.subjects, this.tasks, this.subjectColors);
            e.target.reset();
            dateEl.value = formatLocalISO(new Date());
            nameEl.focus();
            Notifications.show("Task added successfully!", "success");
        },
        onAddSubject() {
            const input = prompt("Enter subject name");
            if (!input) return;
            const name = input.trim();
            if (!name) return;
            if (this.subjects.includes(name)) { Notifications.show("Subject already exists", "error"); return; }
            this.subjects.push(name);
            this.subjects.sort((a,b)=>a.localeCompare(b));
            Storage.saveSubjects(this.subjects);
            // Assign default color for new subject
            this.subjectColors[name] = App.generateColorFor(name);
            Storage.saveSubjectColors(this.subjectColors);
            UI.refreshSelect(this.subjects);
            UI.renderSubjects(this.subjects, this.tasks, this.subjectColors);
            Notifications.show("Subject added", "success");
        },
        deleteSubject(subject) {
            if (!confirm(`Delete subject "${subject}" and all its tasks?`)) return;
            this.subjects = this.subjects.filter(s => s !== subject);
            this.tasks = this.tasks.filter(t => t.subject !== subject);
            Storage.saveSubjects(this.subjects);
            Storage.saveTasks(this.tasks);
            if (this.subjectColors[subject]) { delete this.subjectColors[subject]; Storage.saveSubjectColors(this.subjectColors); }
            UI.refreshSelect(this.subjects);
            UI.renderSubjects(this.subjects, this.tasks, this.subjectColors);
            Notifications.show("Subject deleted", "info");
        },
        completeTask(id) {
            const el = document.querySelector(`[data-task-id="${id}"]`);
            if (el) { el.classList.add("completion-animation"); setTimeout(() => { if (el.parentNode) el.remove(); }, 100); }
            const idx = this.tasks.findIndex(t => t.id === id);
            if (idx > -1) {
                this.tasks[idx].completed = true;
                Storage.saveTasks(this.tasks);
                setTimeout(() => UI.renderSubjects(this.subjects, this.tasks, this.subjectColors), 150);
                Notifications.show("Task completed!", "success");
            }
        },
        deleteTask(id) {
            const el = document.querySelector(`[data-task-id="${id}"]`);
            if (el) { el.style.transition = "all .2s ease"; el.style.opacity = "0"; el.style.transform = "scale(0.95)"; setTimeout(() => { if (el.parentNode) el.remove(); }, 200); }
            const before = this.tasks.length;
            this.tasks = this.tasks.filter(t => t.id !== id);
            if (this.tasks.length < before) {
                Storage.saveTasks(this.tasks);
                setTimeout(() => UI.renderSubjects(this.subjects, this.tasks, this.subjectColors), 180);
                Notifications.show("Task deleted", "info");
            } else {
                Notifications.show("Error: Task not found", "error");
            }
        },
        generateColorFor(seed) {
            // Deterministic pastel hex from string
            let h = 0; for (let i = 0; i < seed.length; i++) { h = (h << 5) - h + seed.charCodeAt(i); h |= 0; }
            const hue = Math.abs(h) % 360, sat = 65, light = 60;
            function hslToHex(H, S, L){ S/=100; L/=100; const C=(1-Math.abs(2*L-1))*S; const X=C*(1-Math.abs((H/60)%2-1)); const m=L-C/2; let r=0,g=0,b=0; if(0<=H&&H<60){r=C;g=X;b=0;} else if(60<=H&&H<120){r=X;g=C;b=0;} else if(120<=H&&H<180){r=0;g=C;b=X;} else if(180<=H&&H<240){r=0;g=X;b=C;} else if(240<=H&&H<300){r=X;g=0;b=C;} else {r=C;g=0;b=X;} const toHex=v=>(Math.round((v+m)*255).toString(16).padStart(2,'0')); return `#${toHex(r)}${toHex(g)}${toHex(b)}`; }
            return hslToHex(hue, sat, light);
        }
    };

    document.addEventListener("DOMContentLoaded", () => {
        App.init();
        window.taskManager = App;
    });
})();


