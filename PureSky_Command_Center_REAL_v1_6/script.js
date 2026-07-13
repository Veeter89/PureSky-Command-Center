const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQL48jQKsdQtfhebBCzPS5PSOcDnSbxNu1WUMIJM-0RgxGPuwbwvWGAjtjOyIHmnKQdFLtNPUXh1PPw/pub?gid=159769806&single=true&output=csv";
const SHEET_LIVE_CSV_URL = SHEET_CSV_URL;

let jobs = [];
let rawSheetRows = [];
const MAX_VISIBLE_JOBS = 30;
const MAX_SIDE_ITEMS = 7;

function parseCSV(text){
  const rows=[]; let row=[], value="", insideQuotes=false;
  for(let i=0;i<text.length;i++){
    const char=text[i], next=text[i+1];
    if(char==='"' && insideQuotes && next==='"'){ value+='"'; i++; }
    else if(char==='"'){ insideQuotes=!insideQuotes; }
    else if(char==="," && !insideQuotes){ row.push(value.trim()); value=""; }
    else if((char==="\n" || char==="\r") && !insideQuotes){
      if(value || row.length){ row.push(value.trim()); rows.push(row); row=[]; value=""; }
    } else { value+=char; }
  }
  if(value || row.length){ row.push(value.trim()); rows.push(row); }
  return rows.filter(r=>r.length && r.some(c=>String(c).trim()!==""));
}

function normalize(text){ return String(text || "").trim().toLowerCase(); }
function cleanText(text){ return String(text || "").trim(); }
function safe(text){
  return cleanText(text).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
}
function hasAny(text, words){
  const n = normalize(text);
  return words.some(w => n.includes(w));
}

function isWinLabel(text){
  const c = compactHeader(text);
  return c === "wins" || c.includes("winsoftheweek") || c.includes("weeklywins") || c.includes("winsweek") || c.includes("thisweekswins");
}
function isUsableWin(text){
  const value = cleanText(text);
  const c = compactHeader(value);
  if(!value) return false;
  if(isWinLabel(value)) return false;
  if(["true","false","yes","no","show","active","win","wins","updated","lastupdated"].includes(c)) return false;
  return true;
}
function splitWinText(text){
  return cleanText(text)
    .split(/\n|\r|;|\|/)
    .map(w => cleanText(w))
    .filter(isUsableWin);
}
function addUniqueWin(list, value){
  splitWinText(value).forEach(w => {
    const key = normalize(w);
    if(key && !list.some(existing => normalize(existing) === key)) list.push(w);
  });
}
function extractWins(rows, mappedJobs){
  const wins = [];

  // Pull from mapped jobs first, but do NOT depend on job/customer rows.
  (mappedJobs || []).forEach(j => addUniqueWin(wins, j.wins));

  if(rows && rows.length){
    const winColumns = new Set();

    // First: find the real header row/column by exact-ish header text.
    rows.forEach((row) => {
      row.forEach((cell, cIndex) => {
        if(isWinLabel(cell)){ winColumns.add(cIndex); }
      });
    });

    // Second: your current sheet has WINS OF THE WEEK in column R.
    // Column R is zero-based index 17. This backup only adds real text wins.
    if(winColumns.size === 0){ winColumns.add(17); }

    // Grab every usable value under the wins column, even if that row has no customer/job.
    winColumns.forEach(cIndex => {
      rows.forEach(row => {
        if(row && row.length > cIndex) addUniqueWin(wins, row[cIndex]);
      });
    });
  }

  return wins;
}

function compactHeader(text){
  return normalize(text).replace(/[^a-z0-9]/g, "");
}

