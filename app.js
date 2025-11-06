// app.js - liest Excel mit SheetJS und zeichnet mit Chart.js
// Lädt automatisch die Excel-Dateien aus data/ des Repos und lädt die erste Datei automatisch.

const REPO_OWNER = 'christoph4711';
const REPO_NAME = 'INT';
// Wir versuchen mehrere Kandidaten für den Branch-Namen (Main / main)
const REPO_BRANCH_CANDIDATES = ['Main', 'main'];

let REPO_BRANCH = null; // wird gesetzt, wenn ein branch funktioniert

let workbookData = null;
let currentSheetName = "";
let parsedRows = [];
let chart = null;

const fileInput = document.getElementById("fileInput");
const sheetSelect = document.getElementById("sheetSelect");
const headerRowCheckbox = document.getElementById("headerRow");
const xSelect = document.getElementById("xSelect");
const ySelect = document.getElementById("ySelect");
const chartType = document.getElementById("chartType");
const renderBtn = document.getElementById("renderBtn");
const downloadPNGBtn = document.getElementById("downloadPNGBtn");
const canvas = document.getElementById("chartCanvas").getContext("2d");

const repoFileSelect = document.getElementById('repoFileSelect');
const refreshRepoFilesBtn = document.getElementById('refreshRepoFiles');
const loadRepoFileBtn = document.getElementById('loadRepoFileBtn');

fileInput.addEventListener("change", handleFile, false);
sheetSelect.addEventListener("change", e => {
  currentSheetName = e.target.value;
  populateColumnSelectors();
});
renderBtn.addEventListener("click", renderChart);
downloadPNGBtn.addEventListener("click", downloadPNG);
refreshRepoFilesBtn.addEventListener('click', () => listRepoFiles(false));
loadRepoFileBtn.addEventListener('click', loadSelectedRepoFile);

// Beim Laden: Dateien aus data/ listen und automatisch die erste laden
listRepoFiles(true);

function handleFile(e){
  const f = e.target.files[0];
  if(!f) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const data = new Uint8Array(ev.target.result);
    const wb = XLSX.read(data, {type:"array"});
    workbookData = wb;
    populateSheetSelect(wb.SheetNames);
    renderBtn.disabled = false;
  };
  reader.readAsArrayBuffer(f);
}

function populateSheetSelect(sheetNames){
  sheetSelect.innerHTML = "";
  sheetNames.forEach((name, idx) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    sheetSelect.appendChild(opt);
    if(idx===0) currentSheetName = name;
  });
  populateColumnSelectors();
}

function populateColumnSelectors(){
  if(!workbookData || !currentSheetName) return;
  const sheet = workbookData.Sheets[currentSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {header:1});
  parsedRows = rows;
  let headers = [];
  if(rows.length === 0){
    headers = [];
  } else {
    if(headerRowCheckbox.checked){
      const first = rows[0];
      headers = first.map((h, i) => (h || `Spalte ${i+1}`));
    } else {
      const cols = rows[0].length;
      headers = Array.from({length: cols}, (_, i) => `Spalte ${i+1}`);
    }
  }
  fillSelect(xSelect, headers, false);
  fillSelect(ySelect, headers, true);
}

function fillSelect(selectEl, options, multiple){
  selectEl.innerHTML = "";
  options.forEach(opt=>{
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt;
    selectEl.appendChild(o);
  });
  if(!multiple) selectEl.selectedIndex = 0;
}

function getColumnIndexByHeader(header){
  if(!parsedRows || parsedRows.length===0) return -1;
  if(headerRowCheckbox.checked){
    const first = parsedRows[0];
    return first.findIndex(h => (h === header));
  } else {
    const m = header.match(/Spalte\s+(\d+)/i);
    if(m) return parseInt(m[1],10)-1;
    return -1;
  }
}

function extractColumnData(colIndex){
  if(parsedRows.length <= (headerRowCheckbox.checked ? 1 : 0)) return [];
  const start = headerRowCheckbox.checked ? 1 : 0;
  const col = [];
  for(let r=start;r<parsedRows.length;r++){
    col.push(parsedRows[r][colIndex]);
  }
  return col;
}

function tryParseNumber(v){
  if(v === null || v === undefined) return null;
  if(typeof v === 'number') return v;
  const cleaned = (''+v).replace(/[, ]+/g, '');
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}

