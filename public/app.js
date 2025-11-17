// public/app.js

const state = {
  database: null,
  table: null,
  limit: 50,
  offset: 0,
  rows: [],
  sort: {
    column: null,
    direction: 'asc'
  },
  filter: ''
};

const dbSelect = document.getElementById('databaseSelect');
const tablesList = document.getElementById('tablesList');
const connectionInfo = document.getElementById('connectionInfo');
const refreshBtn = document.getElementById('refreshBtn');

const tabs = document.querySelectorAll('.tab');
const tabPanels = document.querySelectorAll('.tab-panel');

const rowsTable = document.getElementById('rowsTable');
const rowsTableHead = rowsTable.querySelector('thead');
const rowsTableBody = rowsTable.querySelector('tbody');
const structureTableBody = document.querySelector('#structureTable tbody');

const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageInfo = document.getElementById('pageInfo');

const rowFilterInput = document.getElementById('rowFilterInput');

const sqlInput = document.getElementById('sqlInput');
const runSqlBtn = document.getElementById('runSqlBtn');
const sqlError = document.getElementById('sqlError');
const sqlResultHead = document.querySelector('#sqlResultTable thead');
const sqlResultBody = document.querySelector('#sqlResultTable tbody');

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

function setStatus(text) {
  connectionInfo.textContent = text;
}

function setActiveTab(tabName) {
  tabs.forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });
  tabPanels.forEach(p => {
    p.classList.toggle('active', p.id === `tab-${tabName}`);
  });
}

tabs.forEach(t => {
  t.addEventListener('click', () => {
    setActiveTab(t.dataset.tab);
  });
});

async function loadDatabases() {
  try {
    setStatus('Loading databases...');
    const data = await api('/api/databases');
    dbSelect.innerHTML = '';
    data.forEach(row => {
      const dbName = row.Database || row.database || Object.values(row)[0];
      const opt = document.createElement('option');
      opt.value = dbName;
      opt.textContent = dbName;
      dbSelect.appendChild(opt);
    });
    state.database = dbSelect.value;
    setStatus(`Connected to ${state.database}`);
    await loadTables();
  } catch (err) {
    console.error(err);
    setStatus('Error loading databases');
  }
}

async function loadTables() {
  if (!state.database) return;
  try {
    tablesList.innerHTML = '';
    const data = await api(`/api/tables?database=${encodeURIComponent(state.database)}`);
    const tables = data.tables || data;
    tables.forEach(row => {
      const tableName = Object.values(row)[0];
      const li = document.createElement('li');
      li.textContent = tableName;
      li.addEventListener('click', () => {
        document.querySelectorAll('#tablesList li').forEach(el => el.classList.remove('active'));
        li.classList.add('active');
        state.table = tableName;
        state.offset = 0;
        state.sort.column = null;
        state.filter = '';
        rowFilterInput.value = '';
        loadStructure();
        loadRows();
      });
      tablesList.appendChild(li);
    });
    if (!state.table && tablesList.firstChild) {
      tablesList.firstChild.click();
    }
  } catch (err) {
    console.error(err);
    setStatus('Error loading tables');
  }
}