function mapJobs(rows){
  if(!rows || rows.length < 2) return [];
  const headers = rows[0].map(h => normalize(h));
  const compactHeaders = rows[0].map(h => compactHeader(h));

  function findIndex(names){
    for(const name of names){
      const exact = headers.indexOf(normalize(name));
      if(exact >= 0) return exact;
      const compact = compactHeader(name);
      const compactExact = compactHeaders.indexOf(compact);
      if(compactExact >= 0) return compactExact;
    }
    return -1;
  }

  function get(row,names){
    const index = findIndex(names);
    return index >= 0 ? (row[index] || "") : "";
  }

  function getWins(row){
    const wins = [];
    headers.forEach((h, index) => {
      const ch = compactHeaders[index];
      // Supports: Wins of the Week, Win of Week, Weekly Wins, Wins 1, Wins 2, etc.
      const looksLikeWins = ch.includes("win") && !ch.includes("window");
      if(looksLikeWins){
        const value = cleanText(row[index]);
        if(value) wins.push(value);
      }
    });
    return wins.join("\n");
  }

  return rows.slice(1)
    .filter(row => row.some(cell => cleanText(cell) !== ""))
    .map(row => ({
      customer:get(row,["Customer","Customer Name","Client"]),
      project:get(row,["Project","Project/Task","Task","Description","Project Task"]),
      type:get(row,["Job Type","Type"]),
      priority:get(row,["Priority"]),
      status:get(row,["Status"]),
      owner:get(row,["Owner"]),
      crew:get(row,["Crew"]),
      next:get(row,["Next Action","Next"]),
      waitingOn:get(row,["Waiting On","Waiting"]),
      lead:get(row,["Lead Source"]),
      start:get(row,["Start Date"]),
      finish:get(row,["Target Finish","Target Finish Date"]),
      followUp:get(row,["Follow-up Date","Follow-Up Date","Follow Up Date","Followup Date"]),
      deposit:get(row,["Deposit Status","Deposit Payment","Deposit"]),
      invoice:get(row,["Invoice Status","Invoice"]),
      notes:get(row,["Notes","Note"]),
      wins:getWins(row)
    }));
}

function updateClock(){
  const now = new Date();
  const dateEl = document.getElementById("date");
  const clockEl = document.getElementById("clock");
  const updatedEl = null;
  if(dateEl){
    dateEl.textContent = now.toLocaleDateString("en-US",{timeZone:"America/Chicago",weekday:"long",month:"long",day:"numeric",year:"numeric"});
  }
  if(clockEl){
    clockEl.textContent = now.toLocaleTimeString("en-US",{timeZone:"America/Chicago",hour:"numeric",minute:"2-digit",second:"2-digit",hour12:true});
  }
  if(updatedEl){
    updatedEl.textContent = "LAST UPDATED: " + now.toLocaleTimeString("en-US",{timeZone:"America/Chicago",hour:"numeric",minute:"2-digit",hour12:true});
  }
}

function statusKey(status){
  const s = normalize(status);
  if(s.includes("attention") || s.includes("problem") || s.includes("stuck")) return "needs-attention";
  if(s.includes("wait")) return "waiting";
  if(s.includes("progress")) return "in-progress";
  if(s.includes("schedule")) return "scheduled";
  if(s.includes("complete") || s.includes("done")) return "complete";
  if(s.includes("estimate") || s.includes("quote")) return "estimate-sent";
  if(s.includes("follow")) return "follow-up";
  if(s.includes("sold") || s.includes("approved")) return "sold";
  if(s.includes("paid")) return "paid";
  if(s.includes("lead") || s.includes("new")) return "new-lead";
  return s.replaceAll(" ","-").replaceAll("/","-") || "unknown";
}
function statusClass(status){ return "status-" + statusKey(status); }
function priorityClass(priority){
  const p = normalize(priority);
  if(p.includes("high") || p.includes("urgent")) return "priority-high";
  if(p.includes("med")) return "priority-medium";
  if(p.includes("low")) return "priority-low";
  return "";
}