function renderChart(){
  const xHeader = xSelect.value;
  const yOptions = Array.from(ySelect.selectedOptions).map(o=>o.value);
  if(!xHeader || yOptions.length===0) {
    alert("Bitte X- und mindestens eine Y-Spalte auswählen.");
    return;
  }
  const xIdx = getColumnIndexByHeader(xHeader);
  if(xIdx < 0) return;
  const labelsRaw = extractColumnData(xIdx);
  const labels = labelsRaw.map(v => (v===undefined || v===null) ? "" : String(v));

  const datasets = [];
  const colors = [
    '#0b5cff','#ff6b6b','#00b894','#ff9f1c','#845ef7','#20c997','#f77f00'
  ];
  yOptions.forEach((yHeader, i) => {
    const yIdx = getColumnIndexByHeader(yHeader);
    const raw = extractColumnData(yIdx);
    const data = raw.map(v => tryParseNumber(v));
    datasets.push({
      label: yHeader,
      data,
      borderColor: colors[i % colors.length],
      backgroundColor: colors[i % colors.length] + (chartType.value==='bar' ? '66' : '33'),
      tension: 0.2,
      fill: false
    });
  });

  const type = chartType.value;
  const cfg = {
    type,
    data: {},
    options: { responsive: true, maintainAspectRatio: false }
  };

  if(type === 'pie' || type === 'doughnut'){
    cfg.data = {
      labels,
      datasets: [{
        data: datasets[0].data,
        backgroundColor: colors.slice(0, labels.length),
        label: datasets[0].label
      }]
    };
  } else {
    cfg.data = {
      labels,
      datasets
    };
  }

  if(chart) chart.destroy();
  chart = new Chart(canvas, cfg);
  downloadPNGBtn.disabled = false;
}

function downloadPNG(){
  if(!chart) return;
  const link = document.createElement('a');
  link.href = chart.toBase64Image();
  link.download = 'chart.png';
  link.click();
}

// --- Repo loading helpers (automatisch aus data/) ---
async function listRepoFiles(autoLoadFirstFile = true){
  try{
    refreshRepoFilesBtn.disabled = true;
    repoFileSelect.innerHTML = '<option>...</option>';

    let files = [];
    // Versuche Kandidaten für Branch-Namen
    for(const branchCandidate of REPO_BRANCH_CANDIDATES){
      const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/data?ref=${branchCandidate}`;
      try {
        const res = await fetch(apiUrl);
        if(!res.ok) {
          // 404 oder andere Errors: weiter versuchen
          continue;
        }
        const data = await res.json();
        const exts = ['.xlsx','.xls','.csv'];
        files = data.filter(item => item.type === 'file' && exts.some(e => item.name.toLowerCase().endsWith(e)));
        if(files.length > 0){
          REPO_BRANCH = branchCandidate;
          break;
        }
      } catch(err){
        console.warn('Fehler beim Abfragen von', apiUrl, err);
        continue;
      }
    }

    repoFileSelect.innerHTML = '';
    if(files.length === 0){
      const o = document.createElement('option');
      o.textContent = 'Keine Excel-Dateien in data/ gefunden';
      repoFileSelect.appendChild(o);
      loadRepoFileBtn.disabled = true;
    } else {
      files.forEach(f => {
        const o = document.createElement('option');
        // download_url liefert die raw-Datei (CORS-freundlich)
        o.value = f.download_url;
        o.textContent = f.name;
        repoFileSelect.appendChild(o);
      });
      loadRepoFileBtn.disabled = false;
      // automatisch die erste Datei laden, falls gewünscht
      if(autoLoadFirstFile){
        repoFileSelect.selectedIndex = 0;
        await loadSelectedRepoFile();
      }
    }
  } catch(err){
    console.error(err);
    repoFileSelect.innerHTML = '';
    const o = document.createElement('option');
    o.textContent = 'Fehler beim Laden der Repo-Dateien';
    repoFileSelect.appendChild(o);
    loadRepoFileBtn.disabled = true;
  } finally{
    refreshRepoFilesBtn.disabled = false;
  }
}

async function loadSelectedRepoFile(){
  const url = repoFileSelect.value;
  if(!url || url.startsWith('http') === false) return;
  try{
    loadRepoFileBtn.disabled = true;
    const res = await fetch(url);
    if(!res.ok) throw new Error('Fehler beim Herunterladen der Datei');
    const ab = await res.arrayBuffer();
    const data = new Uint8Array(ab);
    const wb = XLSX.read(data, {type:'array'});
    workbookData = wb;
    populateSheetSelect(wb.SheetNames);
    renderBtn.disabled = false;
  } catch(err){
    console.error(err);
    alert('Konnte Datei aus Repo nicht laden. Siehe Konsole für Details.');
  } finally{
    loadRepoFileBtn.disabled = false;
  }
}