async function loadStructure() {
  if (!state.database || !state.table) return;
  try {
    const data = await api(`/api/table/${encodeURIComponent(state.table)}/structure?database=${encodeURIComponent(state.database)}`);
    structureTableBody.innerHTML = '';
    data.columns.forEach(col => {
      const tr = document.createElement('tr');
      ['Field', 'Type', 'Null', 'Key', 'Default', 'Extra'].forEach(key => {
        const td = document.createElement('td');
        td.textContent = col[key] ?? '';
        tr.appendChild(td);
      });
      structureTableBody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
  }
}

async function loadRows() {
  if (!state.database || !state.table) return;
  try {
    const data = await api(`/api/table/${encodeURIComponent(state.table)}/rows?database=${encodeURIComponent(state.database)}&limit=${state.limit}&offset=${state.offset}`);
    const rows = data.rows || [];
    state.rows = rows;

    if (!rows.length) {
      rowsTableHead.innerHTML = '';
      rowsTableBody.innerHTML = '';
      pageInfo.textContent = 'No rows';
      return;
    }

    buildRowsHeader(rows);
    renderRowsBody();

    const page = Math.floor(state.offset / state.limit) + 1;
    const pages = Math.max(1, Math.ceil(data.total / state.limit));
    pageInfo.textContent = `Page ${page} / ${pages} · ${data.total} rows`;

  } catch (err) {
    console.error(err);
    setStatus('Error loading rows');
  }
}

function buildRowsHeader(rows) {
  rowsTableHead.innerHTML = '';
  const headerRow = document.createElement('tr');

  Object.keys(rows[0]).forEach(col => {
    const th = document.createElement('th');
    th.textContent = col;
    th.classList.add('sortable');
    th.dataset.column = col;
    th.addEventListener('click', () => toggleSort(col));
    if (state.sort.column === col) {
      th.classList.add(state.sort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
    }
    headerRow.appendChild(th);
  });

  const actionsTh = document.createElement('th');
  actionsTh.textContent = 'Actions';
  headerRow.appendChild(actionsTh);

  rowsTableHead.appendChild(headerRow);
}

function renderRowsBody() {
  let rows = [...state.rows];

  // Filter
  const filter = state.filter.trim().toLowerCase();
  if (filter) {
    rows = rows.filter(row => {
      return Object.values(row).some(val =>
        String(val ?? '').toLowerCase().includes(filter)
      );
    });
  }

  // Sort
  if (state.sort.column) {
    const col = state.sort.column;
    const dir = state.sort.direction === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const va = a[col];
      const vb = b[col];

      const na = parseFloat(va);
      const nb = parseFloat(vb);
      const bothNumeric = !isNaN(na) && !isNaN(nb);

      if (bothNumeric) {
        if (na < nb) return -1 * dir;
        if (na > nb) return 1 * dir;
        return 0;
      }

      const sa = String(va ?? '').toLowerCase();
      const sb = String(vb ?? '').toLowerCase();
      if (sa < sb) return -1 * dir;
      if (sa > sb) return 1 * dir;
      return 0;
    });
  }

  // Rebuild header to update sort indicators
  if (rows.length) {
    buildRowsHeader(state.rows);
  }

  rowsTableBody.innerHTML = '';
  rows.forEach(row => {
    const tr = document.createElement('tr');
    Object.entries(row).forEach(([key, value]) => {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.value = value ?? '';
      input.dataset.column = key;
      input.className = 'cell-input';
      td.appendChild(input);
      tr.appendChild(td);
    });

    const actionsTd = document.createElement('td');
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.className = 'mini-btn';
    saveBtn.addEventListener('click', () => updateRow(row));

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Del';
    deleteBtn.className = 'mini-btn';
    deleteBtn.addEventListener('click', () => deleteRow(row));

    actionsTd.appendChild(saveBtn);
    actionsTd.appendChild(deleteBtn);
    tr.appendChild(actionsTd);

    rowsTableBody.appendChild(tr);
  });
}

function toggleSort(column) {
  if (state.sort.column === column) {
    state.sort.direction = state.sort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    state.sort.column = column;
    state.sort.direction = 'asc';
  }
  renderRowsBody();
}

async function updateRow(originalRow) {
  if (!('id' in originalRow)) {
    alert("Update assumes an 'id' primary key.");
    return;
  }
  const id = originalRow.id;

  // Find corresponding row in DOM (best-effort)
  const trs = Array.from(rowsTableBody.children);
  let tr = null;
  for (const rowEl of trs) {
    const inputs = rowEl.querySelectorAll('input');
    const snapshot = {};
    inputs.forEach(input => {
      snapshot[input.dataset.column] = input.value;
    });
    // if first column matches, assume this is the row
    const firstKey = Object.keys(originalRow)[0];
    if (snapshot[firstKey] == originalRow[firstKey]) {
      tr = rowEl;
      break;
    }
  }

  const data = {};
  if (tr) {
    tr.querySelectorAll('input').forEach(input => {
      data[input.dataset.column] = input.value;
    });
  } else {
    Object.assign(data, originalRow);
  }

  try {
    await api(`/api/table/${encodeURIComponent(state.table)}/rows/${id}?database=${encodeURIComponent(state.database)}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    await loadRows();
  } catch (err) {
    console.error(err);
    alert('Error updating row');
  }
}

async function deleteRow(originalRow) {
  if (!('id' in originalRow)) {
    alert("Delete assumes an 'id' primary key.");
    return;
  }
  if (!confirm('Delete this row?')) return;

  const id = originalRow.id;

  try {
    await api(`/api/table/${encodeURIComponent(state.table)}/rows/${id}?database=${encodeURIComponent(state.database)}`, {
      method: 'DELETE'
    });
    await loadRows();
  } catch (err) {
    console.error(err);
    alert('Error deleting row');
  }
}

// Pagination controls
prevPageBtn.addEventListener('click', () => {
  state.offset = Math.max(0, state.offset - state.limit);
  loadRows();
});

nextPageBtn.addEventListener('click', () => {
  state.offset += state.limit;
  loadRows();
});

// Filter input
rowFilterInput.addEventListener('input', () => {
  state.filter = rowFilterInput.value;
  renderRowsBody();
});

// Database selector
dbSelect.addEventListener('change', () => {
  state.database = dbSelect.value;
  state.table = null;
  state.offset = 0;
  state.sort.column = null;
  state.filter = '';
  rowFilterInput.value = '';
  loadTables();
});

// Refresh button
refreshBtn.addEventListener('click', () => {
  loadDatabases();
});

// SQL console
runSqlBtn.addEventListener('click', async () => {
  sqlError.textContent = '';
  sqlResultHead.innerHTML = '';
  sqlResultBody.innerHTML = '';

  const sql = sqlInput.value.trim();
  if (!sql) return;

  try {
    const result = await api('/api/query', {
      method: 'POST',
      body: JSON.stringify({
        database: state.database,
        sql
      })
    });

    const rows = Array.isArray(result.rows) ? result.rows : [];
    if (!rows.length) {
      sqlError.textContent = 'Query executed (no rows).';
      return;
    }

    const headerRow = document.createElement('tr');
    Object.keys(rows[0]).forEach(col => {
      const th = document.createElement('th');
      th.textContent = col;
      headerRow.appendChild(th);
    });
    sqlResultHead.appendChild(headerRow);

    rows.forEach(row => {
      const tr = document.createElement('tr');
      Object.values(row).forEach(value => {
        const td = document.createElement('td');
        td.textContent = value ?? '';
        tr.appendChild(td);
      });
      sqlResultBody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
    sqlError.textContent = err.message;
  }
});

// Initial load
loadDatabases();
setActiveTab('browse');