function isVisibleOnBoard(j){
  const s = normalize(j.status);
  const hasMainInfo = cleanText(j.customer) || cleanText(j.project) || cleanText(j.notes);
  return hasMainInfo && !["lost","dead","cancelled","canceled","archive","archived"].includes(s);
}
function isActive(j){ return isVisibleOnBoard(j) && !["paid"].includes(normalize(j.status)); }
function needsAttention(j){
  return isActive(j) && (
    !!cleanText(j.waitingOn)
    || hasAny(j.status, ["waiting", "stuck", "hold", "attention", "problem"])
    || hasAny(j.next, ["call", "order", "permit", "inspection", "inspect", "utility", "material", "meter", "decision", "schedule", "customer", "follow"])
  );
}
function readyToInvoice(j){
  return isVisibleOnBoard(j) && (
    hasAny(j.invoice, ["ready", "invoice", "bill", "billing", "collect", "final"])
    || hasAny(j.status, ["complete", "done", "final"])
    || hasAny(j.next, ["invoice", "bill", "billing", "collect final", "final payment"])
  );
}
function needsFollowUp(j){
  return isActive(j) && (
    !!cleanText(j.followUp)
    || hasAny(j.status, ["follow", "estimate sent", "quote sent", "estimate", "quote"])
    || hasAny(j.next, ["follow", "call", "check in"])
  );
}

function boardSort(a,b){
  const order = {
    "needs-attention":1,
    "waiting":2,
    "in-progress":3,
    "scheduled":4,
    "sold":5,
    "new-lead":6,
    "estimate-sent":7,
    "follow-up":8,
    "complete":9,
    "paid":10,
    "unknown":11
  };
  return (order[statusKey(a.status)] || 50) - (order[statusKey(b.status)] || 50);
}

function priorityLabel(priority){
  const p = normalize(priority);
  if(!p) return "";
  if(p.includes("high") || p.includes("urgent")) return "HIGH";
  if(p.includes("med")) return "MED";
  if(p.includes("low")) return "LOW";
  return cleanText(priority).toUpperCase();
}
function priorityBadge(priority){
  const label = priorityLabel(priority);
  return label ? `<em class="priority-badge ${priorityClass(priority)}">${safe(label)}</em>` : "";
}

function sideItem(j, detail){
  return `<div class="side-item ${statusClass(j.status)} ${priorityClass(j.priority)}"><span>${safe(j.customer)}</span>${priorityBadge(j.priority)}<small>${safe(detail || j.project || j.next || j.waitingOn || "Needs review")}</small></div>`;
}

function renderJobs(){
  const jobRows = document.getElementById("jobRows");
  if(!jobRows) return;

  const visibleJobs = jobs.filter(isVisibleOnBoard).sort(boardSort).slice(0, MAX_VISIBLE_JOBS);

  jobRows.innerHTML = visibleJobs.map(j => `
    <div class="job-row ${statusClass(j.status)} ${priorityClass(j.priority)}">
      <div class="customer"><span>${safe(j.customer)}</span></div>
      <div class="priority-cell">${priorityBadge(j.priority)}</div>
      <div class="desc"><strong>${safe(j.project)}</strong><span>${safe(j.notes)}</span></div>
      <div class="small"><span class="status-pill ${statusClass(j.status)}">${safe(j.status || "Open")}</span></div>
      <div class="small">${safe(j.waitingOn)}</div>
      <div class="small">${safe(j.next)}</div>
      <div class="small owner">${safe(j.owner)}</div>
    </div>`).join("") || `<div class="loading">No jobs found. Check published Sheet tab.</div>`;

  const attentionJobs = jobs.filter(needsAttention);
  const invoiceJobs = jobs.filter(readyToInvoice);
  const followJobs = jobs.filter(needsFollowUp);
  const wins = extractWins(rawSheetRows, jobs);

  const winsEl = document.getElementById("winsList");
  if(winsEl){
    winsEl.innerHTML = wins.slice(0,6).map(w => `<div class="win-item">${safe(w)}</div>`).join("") || `<div class="empty">No wins entered</div>`;
  }

  document.getElementById("attentionList").innerHTML = attentionJobs.slice(0,MAX_SIDE_ITEMS).map(j => sideItem(j, j.waitingOn || j.next || j.status)).join("") || `<div class="empty">Nothing flagged</div>`;
  document.getElementById("invoiceList").innerHTML = invoiceJobs.slice(0,MAX_SIDE_ITEMS).map(j => sideItem(j, j.invoice || j.next || j.status || j.project)).join("") || `<div class="empty">Nothing ready</div>`;
  document.getElementById("followUpList").innerHTML = followJobs.slice(0,MAX_SIDE_ITEMS).map(j => sideItem(j, j.followUp || j.next || j.status)).join("") || `<div class="empty">No follow ups</div>`;

  document.getElementById("activeCount").textContent = jobs.filter(isActive).length;
  document.getElementById("waitingCount").textContent = jobs.filter(j => hasAny(j.status,["waiting"]) || cleanText(j.waitingOn)).length;
  document.getElementById("followCount").textContent = followJobs.length;
  document.getElementById("invoiceCount").textContent = invoiceJobs.length;
  document.getElementById("attentionCount").textContent = attentionJobs.length;

  const sheetCount = document.getElementById("sheetCount");
  if(sheetCount){ sheetCount.textContent = `SHEET ROWS: ${jobs.length} | SHOWING: ${visibleJobs.length}`; }
}

