(() => {
    "use strict";

    const STORAGE_KEYS = {
        filesystem: "win98_filesystem_v3",
        settings: "win98_settings_v3"
    };

    const DEFAULT_SETTINGS = {
        wallpaper: "wallpaper-teal",
        timeOffsetMs: 0,
        mouseSpeed: 5,
        keyboardRate: 5,
        keyboardDelay: 5,
        soundScheme: "Windows Default",
        bootCount: 0,
        desktopAutoArrange: false,
        ieHomePage: "about:home"
    };

    const Storage = {
        read(key, fallback) {
            try {
                const raw = localStorage.getItem(key);
                if (!raw) return fallback;
                return JSON.parse(raw);
            } catch (error) {
                return fallback;
            }
        },

        write(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (error) {
                return false;
            }
        }
    };

    const Utils = {
        uid(prefix) {
            Utils._uid = (Utils._uid || 0) + 1;
            return `${prefix}-${Utils._uid}`;
        },
        clamp(value, min, max) {
            return Math.max(min, Math.min(max, value));
        },
        deepClone(value) {
            return JSON.parse(JSON.stringify(value));
        },
        escapeHtml(value) {
            return String(value)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
        },
        formatMessage(text) {
            return Utils.escapeHtml(text).replace(/\n/g, "<br>");
        },
        formatClock(date) {
            let hours = date.getHours();
            const minutes = String(date.getMinutes()).padStart(2, "0");
            const suffix = hours >= 12 ? "PM" : "AM";
            hours = hours % 12 || 12;
            return `${hours}:${minutes} ${suffix}`;
        },
        formatShortDate(date) {
            return date.toLocaleDateString("en-US", {
                month: "2-digit",
                day: "2-digit",
                year: "numeric"
            });
        },
        formatExplorerDate(date) {
            return date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric"
            });
        },
        formatSize(value) {
            if (value < 1024) return `${value} bytes`;
            return `${(value / 1024).toFixed(1)} KB`;
        },
        normalizeFilename(name) {
            return String(name || "").replace(/[\\/:*?"<>|]/g, "").trim();
        },
        extension(name) {
            const parts = String(name || "").split(".");
            return parts.length > 1 ? parts.pop().toLowerCase() : "";
        },
        isTextName(name) {
            return ["txt", "ini", "log", "md"].includes(Utils.extension(name));
        },
        isImageName(name) {
            return ["bmp", "png", "jpg", "jpeg", "gif"].includes(Utils.extension(name));
        },
        withSignal(controller, callback) {
            return (...args) => {
                if (!controller.signal.aborted) {
                    callback(...args);
                }
            };
        },
        delegate(root, eventName, selector, handler, options = {}) {
            root.addEventListener(
                eventName,
                (event) => {
                    const match = event.target.closest(selector);
                    if (match && root.contains(match)) {
                        handler(event, match);
                    }
                },
                options
            );
        },
        selectionRect(startX, startY, currentX, currentY) {
            const left = Math.min(startX, currentX);
            const top = Math.min(startY, currentY);
            return {
                left,
                top,
                width: Math.abs(currentX - startX),
                height: Math.abs(currentY - startY)
            };
        },
        rectsIntersect(a, b) {
            return (
                a.left < b.left + b.width &&
                a.left + a.width > b.left &&
                a.top < b.top + b.height &&
                a.top + a.height > b.top
            );
        },
        basename(path) {
            const parts = String(path || "").split("\\").filter(Boolean);
            return parts.length ? parts[parts.length - 1] : "";
        },
        parentPath(path) {
            const normalized = String(path || "");
            const lastSlash = normalized.lastIndexOf("\\");
            if (lastSlash <= 2) {
                return normalized.slice(0, 2) ? `${normalized.slice(0, 2)}\\` : normalized;
            }
            return normalized.slice(0, lastSlash);
        },
        escapeSelector(value) {
            if (window.CSS && typeof window.CSS.escape === "function") {
                return window.CSS.escape(value);
            }
            return String(value).replace(/["\\]/g, "\\$&");
        },
        fitsWithinViewport(rect, bounds) {
            return (
                rect.left >= 0 &&
                rect.top >= 0 &&
                rect.left + rect.width <= bounds.width &&
                rect.top + rect.height <= bounds.height
            );
        }
    };

    class StateManager {
        constructor(settings) {
            this.state = {
                settings,
                session: {
                    loggedIn: false,
                    desktopReady: false,
                    activeWindowId: null,
                    clipboardText: "",
                    screensaverActive: false
                }
            };
            this.listeners = new Set();
        }

        get(path) {
            if (!path) {
                return this.state;
            }
            return path.split(".").reduce((acc, segment) => (acc ? acc[segment] : undefined), this.state);
        }

        set(path, value) {
            const parts = path.split(".");
            let target = this.state;
            for (let index = 0; index < parts.length - 1; index += 1) {
                target = target[parts[index]];
            }
            target[parts[parts.length - 1]] = value;
            if (parts[0] === "settings") {
                this.persistSettings();
            }
            this.emit(path, value);
        }

        update(path, updater) {
            this.set(path, updater(this.get(path)));
        }

        subscribe(listener) {
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
        }

        emit(path, value) {
            this.listeners.forEach((listener) => listener(path, value, this.state));
        }

        persistSettings() {
            Storage.write(STORAGE_KEYS.settings, this.state.settings);
        }
    }

    function createDefaultFileSystem() {
        const now = Date.now();
        return {
            type: "root",
            content: {
                "A:": {
                    type: "drive",
                    driveType: "floppy",
                    label: "3 1/2 Floppy (A:)",
                    createdAt: now,
                    content: {
                        "DISK.TXT": {
                            type: "file",
                            createdAt: now,
                            modifiedAt: now,
                            content: "This floppy disk is not formatted.\n"
                        }
                    }
                },
                "C:": {
                    type: "drive",
                    driveType: "disk",
                    label: "Local Disk (C:)",
                    createdAt: now,
                    content: {
                        "WINDOWS": {
                            type: "dir",
                            createdAt: now,
                            content: {
                                "Desktop": {
                                    type: "dir",
                                    createdAt: now,
                                    content: {
                                        "My Computer.lnk": { type: "shortcut", target: "shell:my-computer", createdAt: now, modifiedAt: now, meta: { icon: "computer", x: 16, y: 16, system: true } },
                                        "Recycle Bin.lnk": { type: "shortcut", target: "shell:recycle-bin", createdAt: now, modifiedAt: now, meta: { icon: "recycle", x: 16, y: 104, system: true } },
                                        "Network Neighborhood.lnk": { type: "shortcut", target: "shell:network-neighborhood", createdAt: now, modifiedAt: now, meta: { icon: "network", x: 16, y: 192, system: true } },
                                        "Internet Explorer.lnk": { type: "shortcut", target: "app:internet-explorer", createdAt: now, modifiedAt: now, meta: { icon: "ie", x: 16, y: 280, system: true } },
                                        "My Documents.lnk": { type: "shortcut", target: "app:my-documents", createdAt: now, modifiedAt: now, meta: { icon: "documents", x: 16, y: 368, system: true } },
                                        "Control Panel.lnk": { type: "shortcut", target: "app:control-panel", createdAt: now, modifiedAt: now, meta: { icon: "control", x: 16, y: 456, system: true } },
                                        "MS-DOS Prompt.lnk": { type: "shortcut", target: "app:ms-dos", createdAt: now, modifiedAt: now, meta: { icon: "dos", x: 16, y: 544, system: true } }
                                    }
                                }
                            }
                        },
                        "My Documents": {
                            type: "dir",
                            createdAt: now,
                            content: {
                                "Welcome.txt": {
                                    type: "file",
                                    createdAt: now,
                                    modifiedAt: now,
                                    content: "Welcome to Windows 98.\n\nThis desktop is a front-end illusion built with HTML, CSS and JavaScript.\n"
                                },
                                "Project Notes.txt": {
                                    type: "file",
                                    createdAt: now,
                                    modifiedAt: now,
                                    content: "Features to demo:\n- Explorer\n- Internet Explorer\n- Paint\n- Calculator\n- Minesweeper\n"
                                },
                                "Retro Drawing.bmp": {
                                    type: "image",
                                    createdAt: now,
                                    modifiedAt: now,
                                    content: ""
                                },
                                "Projects": {
                                    type: "dir",
                                    createdAt: now,
                                    content: {
                                        "Roadmap.txt": {
                                            type: "file",
                                            createdAt: now,
                                            modifiedAt: now,
                                            content: "1. Polish the shell.\n2. Stabilize windows.\n3. Ship the demo.\n"
                                        }
                                    }
                                }
                            }
                        },
                        "Program Files": {
                            type: "dir",
                            createdAt: now,
                            content: {
                                "Internet Explorer": { type: "dir", createdAt: now, content: {} },
                                "Accessories": { type: "dir", createdAt: now, content: {} }
                            }
                        },
                        "Recycle Bin": {
                            type: "dir",
                            createdAt: now,
                            meta: { system: true },
                            content: {}
                        }
                    }
                },
                "D:": {
                    type: "drive",
                    driveType: "cd",
                    label: "CD-ROM (D:)",
                    createdAt: now,
                    readOnly: true,
                    content: {
                        "SETUP.TXT": {
                            type: "file",
                            createdAt: now,
                            modifiedAt: now,
                            content: "Windows 98 Second Edition CD\nInsert this disc to install optional components.\n"
                        }
                    }
                }
            }
        };
    }

    class VirtualFileSystem {
        constructor() {
            this.root = this.load();
            this.repair();
        }

        load() {
            const parsed = Storage.read(STORAGE_KEYS.filesystem, null);
            return parsed && parsed.content ? parsed : createDefaultFileSystem();
        }

        save() {
            Storage.write(STORAGE_KEYS.filesystem, this.root);
        }

        repair() {
            if (!this.root || this.root.type !== "root" || !this.root.content) {
                this.root = createDefaultFileSystem();
            }
            const seed = createDefaultFileSystem();
            ["A:", "C:", "D:"].forEach((drive) => {
                if (!this.root.content[drive] || !this.root.content[drive].content) {
                    this.root.content[drive] = Utils.deepClone(seed.content[drive]);
                }
            });
            this.ensureDir("C:\\WINDOWS");
            this.ensureDir("C:\\WINDOWS\\Desktop");
            this.ensureDir("C:\\My Documents");
            this.ensureDir("C:\\Recycle Bin");
            const desktop = this.getNode("C:\\WINDOWS\\Desktop");
            const seedDesktop = seed.content["C:"].content.WINDOWS.content.Desktop.content;
            Object.entries(seedDesktop).forEach(([name, node]) => {
                if (!this.findKey(desktop.content, name)) {
                    desktop.content[name] = Utils.deepClone(node);
                }
            });
            this.walkAndRepair(this.root);
            this.save();
        }

        walkAndRepair(node) {
            if (!node || typeof node !== "object") return;
            if (!node.createdAt) node.createdAt = Date.now();
            if (!node.modifiedAt && node.type !== "dir" && node.type !== "drive" && node.type !== "root") {
                node.modifiedAt = node.createdAt;
            }
            if (node.type === "shortcut") {
                node.meta = Object.assign({}, node.meta || {});
                if (!node.target && node.meta.target) node.target = node.meta.target;
                if (node.target && !node.meta.target) node.meta.target = node.target;
            }
            if (node.content && typeof node.content === "object") {
                Object.values(node.content).forEach((child) => this.walkAndRepair(child));
            }
        }

        normalizePath(path, cwd = "C:\\WINDOWS") {
            if (!path) return cwd;
            const raw = String(path).replace(/\//g, "\\").trim();
            if (/^[a-zA-Z]:$/.test(raw)) {
                return `${raw[0].toUpperCase()}:\\`;
            }
            let drive = cwd.slice(0, 2).toUpperCase();
            let tail = raw;
            if (/^[a-zA-Z]:/.test(raw)) {
                drive = `${raw[0].toUpperCase()}:`;
                tail = raw.slice(2);
            } else if (raw.startsWith("\\")) {
                tail = raw;
            } else {
                const base = cwd.endsWith("\\") ? cwd : `${cwd}\\`;
                tail = `${base.slice(2)}${raw}`;
            }
            const parts = tail.split("\\").filter(Boolean);
            const resolved = [];
            parts.forEach((part) => {
                if (part === ".") return;
                if (part === "..") {
                    if (resolved.length > 0) resolved.pop();
                    return;
                }
                resolved.push(part);
            });
            return `${drive}\\${resolved.join("\\")}`.replace(/\\+$/g, "\\");
        }

        getSegments(path) {
            const normalized = this.normalizePath(path);
            const drive = normalized.slice(0, 2).toUpperCase();
            const segments = normalized.slice(2).split("\\").filter(Boolean);
            return { normalized, drive, segments };
        }

        findKey(content, segment) {
            return Object.keys(content).find((key) => key.toLowerCase() === String(segment).toLowerCase()) || null;
        }

        getNode(path) {
            const { drive, segments } = this.getSegments(path);
            let node = this.root.content[drive];
            if (!node) return null;
            for (const segment of segments) {
                if (!node.content) return null;
                const actualKey = this.findKey(node.content, segment);
                if (!actualKey) return null;
                node = node.content[actualKey];
            }
            return node;
        }

        getNodeWithParent(path, createParents = false) {
            const { drive, segments } = this.getSegments(path);
            let node = this.root.content[drive];
            if (!node) return null;
            let parent = this.root.content;
            let name = drive;
            if (segments.length === 0) {
                return { node, parent: this.root.content, name: drive, path: `${drive}\\` };
            }
            for (let index = 0; index < segments.length; index += 1) {
                const segment = segments[index];
                if (!node.content) return null;
                let actualKey = this.findKey(node.content, segment);
                if (!actualKey) {
                    if (!createParents || index !== segments.length - 1) {
                        if (!createParents) return null;
                        actualKey = segment;
                        node.content[actualKey] = { type: "dir", createdAt: Date.now(), content: {} };
                    } else {
                        actualKey = segment;
                    }
                }
                parent = node.content;
                name = actualKey;
                node = parent[actualKey] || null;
                if (!node && index < segments.length - 1 && createParents) {
                    parent[actualKey] = { type: "dir", createdAt: Date.now(), content: {} };
                    node = parent[actualKey];
                }
            }
            return { node, parent, name, path: this.normalizePath(path) };
        }

        touchPath(path) {
            let current = this.normalizePath(path);
            while (current) {
                const node = this.getNode(current);
                if (node && node.type !== "root") {
                    node.modifiedAt = Date.now();
                }
                if (/^[A-Z]:\\$/i.test(current)) break;
                current = Utils.parentPath(current);
            }
        }

        isReadOnlyPath(path) {
            const { drive, segments } = this.getSegments(path);
            let node = this.root.content[drive];
            if (!node) return false;
            if (node.readOnly) return true;
            for (const segment of segments) {
                if (!node.content) return false;
                const actualKey = this.findKey(node.content, segment);
                if (!actualKey) return false;
                node = node.content[actualKey];
                if (node && node.readOnly) return true;
            }
            return false;
        }

        isProtectedPath(path) {
            const normalized = this.normalizePath(path);
            if (/^[A-Z]:\\$/i.test(normalized)) return true;
            const node = this.getNode(normalized);
            return Boolean(node && node.meta && node.meta.system);
        }

        ensureDir(path) {
            const info = this.getNodeWithParent(path, true);
            if (!info.node) {
                info.parent[info.name] = { type: "dir", createdAt: Date.now(), content: {} };
            } else if (info.node.type !== "dir" && info.node.type !== "drive") {
                return false;
            }
            this.touchPath(Utils.parentPath(this.normalizePath(path)));
            this.save();
            return true;
        }

        list(path) {
            const node = this.getNode(path);
            if (!node || !node.content) return [];
            return Object.keys(node.content).map((name) => {
                const child = node.content[name];
                return {
                    name,
                    path: this.normalizePath(`${this.normalizePath(path)}\\${name}`),
                    node: child
                };
            });
        }

        exists(path) {
            return Boolean(this.getNode(path));
        }

        isDirectory(path) {
            const node = this.getNode(path);
            return Boolean(node && (node.type === "dir" || node.type === "drive"));
        }

        readFile(path) {
            const node = this.getNode(path);
            if (!node) return null;
            if (node.type === "file" || node.type === "image") return node.content;
            return null;
        }

        writeFile(path, content, options = {}) {
            const normalized = this.normalizePath(path);
            const parentPath = Utils.parentPath(normalized);
            if (!this.isDirectory(parentPath)) {
                return { ok: false, reason: "Parent folder does not exist." };
            }
            if (this.isReadOnlyPath(parentPath)) {
                return { ok: false, reason: "This location is read-only." };
            }
            const info = this.getNodeWithParent(normalized, false);
            if (info && info.node && (info.node.type === "dir" || info.node.type === "drive")) {
                return { ok: false, reason: "Cannot overwrite a folder." };
            }
            if (info && info.node && info.node.readOnly) {
                return { ok: false, reason: "This item is read-only." };
            }
            const name = Utils.basename(normalized);
            const meta = Object.assign({}, info && info.node && info.node.meta ? info.node.meta : {}, options.meta || {});
            const node = {
                type: options.type || (info && info.node ? info.node.type : "file"),
                createdAt: info && info.node ? info.node.createdAt : Date.now(),
                modifiedAt: Date.now(),
                meta,
                content
            };
            if (node.type === "shortcut") {
                node.target = options.target || meta.target || (info && info.node ? info.node.target : "") || "";
                node.meta.target = node.target;
                node.content = "";
            }
            const parentInfo = this.getNodeWithParent(parentPath, false);
            parentInfo.node.content[name] = node;
            this.touchPath(parentPath);
            this.save();
            return { ok: true, path: normalized };
        }

        writeShortcut(path, target, meta = {}) {
            return this.writeFile(path, "", { type: "shortcut", target, meta: Object.assign({}, meta, { target }) });
        }

        rename(path, nextName) {
            const cleanName = Utils.normalizeFilename(nextName);
            if (!cleanName) {
                return { ok: false, reason: "Name cannot be empty." };
            }
            const normalized = this.normalizePath(path);
            if (this.isProtectedPath(normalized)) {
                return { ok: false, reason: "This item is required by the system." };
            }
            if (this.isReadOnlyPath(normalized)) {
                return { ok: false, reason: "This item is read-only." };
            }
            const info = this.getNodeWithParent(normalized, false);
            if (!info || !info.parent || !info.parent[info.name]) {
                return { ok: false, reason: "Item not found." };
            }
            if (cleanName.toLowerCase() === info.name.toLowerCase()) {
                return { ok: true, path: normalized };
            }
            if (this.findKey(info.parent, cleanName)) {
                return { ok: false, reason: "An item with that name already exists." };
            }
            info.parent[cleanName] = info.parent[info.name];
            delete info.parent[info.name];
            if (info.parent[cleanName].meta && info.parent[cleanName].meta.originalPath) {
                const original = info.parent[cleanName].meta.originalPath;
                const parentPath = original.slice(0, original.lastIndexOf("\\"));
                info.parent[cleanName].meta.originalPath = `${parentPath}\\${cleanName}`;
            }
            info.parent[cleanName].modifiedAt = Date.now();
            this.touchPath(Utils.parentPath(normalized));
            this.save();
            return { ok: true, path: `${normalized.slice(0, normalized.lastIndexOf("\\"))}\\${cleanName}` };
        }

        updateMeta(path, patch) {
            const node = this.getNode(path);
            if (!node) return false;
            node.meta = Object.assign({}, node.meta || {}, patch);
            node.modifiedAt = Date.now();
            this.touchPath(Utils.parentPath(this.normalizePath(path)));
            this.save();
            return true;
        }

        deletePath(path, permanent = false) {
            const normalized = this.normalizePath(path);
            if (this.isProtectedPath(normalized)) {
                return { ok: false, reason: "This item is required by the system." };
            }
            if (this.isReadOnlyPath(normalized)) {
                return { ok: false, reason: "This item is read-only." };
            }
            const info = this.getNodeWithParent(normalized, false);
            if (!info || !info.parent || !info.parent[info.name]) {
                return { ok: false, reason: "Item not found." };
            }
            const node = info.parent[info.name];
            const inRecycle = normalized.toLowerCase().startsWith("c:\\recycle bin\\");
            if (!permanent && !inRecycle) {
                const recyclePath = this.normalizePath("C:\\Recycle Bin");
                const recycle = this.getNode(recyclePath);
                let candidate = info.name;
                let counter = 1;
                while (this.findKey(recycle.content, candidate)) {
                    candidate = `${info.name} (${counter})`;
                    counter += 1;
                }
                node.meta = Object.assign({}, node.meta || {}, {
                    originalPath: normalized,
                    deletedAt: Date.now()
                });
                recycle.content[candidate] = node;
                delete info.parent[info.name];
                this.touchPath(recyclePath);
                this.touchPath(Utils.parentPath(normalized));
                this.save();
                return { ok: true, recycled: true, path: `${recyclePath}\\${candidate}` };
            }
            delete info.parent[info.name];
            this.touchPath(Utils.parentPath(normalized));
            this.save();
            return { ok: true, recycled: false };
        }

        restoreFromRecycleBin(path) {
            const normalized = this.normalizePath(path);
            const node = this.getNode(normalized);
            if (!node || !node.meta || !node.meta.originalPath) {
                return { ok: false, reason: "Original location is unavailable." };
            }
            const targetPath = node.meta.originalPath;
            const targetParentPath = targetPath.slice(0, targetPath.lastIndexOf("\\"));
            this.ensureDir(targetParentPath);
            const targetParent = this.getNode(targetParentPath);
            let finalName = targetPath.split("\\").pop();
            let counter = 1;
            while (this.findKey(targetParent.content, finalName)) {
                const extension = Utils.extension(finalName);
                const baseName = extension ? finalName.slice(0, -extension.length - 1) : finalName;
                finalName = extension ? `${baseName} (${counter}).${extension}` : `${baseName} (${counter})`;
                counter += 1;
            }
            targetParent.content[finalName] = node;
            delete node.meta.originalPath;
            delete node.meta.deletedAt;
            const recycleInfo = this.getNodeWithParent(normalized, false);
            delete recycleInfo.parent[recycleInfo.name];
            this.touchPath(targetParentPath);
            this.touchPath("C:\\Recycle Bin");
            this.save();
            return { ok: true, path: `${targetParentPath}\\${finalName}` };
        }

        emptyRecycleBin() {
            const recycle = this.getNode("C:\\Recycle Bin");
            if (!recycle || !recycle.content) return;
            recycle.content = {};
            this.touchPath("C:\\Recycle Bin");
            this.save();
        }

        copyPath(sourcePath, destinationPath) {
            const source = this.getNode(sourcePath);
            if (!source || source.type === "dir" || source.type === "drive") {
                return { ok: false, reason: "Only files can be copied." };
            }
            if (this.exists(destinationPath)) {
                return { ok: false, reason: "An item with that name already exists." };
            }
            const clone = Utils.deepClone(source);
            clone.createdAt = Date.now();
            clone.modifiedAt = Date.now();
            const parentPath = Utils.parentPath(this.normalizePath(destinationPath));
            if (!this.isDirectory(parentPath)) {
                return { ok: false, reason: "Parent folder does not exist." };
            }
            if (this.isReadOnlyPath(parentPath)) {
                return { ok: false, reason: "This location is read-only." };
            }
            const parent = this.getNode(parentPath);
            parent.content[Utils.basename(this.normalizePath(destinationPath))] = clone;
            this.touchPath(parentPath);
            this.save();
            return { ok: true, path: this.normalizePath(destinationPath) };
        }

        itemCount(path) {
            const node = this.getNode(path);
            if (!node || !node.content) return 0;
            return Object.keys(node.content).length;
        }

        estimateSize(node) {
            if (!node) return 0;
            if (typeof node.content === "string") return node.content.length;
            if (!node.content) return 0;
            return Object.values(node.content).reduce((total, child) => total + this.estimateSize(child), 0);
        }

        getProperties(path) {
            const normalized = this.normalizePath(path);
            const node = this.getNode(normalized);
            if (!node) return null;
            const size = this.estimateSize(node);
            return {
                path: normalized,
                type: node.type,
                size,
                createdAt: node.createdAt || Date.now(),
                modifiedAt: node.modifiedAt || node.createdAt || Date.now()
            };
        }

        uniqueChildPath(parentPath, desiredName) {
            const cleanName = Utils.normalizeFilename(desiredName) || "New Folder";
            const parent = this.getNode(parentPath);
            if (!parent || !parent.content) return `${this.normalizePath(parentPath)}\\${cleanName}`;
            let next = cleanName;
            let counter = 1;
            while (this.findKey(parent.content, next)) {
                const extension = Utils.extension(cleanName);
                const baseName = extension ? cleanName.slice(0, -extension.length - 1) : cleanName;
                next = extension ? `${baseName} (${counter}).${extension}` : `${baseName} (${counter})`;
                counter += 1;
            }
            return `${this.normalizePath(parentPath)}\\${next}`;
        }
    }

    const ShellIcons = {
        smallMap: {
            folder: "icon-folder-small",
            documents: "icon-folder-small",
            text: "icon-doc-small",
            image: "icon-run-small",
            notepad: "icon-doc-small",
            paint: "icon-paint-small",
            calculator: "icon-calc-small",
            "internet-explorer": "icon-ie-small",
            ie: "icon-ie-small",
            "ms-dos": "icon-dos-small",
            dos: "icon-dos-small",
            mine: "icon-mine-small",
            solitaire: "icon-cards-small",
            settings: "icon-settings-small",
            control: "icon-control-small",
            display: "icon-display-small",
            clock: "icon-clock-small",
            find: "icon-find-small",
            run: "icon-run-small",
            shutdown: "icon-shutdown-small",
            program: "icon-programs-small",
            help: "icon-help-small",
            computer: "icon-display-small",
            recycle: "icon-shutdown-small",
            network: "icon-display-small",
            drive: "icon-run-small"
        },

        small(key) {
            const className = ShellIcons.smallMap[key] || "icon-doc-small";
            return className === "icon-help-small"
                ? '<div class="sm-icon"><div class="icon icon-help-small">?</div></div>'
                : `<div class="sm-icon"><div class="icon ${className}"></div></div>`;
        },

        large(key) {
            switch (key) {
                case "computer":
                    return '<div class="desktop-icon__visual"><div class="icon icon-computer-large"></div></div>';
                case "display":
                    return '<div class="desktop-icon__visual"><div class="icon icon-computer-large"></div></div>';
                case "recycle":
                    return '<div class="desktop-icon__visual"><div class="icon icon-recycle-large"></div></div>';
                case "bin-full":
                    return '<div class="desktop-icon__visual"><div class="icon icon-bin-full-large"></div></div>';
                case "clock":
                    return '<div class="desktop-icon__visual"><div class="icon icon-drive-cd-large"></div></div>';
                case "network":
                    return '<div class="desktop-icon__visual"><div class="icon icon-network-large"></div></div>';
                case "ie":
                case "internet-explorer":
                    return '<div class="desktop-icon__visual"><div class="icon icon-ie-large"></div></div>';
                case "documents":
                    return '<div class="desktop-icon__visual"><div class="icon icon-documents-large"><span></span></div></div>';
                case "control":
                case "settings":
                case "program":
                case "run":
                    return '<div class="desktop-icon__visual"><div class="icon icon-control-large"><span></span></div></div>';
                case "dos":
                case "ms-dos":
                    return '<div class="desktop-icon__visual"><div class="icon icon-dos-large"></div></div>';
                case "find":
                    return '<div class="desktop-icon__visual"><div class="icon icon-network-large"></div></div>';
                case "folder":
                    return '<div class="desktop-icon__visual"><div class="icon icon-folder-large"></div></div>';
                case "drive-floppy":
                    return '<div class="desktop-icon__visual"><div class="icon icon-drive-floppy-large"></div></div>';
                case "drive-disk":
                    return '<div class="desktop-icon__visual"><div class="icon icon-drive-disk-large"></div></div>';
                case "drive-cd":
                    return '<div class="desktop-icon__visual"><div class="icon icon-drive-cd-large"></div></div>';
                case "image":
                    return '<div class="desktop-icon__visual"><div class="icon icon-image-large"></div></div>';
                default:
                    return '<div class="desktop-icon__visual"><div class="icon icon-text-large"></div></div>';
            }
        },

        fromNode(system, path, node) {
            if (!node) return "text";
            if (node.meta && node.meta.icon) {
                if (node.meta.icon === "recycle") {
                    return system.vfs.itemCount("C:\\Recycle Bin") > 0 ? "bin-full" : "recycle";
                }
                return node.meta.icon;
            }
            if (node.type === "drive") {
                if (node.driveType === "floppy") return "drive-floppy";
                if (node.driveType === "cd") return "drive-cd";
                return "drive-disk";
            }
            if (node.type === "dir") return "folder";
            if (node.type === "image") return "image";
            if (node.type === "shortcut") return "run";
            if (Utils.isImageName(path.split("\\").pop())) return "image";
            if (Utils.isTextName(path.split("\\").pop())) return "text";
            return "text";
        }
    };

    class DialogManager {
        constructor(modalRoot) {
            this.modalRoot = modalRoot;
            this.stack = [];
            this.modalRoot.setAttribute("aria-live", "polite");
        }

        hasOpen() {
            return this.stack.length > 0;
        }

        syncState() {
            this.modalRoot.classList.toggle("has-modal", this.hasOpen());
        }

        async alert(title, message, type = "info") {
            const result = await this.show({ title, message, type, buttons: [{ id: "ok", label: "OK" }] });
            return result.action === "ok";
        }

        async confirm(title, message, type = "warn") {
            const result = await this.show({
                title,
                message,
                type,
                buttons: [
                    { id: "yes", label: "Yes" },
                    { id: "no", label: "No" }
                ]
            });
            return result.action === "yes";
        }

        prompt(options) {
            return this.show(options);
        }

        show({ title, message = "", type = "info", buttons = [{ id: "ok", label: "OK" }], fields = [] }) {
            return new Promise((resolve) => {
                const controller = new AbortController();
                const overlay = document.createElement("div");
                overlay.className = "modal-overlay";
                const dialog = document.createElement("div");
                dialog.className = "dialog win-shell";
                dialog.tabIndex = -1;
                dialog.innerHTML = `
                    <div class="window-titlebar window-titlebar--active">
                        <div class="window-title"><span class="window-title__text">${Utils.escapeHtml(title)}</span></div>
                        <div class="window-controls">
                            <button type="button" class="window-control window-control--close" data-dialog-close>X</button>
                        </div>
                    </div>
                    <div class="dialog__body">
                        <div class="dialog-icon dialog-icon--${type === "error" ? "error" : type === "warn" ? "warn" : "info"}"></div>
                        <div class="dialog__copy">
                            <div>${Utils.formatMessage(message)}</div>
                            ${fields.length ? '<div class="dialog__fields"></div>' : ""}
                        </div>
                    </div>
                    <div class="dialog__actions"></div>
                `;
                overlay.appendChild(dialog);
                this.modalRoot.appendChild(overlay);
                this.stack.push({ overlay, dialog });
                this.syncState();

                const fieldsRoot = dialog.querySelector(".dialog__fields");
                const buttonRoot = dialog.querySelector(".dialog__actions");
                const values = {};
                const cancelAction = buttons.find((button) => ["cancel", "close", "no"].includes(button.id))?.id || "close";
                const defaultAction = buttons.find((button) => !["cancel", "close", "no"].includes(button.id))?.id || buttons[0]?.id || "ok";
                let resolved = false;

                fields.forEach((field) => {
                    const wrapper = document.createElement("label");
                    wrapper.className = "form-row";
                    wrapper.style.display = "flex";
                    wrapper.style.flexDirection = "column";
                    wrapper.style.alignItems = "stretch";
                    wrapper.innerHTML = `<span style="width:auto; margin-bottom:4px;">${Utils.escapeHtml(field.label || "")}</span>`;
                    const input = document.createElement(field.type === "textarea" ? "textarea" : "input");
                    input.className = "field field--classic";
                    if (field.type !== "textarea") input.type = field.type || "text";
                    input.value = field.value || "";
                    input.dataset.fieldId = field.id;
                    if (field.placeholder) input.placeholder = field.placeholder;
                    values[field.id] = field.value || "";
                    input.addEventListener("input", () => {
                        values[field.id] = input.value;
                    }, { signal: controller.signal });
                    wrapper.appendChild(input);
                    fieldsRoot.appendChild(wrapper);
                });

                const close = (action) => {
                    if (resolved) return;
                    resolved = true;
                    controller.abort();
                    overlay.remove();
                    this.stack = this.stack.filter((item) => item.overlay !== overlay);
                    this.syncState();
                    resolve({ action, values });
                };

                buttons.forEach((button) => {
                    const element = document.createElement("button");
                    element.type = "button";
                    element.className = "win-button";
                    element.textContent = button.label;
                    element.dataset.action = button.id;
                    if (button.id === defaultAction) element.dataset.default = "true";
                    element.addEventListener("click", () => close(button.id), { signal: controller.signal });
                    buttonRoot.appendChild(element);
                });

                const focusables = () => Array.from(dialog.querySelectorAll("button, input, textarea, select, [tabindex]:not([tabindex='-1'])"))
                    .filter((element) => !element.disabled && element.offsetParent !== null);

                dialog.querySelector("[data-dialog-close]").addEventListener("click", () => close(cancelAction), { signal: controller.signal });
                overlay.addEventListener("mousedown", (event) => {
                    if (event.target === overlay) {
                        dialog.focus();
                    }
                }, { signal: controller.signal });
                dialog.addEventListener("keydown", (event) => {
                    if (event.key === "Escape") {
                        event.preventDefault();
                        close(cancelAction);
                        return;
                    }
                    if (event.key === "Enter" && event.target.tagName !== "TEXTAREA") {
                        const defaultButton = buttonRoot.querySelector("[data-default='true']") || buttonRoot.querySelector("button");
                        if (defaultButton) {
                            event.preventDefault();
                            defaultButton.click();
                        }
                        return;
                    }
                    if (event.key === "Tab") {
                        const items = focusables();
                        if (!items.length) return;
                        const currentIndex = items.indexOf(document.activeElement);
                        const nextIndex = event.shiftKey
                            ? (currentIndex <= 0 ? items.length - 1 : currentIndex - 1)
                            : (currentIndex === -1 || currentIndex >= items.length - 1 ? 0 : currentIndex + 1);
                        event.preventDefault();
                        items[nextIndex].focus();
                    }
                }, { signal: controller.signal });

                requestAnimationFrame(() => {
                    const firstField = dialog.querySelector("[data-field-id]");
                    const firstButton = buttonRoot.querySelector("button");
                    (firstField || firstButton)?.focus();
                });
            });
        }
    }

    class ContextMenuManager {
        constructor(menuElement) {
            this.element = menuElement;
            this.activeItems = [];
            this.focusIndex = -1;
            this.element.tabIndex = -1;
            document.addEventListener("mousedown", (event) => {
                if (!this.element.classList.contains("hidden") && !this.element.contains(event.target)) {
                    this.hide();
                }
            });
            document.addEventListener("keydown", (event) => {
                if (this.element.classList.contains("hidden")) return;
                if (event.key === "Escape") {
                    event.preventDefault();
                    this.hide();
                    return;
                }
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    this.stepFocus(event.key === "ArrowDown" ? 1 : -1);
                    return;
                }
                if (event.key === "Enter" || event.key === " ") {
                    const element = this.element.querySelector(`.context-menu__item[data-index="${this.focusIndex}"]`);
                    if (element) {
                        event.preventDefault();
                        element.click();
                    }
                }
            });
            window.addEventListener("blur", () => this.hide());
            window.addEventListener("resize", () => this.hide());
        }

        show(x, y, items) {
            this.activeItems = items;
            this.element.innerHTML = "";
            this.focusIndex = -1;
            items.forEach((item, index) => {
                if (item.separator) {
                    const divider = document.createElement("div");
                    divider.className = "menu-divider";
                    this.element.appendChild(divider);
                    return;
                }
                const element = document.createElement("div");
                element.className = `context-menu__item${item.disabled ? " is-disabled" : ""}`;
                element.innerHTML = `
                    <span class="context-menu__check">${item.checked ? "✓" : ""}</span>
                    <span class="context-menu__label">${Utils.escapeHtml(item.label)}</span>
                    <span class="context-menu__shortcut">${Utils.escapeHtml(item.shortcut || "")}</span>
                `;
                element.dataset.index = String(index);
                this.element.appendChild(element);
                if (!item.disabled && this.focusIndex === -1) {
                    this.focusIndex = index;
                }
            });
            this.element.classList.remove("hidden");
            const rect = this.element.getBoundingClientRect();
            const left = Utils.clamp(x, 0, Math.max(0, window.innerWidth - rect.width - 4));
            const top = Utils.clamp(y, 0, Math.max(0, window.innerHeight - rect.height - 34));
            this.element.style.left = `${left}px`;
            this.element.style.top = `${top}px`;
            this.element.setAttribute("aria-hidden", "false");
            this.syncFocus();
            this.element.focus({ preventScroll: true });
        }

        hide() {
            this.element.classList.add("hidden");
            this.element.setAttribute("aria-hidden", "true");
            this.element.innerHTML = "";
            this.activeItems = [];
            this.focusIndex = -1;
        }

        syncFocus() {
            this.element.querySelectorAll(".context-menu__item").forEach((element) => {
                element.classList.toggle("is-focused", Number(element.dataset.index) === this.focusIndex);
            });
        }

        stepFocus(direction) {
            const enabledIndexes = this.activeItems
                .map((item, index) => ({ item, index }))
                .filter((entry) => entry.item && !entry.item.separator && !entry.item.disabled)
                .map((entry) => entry.index);
            if (!enabledIndexes.length) return;
            const currentPos = enabledIndexes.indexOf(this.focusIndex);
            const nextPos = currentPos === -1
                ? 0
                : (currentPos + direction + enabledIndexes.length) % enabledIndexes.length;
            this.focusIndex = enabledIndexes[nextPos];
            this.syncFocus();
        }

        bind() {
            Utils.delegate(this.element, "click", ".context-menu__item", (event, item) => {
                event.stopPropagation();
                const index = Number(item.dataset.index);
                const config = this.activeItems[index];
                if (!config || config.disabled) return;
                this.hide();
                config.action();
            });
            Utils.delegate(this.element, "mousemove", ".context-menu__item", (_event, item) => {
                if (item.classList.contains("is-disabled")) return;
                this.focusIndex = Number(item.dataset.index);
                this.syncFocus();
            });
        }
    }

    class TooltipManager {
        constructor(element) {
            this.element = element;
            this.timer = null;
            this.currentTarget = null;
        }

        init() {
            document.addEventListener("mouseover", (event) => {
                const target = event.target.closest("[data-tooltip]");
                if (!target) return;
                this.schedule(target);
            });
            document.addEventListener("mouseout", (event) => {
                const target = event.target.closest("[data-tooltip]");
                if (target && target === this.currentTarget) {
                    this.hide();
                }
            });
            document.addEventListener("mousedown", () => this.hide());
            window.addEventListener("resize", () => this.hide());
        }

        schedule(target) {
            this.hide();
            this.currentTarget = target;
            this.timer = window.setTimeout(() => {
                this.show(target);
            }, 450);
        }

        show(target) {
            const text = target.dataset.tooltip;
            if (!text) return;
            this.element.textContent = text;
            this.element.classList.remove("hidden");
            const rect = target.getBoundingClientRect();
            const left = Utils.clamp(rect.left, 4, window.innerWidth - this.element.offsetWidth - 4);
            const top = Utils.clamp(rect.top - this.element.offsetHeight - 8, 4, window.innerHeight - this.element.offsetHeight - 4);
            this.element.style.left = `${left}px`;
            this.element.style.top = `${top}px`;
        }

        hide() {
            clearTimeout(this.timer);
            this.timer = null;
            this.currentTarget = null;
            this.element.classList.add("hidden");
        }
    }

    class AppRegistry {
        constructor() {
            this.apps = new Map();
        }

        register(id, definition) {
            this.apps.set(id, definition);
        }

        get(id) {
            return this.apps.get(id);
        }
    }

    class WindowManager {
        constructor(system) {
            this.system = system;
            this.container = system.root.windowsContainer;
            this.taskbar = system.root.taskbarTasks;
            this.instances = new Map();
            this.order = [];
            this.currentInteraction = null;
            this.zBase = 100;
        }

        init() {
            Utils.delegate(this.container, "click", ".window-control", (event, button) => {
                event.stopPropagation();
                const windowElement = button.closest(".window");
                if (!windowElement) return;
                const id = windowElement.dataset.windowId;
                if (button.disabled) return;
                if (button.dataset.action === "close") this.close(id);
                if (button.dataset.action === "minimize") this.minimize(id);
                if (button.dataset.action === "maximize") this.toggleMaximize(id);
            });

            this.container.addEventListener("mousedown", (event) => {
                const windowElement = event.target.closest(".window");
                if (!windowElement) return;
                const id = windowElement.dataset.windowId;
                this.focus(id);
                const titlebar = event.target.closest(".window-titlebar");
                const resizer = event.target.closest(".window-resizer");
                if (resizer && event.button === 0) {
                    this.beginResize(id, resizer.dataset.edge, event);
                    return;
                }
                if (titlebar && !event.target.closest(".window-controls") && event.button === 0) {
                    this.beginDrag(id, event);
                }
            });

            this.container.addEventListener("dblclick", (event) => {
                const titlebar = event.target.closest(".window-titlebar");
                if (!titlebar || event.target.closest(".window-controls")) return;
                const windowElement = titlebar.closest(".window");
                if (windowElement) this.toggleMaximize(windowElement.dataset.windowId);
            });

            this.taskbar.addEventListener("mousedown", (event) => {
                const button = event.target.closest(".taskbar-button");
                if (!button || event.button !== 0) return;
                event.preventDefault();
                const id = button.dataset.windowId;
                const instance = this.instances.get(id);
                if (!instance) return;
                if (instance.isMinimized) {
                    this.restore(id);
                } else if (this.system.state.get("session.activeWindowId") === id) {
                    this.minimize(id);
                } else {
                    this.focus(id);
                }
            });

            this.taskbar.addEventListener("contextmenu", (event) => {
                const button = event.target.closest(".taskbar-button");
                if (!button) return;
                event.preventDefault();
                const id = button.dataset.windowId;
                const instance = this.instances.get(id);
                if (!instance) return;
                this.system.contextMenu.show(event.clientX, event.clientY, [
                    { label: "Restore", disabled: !instance.isMinimized && !instance.isMaximized, action: () => { if (instance.isMinimized) this.restore(id); else this.toggleMaximize(id, false); } },
                    { label: "Minimize", disabled: instance.isMinimized || !instance.minimizable, action: () => this.minimize(id) },
                    { label: instance.isMaximized ? "Restore Down" : "Maximize", disabled: !instance.maximizable, action: () => this.toggleMaximize(id) },
                    { separator: true },
                    { label: "Close", action: () => this.close(id) }
                ]);
            });

            document.addEventListener("mousemove", (event) => this.updateInteraction(event));
            document.addEventListener("mouseup", () => this.endInteraction());
            window.addEventListener("resize", () => this.handleViewportResize());
        }

        create(appId, appData = {}) {
            const definition = this.system.registry.get(appId);
            if (!definition) {
                this.system.dialogs.alert("Windows 98", `Application '${appId}' is not available.`, "error");
                return null;
            }
            const meta = Object.assign({
                width: 520,
                height: 360,
                minWidth: 220,
                minHeight: 140,
                minimizable: true,
                maximizable: true,
                resizable: true
            }, typeof definition.meta === "function" ? definition.meta(appData) : definition.meta);
            const id = Utils.uid("window");
            const bounds = this.getViewportBounds();
            const offset = (this.order.length % 8) * 24;
            const width = Utils.clamp(meta.width || 520, 220, bounds.width);
            const height = Utils.clamp(meta.height || 360, 140, bounds.height);
            const x = Utils.clamp(72 + offset, 0, Math.max(0, bounds.width - width));
            const y = Utils.clamp(48 + offset, 0, Math.max(0, bounds.height - height));
            const controller = new AbortController();
            const instance = {
                id,
                appId,
                appData,
                controller,
                element: document.createElement("section"),
                taskbarButton: document.createElement("button"),
                title: meta.title,
                iconKey: meta.icon,
                minWidth: meta.minWidth || 220,
                minHeight: meta.minHeight || 140,
                minimizable: meta.minimizable !== false,
                maximizable: meta.maximizable !== false,
                resizable: meta.resizable !== false,
                isMinimized: false,
                isMaximized: false,
                restoreRect: null,
                api: null
            };
            instance.element.className = `window win-shell${instance.resizable ? "" : " window--fixed"}`;
            instance.element.dataset.windowId = id;
            instance.element.style.width = `${width}px`;
            instance.element.style.height = `${height}px`;
            instance.element.style.left = `${x}px`;
            instance.element.style.top = `${y}px`;
            instance.element.innerHTML = this.buildWindowShell(instance);
            instance.taskbarButton.className = "taskbar-button";
            instance.taskbarButton.type = "button";
            instance.taskbarButton.dataset.windowId = id;
            instance.taskbarButton.innerHTML = `${ShellIcons.small(meta.icon)}<span>${Utils.escapeHtml(meta.taskTitle || meta.title)}</span>`;
            this.container.appendChild(instance.element);
            this.taskbar.appendChild(instance.taskbarButton);
            this.instances.set(id, instance);
            this.order.push(id);
            const content = instance.element.querySelector(".window-content");
            instance.api = Object.assign({}, definition.create(this.makeInstanceAPI(instance, content)) || {});
            this.syncInstance(instance);
            this.focus(id, { force: true });
            this.notifyShellResize(instance);
            return instance;
        }

        makeInstanceAPI(instance, content) {
            return {
                id: instance.id,
                appId: instance.appId,
                appData: instance.appData,
                element: instance.element,
                content,
                controller: instance.controller,
                system: this.system,
                setTitle: (title) => this.setTitle(instance.id, title),
                setTaskTitle: (title) => this.setTaskTitle(instance.id, title),
                setIcon: (iconKey) => this.setIcon(instance.id, iconKey),
                setBounds: (rect) => this.setBounds(instance.id, rect),
                restore: () => this.restore(instance.id),
                minimize: () => this.minimize(instance.id),
                maximize: () => this.toggleMaximize(instance.id, true),
                close: () => this.close(instance.id),
                focus: () => this.focus(instance.id),
                isFocused: () => this.system.state.get("session.activeWindowId") === instance.id,
                refreshShell: () => this.refreshShell()
            };
        }

        buildWindowShell(instance) {
            return `
                <div class="window-resizer" data-edge="top"></div>
                <div class="window-resizer" data-edge="right"></div>
                <div class="window-resizer" data-edge="bottom"></div>
                <div class="window-resizer" data-edge="left"></div>
                <div class="window-resizer" data-edge="top-left"></div>
                <div class="window-resizer" data-edge="top-right"></div>
                <div class="window-resizer" data-edge="bottom-left"></div>
                <div class="window-resizer" data-edge="bottom-right"></div>
                <div class="window-titlebar">
                    <div class="window-title">
                        ${ShellIcons.small(instance.iconKey)}
                        <span class="window-title__text">${Utils.escapeHtml(instance.title)}</span>
                    </div>
                    <div class="window-controls">
                        <button type="button" class="window-control" data-action="minimize" aria-label="Minimize"${instance.minimizable ? "" : " disabled"}>_</button>
                        <button type="button" class="window-control" data-action="maximize" aria-label="Maximize"${instance.maximizable ? "" : " disabled"}><span class="window-control__glyph window-control__glyph--max"></span></button>
                        <button type="button" class="window-control" data-action="close" aria-label="Close">X</button>
                    </div>
                </div>
                <div class="window-content"></div>
            `;
        }

        setTitle(id, title) {
            const instance = this.instances.get(id);
            if (!instance) return;
            instance.title = title;
            instance.element.querySelector(".window-title__text").textContent = title;
            this.updateTaskbarLabel(instance);
        }

        setTaskTitle(id, title) {
            const instance = this.instances.get(id);
            if (!instance) return;
            instance.taskTitle = title;
            this.updateTaskbarLabel(instance);
        }

        setIcon(id, iconKey) {
            const instance = this.instances.get(id);
            if (!instance) return;
            instance.iconKey = iconKey;
            instance.element.querySelector(".window-title .sm-icon").outerHTML = ShellIcons.small(iconKey);
            instance.taskbarButton.querySelector(".sm-icon").outerHTML = ShellIcons.small(iconKey);
            this.syncInstance(instance);
        }

        updateTaskbarLabel(instance) {
            const label = instance.taskbarButton.querySelector("span");
            if (label) {
                label.textContent = instance.taskTitle || instance.title;
            }
            instance.taskbarButton.title = instance.taskTitle || instance.title;
        }

        syncInstance(instance, focused = this.system.state.get("session.activeWindowId") === instance.id) {
            instance.element.classList.toggle("focused", focused && !instance.isMinimized);
            instance.element.classList.toggle("is-minimized", instance.isMinimized);
            instance.element.classList.toggle("is-maximized", instance.isMaximized);
            instance.taskbarButton.classList.toggle("is-active", focused && !instance.isMinimized);
            instance.taskbarButton.classList.toggle("is-minimized", instance.isMinimized);
            instance.taskbarButton.classList.toggle("is-maximized", instance.isMaximized);
            instance.taskbarButton.setAttribute("aria-pressed", focused && !instance.isMinimized ? "true" : "false");
            const maximizeGlyph = instance.element.querySelector("[data-action='maximize'] .window-control__glyph");
            if (maximizeGlyph) {
                maximizeGlyph.className = `window-control__glyph ${instance.isMaximized ? "window-control__glyph--restore" : "window-control__glyph--max"}`;
            }
        }

        getWindowRect(instance) {
            return {
                left: instance.element.offsetLeft,
                top: instance.element.offsetTop,
                width: instance.element.offsetWidth,
                height: instance.element.offsetHeight
            };
        }

        clampRect(instance, rect, bounds = this.getViewportBounds()) {
            const width = Utils.clamp(Math.round(rect.width), instance.minWidth, bounds.width);
            const height = Utils.clamp(Math.round(rect.height), instance.minHeight, bounds.height);
            const left = Utils.clamp(Math.round(rect.left), 0, Math.max(0, bounds.width - width));
            const top = Utils.clamp(Math.round(rect.top), 0, Math.max(0, bounds.height - height));
            return { left, top, width, height };
        }

        setBounds(id, rect) {
            const instance = this.instances.get(id);
            if (!instance || instance.isMaximized) return;
            const next = this.clampRect(instance, rect);
            instance.element.style.left = `${next.left}px`;
            instance.element.style.top = `${next.top}px`;
            instance.element.style.width = `${next.width}px`;
            instance.element.style.height = `${next.height}px`;
            this.notifyShellResize(instance);
        }

        focus(id, options = {}) {
            if (!id || !this.instances.has(id)) {
                this.system.state.set("session.activeWindowId", null);
                this.instances.forEach((instance) => {
                    this.syncInstance(instance, false);
                });
                return;
            }
            const instance = this.instances.get(id);
            if (!instance) return;
            if (instance.isMinimized && !options.force) {
                this.restore(id);
                return;
            }
            const previousId = this.system.state.get("session.activeWindowId");
            this.order = this.order.filter((entry) => entry !== id);
            this.order.push(id);
            this.order.forEach((entryId, index) => {
                const current = this.instances.get(entryId);
                current.element.style.zIndex = String(this.zBase + index);
                this.syncInstance(current, entryId === id);
            });
            this.system.state.set("session.activeWindowId", id);
            if (previousId && previousId !== id) {
                const previous = this.instances.get(previousId);
                if (previous && previous.api && typeof previous.api.onBlur === "function") {
                    previous.api.onBlur();
                }
            }
            if (instance.api && typeof instance.api.onFocus === "function") {
                instance.api.onFocus();
            }
        }

        async close(id) {
            const instance = this.instances.get(id);
            if (!instance) return;
            if (instance.api && typeof instance.api.beforeClose === "function") {
                const allowClose = await Promise.resolve(instance.api.beforeClose());
                if (!allowClose) return;
            }
            if (this.currentInteraction && this.currentInteraction.id === id) {
                this.endInteraction();
            }
            if (instance.api && typeof instance.api.destroy === "function") {
                instance.api.destroy();
            }
            instance.controller.abort();
            instance.element.remove();
            instance.taskbarButton.remove();
            this.instances.delete(id);
            this.order = this.order.filter((entry) => entry !== id);
            const next = this.order[this.order.length - 1] || null;
            this.focus(next);
        }

        closeAll() {
            Array.from(this.instances.keys()).forEach((id) => {
                const instance = this.instances.get(id);
                if (instance.api && typeof instance.api.destroy === "function") {
                    instance.api.destroy();
                }
                instance.controller.abort();
                instance.element.remove();
                instance.taskbarButton.remove();
            });
            this.instances.clear();
            this.order = [];
            this.focus(null);
        }

        minimize(id) {
            const instance = this.instances.get(id);
            if (!instance || instance.isMinimized || !instance.minimizable) return;
            const start = instance.element.getBoundingClientRect();
            const end = instance.taskbarButton.getBoundingClientRect();
            this.animateGhost(start, end, () => {
                instance.isMinimized = true;
                instance.element.classList.add("minimized");
                this.syncInstance(instance, false);
                if (this.system.state.get("session.activeWindowId") === id) {
                    let next = null;
                    for (let index = this.order.length - 1; index >= 0; index -= 1) {
                        const candidateId = this.order[index];
                        if (candidateId === id) continue;
                        const candidate = this.instances.get(candidateId);
                        if (candidate && !candidate.isMinimized) {
                            next = candidateId;
                            break;
                        }
                    }
                    this.focus(next);
                } else {
                    this.updateTaskbarLabel(instance);
                }
            });
        }

        restore(id) {
            const instance = this.instances.get(id);
            if (!instance || !instance.isMinimized) return;
            instance.element.classList.remove("minimized");
            const start = instance.taskbarButton.getBoundingClientRect();
            const end = instance.element.getBoundingClientRect();
            this.animateGhost(start, end, () => {
                instance.isMinimized = false;
                if (instance.isMaximized) {
                    const bounds = this.getViewportBounds();
                    instance.element.style.left = "0px";
                    instance.element.style.top = "0px";
                    instance.element.style.width = `${bounds.width}px`;
                    instance.element.style.height = `${bounds.height}px`;
                }
                this.focus(id, { force: true });
                this.notifyShellResize(instance);
            });
        }

        toggleMaximize(id, forcedState) {
            const instance = this.instances.get(id);
            if (!instance || instance.isMinimized || !instance.maximizable) return;
            const shouldMaximize = typeof forcedState === "boolean" ? forcedState : !instance.isMaximized;
            if (shouldMaximize === instance.isMaximized) return;
            if (!shouldMaximize) {
                const fallback = instance.restoreRect || { left: 48, top: 32, width: 520, height: 360 };
                const rect = this.clampRect(instance, fallback);
                instance.element.style.left = `${rect.left}px`;
                instance.element.style.top = `${rect.top}px`;
                instance.element.style.width = `${rect.width}px`;
                instance.element.style.height = `${rect.height}px`;
                instance.isMaximized = false;
            } else {
                const currentRect = this.getWindowRect(instance);
                instance.restoreRect = { left: currentRect.left, top: currentRect.top, width: currentRect.width, height: currentRect.height };
                const bounds = this.getViewportBounds();
                instance.element.style.left = "0px";
                instance.element.style.top = "0px";
                instance.element.style.width = `${bounds.width}px`;
                instance.element.style.height = `${bounds.height}px`;
                instance.isMaximized = true;
            }
            this.syncInstance(instance, this.system.state.get("session.activeWindowId") === id);
            this.focus(id, { force: true });
            this.notifyShellResize(instance);
        }

        beginDrag(id, event) {
            const instance = this.instances.get(id);
            if (!instance || instance.isMaximized) return;
            this.currentInteraction = {
                type: "drag",
                id,
                startX: event.clientX,
                startY: event.clientY,
                startLeft: instance.element.offsetLeft,
                startTop: instance.element.offsetTop
            };
            document.body.classList.add("is-window-interacting");
            instance.element.classList.add("is-interacting");
            event.preventDefault();
        }

        beginResize(id, edge, event) {
            const instance = this.instances.get(id);
            if (!instance || instance.isMaximized || !instance.resizable) return;
            this.currentInteraction = {
                type: "resize",
                id,
                edge,
                startX: event.clientX,
                startY: event.clientY,
                startWidth: instance.element.offsetWidth,
                startHeight: instance.element.offsetHeight,
                startLeft: instance.element.offsetLeft,
                startTop: instance.element.offsetTop
            };
            document.body.classList.add("is-window-interacting");
            instance.element.classList.add("is-interacting");
            event.preventDefault();
            event.stopPropagation();
        }

        updateInteraction(event) {
            if (!this.currentInteraction) return;
            const instance = this.instances.get(this.currentInteraction.id);
            if (!instance) return;
            const bounds = this.getViewportBounds();
            if (this.currentInteraction.type === "drag") {
                const nextLeft = Utils.clamp(this.currentInteraction.startLeft + (event.clientX - this.currentInteraction.startX), 0, Math.max(0, bounds.width - instance.element.offsetWidth));
                const nextTop = Utils.clamp(this.currentInteraction.startTop + (event.clientY - this.currentInteraction.startY), 0, Math.max(0, bounds.height - instance.element.offsetHeight));
                instance.element.style.left = `${nextLeft}px`;
                instance.element.style.top = `${nextTop}px`;
                return;
            }
            const dx = event.clientX - this.currentInteraction.startX;
            const dy = event.clientY - this.currentInteraction.startY;
            let { startLeft, startTop, startWidth, startHeight, edge } = this.currentInteraction;
            let left = startLeft;
            let top = startTop;
            let width = startWidth;
            let height = startHeight;
            if (edge.includes("right")) width = Utils.clamp(startWidth + dx, instance.minWidth, bounds.width - startLeft);
            if (edge.includes("bottom")) height = Utils.clamp(startHeight + dy, instance.minHeight, bounds.height - startTop);
            if (edge.includes("left")) {
                left = Utils.clamp(startLeft + dx, 0, startLeft + startWidth - instance.minWidth);
                width = Utils.clamp(startWidth + (startLeft - left), instance.minWidth, bounds.width - left);
            }
            if (edge.includes("top")) {
                top = Utils.clamp(startTop + dy, 0, startTop + startHeight - instance.minHeight);
                height = Utils.clamp(startHeight + (startTop - top), instance.minHeight, bounds.height - top);
            }
            instance.element.style.left = `${left}px`;
            instance.element.style.top = `${top}px`;
            instance.element.style.width = `${width}px`;
            instance.element.style.height = `${height}px`;
        }

        endInteraction() {
            if (!this.currentInteraction) return;
            const instance = this.instances.get(this.currentInteraction.id);
            if (instance) {
                instance.element.classList.remove("is-interacting");
                this.notifyShellResize(instance);
            }
            document.body.classList.remove("is-window-interacting");
            this.currentInteraction = null;
        }

        animateGhost(startRect, endRect, callback) {
            const ghost = document.createElement("div");
            ghost.className = "window-ghost";
            document.body.appendChild(ghost);
            const start = performance.now();
            const duration = 130;
            const tick = (now) => {
                const progress = Utils.clamp((now - start) / duration, 0, 1);
                const left = startRect.left + (endRect.left - startRect.left) * progress;
                const top = startRect.top + (endRect.top - startRect.top) * progress;
                const width = startRect.width + (endRect.width - startRect.width) * progress;
                const height = startRect.height + (endRect.height - startRect.height) * progress;
                ghost.style.left = `${left}px`;
                ghost.style.top = `${top}px`;
                ghost.style.width = `${width}px`;
                ghost.style.height = `${height}px`;
                if (progress < 1) {
                    requestAnimationFrame(tick);
                } else {
                    ghost.remove();
                    callback();
                }
            };
            requestAnimationFrame(tick);
        }

        getViewportBounds() {
            return {
                width: window.innerWidth,
                height: window.innerHeight - this.system.root.taskbar.offsetHeight
            };
        }

        handleViewportResize() {
            const bounds = this.getViewportBounds();
            this.instances.forEach((instance) => {
                if (instance.isMaximized) {
                    instance.restoreRect = instance.restoreRect ? this.clampRect(instance, instance.restoreRect, bounds) : instance.restoreRect;
                    instance.element.style.width = `${bounds.width}px`;
                    instance.element.style.height = `${bounds.height}px`;
                    this.notifyShellResize(instance);
                    return;
                }
                const rect = this.clampRect(instance, this.getWindowRect(instance), bounds);
                instance.element.style.width = `${rect.width}px`;
                instance.element.style.height = `${rect.height}px`;
                instance.element.style.left = `${rect.left}px`;
                instance.element.style.top = `${rect.top}px`;
                if (instance.restoreRect) {
                    instance.restoreRect = this.clampRect(instance, instance.restoreRect, bounds);
                }
                this.notifyShellResize(instance);
            });
        }

        notifyShellResize(instance) {
            if (instance && instance.api && typeof instance.api.afterShellResize === "function") {
                instance.api.afterShellResize(this.getWindowRect(instance));
            }
        }

        refreshShell() {
            this.system.desktop.render();
            this.instances.forEach((instance) => {
                if (instance.api && typeof instance.api.refresh === "function") {
                    instance.api.refresh();
                }
            });
        }
    }

    class DesktopManager {
        constructor(system) {
            this.system = system;
            this.root = system.root.desktop;
            this.selectionBox = system.root.desktopSelection;
            this.selected = new Set();
            this.selectionAnchor = null;
            this.iconDrag = null;
            this.marquee = null;
            this.renameSession = null;
        }

        init() {
            this.applyWallpaper(this.system.state.get("settings.wallpaper"));

            this.root.addEventListener("mousedown", (event) => {
                if (!this.system.state.get("session.loggedIn")) return;
                if (this.renameSession && !event.target.closest(".desktop-icon__rename")) {
                    this.commitRename();
                }
                const icon = event.target.closest(".desktop-icon");
                if (icon && event.button === 0) {
                    this.handleIconMouseDown(event, icon);
                    return;
                }
                if ((event.target === this.root || event.target === this.selectionBox) && event.button === 0) {
                    this.root.focus();
                    if (!event.ctrlKey && !event.shiftKey) {
                        this.clearSelection(false);
                    }
                    this.system.windows.focus(null);
                    this.beginMarquee(event, event.ctrlKey);
                }
            });

            this.root.addEventListener("dblclick", (event) => {
                const icon = event.target.closest(".desktop-icon");
                if (!icon || this.renameSession) return;
                this.openPath(icon.dataset.path);
            });

            this.root.addEventListener("contextmenu", (event) => {
                if (!this.system.state.get("session.loggedIn")) return;
                event.preventDefault();
                const icon = event.target.closest(".desktop-icon");
                if (icon) {
                    if (!this.selected.has(icon.dataset.path)) {
                        this.selectOnly(icon.dataset.path);
                    }
                    this.showIconMenu(event.clientX, event.clientY, icon.dataset.path);
                    return;
                }
                this.clearSelection();
                this.showDesktopMenu(event.clientX, event.clientY);
            });

            this.root.addEventListener("keydown", (event) => {
                if (event.target.closest(".desktop-icon__rename")) return;
                if (event.ctrlKey && event.key.toLowerCase() === "a") {
                    event.preventDefault();
                    this.selectAll();
                }
                if (event.key === "Enter") {
                    const path = Array.from(this.selected)[0];
                    if (path) this.openPath(path);
                }
                if (event.key === "Delete") {
                    const paths = Array.from(this.selected);
                    if (paths.length) this.deletePaths(paths);
                }
                if (event.key === "F2") {
                    const path = Array.from(this.selected)[0];
                    if (path) this.startRename(path);
                }
                if (event.key === "Escape") {
                    if (this.renameSession) this.cancelRename();
                    else this.clearSelection();
                }
            });

            Utils.delegate(this.root, "input", ".desktop-icon__rename", (_event, input) => {
                if (!this.renameSession) return;
                this.renameSession.value = input.value;
            });
            Utils.delegate(this.root, "keydown", ".desktop-icon__rename", (event, input) => {
                event.stopPropagation();
                if (!this.renameSession) return;
                if (event.key === "Enter") {
                    event.preventDefault();
                    this.renameSession.value = input.value;
                    this.commitRename();
                }
                if (event.key === "Escape") {
                    event.preventDefault();
                    this.cancelRename();
                }
            });
            this.root.addEventListener("focusout", (event) => {
                const input = event.target.closest(".desktop-icon__rename");
                if (!input) return;
                window.setTimeout(() => {
                    if (this.renameSession && !this.root.contains(document.activeElement)) {
                        this.commitRename();
                    } else if (this.renameSession && document.activeElement !== input) {
                        this.commitRename();
                    }
                }, 0);
            });

            document.addEventListener("mousemove", (event) => {
                if (this.iconDrag) this.updateIconDrag(event);
                if (this.marquee) this.updateMarquee(event);
            });

            document.addEventListener("mouseup", () => {
                if (this.iconDrag) this.finishIconDrag();
                if (this.marquee) this.finishMarquee();
            });
        }

        getDesktopEntries() {
            const desktopPath = "C:\\WINDOWS\\Desktop";
            const entries = this.system.vfs.list(desktopPath);
            const autoArrange = this.system.state.get("settings.desktopAutoArrange");
            if (autoArrange) {
                return entries.sort((a, b) => a.name.localeCompare(b.name));
            }
            return entries.sort((a, b) => {
                const ay = a.node.meta && Number.isFinite(a.node.meta.y) ? a.node.meta.y : 0;
                const by = b.node.meta && Number.isFinite(b.node.meta.y) ? b.node.meta.y : 0;
                const ax = a.node.meta && Number.isFinite(a.node.meta.x) ? a.node.meta.x : 0;
                const bx = b.node.meta && Number.isFinite(b.node.meta.x) ? b.node.meta.x : 0;
                return ay - by || ax - bx || a.name.localeCompare(b.name);
            });
        }

        render() {
            const entries = this.getDesktopEntries();
            this.root.querySelectorAll(".desktop-icon").forEach((icon) => icon.remove());
            entries.forEach((entry, index) => {
                const node = entry.node;
                const label = entry.name.replace(/\.lnk$/i, "");
                const x = node.meta && Number.isFinite(node.meta.x) ? node.meta.x : 16 + Math.floor(index / 7) * 88;
                const y = node.meta && Number.isFinite(node.meta.y) ? node.meta.y : 16 + (index % 7) * 88;
                const iconKey = this.getDesktopIconKey(entry.path, node);
                const isRenaming = this.renameSession && this.renameSession.path === entry.path;
                const element = document.createElement("button");
                element.type = "button";
                element.className = "desktop-icon";
                element.dataset.path = entry.path;
                element.style.left = `${x}px`;
                element.style.top = `${y}px`;
                element.innerHTML = isRenaming
                    ? `${ShellIcons.large(iconKey)}<input class="desktop-icon__rename field field--classic" type="text" value="${Utils.escapeHtml(this.renameSession.value)}" spellcheck="false">`
                    : `${ShellIcons.large(iconKey)}<div class="desktop-icon__label">${Utils.escapeHtml(label)}</div>`;
                this.root.appendChild(element);
            });
            this.applySelectionClasses();
            if (this.renameSession) {
                const input = this.root.querySelector(`.desktop-icon[data-path="${Utils.escapeSelector(this.renameSession.path)}"] .desktop-icon__rename`);
                if (input) {
                    requestAnimationFrame(() => {
                        input.focus();
                        const node = this.system.vfs.getNode(this.renameSession.path);
                        const visibleLength = node && node.type === "shortcut"
                            ? input.value.length
                            : Math.max(0, input.value.lastIndexOf(".")) || input.value.length;
                        input.setSelectionRange(0, visibleLength);
                    });
                }
            }
            if (this.marquee) {
                this.root.appendChild(this.selectionBox);
            }
        }

        getDesktopIconKey(path, node) {
            const key = ShellIcons.fromNode(this.system, path, node);
            if (key === "bin-full") return "bin-full";
            return key;
        }

        applyWallpaper(className) {
            this.root.classList.remove("wallpaper-teal", "wallpaper-blue", "wallpaper-dark", "wallpaper-clouds", "wallpaper-setup");
            this.root.classList.add(className);
        }

        applySelectionClasses() {
            this.root.querySelectorAll(".desktop-icon").forEach((icon) => {
                icon.classList.toggle("is-selected", this.selected.has(icon.dataset.path));
            });
        }

        selectOnly(path) {
            this.selected = new Set([path]);
            this.selectionAnchor = path;
            this.applySelectionClasses();
        }

        clearSelection(shouldRender = true) {
            this.selected.clear();
            this.selectionAnchor = null;
            if (shouldRender) this.render();
            else this.applySelectionClasses();
        }

        toggleSelection(path) {
            if (this.selected.has(path)) this.selected.delete(path);
            else this.selected.add(path);
            this.selectionAnchor = path;
            this.applySelectionClasses();
        }

        selectAll() {
            this.selected = new Set(Array.from(this.root.querySelectorAll(".desktop-icon")).map((icon) => icon.dataset.path));
            this.selectionAnchor = Array.from(this.selected)[0] || null;
            this.applySelectionClasses();
        }

        selectRange(fromPath, toPath) {
            const order = Array.from(this.root.querySelectorAll(".desktop-icon")).map((icon) => icon.dataset.path);
            const startIndex = order.indexOf(fromPath);
            const endIndex = order.indexOf(toPath);
            if (startIndex === -1 || endIndex === -1) {
                this.selectOnly(toPath);
                return;
            }
            const [start, end] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
            this.selected = new Set(order.slice(start, end + 1));
            this.applySelectionClasses();
        }

        beginMarquee(event, preserveSelection) {
            const rect = this.root.getBoundingClientRect();
            this.marquee = {
                startX: event.clientX - rect.left,
                startY: event.clientY - rect.top,
                baseSelection: preserveSelection ? new Set(this.selected) : new Set()
            };
            this.selectionBox.classList.remove("hidden");
        }

        updateMarquee(event) {
            const rect = this.root.getBoundingClientRect();
            const currentX = event.clientX - rect.left;
            const currentY = event.clientY - rect.top;
            const selection = Utils.selectionRect(this.marquee.startX, this.marquee.startY, currentX, currentY);
            Object.assign(this.selectionBox.style, {
                left: `${selection.left}px`,
                top: `${selection.top}px`,
                width: `${selection.width}px`,
                height: `${selection.height}px`
            });
            this.selected = new Set(this.marquee.baseSelection);
            this.root.querySelectorAll(".desktop-icon").forEach((icon) => {
                const iconRect = {
                    left: icon.offsetLeft,
                    top: icon.offsetTop,
                    width: icon.offsetWidth,
                    height: icon.offsetHeight
                };
                if (Utils.rectsIntersect(selection, iconRect)) {
                    this.selected.add(icon.dataset.path);
                }
            });
            this.applySelectionClasses();
        }

        finishMarquee() {
            this.marquee = null;
            this.selectionBox.classList.add("hidden");
        }

        handleIconMouseDown(event, icon) {
            event.preventDefault();
            this.root.focus();
            const path = icon.dataset.path;
            if (event.shiftKey && this.selectionAnchor) {
                this.selectRange(this.selectionAnchor, path);
            } else if (event.ctrlKey) {
                this.toggleSelection(icon.dataset.path);
            } else if (!this.selected.has(path) || this.selected.size > 1) {
                this.selectOnly(path);
            }
            const dragPaths = this.selected.has(path) ? Array.from(this.selected) : [path];
            this.iconDrag = {
                path,
                paths: dragPaths,
                startX: event.clientX,
                startY: event.clientY,
                items: dragPaths.map((entryPath) => {
                    const safeSelector = `.desktop-icon[data-path="${Utils.escapeSelector(entryPath)}"]`;
                    const element = this.root.querySelector(safeSelector);
                    return {
                        path: entryPath,
                        element,
                        originLeft: element ? element.offsetLeft : 0,
                        originTop: element ? element.offsetTop : 0
                    };
                }),
                moved: false
            };
        }

        updateIconDrag(event) {
            const dx = event.clientX - this.iconDrag.startX;
            const dy = event.clientY - this.iconDrag.startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                this.iconDrag.moved = true;
            }
            if (!this.iconDrag.moved) return;
            this.iconDrag.items.forEach((item) => {
                item.element.style.left = `${item.originLeft + dx}px`;
                item.element.style.top = `${item.originTop + dy}px`;
            });
        }

        finishIconDrag() {
            if (this.iconDrag.moved) {
                if (this.system.state.get("settings.desktopAutoArrange")) {
                    this.arrangeIcons();
                } else {
                    this.iconDrag.items.forEach((item) => {
                        const snappedX = Utils.clamp(Math.round((item.element.offsetLeft - 16) / 88) * 88 + 16, 16, Math.max(16, window.innerWidth - 96));
                        const snappedY = Utils.clamp(Math.round((item.element.offsetTop - 16) / 88) * 88 + 16, 16, Math.max(16, window.innerHeight - 140));
                        this.system.vfs.updateMeta(item.path, { x: snappedX, y: snappedY });
                    });
                }
            }
            this.iconDrag = null;
            this.render();
        }

        startRename(path) {
            const node = this.system.vfs.getNode(path);
            if (!node) return;
            this.selectOnly(path);
            this.renameSession = {
                path,
                value: Utils.basename(path).replace(/\.lnk$/i, "")
            };
            this.render();
        }

        async commitRename() {
            if (!this.renameSession) return;
            const { path, value } = this.renameSession;
            const node = this.system.vfs.getNode(path);
            this.renameSession = null;
            if (!node) {
                this.render();
                return;
            }
            let nextName = Utils.normalizeFilename(value);
            if (!nextName) {
                this.render();
                return;
            }
            if (node.type === "shortcut" && !/\.lnk$/i.test(nextName)) {
                nextName = `${nextName}.lnk`;
            }
            const currentName = Utils.basename(path);
            if (nextName.toLowerCase() === currentName.toLowerCase()) {
                this.render();
                return;
            }
            const renameResult = this.system.vfs.rename(path, nextName);
            if (!renameResult.ok) {
                await this.system.dialogs.alert("Rename", renameResult.reason, "error");
                this.selected = new Set([path]);
                this.selectionAnchor = path;
            } else {
                this.selected = new Set([renameResult.path]);
                this.selectionAnchor = renameResult.path;
            }
            this.render();
            this.system.windows.refreshShell();
        }

        cancelRename() {
            if (!this.renameSession) return;
            this.renameSession = null;
            this.render();
        }

        async deletePaths(paths) {
            const confirmed = await this.system.dialogs.confirm("Delete", `Delete ${paths.length > 1 ? "these items" : "this item"}?`, "warn");
            if (!confirmed) return;
            for (const path of paths) {
                const result = this.system.vfs.deletePath(path, false);
                if (!result.ok) {
                    await this.system.dialogs.alert("Delete", result.reason, "error");
                    break;
                }
            }
            this.selected.clear();
            this.system.windows.refreshShell();
        }

        showDesktopMenu(x, y) {
            this.system.contextMenu.show(x, y, [
                { label: "Arrange Icons", action: () => this.arrangeIcons() },
                { label: "Auto Arrange", checked: this.system.state.get("settings.desktopAutoArrange"), action: () => this.toggleAutoArrange() },
                { label: "Refresh", action: () => this.render() },
                { separator: true },
                { label: "New Text Document", action: () => this.createNewTextDocument() },
                { separator: true },
                { label: "Properties", action: () => this.system.windows.create("display-properties") }
            ]);
        }

        showIconMenu(x, y, path) {
            const node = this.system.vfs.getNode(path);
            const isRecycleItem = path.toLowerCase().startsWith("c:\\recycle bin\\");
            const items = [
                { label: "Open", action: () => this.openPath(path) },
                { separator: true }
            ];
            if (isRecycleItem) {
                items.push({ label: "Restore", action: () => this.restoreRecycleItem(path) });
            } else {
                items.push({ label: "Rename", shortcut: "F2", action: () => this.startRename(path) });
            }
            items.push({ label: "Delete", action: () => this.deletePaths([path]) });
            items.push({ separator: true });
            items.push({ label: "Properties", action: () => this.showProperties(path, node) });
            this.system.contextMenu.show(x, y, items);
        }

        async restoreRecycleItem(path) {
            const result = this.system.vfs.restoreFromRecycleBin(path);
            if (!result.ok) {
                await this.system.dialogs.alert("Recycle Bin", result.reason, "error");
            }
            this.system.windows.refreshShell();
        }

        async showProperties(path, node) {
            const props = this.system.vfs.getProperties(path);
            if (!props) return;
            const message = `Path: ${props.path}\nType: ${node.type}\nSize: ${Utils.formatSize(props.size)}\nModified: ${Utils.formatExplorerDate(new Date(props.modifiedAt))}`;
            await this.system.dialogs.alert("Properties", message, "info");
        }

        createNewTextDocument() {
            const path = this.system.vfs.uniqueChildPath("C:\\WINDOWS\\Desktop", "New Text Document.txt");
            this.system.vfs.writeFile(path, "", { type: "file", meta: { icon: "text", x: 104, y: 16 } });
            this.render();
            this.startRename(path);
        }

        toggleAutoArrange() {
            const nextValue = !this.system.state.get("settings.desktopAutoArrange");
            this.system.state.set("settings.desktopAutoArrange", nextValue);
            if (nextValue) this.arrangeIcons();
            else this.render();
        }

        arrangeIcons() {
            this.getDesktopEntries().forEach((entry, index) => {
                const x = 16 + Math.floor(index / 7) * 88;
                const y = 16 + (index % 7) * 88;
                this.system.vfs.updateMeta(entry.path, { x, y });
            });
            this.render();
        }

        openPath(path) {
            const node = this.system.vfs.getNode(path);
            if (!node) return;
            if (node.type === "shortcut") {
                this.system.openTarget(node.target || (node.meta && node.meta.target));
                return;
            }
            if (node.type === "dir" || node.type === "drive") {
                this.system.windows.create("explorer", { path });
                return;
            }
            if (node.type === "image" || Utils.isImageName(path.split("\\").pop())) {
                this.system.windows.create("paint", { path });
                return;
            }
            if (node.type === "file" && Utils.isTextName(path.split("\\").pop())) {
                this.system.windows.create("notepad", { path });
                return;
            }
            this.system.dialogs.alert("Open", "No application is associated with this file.", "error");
        }
    }

    class StartMenuManager {
        constructor(system) {
            this.system = system;
            this.menu = system.root.startMenu;
            this.button = system.root.startButton;
            this.focusedItem = null;
            this.hoverTimer = null;
            this.menu.tabIndex = -1;
        }

        init() {
            this.button.addEventListener("mousedown", (event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                this.toggle();
            });

            this.menu.addEventListener("mousemove", (event) => {
                const item = event.target.closest(".start-item");
                if (!item || item.classList.contains("is-disabled")) return;
                this.focusItem(item);
                if (item.classList.contains("has-submenu")) {
                    this.scheduleSubmenu(item);
                } else {
                    this.closeSiblingSubmenus(item);
                }
            });

            this.menu.addEventListener("mouseleave", () => {
                clearTimeout(this.hoverTimer);
            });

            this.menu.addEventListener("click", (event) => {
                const item = event.target.closest(".start-item");
                if (!item || item.classList.contains("is-disabled")) return;
                if (item.classList.contains("has-submenu")) {
                    this.openSubmenu(item, true);
                    return;
                }
                this.activateItem(item);
            });

            document.addEventListener("mousedown", (event) => {
                if (!this.menu.classList.contains("hidden") && !this.menu.contains(event.target) && !this.button.contains(event.target)) {
                    this.close();
                }
            });

            document.addEventListener("keydown", (event) => {
                if (this.menu.classList.contains("hidden")) return;
                if (event.key === "Escape") {
                    event.preventDefault();
                    this.close();
                    return;
                }
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    this.stepFocus(event.key === "ArrowDown" ? 1 : -1);
                }
                if (event.key === "ArrowRight") {
                    event.preventDefault();
                    this.moveHorizontal(1);
                }
                if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    this.moveHorizontal(-1);
                }
                if (event.key === "Home" || event.key === "End") {
                    event.preventDefault();
                    const level = this.focusedItem ? this.focusedItem.parentElement : this.menu.querySelector(".start-menu__items");
                    const items = this.getMenuItems(level);
                    if (items.length) this.focusItem(items[event.key === "Home" ? 0 : items.length - 1]);
                }
                if (event.key === "Enter" && this.focusedItem) {
                    event.preventDefault();
                    this.activateItem(this.focusedItem);
                }
            });
        }

        open() {
            this.menu.classList.remove("hidden");
            this.menu.setAttribute("aria-hidden", "false");
            this.button.classList.add("is-open");
            this.button.setAttribute("aria-expanded", "true");
            this.menu.focus({ preventScroll: true });
            const first = this.getMenuItems(this.menu.querySelector(".start-menu__items"))[0];
            if (first) this.focusItem(first);
        }

        close() {
            clearTimeout(this.hoverTimer);
            this.menu.classList.add("hidden");
            this.menu.setAttribute("aria-hidden", "true");
            this.button.classList.remove("is-open");
            this.button.setAttribute("aria-expanded", "false");
            this.menu.querySelectorAll(".start-item.is-open").forEach((item) => item.classList.remove("is-open"));
            this.menu.querySelectorAll(".start-item.is-focused").forEach((item) => item.classList.remove("is-focused"));
            this.focusedItem = null;
        }

        toggle() {
            if (this.menu.classList.contains("hidden")) this.open();
            else this.close();
        }

        getMenuItems(container) {
            if (!container) return [];
            return Array.from(container.children).filter((child) => child.classList.contains("start-item") && !child.classList.contains("is-disabled"));
        }

        focusItem(item) {
            this.menu.querySelectorAll(".start-item.is-focused").forEach((entry) => entry.classList.remove("is-focused"));
            item.classList.add("is-focused");
            this.focusedItem = item;
        }

        stepFocus(direction) {
            const currentLevel = this.focusedItem ? this.focusedItem.parentElement : this.menu.querySelector(".start-menu__items");
            const items = this.getMenuItems(currentLevel);
            if (!items.length) return;
            const index = this.focusedItem ? items.indexOf(this.focusedItem) : -1;
            const nextIndex = (index + direction + items.length) % items.length;
            this.focusItem(items[nextIndex]);
        }

        moveHorizontal(direction) {
            if (!this.focusedItem) return;
            if (direction > 0 && this.focusedItem.classList.contains("has-submenu")) {
                this.openSubmenu(this.focusedItem, true);
                const firstChild = this.getMenuItems(this.focusedItem.querySelector(".submenu"))[0];
                if (firstChild) this.focusItem(firstChild);
                return;
            }
            if (direction < 0) {
                const submenu = this.focusedItem.closest(".submenu");
                if (!submenu) return;
                const parentItem = submenu.parentElement.closest(".start-item");
                if (!parentItem) return;
                this.closeSubmenu(parentItem);
                this.focusItem(parentItem);
            }
        }

        closeSiblingSubmenus(item) {
            const siblings = Array.from(item.parentElement.children).filter((child) => child.classList.contains("start-item") && child !== item);
            siblings.forEach((sibling) => {
                sibling.classList.remove("is-open");
                sibling.querySelectorAll(".start-item.is-open").forEach((entry) => entry.classList.remove("is-open"));
            });
        }

        scheduleSubmenu(item) {
            clearTimeout(this.hoverTimer);
            this.hoverTimer = window.setTimeout(() => {
                this.openSubmenu(item);
            }, 140);
        }

        openSubmenu(item, immediate = false) {
            if (!item.classList.contains("has-submenu")) return;
            if (!immediate) {
                this.closeSiblingSubmenus(item);
            } else {
                clearTimeout(this.hoverTimer);
                this.closeSiblingSubmenus(item);
            }
            item.classList.add("is-open");
        }

        closeSubmenu(item) {
            item.classList.remove("is-open");
            item.querySelectorAll(".start-item.is-open").forEach((entry) => entry.classList.remove("is-open"));
        }

        activateItem(item) {
            if (item.classList.contains("has-submenu")) {
                this.openSubmenu(item, true);
                const firstChild = this.getMenuItems(item.querySelector(".submenu"))[0];
                if (firstChild) this.focusItem(firstChild);
                return;
            }
            const appId = item.dataset.app;
            const action = item.dataset.shellAction;
            this.close();
            if (appId) {
                this.system.windows.create(appId);
            } else if (action) {
                this.system.runShellAction(action);
            }
        }
    }

    class ClockTrayManager {
        constructor(system) {
            this.system = system;
            this.clock = system.root.clock;
            this.button = system.root.clockButton;
            this.calendar = system.root.calendarPanel;
            this.calendarTitle = system.root.calendarMonthYear;
            this.calendarGrid = system.root.calendarGrid;
            this.balloon = system.root.balloon;
            this.balloonTitle = this.balloon.querySelector(".balloon__title");
            this.balloonMessage = this.balloon.querySelector(".balloon__message");
        }

        init() {
            this.updateClock();
            window.setInterval(() => this.updateClock(), 1000);

            this.button.addEventListener("click", () => {
                if (this.calendar.classList.contains("hidden")) this.openCalendar();
                else this.closeCalendar();
            });

            this.system.root.systemTray.addEventListener("click", (event) => {
                const button = event.target.closest("[data-tray-action]");
                if (!button) return;
                const action = button.dataset.trayAction;
                if (action === "volume") this.notify("Volume", "Volume control is not available in this demo.");
                if (action === "network") this.notify("Dial-Up Networking", "You are connected to the retro information superhighway.");
                if (action === "printer") this.notify("Printer", "Ready to print. No paper jams detected.");
            });

            this.balloon.querySelector("[data-balloon-close]").addEventListener("click", () => {
                this.balloon.classList.add("hidden");
            });

            document.addEventListener("mousedown", (event) => {
                if (!this.calendar.classList.contains("hidden") && !this.calendar.contains(event.target) && !this.button.contains(event.target)) {
                    this.closeCalendar();
                }
            });
        }

        getSystemTime() {
            return new Date(Date.now() + this.system.state.get("settings.timeOffsetMs"));
        }

        updateClock() {
            const now = this.getSystemTime();
            this.clock.textContent = Utils.formatClock(now);
            this.button.dataset.tooltip = now.toLocaleString("en-US");
        }

        openCalendar() {
            const now = this.getSystemTime();
            this.calendar.classList.remove("hidden");
            this.calendar.setAttribute("aria-hidden", "false");
            this.calendarTitle.textContent = now.toLocaleString("en-US", { month: "long", year: "numeric" });
            const headers = ["S", "M", "T", "W", "T", "F", "S"];
            this.calendarGrid.innerHTML = headers.map((day) => `<div>${day}</div>`).join("");
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
            const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            for (let index = 0; index < firstDay; index += 1) {
                this.calendarGrid.insertAdjacentHTML("beforeend", "<div></div>");
            }
            for (let day = 1; day <= days; day += 1) {
                this.calendarGrid.insertAdjacentHTML(
                    "beforeend",
                    `<div class="${day === now.getDate() ? "is-today" : ""}">${day}</div>`
                );
            }
        }

        closeCalendar() {
            this.calendar.classList.add("hidden");
            this.calendar.setAttribute("aria-hidden", "true");
        }

        notify(title, message, timeout = 5200) {
            this.balloonTitle.textContent = title;
            this.balloonMessage.textContent = message;
            this.balloon.classList.remove("hidden");
            clearTimeout(this.balloon._timeoutId);
            this.balloon._timeoutId = window.setTimeout(() => {
                this.balloon.classList.add("hidden");
            }, timeout);
        }

        setSystemTime(date) {
            this.system.state.set("settings.timeOffsetMs", date.getTime() - Date.now());
            this.updateClock();
            this.openCalendar();
        }
    }

    class BootManager {
        constructor(system) {
            this.system = system;
            this.bootScreen = system.root.bootScreen;
            this.loginScreen = system.root.loginScreen;
            this.screensaver = system.root.screensaver;
            this.screensaverLogo = system.root.screensaverLogo;
            this.idleSeconds = 0;
            this.screensaverFrame = null;
        }

        init() {
            setTimeout(() => {
                this.bootScreen.classList.add("hidden");
                this.loginScreen.classList.remove("hidden");
            }, 2200);

            this.system.root.loginOk.addEventListener("click", () => this.finishLogin());
            this.system.root.loginCancel.addEventListener("click", () => this.finishLogin());
            this.loginScreen.querySelector("[data-login-dismiss]").addEventListener("click", () => this.finishLogin());

            ["mousemove", "mousedown", "keydown"].forEach((eventName) => {
                document.addEventListener(eventName, () => this.resetIdleTimer(), { passive: true });
            });

            window.setInterval(() => {
                if (!this.system.state.get("session.loggedIn") || this.system.state.get("session.screensaverActive")) return;
                this.idleSeconds += 1;
                if (this.idleSeconds > 75) this.startScreensaver();
            }, 1000);
        }

        finishLogin() {
            if (this.system.state.get("session.loggedIn")) return;
            this.loginScreen.classList.add("hidden");
            this.system.state.set("session.loggedIn", true);
            this.system.state.set("session.desktopReady", true);
            this.system.desktop.render();
            this.system.clock.notify("Windows 98", "Welcome back. Your desktop is ready.");
            this.system.state.update("settings.bootCount", (count) => count + 1);
        }

        logout() {
            this.system.windows.closeAll();
            this.system.startMenu.close();
            this.system.contextMenu.hide();
            this.system.desktop.clearSelection();
            this.system.state.set("session.loggedIn", false);
            this.loginScreen.classList.remove("hidden");
        }

        resetIdleTimer() {
            this.idleSeconds = 0;
            if (this.system.state.get("session.screensaverActive")) {
                this.stopScreensaver();
            }
        }

        startScreensaver() {
            if (this.system.state.get("session.screensaverActive")) return;
            this.system.state.set("session.screensaverActive", true);
            this.screensaver.classList.remove("hidden");
            let x = 40;
            let y = 40;
            let vx = 2;
            let vy = 2;
            const step = () => {
                if (!this.system.state.get("session.screensaverActive")) return;
                x += vx;
                y += vy;
                if (x <= 0 || x >= window.innerWidth - 70) vx *= -1;
                if (y <= 0 || y >= window.innerHeight - 70) vy *= -1;
                this.screensaverLogo.style.left = `${x}px`;
                this.screensaverLogo.style.top = `${y}px`;
                this.screensaverFrame = requestAnimationFrame(step);
            };
            step();
        }

        stopScreensaver() {
            this.system.state.set("session.screensaverActive", false);
            this.screensaver.classList.add("hidden");
            cancelAnimationFrame(this.screensaverFrame);
            this.screensaverFrame = null;
        }

        async openShutdownDialog() {
            const result = await this.system.dialogs.prompt({
                title: "Shut Down Windows",
                message: "What do you want the computer to do?",
                type: "warn",
                fields: [{ id: "choice", label: "Command", value: "shutdown", placeholder: "shutdown / restart / logoff" }],
                buttons: [
                    { id: "ok", label: "OK" },
                    { id: "cancel", label: "Cancel" }
                ]
            });
            if (result.action !== "ok") return;
            const choice = String(result.values.choice || "").trim().toLowerCase();
            if (choice === "restart") {
                window.location.reload();
                return;
            }
            if (choice === "logoff") {
                this.logout();
                return;
            }
            document.body.innerHTML = '<div style="background:#000; width:100vw; height:100vh; display:flex; align-items:center; justify-content:center; color:#ffb000; font:700 28px Arial, sans-serif;">It is now safe to turn off your computer.</div>';
        }
    }

    class IEMockEngine {
        constructor(system, hooks) {
            this.system = system;
            this.hooks = hooks;
            this.history = [];
            this.index = -1;
            this.loadingToken = 0;
            this.currentUrl = "about:home";
        }

        getHomeUrl() {
            return this.normalize(this.system.state.get("settings.ieHomePage") || "about:home");
        }

        normalize(url) {
            const value = String(url || "").trim();
            if (!value) return "about:home";
            if (/^about:/i.test(value)) return value.toLowerCase();
            if (/^https?:\/\//i.test(value)) {
                const lower = value.toLowerCase();
                return lower.endsWith("/") ? lower : `${lower}/`;
            }
            if (value.includes(".")) {
                const lower = `http://${value.toLowerCase().replace(/^www\./, "")}`;
                return lower.endsWith("/") ? lower : `${lower}/`;
            }
            return `http://${value.toLowerCase()}/`;
        }

        pageFor(url) {
            if (url === "about:home") {
                return {
                    title: "Microsoft Internet Explorer",
                    status: "Done",
                    html: `
                        <div class="web-page">
                            <div class="web-page__hero">
                                <h1>Windows 98 Active Desktop</h1>
                                <p>Welcome to the information superhighway. Choose a destination below.</p>
                            </div>
                            <div class="web-page__tiles">
                                <div class="web-card"><a href="http://windows98/">Visit Windows 98</a><p>Product highlights, tips and system facts.</p></div>
                                <div class="web-card"><a href="http://mycomputer/">Explore My Computer</a><p>Drive information and shell shortcuts.</p></div>
                                <div class="web-card"><a href="http://geocities/">GeoCities</a><p>Animated backgrounds, hot colors and personal pages.</p></div>
                                <div class="web-card"><a href="http://chat/">Chat</a><p>Join the retro lounge and watch the room scroll by.</p></div>
                                <div class="web-card"><a href="http://news/">News</a><p>Headlines from a calmer and lower-resolution internet.</p></div>
                                <div class="web-card"><a href="http://help/">Help</a><p>Learn how to browse this simulated web.</p></div>
                            </div>
                        </div>
                    `
                };
            }
            if (url === "http://windows98/") {
                return {
                    title: "Windows 98 - Microsoft Internet Explorer",
                    status: "Done",
                    html: `
                        <div class="web-page">
                            <div class="retro-banner">Welcome to Windows 98 Second Edition</div>
                            <h2>Designed for the internet. Built for the desktop.</h2>
                            <p>Faster startup, improved USB support and a desktop that feels ready for everything.</p>
                            <ul>
                                <li>Active Desktop integration</li>
                                <li>Internet Explorer 5 style browsing</li>
                                <li>Classic start menu with nested programs</li>
                                <li>Integrated accessories, games and system tools</li>
                            </ul>
                            <p><a href="about:home">Back to home</a></p>
                        </div>
                    `
                };
            }
            if (url === "http://mycomputer/") {
                return {
                    title: "My Computer Online - Microsoft Internet Explorer",
                    status: "Done",
                    html: `
                        <div class="web-page">
                            <h2>My Computer Online</h2>
                            <p>The following resources are currently connected:</p>
                            <div class="web-page__tiles">
                                <div class="web-card"><strong>3 1/2 Floppy (A:)</strong><p>Removable storage for your tiny but important files.</p></div>
                                <div class="web-card"><strong>Local Disk (C:)</strong><p>Main system disk with Windows, documents and applications.</p></div>
                                <div class="web-card"><strong>CD-ROM (D:)</strong><p>Insertable media for setup, games and encyclopedias.</p></div>
                            </div>
                        </div>
                    `
                };
            }
            if (url === "http://geocities/") {
                return {
                    title: "GeoCities - Microsoft Internet Explorer",
                    status: "Done",
                    html: `
                        <div class="geocities-page">
                            <h1>WELCOME TO MY HOMEPAGE!!!</h1>
                            <marquee behavior="alternate" scrollamount="7">UNDER CONSTRUCTION</marquee>
                            <p>You are visitor number 000042.</p>
                            <p><a href="http://chat/">Join my chat room</a> | <a href="about:home">Return home</a></p>
                        </div>
                    `
                };
            }
            if (url === "http://chat/") {
                return {
                    title: "Retro Chat - Microsoft Internet Explorer",
                    status: "Done",
                    html: `
                        <div class="web-page">
                            <h2>Retro Lounge Chat</h2>
                            <div class="chat-log">
                                <span>&lt;sysop&gt; Welcome to the lounge.</span>
                                <span>&lt;pixelkid&gt; anybody remember dial-up tones?</span>
                                <span>&lt;retroqueen&gt; yes and i still miss them.</span>
                                <span>&lt;sysop&gt; try not to flood the room.</span>
                            </div>
                        </div>
                    `
                };
            }
            if (url === "http://news/") {
                return {
                    title: "Headline News - Microsoft Internet Explorer",
                    status: "Done",
                    html: `
                        <div class="web-page">
                            <h2>Headline News</h2>
                            <div class="web-card"><strong>Technology:</strong> Front-end desktop shells are suddenly cool again.</div>
                            <div class="web-card"><strong>Business:</strong> Local demos with no dependencies continue to impress.</div>
                            <div class="web-card"><strong>Culture:</strong> Pixel-perfect nostalgia takes over the web.</div>
                        </div>
                    `
                };
            }
            if (url === "http://help/") {
                return {
                    title: "Help - Microsoft Internet Explorer",
                    status: "Done",
                    html: `
                        <div class="web-page">
                            <h2>Internet Explorer Help</h2>
                            <p>This mock browser understands a small, hand-built route map.</p>
                            <ul>
                                <li><a href="about:home">about:home</a></li>
                                <li><a href="http://windows98/">http://windows98/</a></li>
                                <li><a href="http://mycomputer/">http://mycomputer/</a></li>
                                <li><a href="http://geocities/">http://geocities/</a></li>
                                <li><a href="http://chat/">http://chat/</a></li>
                                <li><a href="http://news/">http://news/</a></li>
                            </ul>
                        </div>
                    `
                };
            }
            return {
                title: "Navigation Canceled - Microsoft Internet Explorer",
                status: "Cannot find server",
                html: `
                    <div class="web-page">
                        <h2>The page cannot be displayed</h2>
                        <p>Internet Explorer could not open <strong>${Utils.escapeHtml(url)}</strong>.</p>
                        <p>Try one of these instead:</p>
                        <ul>
                            <li><a href="about:home">about:home</a></li>
                            <li><a href="http://windows98/">http://windows98/</a></li>
                            <li><a href="http://news/">http://news/</a></li>
                            <li><a href="http://help/">http://help/</a></li>
                        </ul>
                    </div>
                `
            };
        }

        updateNavState(isLoading = false) {
            if (typeof this.hooks.setNavState === "function") {
                this.hooks.setNavState({
                    canBack: this.index > 0,
                    canForward: this.index > -1 && this.index < this.history.length - 1,
                    isLoading,
                    currentUrl: this.currentUrl
                });
            }
        }

        navigate(url, options = {}) {
            const normalized = this.normalize(url || this.getHomeUrl());
            this.currentUrl = normalized;
            if (!options.fromHistory) {
                this.history = this.history.slice(0, this.index + 1);
                this.history.push(normalized);
                this.index = this.history.length - 1;
            }
            const token = ++this.loadingToken;
            this.hooks.setAddress(normalized);
            this.hooks.setStatus("Opening page...");
            this.hooks.setProgress(12);
            this.updateNavState(true);
            setTimeout(() => {
                if (token !== this.loadingToken) return;
                this.hooks.setProgress(48);
            }, 110);
            setTimeout(() => {
                if (token !== this.loadingToken) return;
                const page = this.pageFor(normalized);
                this.hooks.setTitle(page.title);
                this.hooks.setContent(page.html);
                this.hooks.setStatus(page.status);
                this.hooks.setProgress(100);
                this.updateNavState(false);
                setTimeout(() => {
                    if (token === this.loadingToken) this.hooks.setProgress(0);
                }, 220);
            }, 340);
        }

        back() {
            if (this.index <= 0) return;
            this.index -= 1;
            this.navigate(this.history[this.index], { fromHistory: true });
        }

        forward() {
            if (this.index >= this.history.length - 1) return;
            this.index += 1;
            this.navigate(this.history[this.index], { fromHistory: true });
        }

        refresh() {
            this.navigate(this.currentUrl, { fromHistory: true });
        }

        stop() {
            this.loadingToken += 1;
            this.hooks.setStatus("Stopped");
            this.hooks.setProgress(0);
            this.updateNavState(false);
        }

        setHomePage(url) {
            const normalized = this.normalize(url);
            this.system.state.set("settings.ieHomePage", normalized);
            return normalized;
        }
    }

    function showOpenError(system, message) {
        return system.dialogs.alert("Windows 98", message, "error");
    }

    function descriptionForNode(path, node) {
        if (node.type === "drive") return node.label || path.slice(0, 2);
        if (node.type === "dir") return "File Folder";
        if (node.type === "shortcut") return "Shortcut";
        if (node.type === "image") return "Bitmap Image";
        if (Utils.isTextName(path.split("\\").pop())) return "Text Document";
        return "File";
    }

    function buildMenuBar(menus) {
        return `
            <div class="window-menu">
                ${menus.map((menu) => `
                    <div class="menu-bar__item" data-menu-label="${menu.label}" tabindex="0">
                        <span class="menu-bar__label">${menu.label}</span>
                        <div class="menu-dropdown win-shell hidden">
                            ${menu.items.map((item) => item.separator
                                ? '<div class="menu-divider"></div>'
                                : `<div class="menu-dropdown__item${item.disabled ? " is-disabled" : ""}" data-menu-action="${item.id}"><span class="menu-dropdown__label">${item.label}</span><span class="menu-dropdown__shortcut">${item.shortcut || ""}</span></div>`).join("")}
                        </div>
                    </div>
                `).join("")}
            </div>
        `;
    }

    function bindMenuBar(root, controller, onAction) {
        const bar = root.querySelector(".window-menu");
        if (!bar) return;
        const topItems = () => Array.from(bar.querySelectorAll(".menu-bar__item"));
        const closeMenus = () => {
            root.querySelectorAll(".menu-dropdown").forEach((dropdown) => dropdown.classList.add("hidden"));
            root.querySelectorAll(".menu-bar__item").forEach((entry) => entry.classList.remove("is-open"));
            root.querySelectorAll(".menu-dropdown__item.is-focused").forEach((entry) => entry.classList.remove("is-focused"));
        };
        const openMenu = (item) => {
            if (!item) return;
            closeMenus();
            const dropdown = item.querySelector(".menu-dropdown");
            if (!dropdown) return;
            item.classList.add("is-open");
            dropdown.classList.remove("hidden");
        };
        const focusDropdownItem = (dropdown, direction = 1) => {
            const items = Array.from(dropdown.querySelectorAll(".menu-dropdown__item:not(.is-disabled)"));
            if (!items.length) return null;
            const currentIndex = items.findIndex((item) => item.classList.contains("is-focused"));
            const nextIndex = currentIndex === -1
                ? (direction > 0 ? 0 : items.length - 1)
                : (currentIndex + direction + items.length) % items.length;
            items.forEach((item) => item.classList.remove("is-focused"));
            items[nextIndex].classList.add("is-focused");
            return items[nextIndex];
        };

        Utils.delegate(root, "click", ".menu-bar__item", (event, item) => {
            event.stopPropagation();
            if (item.classList.contains("is-open")) closeMenus();
            else openMenu(item);
        }, { signal: controller.signal });

        Utils.delegate(root, "mouseover", ".menu-bar__item", (_event, item) => {
            if (!root.querySelector(".menu-bar__item.is-open")) return;
            openMenu(item);
        }, { signal: controller.signal });

        Utils.delegate(root, "click", ".menu-dropdown__item", (event, item) => {
            event.stopPropagation();
            if (item.classList.contains("is-disabled")) return;
            closeMenus();
            onAction(item.dataset.menuAction);
        }, { signal: controller.signal });

        Utils.delegate(root, "mouseover", ".menu-dropdown__item", (_event, item) => {
            if (item.classList.contains("is-disabled")) return;
            item.parentElement.querySelectorAll(".menu-dropdown__item.is-focused").forEach((entry) => entry.classList.remove("is-focused"));
            item.classList.add("is-focused");
        }, { signal: controller.signal });

        bar.addEventListener("keydown", (event) => {
            const openItem = root.querySelector(".menu-bar__item.is-open");
            const items = topItems();
            const activeTop = document.activeElement.closest(".menu-bar__item") || openItem || items[0];
            if (!activeTop) return;
            if (event.key === "Escape") {
                if (openItem) {
                    event.preventDefault();
                    closeMenus();
                    activeTop.focus();
                }
                return;
            }
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                const index = items.indexOf(activeTop);
                const next = items[(index + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length];
                if (openItem) openMenu(next);
                next.focus();
                return;
            }
            if (event.key === "ArrowDown") {
                event.preventDefault();
                openMenu(activeTop);
                focusDropdownItem(activeTop.querySelector(".menu-dropdown"), 1);
                return;
            }
            if (event.key === "ArrowUp" && openItem) {
                event.preventDefault();
                focusDropdownItem(openItem.querySelector(".menu-dropdown"), -1);
                return;
            }
            if ((event.key === "Enter" || event.key === " ") && document.activeElement.classList.contains("menu-bar__item")) {
                event.preventDefault();
                openMenu(activeTop);
                focusDropdownItem(activeTop.querySelector(".menu-dropdown"), 1);
            }
        }, { signal: controller.signal });

        document.addEventListener("mousedown", (event) => {
            if (!root.contains(event.target)) {
                closeMenus();
            }
        }, { signal: controller.signal });
    }

    function createAppDefinitions(system) {
        const definitions = {};

        const explorerFactory = (defaultMeta) => ({
            meta(appData = {}) {
                return {
                    title: defaultMeta.title,
                    taskTitle: defaultMeta.taskTitle || defaultMeta.title,
                    icon: defaultMeta.icon,
                    width: defaultMeta.width || 620,
                    height: defaultMeta.height || 430,
                    minWidth: 360,
                    minHeight: 240
                };
            },
            create(instance) {
                let state = {
                    mode: instance.appData.mode || defaultMeta.mode || null,
                    path: instance.appData.path || defaultMeta.path || "C:\\",
                    view: instance.appData.view || "icons",
                    history: [],
                    historyIndex: -1,
                    selectedKey: null
                };

                const content = instance.content;
                content.innerHTML = `
                    <div class="app-frame explorer">
                        <div class="window-toolbar">
                            <div class="window-toolbar__handle"></div>
                            <button type="button" class="toolbar-button toolbar-button--icon" data-command="back" data-tooltip="Back"><span class="app-toolbar-icon app-toolbar-icon--back"></span></button>
                            <button type="button" class="toolbar-button toolbar-button--icon" data-command="forward" data-tooltip="Forward"><span class="app-toolbar-icon app-toolbar-icon--forward"></span></button>
                            <button type="button" class="toolbar-button toolbar-button--icon" data-command="up" data-tooltip="Up"><span class="app-toolbar-icon app-toolbar-icon--up"></span></button>
                            <button type="button" class="toolbar-button toolbar-button--icon" data-command="toggle-view" data-tooltip="View"><span class="app-toolbar-icon app-toolbar-icon--view"></span></button>
                            <div class="toolbar-separator"></div>
                            <button type="button" class="toolbar-button" data-command="empty-bin">Empty Bin</button>
                        </div>
                        <div class="toolbar">
                            <span class="toolbar-label">Address</span>
                            <div class="toolbar-address">
                                <input type="text" class="toolbar-address__input" data-role="address">
                            </div>
                        </div>
                        <div class="explorer-content win-inset" data-role="content"></div>
                        <div class="status-bar">
                            <div class="status-field" data-role="status"></div>
                            <div class="status-field" data-role="detail"></div>
                        </div>
                    </div>
                `;

                const address = content.querySelector("[data-role='address']");
                const contentRoot = content.querySelector("[data-role='content']");
                const status = content.querySelector("[data-role='status']");
                const detail = content.querySelector("[data-role='detail']");
                const emptyBinButton = content.querySelector("[data-command='empty-bin']");
                const backButton = content.querySelector("[data-command='back']");
                const forwardButton = content.querySelector("[data-command='forward']");
                const upButton = content.querySelector("[data-command='up']");

                const pushHistory = () => {
                    state.history = state.history.slice(0, state.historyIndex + 1);
                    state.history.push({ mode: state.mode, path: state.path, view: state.view });
                    state.historyIndex = state.history.length - 1;
                };

                const getTitle = () => {
                    if (state.mode === "my-computer") return "My Computer";
                    if (state.mode === "recycle-bin") return "Recycle Bin";
                    if (state.mode === "network-neighborhood") return "Network Neighborhood";
                    return state.path.split("\\").filter(Boolean).pop() || state.path.slice(0, 2);
                };

                const getEntries = () => {
                    if (state.mode === "my-computer") {
                        return [
                            { key: "A:\\", name: "3 1/2 Floppy (A:)", path: "A:\\", node: system.vfs.getNode("A:\\"), icon: "drive-floppy", kind: "drive" },
                            { key: "C:\\", name: "Local Disk (C:)", path: "C:\\", node: system.vfs.getNode("C:\\"), icon: "drive-disk", kind: "drive" },
                            { key: "D:\\", name: "CD-ROM (D:)", path: "D:\\", node: system.vfs.getNode("D:\\"), icon: "drive-cd", kind: "drive" },
                            { key: "shell:documents", name: "My Documents", app: "my-documents", icon: "documents", kind: "special" },
                            { key: "app:control-panel", name: "Control Panel", app: "control-panel", icon: "control", kind: "special" }
                        ];
                    }
                    if (state.mode === "network-neighborhood") {
                        return [
                            { key: "node-alpha", name: "WORKSTATION-01", icon: "computer", kind: "special" },
                            { key: "node-beta", name: "DESIGN-LAB", icon: "computer", kind: "special" }
                        ];
                    }
                    const sourcePath = state.mode === "recycle-bin" ? "C:\\Recycle Bin" : state.path;
                    return system.vfs.list(sourcePath).map((entry) => ({
                        key: entry.path,
                        name: entry.name,
                        path: entry.path,
                        node: entry.node,
                        icon: ShellIcons.fromNode(system, entry.path, entry.node),
                        kind: entry.node.type
                    })).sort((a, b) => {
                        const aFolder = a.kind === "dir" || a.kind === "drive";
                        const bFolder = b.kind === "dir" || b.kind === "drive";
                        return Number(bFolder) - Number(aFolder) || a.name.localeCompare(b.name);
                    });
                };

                const findEntry = (key) => getEntries().find((item) => item.key === key) || null;

                const openEntry = (entry) => {
                    if (!entry) return;
                    if (entry.app) {
                        system.windows.create(entry.app);
                        return;
                    }
                    if (entry.kind === "special" && state.mode === "network-neighborhood") {
                        system.dialogs.alert("Network Neighborhood", `${entry.name} is not responding right now.`, "info");
                        return;
                    }
                    if (entry.node && entry.node.type === "shortcut") {
                        system.openTarget(entry.node.target || (entry.node.meta && entry.node.meta.target));
                        return;
                    }
                    if (entry.node && (entry.node.type === "dir" || entry.node.type === "drive")) {
                        navigate({ path: entry.path, mode: null });
                        return;
                    }
                    if (entry.node && (entry.node.type === "image" || Utils.isImageName(entry.name))) {
                        system.windows.create("paint", { path: entry.path });
                        return;
                    }
                    if (entry.node && Utils.isTextName(entry.name)) {
                        system.windows.create("notepad", { path: entry.path });
                        return;
                    }
                    system.dialogs.alert("Explorer", "This item cannot be opened.", "error");
                };

                const renameEntry = async (entry) => {
                    if (!entry || !entry.path) return;
                    const result = await system.dialogs.prompt({
                        title: "Rename",
                        message: "Type a new name for this item.",
                        type: "info",
                        fields: [{ id: "name", label: "Name", value: entry.name }],
                        buttons: [{ id: "ok", label: "OK" }, { id: "cancel", label: "Cancel" }]
                    });
                    if (result.action !== "ok") return;
                    const renameResult = system.vfs.rename(entry.path, result.values.name);
                    if (!renameResult.ok) {
                        await system.dialogs.alert("Explorer", renameResult.reason, "error");
                        return;
                    }
                    state.selectedKey = renameResult.path;
                    renderEntries();
                    system.windows.refreshShell();
                };

                const updateDetail = (entry) => {
                    if (!entry) {
                        detail.textContent = "";
                        return;
                    }
                    const props = entry.path ? system.vfs.getProperties(entry.path) : null;
                    detail.textContent = props
                        ? `${descriptionForNode(entry.path || entry.key, entry.node || { type: entry.kind })} • ${Utils.formatSize(props.size)}`
                        : descriptionForNode(entry.path || entry.key, entry.node || { type: entry.kind });
                };

                const syncToolbar = () => {
                    const canGoBack = state.historyIndex > 0;
                    const canGoForward = state.historyIndex > -1 && state.historyIndex < state.history.length - 1;
                    const atDriveRoot = !state.mode && ["C:\\", "A:\\", "D:\\"].includes(state.path.toUpperCase());
                    backButton.disabled = !canGoBack;
                    forwardButton.disabled = !canGoForward;
                    upButton.disabled = atDriveRoot && !state.mode;
                    [backButton, forwardButton, upButton].forEach((button) => {
                        button.classList.toggle("is-disabled", button.disabled);
                    });
                };

                const renderEntries = () => {
                    const entries = getEntries();
                    instance.setTitle(getTitle());
                    instance.setTaskTitle(getTitle());
                    address.value = state.mode ? getTitle() : state.path;
                    emptyBinButton.style.display = state.mode === "recycle-bin" ? "inline-flex" : "none";
                    status.textContent = state.selectedKey ? "1 object selected" : `${entries.length} object(s)`;
                    updateDetail(findEntry(state.selectedKey));
                    syncToolbar();
                    if (!entries.length) {
                        contentRoot.innerHTML = '<div class="explorer-empty">This folder is empty.</div>';
                        contentRoot.tabIndex = 0;
                        return;
                    }
                    if (state.view === "list") {
                        contentRoot.innerHTML = `
                            <div class="explorer-list">
                                <div class="explorer-list__header">
                                    <div>Name</div><div>Type</div><div>Size</div><div>Modified</div>
                                </div>
                                ${entries.map((entry) => {
                                    const props = entry.path ? system.vfs.getProperties(entry.path) : null;
                                    return `
                                        <div class="explorer-row${state.selectedKey === entry.key ? " is-selected" : ""}" data-entry-key="${Utils.escapeHtml(entry.key)}">
                                            <div style="display:flex; align-items:center; gap:6px;">${ShellIcons.small(entry.icon)}<span>${Utils.escapeHtml(entry.name.replace(/\.lnk$/i, ""))}</span></div>
                                            <div>${Utils.escapeHtml(descriptionForNode(entry.path || entry.key, entry.node || { type: entry.kind }))}</div>
                                            <div>${props ? Utils.escapeHtml(Utils.formatSize(props.size)) : ""}</div>
                                            <div>${props ? Utils.escapeHtml(Utils.formatExplorerDate(new Date(props.modifiedAt))) : ""}</div>
                                        </div>
                                    `;
                                }).join("")}
                            </div>
                        `;
                    } else {
                        contentRoot.innerHTML = `<div class="explorer-grid">
                            ${entries.map((entry) => `
                                <button type="button" class="shell-item${state.selectedKey === entry.key ? " is-selected" : ""}" data-entry-key="${Utils.escapeHtml(entry.key)}">
                                    ${ShellIcons.large(entry.icon)}
                                    <div class="shell-item__name">${Utils.escapeHtml(entry.name.replace(/\.lnk$/i, ""))}</div>
                                </button>
                            `).join("")}
                        </div>`;
                    }
                    contentRoot.tabIndex = 0;
                };

                const navigate = (next, options = {}) => {
                    state.mode = typeof next.mode === "undefined" ? state.mode : next.mode;
                    state.path = next.path || state.path;
                    if (next.view) state.view = next.view;
                    state.selectedKey = null;
                    if (!options.fromHistory) pushHistory();
                    renderEntries();
                };

                pushHistory();
                renderEntries();

                Utils.delegate(contentRoot, "click", "[data-entry-key]", (_event, element) => {
                    state.selectedKey = element.dataset.entryKey;
                    renderEntries();
                }, { signal: instance.controller.signal });

                Utils.delegate(contentRoot, "dblclick", "[data-entry-key]", (_event, element) => {
                    const entry = findEntry(element.dataset.entryKey);
                    openEntry(entry);
                }, { signal: instance.controller.signal });

                contentRoot.addEventListener("click", (event) => {
                    if (event.target === contentRoot) {
                        state.selectedKey = null;
                        renderEntries();
                    }
                }, { signal: instance.controller.signal });

                contentRoot.addEventListener("contextmenu", (event) => {
                    const element = event.target.closest("[data-entry-key]");
                    if (!element) return;
                    event.preventDefault();
                    state.selectedKey = element.dataset.entryKey;
                    renderEntries();
                    const entry = findEntry(state.selectedKey);
                    const inRecycle = state.mode === "recycle-bin";
                    const items = [{ label: "Open", action: () => openEntry(entry) }, { separator: true }];
                    if (inRecycle && entry.path) items.push({ label: "Restore", action: () => system.desktop.restoreRecycleItem(entry.path) });
                    if (!inRecycle && entry.path && entry.node && entry.node.type !== "drive") items.push({ label: "Rename", shortcut: "F2", action: () => renameEntry(entry) });
                    if (entry.path && entry.node && entry.node.type !== "drive") items.push({ label: "Delete", action: () => system.desktop.deletePaths([entry.path]) });
                    items.push({ separator: true });
                    items.push({ label: "Properties", action: () => system.desktop.showProperties(entry.path || entry.key, entry.node || { type: entry.kind }) });
                    system.contextMenu.show(event.clientX, event.clientY, items);
                }, { signal: instance.controller.signal });

                contentRoot.addEventListener("keydown", (event) => {
                    if (!state.selectedKey) {
                        if (event.key === "Backspace") {
                            event.preventDefault();
                            backButton.click();
                        }
                        return;
                    }
                    const entry = findEntry(state.selectedKey);
                    if (!entry) return;
                    if (event.key === "Enter") {
                        event.preventDefault();
                        openEntry(entry);
                    }
                    if (event.key === "Delete" && entry.path && entry.node.type !== "drive") {
                        event.preventDefault();
                        system.desktop.deletePaths([entry.path]);
                    }
                    if (event.key === "F2" && entry.path && entry.node.type !== "drive") {
                        event.preventDefault();
                        renameEntry(entry);
                    }
                    if (event.key === "Backspace") {
                        event.preventDefault();
                        backButton.click();
                    }
                }, { signal: instance.controller.signal });

                backButton.addEventListener("click", () => {
                    if (state.historyIndex <= 0) return;
                    state.historyIndex -= 1;
                    const snapshot = state.history[state.historyIndex];
                    state = Object.assign({}, state, snapshot);
                    renderEntries();
                }, { signal: instance.controller.signal });

                forwardButton.addEventListener("click", () => {
                    if (state.historyIndex >= state.history.length - 1) return;
                    state.historyIndex += 1;
                    const snapshot = state.history[state.historyIndex];
                    state = Object.assign({}, state, snapshot);
                    renderEntries();
                }, { signal: instance.controller.signal });

                upButton.addEventListener("click", () => {
                    if (state.mode) {
                        navigate({ mode: "my-computer", path: "C:\\" });
                        return;
                    }
                    if (["C:\\", "A:\\", "D:\\"].includes(state.path.toUpperCase())) return;
                    const parent = state.path.slice(0, state.path.lastIndexOf("\\")) || `${state.path.slice(0, 2)}\\`;
                    navigate({ path: parent });
                }, { signal: instance.controller.signal });

                content.querySelector("[data-command='toggle-view']").addEventListener("click", () => {
                    state.view = state.view === "icons" ? "list" : "icons";
                    renderEntries();
                }, { signal: instance.controller.signal });

                emptyBinButton.addEventListener("click", async () => {
                    const confirmed = await system.dialogs.confirm("Recycle Bin", "Permanently delete all items?", "warn");
                    if (!confirmed) return;
                    system.vfs.emptyRecycleBin();
                    system.windows.refreshShell();
                }, { signal: instance.controller.signal });

                address.addEventListener("keydown", (event) => {
                    if (event.key !== "Enter") return;
                    const value = address.value.trim();
                    if (/^my computer$/i.test(value)) {
                        navigate({ mode: "my-computer", path: "C:\\" });
                        return;
                    }
                    const normalized = system.vfs.normalizePath(value, state.path);
                    if (system.vfs.exists(normalized) && system.vfs.isDirectory(normalized)) navigate({ path: normalized });
                    else system.dialogs.alert("Explorer", "The specified path could not be found.", "error");
                }, { signal: instance.controller.signal });

                return {
                    refresh() {
                        renderEntries();
                    }
                };
            }
        });

        definitions.explorer = explorerFactory({ title: "Explorer", icon: "folder", path: "C:\\" });
        definitions["my-computer"] = explorerFactory({ title: "My Computer", icon: "computer", mode: "my-computer" });
        definitions["my-documents"] = explorerFactory({ title: "My Documents", icon: "documents", path: "C:\\My Documents" });
        definitions["recycle-bin"] = explorerFactory({ title: "Recycle Bin", icon: "recycle", mode: "recycle-bin", path: "C:\\Recycle Bin" });
        definitions["network-neighborhood"] = explorerFactory({ title: "Network Neighborhood", icon: "network", mode: "network-neighborhood" });

        definitions["control-panel"] = {
            meta: { title: "Control Panel", taskTitle: "Control Panel", icon: "control", width: 560, height: 420, minWidth: 360, minHeight: 240 },
            create(instance) {
                instance.content.innerHTML = `
                    <div class="control-panel">
                        <div class="control-panel__grid">
                            ${[
                                ["display-properties", "Display", "display"],
                                ["date-time", "Date/Time", "clock"],
                                ["mouse-settings", "Mouse", "find"],
                                ["keyboard-settings", "Keyboard", "program"],
                                ["sounds-settings", "Sounds", "settings"],
                                ["system-properties", "System", "computer"],
                                ["add-remove-programs", "Add/Remove Programs", "control"],
                                ["network-settings", "Network", "network"],
                                ["printers-settings", "Printers", "program"],
                                ["internet-options", "Internet Options", "internet-explorer"]
                            ].map(([app, label, icon]) => `
                                <button type="button" class="control-item" data-app="${app}">
                                    ${ShellIcons.large(icon)}
                                    <div class="control-item__label">${label}</div>
                                </button>
                            `).join("")}
                        </div>
                    </div>
                `;
                Utils.delegate(instance.content, "dblclick", ".control-item", (_event, item) => system.windows.create(item.dataset.app), { signal: instance.controller.signal });
                Utils.delegate(instance.content, "click", ".control-item", (_event, item) => system.windows.create(item.dataset.app), { signal: instance.controller.signal });
                return {};
            }
        };

        definitions["display-properties"] = {
            meta: { title: "Display Properties", icon: "display", width: 420, height: 340, minWidth: 320, minHeight: 240 },
            create(instance) {
                const current = system.state.get("settings.wallpaper");
                instance.content.innerHTML = `
                    <div class="settings-panel">
                        <div class="settings-panel__preview">
                            <div class="desktop ${current}" style="position:relative; inset:auto; height:150px; border:2px inset #808080;"></div>
                        </div>
                        <label>Wallpaper
                            <select class="field field--classic" data-role="wallpaper">
                                <option value="wallpaper-teal">Windows 98 Teal</option>
                                <option value="wallpaper-blue">Classic Blue</option>
                                <option value="wallpaper-dark">Dark Workspace</option>
                                <option value="wallpaper-clouds">Clouds</option>
                                <option value="wallpaper-setup">Setup Blue</option>
                            </select>
                        </label>
                        <div style="display:flex; justify-content:flex-end; gap:6px;">
                            <button type="button" class="win-button" data-action="apply">Apply</button>
                            <button type="button" class="win-button" data-action="ok">OK</button>
                            <button type="button" class="win-button" data-action="cancel">Cancel</button>
                        </div>
                    </div>
                `;
                const preview = instance.content.querySelector(".desktop");
                const select = instance.content.querySelector("[data-role='wallpaper']");
                select.value = current;
                select.addEventListener("change", () => {
                    preview.className = `desktop ${select.value}`;
                }, { signal: instance.controller.signal });
                const apply = () => {
                    system.state.set("settings.wallpaper", select.value);
                    system.desktop.applyWallpaper(select.value);
                };
                Utils.delegate(instance.content, "click", "[data-action]", (_event, button) => {
                    if (button.dataset.action === "apply") apply();
                    if (button.dataset.action === "ok") { apply(); instance.close(); }
                    if (button.dataset.action === "cancel") instance.close();
                }, { signal: instance.controller.signal });
                return {};
            }
        };

        definitions["date-time"] = {
            meta: { title: "Date/Time Properties", icon: "clock", width: 380, height: 280, minWidth: 320, minHeight: 240 },
            create(instance) {
                const now = system.clock.getSystemTime();
                instance.content.innerHTML = `
                    <div class="settings-panel">
                        <label>Date<input class="field field--classic" type="date" data-field="date"></label>
                        <label>Time<input class="field field--classic" type="time" data-field="time"></label>
                        <div style="display:flex; justify-content:flex-end; gap:6px; margin-top:auto;">
                            <button type="button" class="win-button" data-action="apply">Apply</button>
                            <button type="button" class="win-button" data-action="ok">OK</button>
                            <button type="button" class="win-button" data-action="cancel">Cancel</button>
                        </div>
                    </div>
                `;
                instance.content.querySelector("[data-field='date']").value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
                instance.content.querySelector("[data-field='time']").value = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
                const apply = () => {
                    const nextDate = new Date(`${instance.content.querySelector("[data-field='date']").value}T${instance.content.querySelector("[data-field='time']").value}:00`);
                    if (!Number.isNaN(nextDate.getTime())) system.clock.setSystemTime(nextDate);
                };
                Utils.delegate(instance.content, "click", "[data-action]", (_event, button) => {
                    if (button.dataset.action === "apply") apply();
                    if (button.dataset.action === "ok") { apply(); instance.close(); }
                    if (button.dataset.action === "cancel") instance.close();
                }, { signal: instance.controller.signal });
                return {};
            }
        };

        const sliderSettingsFactory = (title, icon, labels) => ({
            meta: { title, icon, width: 400, height: 260, minWidth: 320, minHeight: 220 },
            create(instance) {
                instance.content.innerHTML = `
                    <div class="settings-panel">
                        ${labels.map((label) => `
                            <div class="range-row">
                                <span style="width:110px;">${label.text}</span>
                                <input type="range" min="1" max="10" value="${system.state.get(`settings.${label.key}`) || 5}" data-key="${label.key}">
                            </div>
                        `).join("")}
                        <div style="display:flex; justify-content:flex-end; gap:6px; margin-top:auto;">
                            <button type="button" class="win-button" data-action="ok">OK</button>
                            <button type="button" class="win-button" data-action="cancel">Cancel</button>
                        </div>
                    </div>
                `;
                Utils.delegate(instance.content, "click", "[data-action]", (_event, button) => {
                    if (button.dataset.action === "ok") {
                        instance.content.querySelectorAll("input[type='range']").forEach((input) => system.state.set(`settings.${input.dataset.key}`, Number(input.value)));
                        instance.close();
                    }
                    if (button.dataset.action === "cancel") instance.close();
                }, { signal: instance.controller.signal });
                return {};
            }
        });

        definitions["mouse-settings"] = sliderSettingsFactory("Mouse Properties", "find", [{ key: "mouseSpeed", text: "Pointer speed" }]);
        definitions["keyboard-settings"] = sliderSettingsFactory("Keyboard Properties", "program", [
            { key: "keyboardDelay", text: "Repeat delay" },
            { key: "keyboardRate", text: "Repeat rate" }
        ]);

        definitions["sounds-settings"] = {
            meta: { title: "Sounds Properties", icon: "settings", width: 420, height: 300, minWidth: 320, minHeight: 220 },
            create(instance) {
                instance.content.innerHTML = `
                    <div class="settings-panel">
                        <div class="list-box win-inset">
                            ${["Default Beep", "Asterisk", "Exclamation", "Program Error", "Start Windows", "Exit Windows"].map((item, index) => `<div class="list-box__item${index === 0 ? " is-selected" : ""}">${item}</div>`).join("")}
                        </div>
                        <div style="display:flex; justify-content:flex-end; gap:6px; margin-top:auto;">
                            <button type="button" class="win-button" data-action="ok">OK</button>
                        </div>
                    </div>
                `;
                Utils.delegate(instance.content, "click", "[data-action='ok']", () => instance.close(), { signal: instance.controller.signal });
                return {};
            }
        };

        definitions["system-properties"] = {
            meta: { title: "System Properties", icon: "computer", width: 430, height: 280, minWidth: 320, minHeight: 220 },
            create(instance) {
                instance.content.innerHTML = `
                    <div class="settings-panel">
                        <div class="settings-panel__preview win-inset">
                            <h3>Microsoft Windows 98 Second Edition</h3>
                            <p>Registered to: Administrator</p>
                            <p>Computer: WIN98-DEMO</p>
                            <p>Memory: 64.0 MB RAM</p>
                        </div>
                        <div style="display:flex; justify-content:space-between; gap:6px;">
                            <button type="button" class="win-button" data-action="about">About</button>
                            <button type="button" class="win-button" data-action="ok">OK</button>
                        </div>
                    </div>
                `;
                Utils.delegate(instance.content, "click", "[data-action='about']", () => system.windows.create("about-windows"), { signal: instance.controller.signal });
                Utils.delegate(instance.content, "click", "[data-action='ok']", () => instance.close(), { signal: instance.controller.signal });
                return {};
            }
        };

        definitions["about-windows"] = {
            meta: { title: "About Windows", icon: "computer", width: 360, height: 220, minWidth: 300, minHeight: 200 },
            create(instance) {
                instance.content.innerHTML = `
                    <div class="settings-panel">
                        <div class="settings-panel__preview win-inset" style="display:flex; align-items:center; gap:14px;">
                            ${ShellIcons.large("computer")}
                            <div>
                                <h3 style="margin:0 0 8px;">Windows 98</h3>
                                <p style="margin:0 0 6px;">Second Edition simulation</p>
                                <p style="margin:0;">Built as a front-end shell showcase.</p>
                            </div>
                        </div>
                        <div style="display:flex; justify-content:flex-end;">
                            <button type="button" class="win-button" data-action="ok">OK</button>
                        </div>
                    </div>
                `;
                Utils.delegate(instance.content, "click", "[data-action='ok']", () => instance.close(), { signal: instance.controller.signal });
                return {};
            }
        };

        definitions["add-remove-programs"] = {
            meta: { title: "Add/Remove Programs", icon: "control", width: 440, height: 320, minWidth: 340, minHeight: 240 },
            create(instance) {
                instance.content.innerHTML = `
                    <div class="settings-panel">
                        <div class="list-box win-inset">
                            ${["Internet Explorer 5", "Windows Accessories", "Retro Paint", "Minesweeper", "Solitaire Preview"].map((item, index) => `<div class="list-box__item${index === 0 ? " is-selected" : ""}">${item}</div>`).join("")}
                        </div>
                        <div style="display:flex; justify-content:flex-end; gap:6px;">
                            <button type="button" class="win-button" data-action="remove">Remove</button>
                            <button type="button" class="win-button" data-action="ok">OK</button>
                        </div>
                    </div>
                `;
                Utils.delegate(instance.content, "click", "[data-action='remove']", () => system.dialogs.alert("Add/Remove Programs", "Program removal is disabled in this demo.", "info"), { signal: instance.controller.signal });
                Utils.delegate(instance.content, "click", "[data-action='ok']", () => instance.close(), { signal: instance.controller.signal });
                return {};
            }
        };

        definitions["network-settings"] = {
            meta: { title: "Network", icon: "network", width: 430, height: 280, minWidth: 320, minHeight: 220 },
            create(instance) {
                instance.content.innerHTML = `
                    <div class="settings-panel">
                        <div class="settings-panel__preview win-inset">
                            <h3>Installed Components</h3>
                            <ul>
                                <li>Client for Microsoft Networks</li>
                                <li>TCP/IP Dial-Up Adapter</li>
                                <li>File and Printer Sharing</li>
                            </ul>
                        </div>
                        <div style="display:flex; justify-content:flex-end;">
                            <button type="button" class="win-button" data-action="ok">OK</button>
                        </div>
                    </div>
                `;
                Utils.delegate(instance.content, "click", "[data-action='ok']", () => instance.close(), { signal: instance.controller.signal });
                return {};
            }
        };

        definitions["printers-settings"] = {
            meta: { title: "Printers", icon: "program", width: 420, height: 260, minWidth: 320, minHeight: 220 },
            create(instance) {
                instance.content.innerHTML = `
                    <div class="settings-panel">
                        <div class="list-box win-inset">
                            <div class="list-box__item is-selected">HP DeskJet 690C</div>
                            <div class="list-box__item">Generic / Text Only</div>
                        </div>
                        <div style="display:flex; justify-content:flex-end; gap:6px;">
                            <button type="button" class="win-button" data-action="ok">OK</button>
                        </div>
                    </div>
                `;
                Utils.delegate(instance.content, "click", "[data-action='ok']", () => instance.close(), { signal: instance.controller.signal });
                return {};
            }
        };

        definitions["internet-options"] = {
            meta: { title: "Internet Options", icon: "internet-explorer", width: 440, height: 260, minWidth: 340, minHeight: 220 },
            create(instance) {
                instance.content.innerHTML = `
                    <div class="settings-panel">
                        <label>Home page
                            <input class="field field--classic" data-role="homepage" type="text" value="${Utils.escapeHtml(system.state.get("settings.ieHomePage") || "about:home")}">
                        </label>
                        <div class="settings-panel__preview win-inset">
                            <p style="margin:0 0 6px;"><strong>Browsing history</strong></p>
                            <p style="margin:0;">Temporary internet files are simulated in memory only.</p>
                        </div>
                        <div style="display:flex; justify-content:flex-end; gap:6px; margin-top:auto;">
                            <button type="button" class="win-button" data-action="apply">Apply</button>
                            <button type="button" class="win-button" data-action="ok">OK</button>
                            <button type="button" class="win-button" data-action="cancel">Cancel</button>
                        </div>
                    </div>
                `;
                const input = instance.content.querySelector("[data-role='homepage']");
                const apply = () => {
                    const home = new IEMockEngine(system, {}).normalize(input.value || "about:home");
                    system.state.set("settings.ieHomePage", home);
                };
                Utils.delegate(instance.content, "click", "[data-action]", (_event, button) => {
                    if (button.dataset.action === "apply") apply();
                    if (button.dataset.action === "ok") { apply(); instance.close(); }
                    if (button.dataset.action === "cancel") instance.close();
                }, { signal: instance.controller.signal });
                return {};
            }
        };

        definitions["help-viewer"] = {
            meta: { title: "Windows Help", icon: "help", width: 520, height: 380, minWidth: 360, minHeight: 260 },
            create(instance) {
                instance.content.innerHTML = `
                    <div class="settings-panel">
                        <div class="settings-panel__preview win-inset">
                            <h3>Windows 98 Help Topics</h3>
                            <p>Keyboard shortcuts:</p>
                            <ul>
                                <li>Enter: open selected desktop item</li>
                                <li>Delete: send selected item to Recycle Bin</li>
                                <li>F2: rename selected desktop item</li>
                                <li>Esc: close the Start menu</li>
                            </ul>
                        </div>
                        <div style="display:flex; justify-content:flex-end;">
                            <button type="button" class="win-button" data-action="ok">Close</button>
                        </div>
                    </div>
                `;
                Utils.delegate(instance.content, "click", "[data-action='ok']", () => instance.close(), { signal: instance.controller.signal });
                return {};
            }
        };

        definitions["run-dialog"] = {
            meta: { title: "Run", icon: "run", width: 360, height: 180, minWidth: 320, minHeight: 170 },
            create(instance) {
                instance.content.innerHTML = `
                    <div class="settings-panel">
                        <p style="margin:0;">Type the name of a program, folder, document, or internet resource.</p>
                        <label>Open
                            <input class="field field--classic" data-role="command" type="text" value="">
                        </label>
                        <div style="display:flex; justify-content:flex-end; gap:6px; margin-top:auto;">
                            <button type="button" class="win-button" data-action="ok">OK</button>
                            <button type="button" class="win-button" data-action="cancel">Cancel</button>
                        </div>
                    </div>
                `;
                const input = instance.content.querySelector("[data-role='command']");
                setTimeout(() => input.focus(), 20);
                const execute = async () => {
                    const value = input.value.trim();
                    if (!value) return;
                    const result = await system.runCommand(value);
                    if (result !== false) instance.close();
                };
                Utils.delegate(instance.content, "click", "[data-action='ok']", () => execute(), { signal: instance.controller.signal });
                Utils.delegate(instance.content, "click", "[data-action='cancel']", () => instance.close(), { signal: instance.controller.signal });
                input.addEventListener("keydown", (event) => {
                    if (event.key === "Enter") execute();
                }, { signal: instance.controller.signal });
                return {};
            }
        };

        definitions["internet-explorer"] = {
            meta: { title: "Microsoft Internet Explorer", icon: "internet-explorer", width: 700, height: 480, minWidth: 440, minHeight: 280 },
            create(instance) {
                instance.content.innerHTML = `
                    <div class="app-frame browser">
                        ${buildMenuBar([
                            { label: "File", items: [{ id: "go-home", label: "Home" }, { id: "set-home", label: "Set As Home Page" }, { separator: true }, { id: "close", label: "Close", shortcut: "Alt+F4" }] },
                            { label: "Edit", items: [{ id: "copy-url", label: "Copy Address", shortcut: "Ctrl+C" }] },
                            { label: "View", items: [{ id: "refresh", label: "Refresh", shortcut: "F5" }] },
                            { label: "Favorites", items: [{ id: "fav-home", label: "Windows 98 Home" }, { id: "fav-news", label: "Headline News" }, { id: "fav-help", label: "Help" }] },
                            { label: "Help", items: [{ id: "about", label: "About Internet Explorer" }] }
                        ])}
                        <div class="window-toolbar">
                            <div class="window-toolbar__handle"></div>
                            <div class="browser-toolbar__cluster">
                                <button type="button" class="toolbar-button toolbar-button--icon" data-action="back" data-tooltip="Back"><span class="app-toolbar-icon app-toolbar-icon--back"></span></button>
                                <button type="button" class="toolbar-button toolbar-button--icon" data-action="forward" data-tooltip="Forward"><span class="app-toolbar-icon app-toolbar-icon--forward"></span></button>
                                <button type="button" class="toolbar-button toolbar-button--icon" data-action="stop" data-tooltip="Stop"><span class="app-toolbar-icon app-toolbar-icon--stop"></span></button>
                                <button type="button" class="toolbar-button toolbar-button--icon" data-action="refresh" data-tooltip="Refresh"><span class="app-toolbar-icon app-toolbar-icon--refresh"></span></button>
                                <button type="button" class="toolbar-button toolbar-button--icon" data-action="home" data-tooltip="Home"><span class="app-toolbar-icon app-toolbar-icon--home"></span></button>
                            </div>
                        </div>
                        <div class="toolbar">
                            <span class="toolbar-label">Address</span>
                            <div class="toolbar-address">
                                <input type="text" class="browser-address__input" data-role="address">
                                <button type="button" class="toolbar-button" data-action="go">Go</button>
                            </div>
                        </div>
                        <div class="browser-content win-inset" data-role="page"></div>
                        <div class="browser-status">
                            <div class="status-field" data-role="status">Done</div>
                            <div class="status-field browser-progress"><div class="browser-progress__bar" data-role="progress"></div></div>
                        </div>
                    </div>
                `;
                const page = instance.content.querySelector("[data-role='page']");
                const address = instance.content.querySelector("[data-role='address']");
                const status = instance.content.querySelector("[data-role='status']");
                const progress = instance.content.querySelector("[data-role='progress']");
                const toolbarButtons = {
                    back: instance.content.querySelector("[data-action='back']"),
                    forward: instance.content.querySelector("[data-action='forward']"),
                    stop: instance.content.querySelector("[data-action='stop']")
                };
                const browser = new IEMockEngine(system, {
                    setTitle: (title) => instance.setTitle(title),
                    setAddress: (url) => { address.value = url; },
                    setStatus: (text) => { status.textContent = text; },
                    setContent: (html) => { page.innerHTML = html; },
                    setProgress: (value) => { progress.style.width = `${value}%`; },
                    setNavState: ({ canBack, canForward, isLoading }) => {
                        toolbarButtons.back.disabled = !canBack;
                        toolbarButtons.forward.disabled = !canForward;
                        toolbarButtons.stop.disabled = !isLoading;
                        toolbarButtons.back.classList.toggle("is-disabled", !canBack);
                        toolbarButtons.forward.classList.toggle("is-disabled", !canForward);
                        toolbarButtons.stop.classList.toggle("is-disabled", !isLoading);
                    }
                });
                bindMenuBar(instance.content, instance.controller, (action) => {
                    if (action === "go-home" || action === "fav-home") browser.navigate(browser.getHomeUrl());
                    if (action === "fav-news") browser.navigate("http://news/");
                    if (action === "fav-help") browser.navigate("http://help/");
                    if (action === "refresh") browser.refresh();
                    if (action === "copy-url") system.state.set("session.clipboardText", address.value);
                    if (action === "set-home") {
                        const saved = browser.setHomePage(browser.currentUrl);
                        system.clock.notify("Internet Explorer", `${saved} set as your home page.`);
                    }
                    if (action === "about") system.dialogs.alert("Internet Explorer", "Microsoft Internet Explorer 5.0\nRetro front-end edition", "info");
                    if (action === "close") instance.close();
                });
                Utils.delegate(instance.content, "click", "[data-action]", (_event, element) => {
                    if (element.disabled) return;
                    const action = element.dataset.action;
                    if (action === "back") browser.back();
                    if (action === "forward") browser.forward();
                    if (action === "stop") browser.stop();
                    if (action === "refresh") browser.refresh();
                    if (action === "home") browser.navigate(browser.getHomeUrl());
                    if (action === "go") browser.navigate(address.value);
                }, { signal: instance.controller.signal });
                page.addEventListener("click", (event) => {
                    const link = event.target.closest("a");
                    if (!link) return;
                    event.preventDefault();
                    browser.navigate(link.getAttribute("href"));
                }, { signal: instance.controller.signal });
                page.addEventListener("mouseover", (event) => {
                    const link = event.target.closest("a");
                    if (link) status.textContent = browser.normalize(link.getAttribute("href"));
                }, { signal: instance.controller.signal });
                page.addEventListener("mouseout", () => {
                    status.textContent = "Done";
                }, { signal: instance.controller.signal });
                address.addEventListener("keydown", (event) => {
                    if (event.key === "Enter") browser.navigate(address.value);
                }, { signal: instance.controller.signal });
                instance.element.addEventListener("keydown", (event) => {
                    if (event.key === "F5") {
                        event.preventDefault();
                        browser.refresh();
                    }
                    if (event.ctrlKey && event.key.toLowerCase() === "l") {
                        event.preventDefault();
                        address.focus();
                        address.select();
                    }
                }, { signal: instance.controller.signal });
                browser.navigate(instance.appData.url || browser.getHomeUrl());
                return {
                    destroy() {
                        browser.stop();
                    }
                };
            }
        };

        definitions.notepad = {
            meta: { title: "Untitled - Notepad", icon: "notepad", width: 560, height: 430, minWidth: 340, minHeight: 240 },
            create(instance) {
                let currentPath = instance.appData.path || null;
                let wordWrap = false;
                let dirty = false;
                let savedText = "";
                let history = [];
                let historyIndex = -1;
                let restoringHistory = false;
                let lastFindTerm = "";
                instance.content.innerHTML = `
                    <div class="app-frame notepad">
                        ${buildMenuBar([
                            { label: "File", items: [{ id: "new", label: "New", shortcut: "Ctrl+N" }, { id: "open", label: "Open...", shortcut: "Ctrl+O" }, { id: "save", label: "Save", shortcut: "Ctrl+S" }, { id: "save-as", label: "Save As...", shortcut: "Ctrl+Shift+S" }, { separator: true }, { id: "exit", label: "Exit", shortcut: "Alt+F4" }] },
                            { label: "Edit", items: [{ id: "undo", label: "Undo", shortcut: "Ctrl+Z" }, { id: "redo", label: "Redo", shortcut: "Ctrl+Y" }, { separator: true }, { id: "copy", label: "Copy", shortcut: "Ctrl+C" }, { id: "cut", label: "Cut", shortcut: "Ctrl+X" }, { id: "paste", label: "Paste", shortcut: "Ctrl+V" }, { id: "select-all", label: "Select All", shortcut: "Ctrl+A" }, { separator: true }, { id: "word-wrap", label: "Word Wrap" }] },
                            { label: "Search", items: [{ id: "find", label: "Find...", shortcut: "Ctrl+F" }, { id: "find-next", label: "Find Next", shortcut: "F3" }] },
                            { label: "Help", items: [{ id: "help", label: "Help Topics" }] }
                        ])}
                        <textarea class="notepad__editor win-inset" spellcheck="false"></textarea>
                        <div class="status-bar notepad__status">
                            <div class="status-field" data-role="position">Ln 1, Col 1</div>
                            <div class="status-field" data-role="mode">INS</div>
                            <div class="status-field" data-role="wrap">No Wrap</div>
                        </div>
                    </div>
                `;
                const editor = instance.content.querySelector(".notepad__editor");
                const position = instance.content.querySelector("[data-role='position']");
                const wrapStatus = instance.content.querySelector("[data-role='wrap']");

                const setTitle = () => {
                    const name = currentPath ? currentPath.split("\\").pop() : "Untitled";
                    instance.setTitle(`${dirty ? "*" : ""}${name} - Notepad`);
                    instance.setTaskTitle(name);
                };

                const updateStatus = () => {
                    const before = editor.value.slice(0, editor.selectionStart);
                    const lines = before.split("\n");
                    position.textContent = `Ln ${lines.length}, Col ${lines[lines.length - 1].length + 1}`;
                    wrapStatus.textContent = wordWrap ? "Word Wrap" : "No Wrap";
                };

                const captureSnapshot = () => ({
                    value: editor.value,
                    start: editor.selectionStart,
                    end: editor.selectionEnd
                });

                const applySnapshot = (snapshot) => {
                    if (!snapshot) return;
                    restoringHistory = true;
                    editor.value = snapshot.value;
                    editor.setSelectionRange(snapshot.start, snapshot.end);
                    restoringHistory = false;
                    updateDirtyState();
                    updateStatus();
                };

                const resetHistory = () => {
                    history = [captureSnapshot()];
                    historyIndex = 0;
                };

                const recordHistory = () => {
                    if (restoringHistory) return;
                    const snapshot = captureSnapshot();
                    const current = history[historyIndex];
                    if (current && current.value === snapshot.value && current.start === snapshot.start && current.end === snapshot.end) {
                        return;
                    }
                    history = history.slice(0, historyIndex + 1);
                    history.push(snapshot);
                    if (history.length > 100) history.shift();
                    historyIndex = history.length - 1;
                };

                const updateDirtyState = () => {
                    dirty = editor.value !== savedText;
                    setTitle();
                };

                const markSaved = () => {
                    savedText = editor.value;
                    dirty = false;
                    setTitle();
                    resetHistory();
                };

                const saveToPath = async (path) => {
                    const existing = system.vfs.getNode(path);
                    if (existing && existing.readOnly) {
                        await system.dialogs.alert("Notepad", "This file is read-only.", "error");
                        return false;
                    }
                    const result = system.vfs.writeFile(path, editor.value, { type: "file", meta: { icon: "text" } });
                    if (!result.ok) {
                        await system.dialogs.alert("Notepad", result.reason, "error");
                        return false;
                    }
                    currentPath = result.path;
                    markSaved();
                    system.windows.refreshShell();
                    return true;
                };

                const ensureCanDiscard = async () => {
                    if (!dirty) return true;
                    const result = await system.dialogs.prompt({
                        title: "Notepad",
                        message: "The text in the active document has changed.\n\nDo you want to save the changes?",
                        type: "warn",
                        buttons: [
                            { id: "save", label: "Save" },
                            { id: "discard", label: "Don't Save" },
                            { id: "cancel", label: "Cancel" }
                        ]
                    });
                    if (result.action === "save") return currentPath ? saveToPath(currentPath) : saveAs();
                    return result.action === "discard";
                };

                const openFile = async () => {
                    const result = await system.dialogs.prompt({
                        title: "Open",
                        message: "Type the path of a text file to open.",
                        type: "info",
                        fields: [{ id: "path", label: "Path", value: currentPath || "C:\\My Documents\\Welcome.txt" }],
                        buttons: [{ id: "ok", label: "OK" }, { id: "cancel", label: "Cancel" }]
                    });
                    if (result.action !== "ok") return;
                    const path = system.vfs.normalizePath(result.values.path || "", "C:\\My Documents");
                    const file = system.vfs.readFile(path);
                    if (typeof file !== "string") {
                        system.dialogs.alert("Notepad", "File not found or unsupported format.", "error");
                        return;
                    }
                    currentPath = path;
                    editor.value = file;
                    savedText = file;
                    dirty = false;
                    setTitle();
                    resetHistory();
                    updateStatus();
                };

                const saveAs = async () => {
                    const result = await system.dialogs.prompt({
                        title: "Save As",
                        message: "Type the path where this text file should be saved.",
                        type: "info",
                        fields: [{ id: "path", label: "Path", value: currentPath || "C:\\My Documents\\Untitled.txt" }],
                        buttons: [{ id: "ok", label: "OK" }, { id: "cancel", label: "Cancel" }]
                    });
                    if (result.action !== "ok") return false;
                    return saveToPath(system.vfs.normalizePath(result.values.path || "", "C:\\My Documents"));
                };

                const copySelection = () => {
                    system.state.set("session.clipboardText", editor.value.slice(editor.selectionStart, editor.selectionEnd));
                };

                const replaceSelection = (text) => {
                    const start = editor.selectionStart;
                    const end = editor.selectionEnd;
                    editor.value = `${editor.value.slice(0, start)}${text}${editor.value.slice(end)}`;
                    editor.setSelectionRange(start + text.length, start + text.length);
                    updateDirtyState();
                    updateStatus();
                    recordHistory();
                };

                const cutSelection = () => {
                    const cutValue = editor.value.slice(editor.selectionStart, editor.selectionEnd);
                    if (!cutValue) return;
                    system.state.set("session.clipboardText", cutValue);
                    replaceSelection("");
                };

                const pasteClipboard = () => {
                    const clip = system.state.get("session.clipboardText") || "";
                    if (!clip) return;
                    replaceSelection(clip);
                };

                const findText = async (reuse = false) => {
                    if (!reuse || !lastFindTerm) {
                        const result = await system.dialogs.prompt({
                            title: "Find",
                            message: "Find what:",
                            type: "info",
                            fields: [{ id: "term", label: "Text", value: lastFindTerm }],
                            buttons: [{ id: "ok", label: "Find Next" }, { id: "cancel", label: "Cancel" }]
                        });
                        if (result.action !== "ok") return;
                        lastFindTerm = result.values.term || "";
                    }
                    if (!lastFindTerm) return;
                    let index = editor.value.indexOf(lastFindTerm, editor.selectionEnd);
                    if (index === -1) index = editor.value.indexOf(lastFindTerm);
                    if (index === -1) {
                        system.dialogs.alert("Notepad", `Cannot find "${lastFindTerm}".`, "info");
                        return;
                    }
                    editor.focus();
                    editor.setSelectionRange(index, index + lastFindTerm.length);
                    updateStatus();
                };

                bindMenuBar(instance.content, instance.controller, async (action) => {
                    if (action === "new") {
                        if (await ensureCanDiscard()) {
                            currentPath = null;
                            editor.value = "";
                            savedText = "";
                            dirty = false;
                            setTitle();
                            resetHistory();
                            updateStatus();
                        }
                    }
                    if (action === "open") {
                        if (await ensureCanDiscard()) await openFile();
                    }
                    if (action === "save") {
                        if (currentPath) await saveToPath(currentPath);
                        else await saveAs();
                    }
                    if (action === "save-as") await saveAs();
                    if (action === "undo" && historyIndex > 0) {
                        historyIndex -= 1;
                        applySnapshot(history[historyIndex]);
                    }
                    if (action === "redo" && historyIndex < history.length - 1) {
                        historyIndex += 1;
                        applySnapshot(history[historyIndex]);
                    }
                    if (action === "exit") instance.close();
                    if (action === "copy") copySelection();
                    if (action === "cut") cutSelection();
                    if (action === "paste") pasteClipboard();
                    if (action === "select-all") {
                        editor.focus();
                        editor.setSelectionRange(0, editor.value.length);
                        updateStatus();
                    }
                    if (action === "word-wrap") {
                        wordWrap = !wordWrap;
                        editor.classList.toggle("is-wrap", wordWrap);
                        updateStatus();
                    }
                    if (action === "find") await findText(false);
                    if (action === "find-next") await findText(true);
                    if (action === "help") system.windows.create("help-viewer");
                });

                if (currentPath) {
                    const file = system.vfs.readFile(currentPath);
                    if (typeof file === "string") editor.value = file;
                }
                savedText = editor.value;
                resetHistory();
                setTitle();
                updateStatus();

                editor.addEventListener("input", () => { updateDirtyState(); updateStatus(); recordHistory(); }, { signal: instance.controller.signal });
                ["click", "keyup", "select"].forEach((eventName) => editor.addEventListener(eventName, updateStatus, { signal: instance.controller.signal }));
                instance.element.addEventListener("keydown", async (event) => {
                    if (!event.ctrlKey || event.altKey) {
                        if (event.key === "F3") {
                            event.preventDefault();
                            await findText(true);
                        }
                        return;
                    }
                    const key = event.key.toLowerCase();
                    if (key === "n") { event.preventDefault(); if (await ensureCanDiscard()) { currentPath = null; editor.value = ""; savedText = ""; dirty = false; setTitle(); resetHistory(); updateStatus(); } }
                    if (key === "o") { event.preventDefault(); if (await ensureCanDiscard()) await openFile(); }
                    if (key === "s") { event.preventDefault(); if (event.shiftKey) await saveAs(); else if (currentPath) await saveToPath(currentPath); else await saveAs(); }
                    if (key === "a") { event.preventDefault(); editor.focus(); editor.setSelectionRange(0, editor.value.length); updateStatus(); }
                    if (key === "f") { event.preventDefault(); await findText(false); }
                    if (key === "c") { event.preventDefault(); copySelection(); }
                    if (key === "x") { event.preventDefault(); cutSelection(); }
                    if (key === "v") { event.preventDefault(); pasteClipboard(); }
                    if (key === "z" && historyIndex > 0) { event.preventDefault(); historyIndex -= 1; applySnapshot(history[historyIndex]); }
                    if (key === "y" && historyIndex < history.length - 1) { event.preventDefault(); historyIndex += 1; applySnapshot(history[historyIndex]); }
                }, { signal: instance.controller.signal });

                return {
                    async beforeClose() {
                        return ensureCanDiscard();
                    }
                };
            }
        };

        definitions.paint = {
            meta: { title: "untitled - Paint", icon: "paint", width: 720, height: 520, minWidth: 460, minHeight: 320 },
            create(instance) {
                let currentPath = instance.appData.path || null;
                let tool = "pencil";
                let color = "#000000";
                let dirty = false;
                let drawing = false;
                let drawingChanged = false;
                let startX = 0;
                let startY = 0;
                let snapshot = null;
                let selectionRect = null;
                let history = [];
                let historyIndex = -1;
                let savedFingerprint = "";
                instance.content.innerHTML = `
                    <div class="paint">
                        <div class="window-toolbar">
                            <div class="window-toolbar__handle"></div>
                            <button type="button" class="toolbar-button" data-action="save">Save</button>
                            <button type="button" class="toolbar-button" data-action="undo">Undo</button>
                            <button type="button" class="toolbar-button" data-action="redo">Redo</button>
                            <button type="button" class="toolbar-button" data-action="clear">Clear Image</button>
                        </div>
                        <div class="paint__main">
                            <div class="paint__tools">
                                ${[
                                    ["select", "S"], ["pencil", "P"], ["brush", "B"], ["eraser", "E"], ["fill", "F"], ["line", "L"], ["rect", "R"], ["ellipse", "O"], ["picker", "I"]
                                ].map(([name, label]) => `<button type="button" class="paint__tool toolbar-button${name === "pencil" ? " is-pressed" : ""}" data-tool="${name}">${label}</button>`).join("")}
                            </div>
                            <div class="paint__workspace">
                                <div class="paint__canvas-frame win-inset">
                                    <canvas class="paint__canvas" width="560" height="360"></canvas>
                                    <div class="paint__selection hidden"></div>
                                </div>
                            </div>
                        </div>
                        <div class="paint__footer">
                            <div class="paint__current-color win-inset" data-role="color"></div>
                            <div class="paint__palette">
                                ${["#000000", "#808080", "#800000", "#808000", "#008000", "#008080", "#000080", "#800080", "#ffffff", "#c0c0c0", "#ff0000", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#ff00ff"].map((swatch) => `<button type="button" class="paint__swatch" data-swatch="${swatch}" style="background:${swatch};"></button>`).join("")}
                            </div>
                            <div class="paint__size">
                                <span>W</span><input type="number" class="field field--classic" data-size="width" value="560" min="64" max="1200">
                                <span>H</span><input type="number" class="field field--classic" data-size="height" value="360" min="64" max="900">
                                <button type="button" class="win-button" data-action="resize">Resize</button>
                            </div>
                        </div>
                    </div>
                `;
                const canvas = instance.content.querySelector("canvas");
                const selection = instance.content.querySelector(".paint__selection");
                const colorBox = instance.content.querySelector("[data-role='color']");
                const ctx = canvas.getContext("2d", { willReadFrequently: true });
                const undoButton = instance.content.querySelector("[data-action='undo']");
                const redoButton = instance.content.querySelector("[data-action='redo']");
                const sizeWidth = instance.content.querySelector("[data-size='width']");
                const sizeHeight = instance.content.querySelector("[data-size='height']");
                colorBox.style.background = color;
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                const setTitle = () => {
                    const name = currentPath ? currentPath.split("\\").pop() : "untitled";
                    instance.setTitle(`${dirty ? "*" : ""}${name} - Paint`);
                    instance.setTaskTitle(name);
                };

                const snapshotFingerprint = (frame) => `${frame.width}x${frame.height}:${frame.data}`;

                const updateCanvasSizeInputs = () => {
                    sizeWidth.value = String(canvas.width);
                    sizeHeight.value = String(canvas.height);
                };

                const captureHistoryFrame = () => ({
                    width: canvas.width,
                    height: canvas.height,
                    data: canvas.toDataURL("image/png")
                });

                const updateDirtyState = () => {
                    const current = captureHistoryFrame();
                    dirty = snapshotFingerprint(current) !== savedFingerprint;
                    setTitle();
                };

                const syncHistoryButtons = () => {
                    undoButton.disabled = historyIndex <= 0;
                    redoButton.disabled = historyIndex >= history.length - 1;
                    undoButton.classList.toggle("is-disabled", undoButton.disabled);
                    redoButton.classList.toggle("is-disabled", redoButton.disabled);
                };

                const restoreFrame = (frame) => new Promise((resolve) => {
                    canvas.width = frame.width;
                    canvas.height = frame.height;
                    updateCanvasSizeInputs();
                    ctx.fillStyle = "#ffffff";
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    if (!frame.data) {
                        updateDirtyState();
                        resolve();
                        return;
                    }
                    const image = new Image();
                    image.onload = () => {
                        ctx.fillStyle = "#ffffff";
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        ctx.drawImage(image, 0, 0);
                        updateDirtyState();
                        resolve();
                    };
                    image.src = frame.data;
                });

                const pushHistory = () => {
                    const frame = captureHistoryFrame();
                    const current = history[historyIndex];
                    if (current && snapshotFingerprint(current) === snapshotFingerprint(frame)) {
                        syncHistoryButtons();
                        return;
                    }
                    history = history.slice(0, historyIndex + 1);
                    history.push(frame);
                    if (history.length > 40) history.shift();
                    historyIndex = history.length - 1;
                    syncHistoryButtons();
                    updateDirtyState();
                };

                const markSaved = () => {
                    const frame = captureHistoryFrame();
                    savedFingerprint = snapshotFingerprint(frame);
                    dirty = false;
                    setTitle();
                    if (!history.length || snapshotFingerprint(history[historyIndex]) !== savedFingerprint) {
                        pushHistory();
                    }
                };

                const loadImage = (data) => new Promise((resolve) => {
                    if (!data) {
                        resolve();
                        return;
                    }
                    const image = new Image();
                    image.onload = () => {
                        canvas.width = image.width || canvas.width;
                        canvas.height = image.height || canvas.height;
                        updateCanvasSizeInputs();
                        ctx.fillStyle = "#ffffff";
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        ctx.drawImage(image, 0, 0);
                        resolve();
                    };
                    image.src = data;
                });

                const floodFill = (x, y, nextColor) => {
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const indexFor = (px, py) => (py * canvas.width + px) * 4;
                    const startIndex = indexFor(x, y);
                    const target = imageData.data.slice(startIndex, startIndex + 4);
                    const hex = nextColor.replace("#", "");
                    const fill = [
                        parseInt(hex.slice(0, 2), 16),
                        parseInt(hex.slice(2, 4), 16),
                        parseInt(hex.slice(4, 6), 16),
                        255
                    ];
                    if (target[0] === fill[0] && target[1] === fill[1] && target[2] === fill[2]) return false;
                    const stack = [[x, y]];
                    while (stack.length) {
                        const [px, py] = stack.pop();
                        if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
                        const index = indexFor(px, py);
                        if (imageData.data[index] !== target[0] || imageData.data[index + 1] !== target[1] || imageData.data[index + 2] !== target[2]) continue;
                        imageData.data[index] = fill[0];
                        imageData.data[index + 1] = fill[1];
                        imageData.data[index + 2] = fill[2];
                        imageData.data[index + 3] = fill[3];
                        stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
                    }
                    ctx.putImageData(imageData, 0, 0);
                    return true;
                };

                const saveImage = async () => {
                    const data = canvas.toDataURL("image/png");
                    if (currentPath) {
                        const result = system.vfs.writeFile(currentPath, data, { type: "image", meta: { icon: "image" } });
                        if (!result.ok) {
                            await system.dialogs.alert("Paint", result.reason, "error");
                            return;
                        }
                        markSaved();
                        system.windows.refreshShell();
                        return true;
                    }
                    const result = await system.dialogs.prompt({
                        title: "Save As",
                        message: "Type the path where this bitmap should be saved.",
                        type: "info",
                        fields: [{ id: "path", label: "Path", value: "C:\\My Documents\\Drawing.bmp" }],
                        buttons: [{ id: "ok", label: "OK" }, { id: "cancel", label: "Cancel" }]
                    });
                    if (result.action !== "ok") return;
                    const path = system.vfs.normalizePath(result.values.path || "", "C:\\My Documents");
                    const writeResult = system.vfs.writeFile(path, data, { type: "image", meta: { icon: "image" } });
                    if (writeResult.ok) {
                        currentPath = writeResult.path;
                        markSaved();
                        system.windows.refreshShell();
                        return true;
                    }
                    await system.dialogs.alert("Paint", writeResult.reason || "Unable to save the file.", "error");
                    return false;
                };

                const applyToolPreview = (x, y) => {
                    ctx.putImageData(snapshot, 0, 0);
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1;
                    if (tool === "line") {
                        ctx.beginPath();
                        ctx.moveTo(startX, startY);
                        ctx.lineTo(x, y);
                        ctx.stroke();
                    }
                    if (tool === "rect") {
                        ctx.strokeRect(startX, startY, x - startX, y - startY);
                    }
                    if (tool === "ellipse") {
                        ctx.beginPath();
                        ctx.ellipse((startX + x) / 2, (startY + y) / 2, Math.abs(x - startX) / 2, Math.abs(y - startY) / 2, 0, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                };

                const canvasPoint = (event) => {
                    const rect = canvas.getBoundingClientRect();
                    return {
                        x: Utils.clamp(Math.floor((event.clientX - rect.left) * (canvas.width / rect.width)), 0, canvas.width - 1),
                        y: Utils.clamp(Math.floor((event.clientY - rect.top) * (canvas.height / rect.height)), 0, canvas.height - 1)
                    };
                };

                const updateSelection = (x, y) => {
                    const left = Math.min(startX, x);
                    const top = Math.min(startY, y);
                    const width = Math.abs(x - startX);
                    const height = Math.abs(y - startY);
                    Object.assign(selection.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
                    selection.classList.remove("hidden");
                    selectionRect = { left, top, width, height };
                };

                const beginDraw = (event) => {
                    const point = canvasPoint(event);
                    startX = point.x;
                    startY = point.y;
                    snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    drawing = true;
                    drawingChanged = false;
                    if (tool === "picker") {
                        const pixel = ctx.getImageData(point.x, point.y, 1, 1).data;
                        color = `#${[pixel[0], pixel[1], pixel[2]].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
                        colorBox.style.background = color;
                        drawing = false;
                    }
                    if (tool === "fill") {
                        if (floodFill(point.x, point.y, color)) {
                            pushHistory();
                        }
                        drawing = false;
                    }
                    if (tool === "pencil" || tool === "brush" || tool === "eraser") {
                        ctx.beginPath();
                        ctx.moveTo(point.x, point.y);
                        ctx.lineCap = "round";
                        ctx.lineWidth = tool === "brush" ? 4 : tool === "eraser" ? 10 : 1;
                        ctx.strokeStyle = tool === "eraser" ? "#ffffff" : color;
                    }
                    if (tool === "select") {
                        selectionRect = null;
                        selection.classList.add("hidden");
                    }
                };

                const moveDraw = (event) => {
                    if (!drawing) return;
                    const point = canvasPoint(event);
                    if (tool === "pencil" || tool === "brush" || tool === "eraser") {
                        ctx.lineTo(point.x, point.y);
                        ctx.stroke();
                        drawingChanged = true;
                    }
                    if (["line", "rect", "ellipse"].includes(tool)) {
                        applyToolPreview(point.x, point.y);
                        drawingChanged = true;
                    }
                    if (tool === "select") updateSelection(point.x, point.y);
                };

                const endDraw = () => {
                    if (drawing && drawingChanged && tool !== "select") {
                        pushHistory();
                    }
                    drawing = false;
                };

                Utils.delegate(instance.content, "click", "[data-tool]", (_event, button) => {
                    tool = button.dataset.tool;
                    instance.content.querySelectorAll("[data-tool]").forEach((element) => element.classList.remove("is-pressed"));
                    button.classList.add("is-pressed");
                }, { signal: instance.controller.signal });
                Utils.delegate(instance.content, "click", "[data-swatch]", (_event, swatch) => {
                    color = swatch.dataset.swatch;
                    colorBox.style.background = color;
                }, { signal: instance.controller.signal });
                Utils.delegate(instance.content, "click", "[data-action='save']", () => saveImage(), { signal: instance.controller.signal });
                Utils.delegate(instance.content, "click", "[data-action='undo']", async () => {
                    if (historyIndex <= 0) return;
                    historyIndex -= 1;
                    await restoreFrame(history[historyIndex]);
                    syncHistoryButtons();
                }, { signal: instance.controller.signal });
                Utils.delegate(instance.content, "click", "[data-action='redo']", async () => {
                    if (historyIndex >= history.length - 1) return;
                    historyIndex += 1;
                    await restoreFrame(history[historyIndex]);
                    syncHistoryButtons();
                }, { signal: instance.controller.signal });
                Utils.delegate(instance.content, "click", "[data-action='clear']", () => {
                    ctx.fillStyle = "#ffffff";
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    selection.classList.add("hidden");
                    pushHistory();
                }, { signal: instance.controller.signal });
                Utils.delegate(instance.content, "click", "[data-action='resize']", () => {
                    const nextWidth = Number(instance.content.querySelector("[data-size='width']").value);
                    const nextHeight = Number(instance.content.querySelector("[data-size='height']").value);
                    const offscreen = document.createElement("canvas");
                    offscreen.width = canvas.width;
                    offscreen.height = canvas.height;
                    offscreen.getContext("2d").drawImage(canvas, 0, 0);
                    canvas.width = Utils.clamp(nextWidth, 64, 1200);
                    canvas.height = Utils.clamp(nextHeight, 64, 900);
                    ctx.fillStyle = "#ffffff";
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(offscreen, 0, 0);
                    updateCanvasSizeInputs();
                    pushHistory();
                }, { signal: instance.controller.signal });

                canvas.addEventListener("mousedown", beginDraw, { signal: instance.controller.signal });
                canvas.addEventListener("mousemove", moveDraw, { signal: instance.controller.signal });
                document.addEventListener("mouseup", endDraw, { signal: instance.controller.signal });

                instance.element.addEventListener("keydown", async (event) => {
                    if (!event.ctrlKey || event.altKey) return;
                    const key = event.key.toLowerCase();
                    if (key === "s") {
                        event.preventDefault();
                        await saveImage();
                    }
                    if (key === "z" && historyIndex > 0) {
                        event.preventDefault();
                        historyIndex -= 1;
                        await restoreFrame(history[historyIndex]);
                        syncHistoryButtons();
                    }
                    if (key === "y" && historyIndex < history.length - 1) {
                        event.preventDefault();
                        historyIndex += 1;
                        await restoreFrame(history[historyIndex]);
                        syncHistoryButtons();
                    }
                }, { signal: instance.controller.signal });

                const initialize = async () => {
                    if (currentPath) {
                        await loadImage(system.vfs.readFile(currentPath));
                    }
                    updateCanvasSizeInputs();
                    history = [];
                    historyIndex = -1;
                    pushHistory();
                    savedFingerprint = snapshotFingerprint(history[historyIndex]);
                    dirty = false;
                    setTitle();
                };

                initialize();

                return {
                    async beforeClose() {
                        if (!dirty) return true;
                        const result = await system.dialogs.prompt({
                            title: "Paint",
                            message: "The picture has changed.\n\nDo you want to save the changes?",
                            type: "warn",
                            buttons: [
                                { id: "save", label: "Save" },
                                { id: "discard", label: "Don't Save" },
                                { id: "cancel", label: "Cancel" }
                            ]
                        });
                        if (result.action === "save") return saveImage();
                        return result.action === "discard";
                    }
                };
            }
        };

        definitions.calculator = {
            meta: { title: "Calculator", icon: "calculator", width: 300, height: 280, minWidth: 260, minHeight: 240 },
            create(instance) {
                instance.content.innerHTML = `
                    <div class="calculator">
                        <div class="calculator__display win-inset" data-role="display">0.</div>
                        <div class="calculator__body">
                            <div class="calculator__memory">
                                ${["MC", "MR", "MS", "M+"].map((key) => `<button type="button" class="win-button calculator__button calculator__button--red" data-key="${key}">${key}</button>`).join("")}
                            </div>
                            <div class="calculator__grid">
                                ${["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", "+/-", ".", "+", "C", "CE", "Back", "="].map((key) => `<button type="button" class="win-button calculator__button ${["/", "*", "-", "+", "="].includes(key) || key.startsWith("M") ? "calculator__button--red" : "calculator__button--blue"}" data-key="${key}">${key}</button>`).join("")}
                            </div>
                        </div>
                    </div>
                `;
                const display = instance.content.querySelector("[data-role='display']");
                const formatDisplay = (value) => {
                    if (value === "Error") return value;
                    const numeric = Number(value);
                    if (!Number.isFinite(numeric)) return "Error";
                    const asText = String(value);
                    if (asText.length <= 14) return asText.includes(".") ? asText : `${asText}.`;
                    return numeric.toExponential(8).replace("+", "");
                };
                const engine = {
                    displayValue: "0",
                    firstOperand: null,
                    operator: null,
                    waitingForSecondOperand: false,
                    memory: 0,
                    lastOperator: null,
                    lastOperand: null,
                    error: false,
                    setDisplay(value) {
                        this.displayValue = value;
                        display.textContent = formatDisplay(value);
                    },
                    clearAll() {
                        this.firstOperand = null;
                        this.operator = null;
                        this.waitingForSecondOperand = false;
                        this.lastOperator = null;
                        this.lastOperand = null;
                        this.error = false;
                        this.setDisplay("0");
                    },
                    clearEntry() {
                        if (this.error) {
                            this.clearAll();
                            return;
                        }
                        this.setDisplay("0");
                    },
                    inputDigit(digit) {
                        if (this.error) return;
                        if (this.waitingForSecondOperand) {
                            this.setDisplay(digit);
                            this.waitingForSecondOperand = false;
                            return;
                        }
                        this.setDisplay(this.displayValue === "0" ? digit : `${this.displayValue}${digit}`);
                    },
                    inputDecimal() {
                        if (this.error) return;
                        if (this.waitingForSecondOperand) {
                            this.setDisplay("0.");
                            this.waitingForSecondOperand = false;
                            return;
                        }
                        if (!this.displayValue.includes(".")) {
                            this.setDisplay(`${this.displayValue}.`);
                        }
                    },
                    backspace() {
                        if (this.error || this.waitingForSecondOperand) return;
                        const next = this.displayValue.length > 1 ? this.displayValue.slice(0, -1) : "0";
                        this.setDisplay(next === "-" ? "0" : next);
                    },
                    toggleSign() {
                        if (this.error) return;
                        this.setDisplay(String(Number(this.displayValue) * -1));
                    },
                    percent() {
                        if (this.error) return;
                        const current = Number(this.displayValue);
                        const base = this.firstOperand === null ? 1 : this.firstOperand / 100;
                        this.setDisplay(String(current * base));
                    },
                    performCalculation(a, b, operator) {
                        if (operator === "+") return a + b;
                        if (operator === "-") return a - b;
                        if (operator === "*") return a * b;
                        if (operator === "/") return b === 0 ? Number.NaN : a / b;
                        return b;
                    },
                    handleOperator(nextOperator) {
                        if (this.error) return;
                        const inputValue = Number(this.displayValue);
                        if (this.operator && this.waitingForSecondOperand && nextOperator !== "=") {
                            this.operator = nextOperator;
                            return;
                        }
                        if (nextOperator === "=" && !this.operator && this.lastOperator !== null && this.lastOperand !== null) {
                            const repeat = this.performCalculation(inputValue, this.lastOperand, this.lastOperator);
                            if (!Number.isFinite(repeat)) return this.triggerError();
                            this.firstOperand = repeat;
                            this.setDisplay(String(repeat));
                            this.waitingForSecondOperand = true;
                            return;
                        }
                        if (this.firstOperand === null) {
                            this.firstOperand = inputValue;
                        } else if (this.operator) {
                            const result = this.performCalculation(this.firstOperand, inputValue, this.operator);
                            if (!Number.isFinite(result)) return this.triggerError();
                            this.firstOperand = result;
                            this.setDisplay(String(result));
                            if (nextOperator === "=") {
                                this.lastOperator = this.operator;
                                this.lastOperand = inputValue;
                            }
                        }
                        this.waitingForSecondOperand = true;
                        this.operator = nextOperator === "=" ? null : nextOperator;
                    },
                    triggerError() {
                        this.error = true;
                        this.setDisplay("Error");
                    },
                    handleMemory(key) {
                        if (key === "MC") this.memory = 0;
                        if (key === "MR") {
                            this.setDisplay(String(this.memory));
                            this.waitingForSecondOperand = false;
                        }
                        if (key === "MS") this.memory = Number(this.displayValue) || 0;
                        if (key === "M+") this.memory += Number(this.displayValue) || 0;
                    }
                };

                const press = (key) => {
                    if (/^[0-9]$/.test(key)) {
                        engine.inputDigit(key);
                        return;
                    }
                    if (key === ".") { engine.inputDecimal(); return; }
                    if (key === "C") { engine.clearAll(); return; }
                    if (key === "CE") { engine.clearEntry(); return; }
                    if (key === "Back") { engine.backspace(); return; }
                    if (key === "+/-") { engine.toggleSign(); return; }
                    if (key === "%") { engine.percent(); return; }
                    if (["+", "-", "*", "/", "="].includes(key)) { engine.handleOperator(key); return; }
                    if (["MC", "MR", "MS", "M+"].includes(key)) { engine.handleMemory(key); }
                };
                Utils.delegate(instance.content, "click", "[data-key]", (_event, button) => press(button.dataset.key), { signal: instance.controller.signal });
                instance.element.addEventListener("keydown", (event) => {
                    if (event.ctrlKey && event.key.toLowerCase() === "c") {
                        event.preventDefault();
                        system.state.set("session.clipboardText", engine.displayValue);
                        return;
                    }
                    if (event.ctrlKey && event.key.toLowerCase() === "v") {
                        event.preventDefault();
                        const clip = system.state.get("session.clipboardText") || "";
                        const numeric = Number(clip);
                        if (!Number.isNaN(numeric)) {
                            engine.setDisplay(String(numeric));
                            engine.waitingForSecondOperand = false;
                        }
                        return;
                    }
                    const map = { Enter: "=", Escape: "C", Backspace: "Back" };
                    const key = map[event.key] || event.key;
                    if (/^[0-9]$/.test(key) || [".", "+", "-", "*", "/", "=", "C", "CE", "Back", "%"].includes(key)) {
                        event.preventDefault();
                        press(key);
                    }
                }, { signal: instance.controller.signal });
                engine.clearAll();
                return {};
            }
        };

        definitions["ms-dos"] = {
            meta: { title: "MS-DOS Prompt", icon: "ms-dos", width: 640, height: 420, minWidth: 400, minHeight: 240 },
            create(instance) {
                let cwd = "C:\\WINDOWS";
                let history = [];
                let historyIndex = -1;
                const commandNames = ["help", "dir", "cls", "ver", "echo", "date", "time", "cd", "chdir", "md", "mkdir", "del", "erase", "type", "copy", "ren", "rename", "start", "win", "exit"];
                instance.content.innerHTML = `
                    <div class="cmd">
                        <div class="cmd__screen win-inset" data-role="screen">
                            Microsoft(R) Windows 98
   (C)Copyright Microsoft Corp 1981-1999.

                        </div>
                    </div>
                `;
                const screen = instance.content.querySelector("[data-role='screen']");

                const tokenize = (text) => {
                    const matches = String(text || "").match(/"[^"]*"|\S+/g) || [];
                    return matches.map((part) => part.replace(/^"|"$/g, ""));
                };

                const writeLine = (text = "") => {
                    const block = document.createElement("div");
                    block.textContent = text;
                    screen.appendChild(block);
                };

                const dirList = (path) => {
                    if (!system.vfs.isDirectory(path)) {
                        writeLine("Invalid directory.");
                        return;
                    }
                    const list = system.vfs.list(path).sort((a, b) => {
                        const aDir = a.node.type === "dir" || a.node.type === "drive";
                        const bDir = b.node.type === "dir" || b.node.type === "drive";
                        return Number(bDir) - Number(aDir) || a.name.localeCompare(b.name);
                    });
                    writeLine(` Volume in drive ${path[0]} has no label`);
                    writeLine(` Directory of ${path}`);
                    writeLine("");
                    list.forEach((entry) => {
                        const props = system.vfs.getProperties(entry.path);
                        const type = entry.node.type === "dir" ? "<DIR>" : "     ";
                        const modified = props ? Utils.formatExplorerDate(new Date(props.modifiedAt)) : "";
                        writeLine(`${entry.name.padEnd(22)} ${type} ${modified}`);
                    });
                    writeLine("");
                    writeLine(`${list.length} item(s)`);
                };

                const autoComplete = (text) => {
                    const trimmed = text.replace(/\s+$/, "");
                    const parts = tokenize(trimmed);
                    if (!parts.length) return text;
                    if (parts.length === 1 && !/\s/.test(trimmed)) {
                        const match = commandNames.find((name) => name.startsWith(parts[0].toLowerCase()));
                        return match || text;
                    }
                    const fragment = parts[parts.length - 1];
                    const searchBase = fragment.includes("\\") ? Utils.parentPath(system.vfs.normalizePath(fragment, cwd)) : cwd;
                    const prefix = fragment.includes("\\") ? fragment.split("\\").pop().toLowerCase() : fragment.toLowerCase();
                    const entries = system.vfs.list(searchBase);
                    const match = entries.find((entry) => entry.name.toLowerCase().startsWith(prefix));
                    if (!match) return text;
                    parts[parts.length - 1] = fragment.includes("\\") ? `${searchBase}\\${match.name}` : match.name;
                    return parts.join(" ");
                };

                const promptLine = () => {
                    if (instance.controller.signal.aborted) return;
                    const line = document.createElement("div");
                    line.className = "cmd__line";
                    line.innerHTML = `<span class="cmd__prompt">${Utils.escapeHtml(`${cwd}>`)}</span><span class="cmd__input" contenteditable="true" spellcheck="false"></span>`;
                    screen.appendChild(line);
                    const input = line.querySelector(".cmd__input");
                    input.focus();
                    screen.scrollTop = screen.scrollHeight;
                    input.addEventListener("keydown", async (event) => {
                        if (event.key === "ArrowUp") {
                            event.preventDefault();
                            if (historyIndex < history.length - 1) historyIndex += 1;
                            input.textContent = history[history.length - 1 - historyIndex] || "";
                        }
                        if (event.key === "ArrowDown") {
                            event.preventDefault();
                            historyIndex = Math.max(-1, historyIndex - 1);
                            input.textContent = historyIndex === -1 ? "" : history[history.length - 1 - historyIndex] || "";
                        }
                        if (event.key === "Tab") {
                            event.preventDefault();
                            input.textContent = autoComplete(input.textContent);
                        }
                        if (event.key === "Enter") {
                            event.preventDefault();
                            const commandText = input.textContent.trim();
                            line.remove();
                            const shouldContinue = await execute(commandText);
                            if (shouldContinue !== false && !instance.controller.signal.aborted) {
                                promptLine();
                            }
                        }
                    }, { signal: instance.controller.signal });
                };

                const execute = async (commandText) => {
                    if (commandText) {
                        history.push(commandText);
                        historyIndex = -1;
                    }
                    const parts = tokenize(commandText);
                    const command = (parts[0] || "").toLowerCase();
                    const args = parts.slice(1);
                    writeLine(`${cwd}>${commandText}`);
                    if (!command) return;
                    if (command === "help") {
                        writeLine("Supported commands:");
                        writeLine("HELP DIR CLS VER ECHO DATE TIME CD CHDIR MD MKDIR DEL ERASE TYPE COPY REN RENAME START WIN EXIT");
                    }
                    else if (command === "ver") writeLine("Windows 98 [Version 4.10.2222]");
                    else if (command === "date") writeLine(`Current date is ${Utils.formatShortDate(system.clock.getSystemTime())}`);
                    else if (command === "time") writeLine(`Current time is ${Utils.formatClock(system.clock.getSystemTime())}`);
                    else if (command === "echo") writeLine(args.join(" "));
                    else if (command === "cls") screen.textContent = "";
                    else if (command === "dir") {
                        const target = args[0] ? system.vfs.normalizePath(args.join(" "), cwd) : cwd;
                        dirList(target);
                    } else if (command === "cd" || command === "chdir") {
                        if (!args.length) {
                            writeLine(cwd);
                            return true;
                        }
                        const target = system.vfs.normalizePath(args.join(" "), cwd);
                        if (system.vfs.isDirectory(target)) cwd = target;
                        else writeLine("Invalid directory.");
                    } else if (command === "type") {
                        const target = system.vfs.normalizePath(args.join(" ") || "", cwd);
                        const file = system.vfs.readFile(target);
                        if (typeof file === "string") file.split("\n").forEach((line) => writeLine(line));
                        else writeLine("File not found.");
                    } else if (command === "mkdir" || command === "md") {
                        const target = system.vfs.normalizePath(args.join(" ") || "New Folder", cwd);
                        if (system.vfs.exists(target)) {
                            writeLine("A subdirectory or file already exists.");
                        } else if (!system.vfs.ensureDir(target)) {
                            writeLine("Unable to create directory.");
                        }
                        system.windows.refreshShell();
                    } else if (command === "del" || command === "erase") {
                        const target = system.vfs.normalizePath(args.join(" ") || "", cwd);
                        const result = system.vfs.deletePath(target, false);
                        if (!result.ok) writeLine(result.reason);
                        system.windows.refreshShell();
                    } else if (command === "copy") {
                        if (args.length < 2) {
                            writeLine("Syntax error.");
                        } else {
                            const source = system.vfs.normalizePath(args[0], cwd);
                            const destination = system.vfs.normalizePath(args[1], cwd);
                            const result = system.vfs.copyPath(source, destination);
                            if (!result.ok) writeLine(result.reason);
                            else system.windows.refreshShell();
                        }
                    } else if (command === "ren" || command === "rename") {
                        if (args.length < 2) {
                            writeLine("Syntax error.");
                        } else {
                            const source = system.vfs.normalizePath(args[0], cwd);
                            const result = system.vfs.rename(source, args.slice(1).join(" "));
                            if (!result.ok) writeLine(result.reason);
                            else system.windows.refreshShell();
                        }
                    } else if (command === "start") {
                        await system.runCommand(args.join(" "));
                    } else if (command === "win") {
                        writeLine("Returning to Windows...");
                        system.windows.focus(null);
                    } else if (command === "exit") {
                        instance.close();
                        return false;
                    } else {
                        writeLine("Bad command or file name");
                    }
                    return true;
                };

                screen.addEventListener("mousedown", () => {
                    const input = screen.querySelector(".cmd__input:last-child");
                    input?.focus();
                }, { signal: instance.controller.signal });
                promptLine();
                return {
                    onFocus() {
                        const input = screen.querySelector(".cmd__input:last-child");
                        input?.focus();
                    }
                };
            }
        };

        definitions.minesweeper = {
            meta: { title: "Minesweeper", icon: "mine", width: 260, height: 360, minWidth: 220, minHeight: 300 },
            create(instance) {
                const width = 9;
                const height = 9;
                const mineCount = 10;
                let board = [];
                let started = false;
                let revealed = 0;
                let timerId = null;
                let seconds = 0;
                const buildBoard = () => {
                    board = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => ({ x, y, mine: false, flagged: false, open: false, count: 0 })));
                    let planted = 0;
                    while (planted < mineCount) {
                        const x = Math.floor(Math.random() * width);
                        const y = Math.floor(Math.random() * height);
                        if (!board[y][x].mine) {
                            board[y][x].mine = true;
                            planted += 1;
                        }
                    }
                    board.forEach((row, y) => row.forEach((cell, x) => {
                        cell.count = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => [dx, dy]))
                            .filter(([dx, dy]) => dx || dy)
                            .map(([dx, dy]) => board[y + dy]?.[x + dx])
                            .filter(Boolean)
                            .filter((cellRef) => cellRef.mine).length;
                    }));
                };
                instance.content.innerHTML = `
                    <div class="minesweeper">
                        <div class="minesweeper__hud win-shell">
                            <div class="mine-count win-inset" data-role="mines">${String(mineCount).padStart(3, "0")}</div>
                            <button type="button" class="mine-face win-button" data-action="reset">:)</button>
                            <div class="mine-timer win-inset" data-role="time">000</div>
                        </div>
                        <div class="minesweeper__board win-shell" data-role="board"></div>
                    </div>
                `;
                const boardRoot = instance.content.querySelector("[data-role='board']");
                const mineLabel = instance.content.querySelector("[data-role='mines']");
                const timeLabel = instance.content.querySelector("[data-role='time']");
                const resetGame = () => {
                    clearInterval(timerId);
                    seconds = 0;
                    revealed = 0;
                    started = false;
                    mineLabel.textContent = String(mineCount).padStart(3, "0");
                    timeLabel.textContent = "000";
                    buildBoard();
                    boardRoot.style.gridTemplateColumns = `repeat(${width}, 18px)`;
                    boardRoot.innerHTML = board.flat().map((cell) => `<button type="button" class="mine-cell" data-x="${cell.x}" data-y="${cell.y}"></button>`).join("");
                };
                const reveal = (x, y) => {
                    const cell = board[y]?.[x];
                    if (!cell || cell.open || cell.flagged) return;
                    cell.open = true;
                    revealed += 1;
                    if (cell.mine) {
                        boardRoot.querySelector(`[data-x="${x}"][data-y="${y}"]`).textContent = "*";
                        boardRoot.querySelector(`[data-x="${x}"][data-y="${y}"]`).classList.add("is-open");
                        clearInterval(timerId);
                        system.dialogs.alert("Minesweeper", "Boom! You hit a mine.", "error");
                        return;
                    }
                    if (cell.count === 0) {
                        [-1, 0, 1].forEach((dy) => [-1, 0, 1].forEach((dx) => { if (dx || dy) reveal(x + dx, y + dy); }));
                    }
                };
                Utils.delegate(instance.content, "click", ".mine-cell", (_event, button) => {
                    if (!started) {
                        started = true;
                        timerId = setInterval(() => {
                            seconds += 1;
                            timeLabel.textContent = String(seconds).padStart(3, "0");
                        }, 1000);
                    }
                    reveal(Number(button.dataset.x), Number(button.dataset.y));
                    board.flat().forEach((cell) => {
                        const element = boardRoot.querySelector(`[data-x="${cell.x}"][data-y="${cell.y}"]`);
                        element.classList.toggle("is-open", cell.open);
                        element.dataset.count = cell.count;
                        element.textContent = cell.open && cell.count ? String(cell.count) : cell.flagged ? "!" : cell.open && cell.mine ? "*" : "";
                    });
                    if (revealed === width * height - mineCount) {
                        clearInterval(timerId);
                        system.dialogs.alert("Minesweeper", "You cleared the field!", "info");
                    }
                }, { signal: instance.controller.signal });
                boardRoot.addEventListener("contextmenu", (event) => {
                    const button = event.target.closest(".mine-cell");
                    if (!button) return;
                    event.preventDefault();
                    const cell = board[Number(button.dataset.y)][Number(button.dataset.x)];
                    if (!cell.open) {
                        cell.flagged = !cell.flagged;
                        button.textContent = cell.flagged ? "!" : "";
                    }
                }, { signal: instance.controller.signal });
                Utils.delegate(instance.content, "click", "[data-action='reset']", () => resetGame(), { signal: instance.controller.signal });
                resetGame();
                return {
                    destroy() {
                        clearInterval(timerId);
                    }
                };
            }
        };

        definitions.solitaire = {
            meta: { title: "Solitaire", icon: "solitaire", width: 520, height: 400, minWidth: 340, minHeight: 260 },
            create(instance) {
                instance.content.innerHTML = `
                    <div class="solitaire-placeholder">
                        <div class="solitaire-card"></div>
                        <div>Solitaire loading screen placeholder</div>
                    </div>
                `;
                return {};
            }
        };

        return definitions;
    }

    function createSystem() {
        const settings = Object.assign({}, DEFAULT_SETTINGS, Storage.read(STORAGE_KEYS.settings, {}));

        const root = {
            bootScreen: document.getElementById("boot-screen"),
            loginScreen: document.getElementById("login-screen"),
            screensaver: document.getElementById("screensaver"),
            screensaverLogo: document.getElementById("screensaver-logo"),
            desktop: document.getElementById("desktop"),
            desktopSelection: document.getElementById("desktop-selection"),
            windowsContainer: document.getElementById("windows-container"),
            modalContainer: document.getElementById("modal-container"),
            contextMenu: document.getElementById("context-menu"),
            startMenu: document.getElementById("start-menu"),
            startButton: document.getElementById("start-button"),
            taskbar: document.getElementById("taskbar"),
            taskbarTasks: document.getElementById("taskbar-tasks"),
            systemTray: document.getElementById("system-tray"),
            clockButton: document.getElementById("clock-button"),
            clock: document.getElementById("clock"),
            calendarPanel: document.getElementById("calendar-panel"),
            calendarMonthYear: document.getElementById("calendar-month-year"),
            calendarGrid: document.getElementById("calendar-grid"),
            balloon: document.getElementById("balloon-notification"),
            tooltip: document.getElementById("tooltip"),
            loginOk: document.getElementById("login-ok"),
            loginCancel: document.getElementById("login-cancel")
        };

        const system = {
            root,
            state: new StateManager(settings),
            vfs: new VirtualFileSystem()
        };

        system.dialogs = new DialogManager(root.modalContainer);
        system.contextMenu = new ContextMenuManager(root.contextMenu);
        system.contextMenu.bind();
        system.tooltip = new TooltipManager(root.tooltip);
        system.registry = new AppRegistry();
        system.windows = new WindowManager(system);
        system.desktop = new DesktopManager(system);
        system.startMenu = new StartMenuManager(system);
        system.clock = new ClockTrayManager(system);
        system.boot = new BootManager(system);

        system.openTarget = (target) => {
            if (!target) return false;
            if (target.startsWith("app:")) {
                system.windows.create(target.slice(4));
                return true;
            }
            if (target.startsWith("shell:")) {
                const key = target.slice(6);
                if (key === "my-computer") system.windows.create("my-computer");
                if (key === "recycle-bin") system.windows.create("recycle-bin");
                if (key === "network-neighborhood") system.windows.create("network-neighborhood");
                return true;
            }
            const normalized = system.vfs.normalizePath(target);
            if (system.vfs.exists(normalized)) {
                system.desktop.openPath(normalized);
                return true;
            }
            return false;
        };

        system.runCommand = async (commandText) => {
            const command = String(commandText || "").trim();
            if (!command) return false;
            const normalized = command.toLowerCase();
            const map = {
                notepad: "notepad",
                calc: "calculator",
                calculator: "calculator",
                mspaint: "paint",
                paint: "paint",
                cmd: "ms-dos",
                "ms-dos": "ms-dos",
                explorer: "my-computer",
                control: "control-panel",
                ie: "internet-explorer"
            };
            if (map[normalized]) {
                system.windows.create(map[normalized]);
                return true;
            }
            if (system.openTarget(command)) return true;
            await showOpenError(system, `Cannot find '${command}'.`);
            return false;
        };

        system.runShellAction = (action) => {
            if (action === "open-display-properties") system.windows.create("display-properties");
            if (action === "open-date-time") system.windows.create("date-time");
            if (action === "open-help") system.windows.create("help-viewer");
            if (action === "open-find") system.dialogs.alert("Find", "Use Explorer or Internet Explorer to browse for content.", "info");
            if (action === "open-shutdown") system.boot.openShutdownDialog();
        };

        const definitions = createAppDefinitions(system);
        Object.entries(definitions).forEach(([key, definition]) => system.registry.register(key, definition));

        system.tooltip.init();
        system.windows.init();
        system.desktop.init();
        system.startMenu.init();
        system.clock.init();
        system.boot.init();
        system.desktop.render();
        const params = new URLSearchParams(window.location.search);
        if (params.get("autologin") === "1") {
            setTimeout(() => {
                system.boot.finishLogin();
                const openList = (params.get("open") || "").split(",").map((item) => item.trim()).filter(Boolean);
                openList.forEach((appId) => {
                    if (system.registry.get(appId)) system.windows.create(appId);
                });
            }, 2400);
        }
        window.WIN98 = system;
        return system;
    }

    document.addEventListener("DOMContentLoaded", () => {
        createSystem();
    });
})();
