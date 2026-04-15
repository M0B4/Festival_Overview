const GITHUB_USER = 'm0b4';
const GITHUB_REPO = 'Festival_Overview';
const DATA_FOLDER = 'data';

const colorThief = new ColorThief();
const festivalColorCache = {};

const primarySelect = document.getElementById('primary-select');
const compareContainer = document.getElementById('compare-container');
const searchInput = document.getElementById('search-input');
const displayFilter = document.getElementById('display-filter');
const tableBody = document.getElementById('band-table-body');
const stats = document.getElementById('stats');

let allFestivalFiles = [];
let primaryBands = [];
let cachedComparisons = {};
let currentSort = { column: 'name', direction: 'asc' };

function toggleSection(id) { document.getElementById(id).classList.toggle('collapsed'); }

function handleSort(column) {
    if (currentSort.column === column) { currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc'; } else { currentSort.column = column;
        currentSort.direction = 'asc'; }
    renderTable();
}

async function getFestivalColor(festivalPath) {
    const fileName = decodeURIComponent(festivalPath.split('/').pop());
    if (festivalColorCache[fileName]) return festivalColorCache[fileName];

    const info = (typeof festivalMetadata !== 'undefined') ? festivalMetadata[fileName] : null;
    const posterUrl = info ? (info.poster_thumb || info.poster) : null;

    if (!posterUrl) {
        festivalColorCache[fileName] = 'rgb(127, 140, 141)';
        return festivalColorCache[fileName];
    }

    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = posterUrl;
        img.onload = () => {
            try {
                const palette = colorThief.getPalette(img, 5);
                let bestColor = palette[0];
                let maxSat = 0;
                for (let col of palette) {
                    const diff = Math.max(...col) - Math.min(...col);
                    if (diff > maxSat) { maxSat = diff;
                        bestColor = col; }
                }
                const colorString = `rgb(${bestColor[0]}, ${bestColor[1]}, ${bestColor[2]})`;
                festivalColorCache[fileName] = colorString;
                resolve(colorString);
            } catch (e) { resolve('rgb(127, 140, 141)'); }
        };
        img.onerror = () => resolve('rgb(127, 140, 141)');
    });
}

function updateFestivalInfo(filePath) {
    const fileName = decodeURIComponent(filePath.split('/').pop());
    const info = (typeof festivalMetadata !== 'undefined') ? festivalMetadata[fileName] : null;
    const infoCard = document.getElementById('festival-info-card');

    if (info) {
        infoCard.style.display = 'block';
        document.getElementById('info-name').innerText = prettyName(fileName);
        document.getElementById('info-date').innerText = info.date || '-';
        document.getElementById('info-location').innerText = info.location || '-';
        document.getElementById('info-price').innerText = info.price || 'k.A.';
        document.getElementById('info-link').href = info.website || '#';
        document.getElementById('info-desc').innerText = info.description || '';
        const posterImg = document.getElementById('info-poster');
        const thumbSrc = info.poster_thumb || info.poster;
        if (thumbSrc) { posterImg.src = thumbSrc;
            posterImg.style.display = 'block'; } else { posterImg.style.display = 'none'; }
        infoCard.classList.remove('collapsed');
    } else { infoCard.style.display = 'none'; }
}

function getFlagImg(countryName) {
    if (!countryName) return '🏴';
    const code = typeof countryCodes !== 'undefined' ? countryCodes[countryName.trim().toLowerCase()] : null;
    return code ? `<img src="https://flagcdn.com/w40/${code}.png" style="width:20px;">` : '🏴';
}

function prettyName(filename) { return filename.replace('.json', '').replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); }

async function init() {
    try {
        const res = await fetch(`https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${DATA_FOLDER}`);
        const files = await res.json();
        allFestivalFiles = files.filter(f => f.name.endsWith('.json'));
        primarySelect.innerHTML = '';
        allFestivalFiles.forEach(file => {
            const opt = document.createElement('option');
            opt.value = file.path;
            opt.textContent = prettyName(file.name);
            primarySelect.appendChild(opt);
        });
        if (primarySelect.options.length > 0) primarySelect.selectedIndex = primarySelect.options.length - 1;
        updateCompareCheckboxes();
        loadPrimaryData();
    } catch (e) { stats.innerText = "GitHub-Ladefehler."; }
}