async function fetchRowsFrom(url){
  const sep = url.includes("?") ? "&" : "?";
  const response = await fetch(url + sep + "cacheBust=" + Date.now());
  const csv = await response.text();
  return parseCSV(csv);
}

async function loadJobs(){
  try{
    let rows = await fetchRowsFrom(SHEET_CSV_URL);
    rawSheetRows = rows;
    jobs = mapJobs(rows);

    // If the published CSV is behind and does not include the Wins column yet,
    // pull a live CSV from the actual sheet ID and use it only for Wins.
    if(extractWins(rawSheetRows, jobs).length === 0){
      try{
        const liveRows = await fetchRowsFrom(SHEET_LIVE_CSV_URL);
        if(extractWins(liveRows, mapJobs(liveRows)).length > 0){
          rawSheetRows = liveRows;
          jobs = mapJobs(liveRows);
        }
      } catch(liveError){
        console.warn("Live wins fallback failed", liveError);
      }
    }

    renderJobs();
  } catch(error){
    const jobRows = document.getElementById("jobRows");
    if(jobRows) jobRows.innerHTML = `<div class="loading">Could not load Google Sheet. Check publish link.</div>`;
    console.error(error);
  }
}


async function loadWeather(){
  const mini = document.getElementById("weatherMini");
  const card = document.getElementById("weatherCard");
  try{
    // Portage, WI coordinates. No API key needed.
    const url = "https://api.open-meteo.com/v1/forecast?latitude=43.5391&longitude=-89.4626&current=temperature_2m,precipitation,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FChicago&forecast_days=1";
    const response = await fetch(url + "&cacheBust=" + Date.now());
    const data = await response.json();
    const temp = Math.round(data.current.temperature_2m);
    const wind = Math.round(data.current.wind_speed_10m || 0);
    const rain = data.daily && data.daily.precipitation_probability_max ? data.daily.precipitation_probability_max[0] : 0;
    const high = data.daily && data.daily.temperature_2m_max ? Math.round(data.daily.temperature_2m_max[0]) : "--";
    const low = data.daily && data.daily.temperature_2m_min ? Math.round(data.daily.temperature_2m_min[0]) : "--";
    const condition = weatherCodeLabel(data.current.weather_code);
    if(mini) mini.textContent = `Portage ${temp}° • ${condition}`;
    if(card) card.innerHTML = `<div class="weather-temp">${temp}°</div><div class="weather-details">${safe(condition)}<br>High ${high}° / Low ${low}°<br>Rain ${rain}% • Wind ${wind} mph</div>`;
  } catch(error){
    if(mini) mini.textContent = "Portage, WI";
    if(card) card.innerHTML = `<div class="empty">Weather unavailable</div>`;
    console.error(error);
  }
}

function weatherCodeLabel(code){
  const c = Number(code);
  if(c === 0) return "Clear";
  if([1,2].includes(c)) return "Partly Cloudy";
  if(c === 3) return "Cloudy";
  if([45,48].includes(c)) return "Fog";
  if([51,53,55,56,57].includes(c)) return "Drizzle";
  if([61,63,65,66,67,80,81,82].includes(c)) return "Rain";
  if([71,73,75,77,85,86].includes(c)) return "Snow";
  if([95,96,99].includes(c)) return "Storms";
  return "Weather";
}

updateClock();
loadJobs();
loadWeather();
setInterval(updateClock,1000);
setInterval(loadJobs,30000);
setInterval(loadWeather,900000);
