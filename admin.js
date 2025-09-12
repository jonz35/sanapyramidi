(function () {
    const MIN_ROWS = 5;
    const MAX_ROWS = 10;
    const MAX_WORD_LENGTH = 16;
    const MAX_TITLE_LENGTH = 40;

    const appRoot = document.getElementById('app');

    function encodeBase64Url(str) {
        return btoa(unescape(encodeURIComponent(str)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '');
    }
    function decodeBase64Url(str) {
        const pad = str.length % 4 === 2 ? '==' : str.length % 4 === 3 ? '=' : '';
        const s = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
        return decodeURIComponent(escape(atob(s)));
    }

    function getHashParams() {
        const raw = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
        const pairs = new URLSearchParams(raw);
        const obj = {};
        for (const [k, v] of pairs.entries()) obj[k] = v;
        return obj;
    }
    function setHashParams(obj) {
        const params = new URLSearchParams(obj);
        const newHash = '#' + params.toString();
        if (newHash !== location.hash) {
            history.replaceState(null, '', newHash);
        }
    }

    function validateConfig(cfg) {
        if (!cfg || !Array.isArray(cfg.categories)) {
            throw new Error('Missing categories.');
        }
        const count = cfg.categories.length;
        if (count < MIN_ROWS || count > MAX_ROWS) throw new Error('Use 5 to 10 categories.');
        const sizes = cfg.categories.map(c => Number(c.size));
        const maxSize = Math.max.apply(null, sizes);
        if (maxSize !== count) throw new Error('Sizes must be 1..N with no gaps.');
        const expected = new Set(Array.from({ length: maxSize }, (_, i) => i + 1));
        const seen = new Set();
        const all = new Set();
        for (const c of cfg.categories) {
            if (!expected.has(c.size)) throw new Error('Invalid size.');
            if (seen.has(c.size)) throw new Error('Duplicate size ' + c.size);
            seen.add(c.size);
            if (!Array.isArray(c.words) || c.words.length !== c.size) throw new Error('Words length must equal size.');
            for (const w of c.words) {
                if (typeof w !== 'string' || !w.trim()) throw new Error('Words must be non-empty.');
                if (w.length > MAX_WORD_LENGTH) throw new Error('Word too long.');
                const key = w.toLowerCase();
                if (all.has(key)) throw new Error('Duplicate word: ' + w);
                all.add(key);
            }
            if (typeof c.title !== 'string') c.title = '';
            if (c.title.length > MAX_TITLE_LENGTH) throw new Error('Title too long.');
        }
        const expectedWords = (maxSize * (maxSize + 1)) / 2;
        if (Array.from(all).length !== expectedWords) throw new Error('Must have exactly ' + expectedWords + ' unique words.');
    }

    function buildAdmin(config) {
        appRoot.innerHTML = '' +
            '<section class="banner">Create a puzzle: 5–10 categories sized 1..N.</section>' +
            '<div class="admin-form" id="admin-form"></div>' +
            '<div class="admin-actions">' +
            '  <button id="add-cat-btn">Add category</button>' +
            '  <button id="remove-cat-btn" class="danger">Remove last</button>' +
            '</div>' +
            '<div class="admin-actions">' +
            '  <button id="save-play-btn" class="primary">Save & Play</button>' +
            '  <button id="copy-play-btn">Copy Play Link</button>' +
            '  <button id="copy-admin-btn">Copy Admin Link</button>' +
            '  <span class="output" id="admin-status"></span>' +
            '</div>' +
            '<div id="admin-preview"></div>';

        let current = normalizeConfig(config);
        const formEl = document.getElementById('admin-form');
        rerenderForm();

        function rerenderForm() {
            formEl.innerHTML = '';
            formEl.appendChild(buildAdminForm(current));
            // enable/disable add/remove
            const canAdd = current.categories.length < MAX_ROWS;
            const canRemove = current.categories.length > MIN_ROWS;
            document.getElementById('add-cat-btn').disabled = !canAdd;
            document.getElementById('remove-cat-btn').disabled = !canRemove;
        }

        document.getElementById('add-cat-btn').onclick = () => {
            current = readAdminForm();
            const nextSize = current.categories.length + 1;
            if (nextSize > MAX_ROWS) return;
            current.categories.push({ title: '', size: nextSize, words: new Array(nextSize).fill('') });
            rerenderForm();
        };
        document.getElementById('remove-cat-btn').onclick = () => {
            current = readAdminForm();
            if (current.categories.length <= MIN_ROWS) return;
            current.categories.pop();
            rerenderForm();
        };

        document.getElementById('save-play-btn').onclick = () => {
            const cfg = readAdminForm();
            const err = safeValidate(cfg);
            if (err) return setAdminStatus(err, true);
            const url = buildUrl('play', cfg);
            location.href = './index.html#mode=play&game=' + encodeURIComponent(url.game);
        };
        document.getElementById('copy-play-btn').onclick = async () => {
            const cfg = readAdminForm();
            const err = safeValidate(cfg);
            if (err) return setAdminStatus(err, true);
            const url = new URL(location.origin + location.pathname.replace('admin.html', 'index.html'));
            const enc = encodeBase64Url(JSON.stringify(cfg));
            url.hash = 'mode=play&game=' + enc;
            await navigator.clipboard.writeText(url.toString());
            setAdminStatus('Play link copied.');
        };
        document.getElementById('copy-admin-btn').onclick = async () => {
            const cfg = readAdminForm();
            const err = safeValidate(cfg);
            if (err) return setAdminStatus(err, true);
            const enc = encodeBase64Url(JSON.stringify(cfg));
            const url = new URL(location.href);
            url.hash = 'game=' + enc;
            await navigator.clipboard.writeText(url.toString());
            setAdminStatus('Admin link copied.');
        };
    }

    function buildUrl(mode, cfg) {
        const enc = encodeBase64Url(JSON.stringify(cfg));
        return { game: enc, mode };
    }

    function setAdminStatus(text, isError) {
        const el = document.getElementById('admin-status');
        if (!el) return;
        el.textContent = text;
        el.className = 'output' + (isError ? ' error' : '');
    }

    function buildAdminForm(config) {
        const frag = document.createDocumentFragment();
        const container = document.createElement('div');
        container.className = 'admin-form-inner';
        const maxSize = Math.max.apply(null, config.categories.map(c => c.size));
        for (let size = 1; size <= maxSize; size++) {
            const cat = config.categories.find(c => c.size === size) || { title: '', size, words: new Array(size).fill('') };
            const section = document.createElement('section');
            section.className = 'category';
            section.setAttribute('data-size', String(size));
            section.innerHTML = '' +
                '<h3>Group of ' + size + '</h3>' +
                '<div class="grid">' +
                '  <label>Title<br><input type="text" maxlength="' + MAX_TITLE_LENGTH + '" data-size="' + size + '" data-field="title" value="' + escapeHtml(cat.title) + '"/></label>' +
                buildWordInputs(size, cat.words) +
                '  <small>Comma-separated words (exactly ' + size + '). Unique, max ' + MAX_WORD_LENGTH + ' chars each.</small>' +
                '</div>';
            container.appendChild(section);
        }
        frag.appendChild(container);
        return frag;
    }

    function buildWordInputs(size, words) {
        const csv = (Array.isArray(words) ? words.filter(Boolean).join(', ') : '') || '';
        return '<label>Words<br><textarea rows="2" data-size="' + size + '" data-field="wordsCsv" placeholder="e.g. A, B, C">' + escapeHtml(csv) + '</textarea></label>';
    }

    function readAdminForm() {
        const sections = Array.from(document.querySelectorAll('section.category'));
        const categories = sections.map(sec => {
            const size = Number(sec.getAttribute('data-size'));
            const titleInput = sec.querySelector('input[data-field="title"]');
            const csvInput = sec.querySelector('textarea[data-field="wordsCsv"]');
            const words = (csvInput && csvInput.value || '')
                .split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0);
            return { title: (titleInput && titleInput.value || '').trim(), size, words };
        });
        // Ensure sorted and sizes are 1..N
        categories.sort((a, b) => a.size - b.size);
        for (let i = 0; i < categories.length; i++) categories[i].size = i + 1;
        return { categories };
    }

    function normalizeConfig(cfg) {
        const cats = Array.isArray(cfg.categories) ? cfg.categories.slice() : [];
        cats.sort((a, b) => a.size - b.size);
        let maxSize = cats.length > 0 ? Math.max.apply(null, cats.map(c => c.size)) : MIN_ROWS;
        if (!Number.isFinite(maxSize) || maxSize < MIN_ROWS) maxSize = MIN_ROWS;
        if (maxSize > MAX_ROWS) maxSize = MAX_ROWS;
        const normalized = [];
        for (let size = 1; size <= maxSize; size++) {
            const found = cats.find(c => c.size === size);
            if (found) {
                const words = Array.isArray(found.words) ? found.words.slice(0, size) : [];
                while (words.length < size) words.push('');
                normalized.push({ title: typeof found.title === 'string' ? found.title : '', size, words });
            } else {
                normalized.push({ title: '', size, words: new Array(size).fill('') });
            }
        }
        return { categories: normalized };
    }

    function safeValidate(cfg) {
        try {
            validateConfig(cfg);
            return '';
        } catch (e) {
            return e.message || 'Invalid configuration.';
        }
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // If we have a game param, preload admin form
    function loadConfigFromHashOrBlank() {
        const params = getHashParams();
        if (params.game) {
            try {
                const cfg = JSON.parse(decodeBase64Url(params.game));
                validateConfig(cfg);
                return cfg;
            } catch (e) {
                // ignore, fall through
            }
        }
        return {
            categories: [
                { title: '', size: 1, words: [''] },
                { title: '', size: 2, words: ['', ''] },
                { title: '', size: 3, words: ['', '', ''] },
                { title: '', size: 4, words: ['', '', '', ''] },
                { title: '', size: 5, words: ['', '', '', '', ''] },
            ]
        };
    }

    document.addEventListener('DOMContentLoaded', () => {
        const cfg = loadConfigFromHashOrBlank();
        buildAdmin(cfg);
    });
})();