function updateCompareCheckboxes() {
    compareContainer.innerHTML = '';
    allFestivalFiles.forEach(file => {
        if (file.path === primarySelect.value) return;
        const label = document.createElement('label');
        label.className = 'compare-item';
        label.innerHTML = `<input type="checkbox" value="${file.path}"> ${prettyName(file.name)}`;
        label.querySelector('input').addEventListener('change', renderTable);
        compareContainer.appendChild(label);
    });
}

async function loadPrimaryData() {
    const filePath = primarySelect.value;
    updateFestivalInfo(filePath);
    const res = await fetch(filePath);
    primaryBands = await res.json();
    renderTable();
}

async function renderTable() {
    const searchTerm = searchInput.value.toLowerCase();
    const filterMode = displayFilter.value;
    const checkedCheckboxes = Array.from(compareContainer.querySelectorAll('input:checked'));

    let matchMap = {};
    for (let cb of checkedCheckboxes) {
        const path = cb.value;
        if (!cachedComparisons[path]) {
            const res = await fetch(path);
            const data = await res.json();
            cachedComparisons[path] = new Set(data.map(b => b.name.toLowerCase().trim()));
        }
        const festColor = await getFestivalColor(path);
        cachedComparisons[path].forEach(name => {
            if (!matchMap[name]) matchMap[name] = [];
            matchMap[name].push({ name: prettyName(path.split('/').pop()), color: festColor });
        });
    }

    let filteredBands = primaryBands.filter(band => {
        const lowName = (band.name || "").toLowerCase().trim();
        const matches = matchMap[lowName] || [];
        const isShared = matches.length > 0;
        if (filterMode === 'exclusive' && isShared) return false;
        if (filterMode === 'shared' && !isShared) return false;
        if (!band.name.toLowerCase().includes(searchTerm) && !band.genre.toLowerCase().includes(searchTerm)) return false;
        return true;
    });

    filteredBands.sort((a, b) => {
        let valA = a[currentSort.column].toLowerCase();
        let valB = b[currentSort.column].toLowerCase();
        return currentSort.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });

    tableBody.innerHTML = '';
    let overlapCount = 0;
    let festCounts = {};

    filteredBands.forEach(band => {
        const lowName = (band.name || "").toLowerCase().trim();
        const matches = matchMap[lowName] || [];
        if (matches.length > 0) {
            overlapCount++;
            matches.forEach(m => festCounts[m.name] = (festCounts[m.name] || 0) + 1);
        }
        const row = document.createElement('tr');
        let badgesHtml = '';
        matches.forEach(m => {
            badgesHtml += `<span class="badge" style="background-color: ${m.color}">${m.name}</span>`;
        });
        row.innerHTML = `<td>${getFlagImg(band.country)}</td><td><strong>${band.name}</strong>${badgesHtml}</td><td style="color:#666; font-size:12px">${band.genre}</td>`;
        tableBody.appendChild(row);
    });

    let statsText = `<strong>${filteredBands.length} BANDS</strong> (${overlapCount} ÜBERSCHNEIDUNGEN)`;
    if (Object.keys(festCounts).length > 0) {
        statsText += ` <span style="font-size:11px; color:#666; margin-left:10px;">[ ${Object.entries(festCounts).map(([n,c])=>`${n}: ${c}`).join(' | ')} ]</span>`;
    }
    stats.innerHTML = statsText;
    updateGenreStats(filteredBands);
}

function updateGenreStats(displayedBands) {
    const statsGrid = document.getElementById('stats-grid');
    if (!displayedBands.length) { statsGrid.innerHTML = 'Keine Daten.'; return; }
    const counts = {};
    displayedBands.forEach(band => counts[band.genre] = (counts[band.genre] || 0) + 1);
    const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10);
    statsGrid.innerHTML = sorted.map(([g,c]) => {
        const p = Math.round((c/displayedBands.length)*100);
        return `<div class="stat-item"><div class="stat-info"><span>${g}</span><span>${p}%</span></div><div class="stat-bar-bg"><div class="stat-bar-fill" style="width:${p}%"></div></div></div>`;
    }).join('');
}

primarySelect.addEventListener('change', () => { updateCompareCheckboxes(); loadPrimaryData(); });
searchInput.addEventListener('input', renderTable);
displayFilter.addEventListener('change', renderTable);
window.onclick = (e) => { if (e.target.id === 'poster-modal') e.target.style.display = "none"; }
document.getElementById('info-poster').onclick = function() {
    const info = festivalMetadata[decodeURIComponent(primarySelect.value.split('/').pop())];
    if (info) { document.getElementById('modal-img').src = info.poster_full || info.poster; document.getElementById('poster-modal').style.display = "block"; }
};

init();