// Sanapyramidi – vanilla JS, URL-driven state (config only)

/*
Config schema (URL-encoded in #game=):
{
  categories: [
    { title: "Category A", words: [".."], size: 1 },
    { title: "Category B", words: ["..", ".."], size: 2 },
    { title: "Category C", words: ["..", "..", ".."], size: 3 },
    { title: "Category D", words: [4 words], size: 4 },
    { title: "Category E", words: [5 words], size: 5 }
  ]
}
*/

(function () {
    const appRoot = document.getElementById('app');

    const DEFAULT_CONFIG = {
        categories: [
            { title: 'Solo', size: 1, words: ['Sun'] },
            { title: 'Duos', size: 2, words: ['Salt', 'Pepper'] },
            { title: 'Trios', size: 3, words: ['Red', 'Green', 'Blue'] },
            { title: 'Quads', size: 4, words: ['North', 'South', 'East', 'West'] },
            { title: 'Vowels', size: 5, words: ['A', 'E', 'I', 'O', 'U'] }
        ],
        theme: 'original'
    };

    const MIN_ROWS = 5;
    const MAX_ROWS = 10;
    const MAX_WORD_LENGTH = 16;
    const MAX_TITLE_LENGTH = 40;
    const PALETTE = ['#00e5ff', '#ff00aa', '#ffee00', '#00ff85', '#9b5eff', '#ff5e00'];

    // Base64URL helpers
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

    function loadConfigFromHash() {
        const params = getHashParams();
        if (params.game) {
            try {
                const json = decodeBase64Url(params.game);
                const cfg = JSON.parse(json);
                validateConfig(cfg);
                return cfg;
            } catch (e) {
                console.warn('Invalid game config in URL, using default', e);
                return DEFAULT_CONFIG;
            }
        }
        return DEFAULT_CONFIG;
    }

    function saveConfigToHash(cfg, mode) {
        const params = getHashParams();
        const json = JSON.stringify(cfg);
        params.game = encodeBase64Url(json);
        params.mode = mode || params.mode || 'play';
        setHashParams(params);
    }

    function validateConfig(cfg) {
        if (!cfg || !Array.isArray(cfg.categories)) {
            throw new Error('Missing categories.');
        }
        const catCount = cfg.categories.length;
        if (catCount < MIN_ROWS || catCount > MAX_ROWS) {
            throw new Error('Categories must be 5 to 10 groups.');
        }
        const sizesPresent = cfg.categories.map(c => Number(c.size)).filter(n => Number.isFinite(n));
        const maxSize = Math.max.apply(null, sizesPresent);
        if (catCount !== maxSize) {
            throw new Error('Sizes must be continuous 1..N without gaps.');
        }
        if (maxSize < MIN_ROWS || maxSize > MAX_ROWS) {
            throw new Error('Max size N must be between 5 and 10.');
        }
        const expectedSizes = Array.from({ length: maxSize }, (_, i) => i + 1);
        const seenSizes = new Set();
        const allWords = new Set();
        for (const c of cfg.categories) {
            if (!expectedSizes.includes(c.size)) throw new Error('Invalid category size. Must be 1..N.');
            if (seenSizes.has(c.size)) throw new Error('Duplicate size definition.');
            seenSizes.add(c.size);
            if (!Array.isArray(c.words) || c.words.length !== c.size) throw new Error('Words length must equal size.');
            for (const w of c.words) {
                if (typeof w !== 'string' || !w.trim()) throw new Error('Words must be non-empty.');
                if (w.length > MAX_WORD_LENGTH) throw new Error('Word too long.');
                const norm = w.toLowerCase();
                if (allWords.has(norm)) throw new Error('Duplicate word detected.');
                allWords.add(norm);
            }
            if (typeof c.title !== 'string') c.title = '';
            if (c.title.length > MAX_TITLE_LENGTH) throw new Error('Title too long.');
        }
        const sizesOk = expectedSizes.every(s => seenSizes.has(s));
        if (!sizesOk) throw new Error('Sizes 1..N must appear exactly once.');
        const expectedWords = (maxSize * (maxSize + 1)) / 2;
        if (Array.from(allWords).length !== expectedWords) throw new Error('Total words must be ' + expectedWords + ' unique.');
    }

    function shuffle(array, seed) {
        // Mulberry32 PRNG
        function mulberry32(a) {
            return function () {
                let t = a += 0x6D2B79F5;
                t = Math.imul(t ^ t >>> 15, t | 1);
                t ^= t + Math.imul(t ^ t >>> 7, t | 61);
                return ((t ^ t >>> 14) >>> 0) / 4294967296;
            };
        }
        const rand = mulberry32(seed >>> 0);
        const arr = array.slice();
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function makeSeed() {
        return Math.floor(Math.random() * 2 ** 31);
    }

    function setEquals(a, b) {
        if (a.size !== b.size) return false;
        for (const v of a) {
            if (!b.has(v)) return false;
        }
        return true;
    }

    function render() {
        const params = getHashParams();
        const mode = params.mode || 'play';
        const config = loadConfigFromHash();
        if (mode === 'admin') {
            // Admin UI lives on admin.html
            window.location.href = './admin.html';
            return;
        } else if (mode === 'help') {
            renderHelp();
        } else {
            applyTheme(config.theme || 'original');
            renderPlay(config);
        }
        updateNav(mode);
    }

    function applyTheme(theme) {
        const root = document.documentElement;
        root.classList.remove('theme-light', 'theme-sunset');
        if (theme === 'light') root.classList.add('theme-light');
        else if (theme === 'sunset') root.classList.add('theme-sunset');
    }

    function updateNav(mode) {
        const play = document.getElementById('nav-play');
        const admin = document.getElementById('nav-admin');
        const help = document.getElementById('nav-help');
        const elements = [play, admin, help].filter(Boolean);
        if (elements.length === 0) return;
        elements.forEach(el => el.classList.remove('active'));
        if (mode === 'admin' && admin) admin.classList.add('active');
        else if (mode === 'help' && help) help.classList.add('active');
        else if (play) play.classList.add('active');
    }

    // Admin UI removed; now lives in admin.html/admin.js

    // Play UI
    function renderPlay(config) {
        const seed = makeSeed(); // restart always
        const allWords = config.categories.flatMap(c => c.words.map(w => ({ word: w, size: c.size, title: c.title })));
        const randomized = shuffle(allWords, seed);

        const maxRow = Math.max.apply(null, config.categories.map(c => c.size));
        const SIZES = Array.from({ length: maxRow }, (_, i) => i + 1);
        const TOTAL_WORDS = (maxRow * (maxRow + 1)) / 2;

        const state = {
            remainingLives: 4,
            selected: new Set(),
            solvedBySize: new Set(),
            lockedWords: new Set(),
            order: randomized.map(x => x.word),
            solvedColors: {}, // size -> hex color
            didIntro: false,
        };

        appRoot.innerHTML = '' +
            '<div id="pyramid" class="pyramid" aria-label="Word pyramid"></div>' +
            '<div id="message"></div>' +
            '<div class="controls">' +
            '  <button id="check-btn" class="primary">Check</button>' +
            '  <button id="restart-btn">Restart</button>' +
            '  <div class="lives" title="Lives"><div id="lives-dots" class="lives-dots" aria-label="Lives"></div></div>' +
            '</div>';

        const pyramidEl = document.getElementById('pyramid');
        renderFromOrder();
        renderLivesDots();
        if (!state.didIntro) {
            startIntroReveal(pyramidEl);
            state.didIntro = true;
        }

        document.getElementById('check-btn').onclick = () => onCheck(randomized, state, pyramidEl, config);
        document.getElementById('restart-btn').onclick = () => { render(); };

        function updateTilesSelection() {
            const tiles = pyramidEl.querySelectorAll('.tile');
            tiles.forEach(tile => {
                const key = tile.getAttribute('data-word');
                tile.classList.toggle('selected', state.selected.has(key));
            });
            updateCheckEnabled();
        }

        function updateCheckEnabled() {
            const sizesLeft = SIZES.filter(s => !state.solvedBySize.has(s));
            const validCounts = new Set(sizesLeft);
            const enable = validCounts.has(state.selected.size);
            document.getElementById('check-btn').disabled = !enable || state.selected.size === 0;
        }

        function onTileClick(word, el) {
            if (state.lockedWords.has(word)) return;
            if (state.selected.has(word)) state.selected.delete(word); else state.selected.add(word);
            updateTilesSelection();
        }

        function onCheck(randomized, state, pyramidEl, config) {
            const selectedWords = Array.from(state.selected);
            if (selectedWords.length === 0) return;
            const sizesLeft = SIZES.filter(s => !state.solvedBySize.has(s));
            if (!sizesLeft.includes(selectedWords.length)) {
                // disallow check if size mismatch; force button disabled guard
                return;
            }

            const solvedCat = config.categories.find(c => c.size === selectedWords.length && setEquals(new Set(c.words), new Set(selectedWords)));
            if (solvedCat) {
                state.solvedBySize.add(solvedCat.size);
                selectedWords.forEach(w => state.lockedWords.add(w));
                // Melt out selected tiles before placing the solved row
                meltSelectedTiles(pyramidEl, selectedWords, () => {
                    rebuildOrderRespectingSolved(solvedCat.size, selectedWords);
                    renderFromOrder();
                    mergeSolvedRow(pyramidEl, solvedCat);
                    flashRow(pyramidEl, solvedCat.size, solvedCat.title);
                    state.selected.clear();
                    updateTilesSelection();
                    updateTilesLocked();
                    maybeWin();
                });
            } else {
                state.remainingLives -= 1;
                renderLivesDots();
                shakeSelected(pyramidEl);
                state.selected.clear();
                updateTilesSelection();
                if (state.remainingLives <= 0) {
                    const msg = document.getElementById('message');
                    if (msg) { msg.textContent = ''; msg.className = ''; }
                    revealAnswers(pyramidEl, config);
                    disableAll();
                }
            }
        }

        function updateTilesLocked() {
            const tiles = pyramidEl.querySelectorAll('.tile');
            tiles.forEach(tile => {
                const word = tile.getAttribute('data-word');
                const locked = state.lockedWords.has(word);
                tile.classList.toggle('locked', locked);
            });
        }

        function maybeWin() {
            if (state.solvedBySize.size === maxRow) {
                const msg = document.getElementById('message');
                if (msg) msg.textContent = '';
                launchFireworks();
                disableAll();
            }
        }

        function disableAll() {
            document.getElementById('check-btn').disabled = true;
            const tiles = pyramidEl.querySelectorAll('.tile');
            tiles.forEach(t => t.setAttribute('aria-disabled', 'true'));
        }

        function setMessage(text, isError) {
            const el = document.getElementById('message');
            el.className = 'banner ' + (isError ? 'error' : 'ok');
            el.textContent = text;
        }

        function shakeSelected(root) {
            const selected = root.querySelectorAll('.tile.selected');
            selected.forEach(t => {
                t.classList.remove('shake');
                // force reflow
                void t.offsetWidth;
                t.classList.add('shake');
            });
        }

        function revealAnswers(pyramidEl, config) {
            // Place each category's words into its correct row, then mark solved
            const finalOrder = new Array(TOTAL_WORDS);
            const bounds = rowBounds();
            for (const cat of config.categories) {
                const [start, end] = bounds[cat.size];
                const rowWords = cat.words.slice();
                for (let i = start, k = 0; i <= end; i++, k++) finalOrder[i] = rowWords[k];
            }
            state.order = finalOrder;
            // mark solved and assign colors
            state.solvedBySize = new Set(SIZES);
            for (const cat of config.categories) {
                cat.words.forEach(w => state.lockedWords.add(w));
                ensureRowColor(cat.size);
            }
            renderFromOrder();
            for (const cat of config.categories) {
                mergeSolvedRow(pyramidEl, cat);
            }
        }

        function flashRow(pyramidEl, size, title) {
            const rowEl = pyramidEl.querySelector('[data-row="' + size + '"]');
            if (!rowEl) return;
            rowEl.classList.add('row-solved');
            setTimeout(() => rowEl.classList.remove('row-solved'), 700);
        }

        // removed label under solved row per request

        function renderFromOrder() {
            // If pyramid not yet built, render full
            if (!pyramidEl.firstChild) {
                renderPyramidFromWords(pyramidEl, state.order);
            } else {
                // Update only unfinished rows to avoid flicker
                const bounds = rowBounds();
                for (let r = 1; r <= maxRow; r++) {
                    const rowEl = pyramidEl.querySelector('[data-row="' + r + '"]');
                    if (!rowEl) continue;
                    if (state.solvedBySize.has(r)) {
                        // keep merged row as-is
                        continue;
                    }
                    const [start, end] = bounds[r];
                    // Rebuild this row's tiles only
                    while (rowEl.firstChild) rowEl.removeChild(rowEl.firstChild);
                    for (let i = start; i <= end; i++) {
                        const word = state.order[i];
                        const tile = document.createElement('div');
                        tile.className = 'tile';
                        tile.setAttribute('tabindex', '0');
                        tile.setAttribute('data-word', word);
                        tile.textContent = word;
                        tile.onclick = () => onTileClick(word, tile);
                        tile.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTileClick(word, tile); } };
                        rowEl.appendChild(tile);
                    }
                }
            }
            updateTilesLocked();
            updateTilesSelection();
            // keep solved rows merged after rerender
            for (const size of state.solvedBySize) {
                const cat = config.categories.find(c => c.size === size);
                if (cat) mergeSolvedRow(pyramidEl, cat);
            }
            renderLivesDots();
        }

        function renderLivesDots() {
            const container = document.getElementById('lives-dots');
            if (!container) return;
            const maxLives = 4;
            const previous = container.querySelectorAll('.dot');
            const prevCount = previous.length;
            container.innerHTML = '';
            for (let i = 0; i < maxLives; i++) {
                const dot = document.createElement('span');
                const isFilled = i < state.remainingLives;
                dot.className = 'dot' + (isFilled ? ' filled' : '');
                // animate those that were filled but now lost
                if (prevCount > 0 && i >= state.remainingLives) {
                    dot.className += ' lost';
                }
                container.appendChild(dot);
            }
        }

        function launchFireworks() {
            const host = document.getElementById('pyramid') || appRoot;
            const layer = document.createElement('div');
            layer.className = 'fireworks-layer';
            host.appendChild(layer);

            // Center bursts around the middle row
            const rowEl = host.querySelector('[data-row="' + Math.ceil(maxRow / 2) + '"]');
            const hostRect = host.getBoundingClientRect();
            let centerXPct = 50, centerYPct = 50;
            if (rowEl && hostRect.width > 0 && hostRect.height > 0) {
                const rowRect = rowEl.getBoundingClientRect();
                const cx = (rowRect.left + rowRect.right) / 2;
                const cy = (rowRect.top + rowRect.bottom) / 2;
                centerXPct = ((cx - hostRect.left) / hostRect.width) * 100;
                centerYPct = ((cy - hostRect.top) / hostRect.height) * 100;
            }

            const bursts = 4;
            for (let b = 0; b < bursts; b++) {
                const jitterX = (Math.random() * 8) - 4; // +/-4%
                const jitterY = (Math.random() * 6) - 3; // +/-3%
                spawnBurst(layer, centerXPct + jitterX, centerYPct + jitterY);
            }
            setTimeout(() => { if (layer.parentNode) layer.parentNode.removeChild(layer); }, 1600);
        }

        function spawnBurst(layer, xPct, yPct) {
            const particles = 26;
            const radius = 80 + Math.random() * 50; // px
            const colors = PALETTE;
            for (let i = 0; i < particles; i++) {
                const p = document.createElement('span');
                p.className = 'firework-particle';
                const angle = (Math.PI * 2) * (i / particles) + Math.random() * 0.6;
                const dist = radius * (0.6 + Math.random() * 0.6);
                const dx = Math.cos(angle) * dist;
                const dy = Math.sin(angle) * dist;
                p.style.left = xPct + '%';
                p.style.top = yPct + '%';
                p.style.setProperty('--tx', dx + 'px');
                p.style.setProperty('--ty', dy + 'px');
                p.style.backgroundColor = colors[i % colors.length];
                p.style.animationDelay = (Math.random() * 120) + 'ms';
                layer.appendChild(p);
            }
        }

        function renderPyramidFromWords(root, words) {
            root.innerHTML = '';
            let idx = 0;
            for (let r = 1; r <= maxRow; r++) {
                const row = document.createElement('div');
                row.className = 'row row-' + r;
                row.setAttribute('data-row', String(r));
                for (let c = 0; c < r; c++) {
                    const word = words[idx++];
                    const tile = document.createElement('div');
                    tile.className = 'tile';
                    tile.setAttribute('tabindex', '0');
                    tile.setAttribute('data-word', word);
                    const wordEl = document.createElement('span');
                    wordEl.className = 'word';
                    wordEl.textContent = word;
                    tile.appendChild(wordEl);
                    tile.onclick = () => onTileClick(word, tile);
                    tile.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTileClick(word, tile); } };
                    row.appendChild(tile);
                }
                root.appendChild(row);
            }
        }

        function startIntroReveal(root) {
            const tiles = Array.from(root.querySelectorAll('.tile'));
            // prepare: hide words instantly before first paint
            tiles.forEach(t => t.classList.add('hiding'));
            tiles.forEach((t, i) => {
                const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
                t.classList.add('intro');
                t.style.backgroundColor = hexToRgba(color, 0.35);
                t.style.borderColor = color;
                t.style.boxShadow = '0 0 12px 0 ' + hexToRgba(color, 0.35);
                setTimeout(() => {
                    // begin darkening: clear inline colors to transition back to defaults
                    const onEnd = (e) => {
                        if (e.propertyName !== 'background-color' && e.propertyName !== 'background') return;
                        t.removeEventListener('transitionend', onEnd);
                        // show word only after dark background reached
                        t.classList.remove('hiding');
                        t.classList.remove('intro');
                        t.style.boxShadow = '';
                    };
                    t.addEventListener('transitionend', onEnd);
                    t.style.backgroundColor = '';
                    t.style.borderColor = '';
                    // safety fallback
                    setTimeout(() => {
                        if (t.classList.contains('hiding')) {
                            t.classList.remove('hiding');
                            t.classList.remove('intro');
                            t.style.boxShadow = '';
                        }
                    }, 500);
                }, 80 * i);
            });
        }

        function mergeSolvedRow(root, cat) {
            const bounds = rowBounds();
            const [start, end] = bounds[cat.size];
            const rowEl = root.querySelector('[data-row="' + cat.size + '"]');
            if (!rowEl) return;
            const color = ensureRowColor(cat.size);
            const merged = document.createElement('div');
            merged.className = 'merged-cell';
            merged.style.backgroundColor = hexToRgba(color, 0.3);
            merged.style.borderColor = hexToRgba(color, 0.35);
            merged.style.gridColumn = '1 / -1';
            const title = document.createElement('div');
            title.className = 'merged-title';
            title.textContent = cat.title ? cat.title : 'Solved';
            const words = document.createElement('div');
            words.className = 'merged-words';
            words.textContent = cat.words.join(', ');
            merged.appendChild(title);
            merged.appendChild(words);
            // replace row children with single merged node
            while (rowEl.firstChild) rowEl.removeChild(rowEl.firstChild);
            rowEl.appendChild(merged);
        }

        function meltSelectedTiles(root, words, done) {
            const tiles = [];
            for (const w of words) {
                const selector = '.tile[data-word="' + (window.CSS && CSS.escape ? CSS.escape(w) : String(w).replace(/"/g, '\\"')) + '"]';
                const el = root.querySelector(selector);
                if (el) tiles.push(el);
            }
            if (tiles.length === 0) return done();
            let remaining = tiles.length;
            tiles.forEach(el => {
                el.classList.add('melting');
                const onEnd = () => {
                    el.removeEventListener('animationend', onEnd);
                    if (--remaining === 0) done();
                };
                el.addEventListener('animationend', onEnd);
            });
            // Safety fallback in case events don't fire
            setTimeout(() => { if (remaining > 0) done(); }, 450);
        }

        function rowBounds() {
            // returns map size-> [startIndex, endIndex]
            let start = 0;
            const map = {};
            for (let r = 1; r <= maxRow; r++) {
                const end = start + r - 1;
                map[r] = [start, end];
                start = end + 1;
            }
            return map;
        }

        function rebuildOrderRespectingSolved(newlySolvedSize, newlySolvedWords) {
            const bounds = rowBounds();
            // solved sizes include the newly solved
            const solvedSizes = new Set(state.solvedBySize);
            if (newlySolvedSize != null) solvedSizes.add(newlySolvedSize);

            // Build map size -> words to lock into that row
            const wordsBySize = {};
            for (const c of config.categories) {
                if (solvedSizes.has(c.size)) {
                    wordsBySize[c.size] = (c.size === newlySolvedSize) ? newlySolvedWords.slice() : c.words.slice();
                }
            }
            const allLocked = new Set(Object.values(wordsBySize).flat());
            const freeWords = state.order.filter(w => !allLocked.has(w));

            const order = new Array(TOTAL_WORDS);
            // place solved rows first
            for (const size of SIZES) {
                if (wordsBySize[size]) {
                    const [start, end] = bounds[size];
                    const rowWords = wordsBySize[size];
                    for (let i = start, k = 0; i <= end; i++, k++) order[i] = rowWords[k];
                }
            }
            // fill remaining positions with free words in order
            let idx = 0;
            for (let i = 0; i < order.length; i++) {
                if (!order[i]) order[i] = freeWords[idx++];
            }
            state.order = order;
        }

        function ensureRowColor(size) {
            if (state.solvedColors[size]) return state.solvedColors[size];
            // pick an unused color if possible
            const used = new Set(Object.values(state.solvedColors));
            const candidates = PALETTE.filter(c => !used.has(c));
            const pickFrom = candidates.length ? candidates : PALETTE;
            const color = pickFrom[Math.floor(Math.random() * pickFrom.length)];
            state.solvedColors[size] = color;
            return color;
        }

        function hexToRgba(hex, alpha) {
            let h = hex.replace('#', '');
            if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
            const r = parseInt(h.slice(0, 2), 16);
            const g = parseInt(h.slice(2, 4), 16);
            const b = parseInt(h.slice(4, 6), 16);
            return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
        }

        // removed solved row background styling
    }

    function buildPyramidHtml(words) {
        let html = '<div class="pyramid">';
        let idx = 0;
        for (let r = 1; r <= 5; r++) {
            html += '<div class="row row-' + r + '" data-row="' + r + '">';
            for (let c = 0; c < r; c++) {
                const w = words[idx++];
                html += '<div class="tile" data-word="' + escapeHtml(w) + '">' + escapeHtml(w) + '</div>';
            }
            html += '</div>';
        }
        html += '</div>';
        return html;
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function renderHelp() {
        appRoot.innerHTML = '' +
            '<section class="help">' +
            '<h3>How to Play</h3>' +
            '<p>Select words that belong together. Press Check when your selection size matches a remaining group size. You have 4 lives. Wrong checks cost a life. Solved rows reveal their title. When lives reach 0, answers are revealed.</p>' +
            '<h3>Admin</h3>' +
            '<p>Use Admin to build a puzzle. Save to encode it in the URL and share the Play link. Refreshing or sharing restarts the game.</p>' +
            '</section>';
    }

    window.addEventListener('hashchange', render);
    document.addEventListener('DOMContentLoaded', () => {
        // Ensure there is a mode param
        const params = getHashParams();
        if (!params.mode) {
            params.mode = 'play';
            setHashParams(params);
        }
        render();
    });
})();


