/**
 * Masters Friendship Competition -- Google Apps Script Backend
 *
 * Deploy as Web App: "Anyone" access, execute as your account.
 * Backing Sheet has tabs: Config, Draft, WeekendPicks, Field
 *
 * GET endpoints:
 *   ?action=draft_state    -- current draft state + all picks
 *   ?action=field          -- available (unpicked) golfers
 *   ?action=teams          -- all teams with their golfers (for GitHub Actions)
 *   ?action=weekend_state  -- weekend team selections
 *
 * POST endpoints:
 *   action=make_pick       -- {owner, player_name, dg_id}
 *   action=weekend_pick    -- {owner, golfer_ids: [id1, id2, id3, id4]}
 *   action=set_config      -- {key, value}
 */

// ── Helpers ──────────────────────────────────────────────

function getSheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getConfigValue(key) {
  var sheet = getSheet("Config");
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) return data[i][1];
  }
  return null;
}

function setConfigValue(key, value) {
  var sheet = getSheet("Config");
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  // Key not found, append
  sheet.appendRow([key, value]);
}

// ── Snake Draft Logic ────────────────────────────────────

function getSnakeOrder() {
  var orderStr = getConfigValue("draft_order");
  if (!orderStr) return ["Corey", "Eli", "Preston", "Eric"];
  return JSON.parse(orderStr);
}

function getPickOwner(pickNumber) {
  var order = getSnakeOrder();
  var numPlayers = order.length;
  var round = Math.floor((pickNumber - 1) / numPlayers);
  var posInRound = (pickNumber - 1) % numPlayers;
  // Snake: odd rounds reverse
  if (round % 2 === 1) {
    posInRound = numPlayers - 1 - posInRound;
  }
  return order[posInRound];
}

function getDraftRound(pickNumber) {
  var numPlayers = getSnakeOrder().length;
  return Math.floor((pickNumber - 1) / numPlayers) + 1;
}

// ── GET Handler ──────────────────────────────────────────

function doGet(e) {
  var action = (e.parameter || {}).action || "draft_state";

  switch (action) {
    case "draft_state":
      return getDraftState();
    case "field":
      return getAvailableField();
    case "teams":
      return getTeams();
    case "weekend_state":
      return getWeekendState();
    default:
      return jsonResponse({ error: "Unknown action: " + action });
  }
}

function getDraftState() {
  var sheet = getSheet("Draft");
  var data = sheet.getDataRange().getValues();
  var picks = [];

  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue; // skip empty rows
    picks.push({
      pick_number: data[i][0],
      round: data[i][1],
      player_name: data[i][2],
      dg_id: data[i][3],
      team_owner: data[i][4],
      timestamp: data[i][5]
    });
  }

  var currentPick = picks.length + 1;
  var totalPicks = getSnakeOrder().length * 8; // 4 players x 8 rounds
  var draftStatus = getConfigValue("draft_status") || "not_started";
  var onTheClock = currentPick <= totalPicks ? getPickOwner(currentPick) : null;
  var currentRound = currentPick <= totalPicks ? getDraftRound(currentPick) : null;

  return jsonResponse({
    status: draftStatus,
    current_pick: currentPick,
    total_picks: totalPicks,
    current_round: currentRound,
    on_the_clock: onTheClock,
    draft_order: getSnakeOrder(),
    picks: picks
  });
}

function getAvailableField() {
  // Get all field players
  var fieldSheet = getSheet("Field");
  var fieldData = fieldSheet.getDataRange().getValues();
  var allPlayers = [];
  for (var i = 1; i < fieldData.length; i++) {
    if (!fieldData[i][0]) continue;
    allPlayers.push({
      dg_id: fieldData[i][0],
      name: fieldData[i][1],
      country: fieldData[i][2],
      dg_rank: fieldData[i][3],
      owgr_rank: fieldData[i][4]
    });
  }

  // Get drafted player IDs
  var draftSheet = getSheet("Draft");
  var draftData = draftSheet.getDataRange().getValues();
  var draftedIds = {};
  for (var j = 1; j < draftData.length; j++) {
    if (draftData[j][3]) draftedIds[draftData[j][3]] = true;
  }

  // Filter out drafted
  var available = allPlayers.filter(function(p) {
    return !draftedIds[p.dg_id];
  });

  return jsonResponse({ available: available, drafted_count: Object.keys(draftedIds).length });
}

function getTeams() {
  var draftSheet = getSheet("Draft");
  var draftData = draftSheet.getDataRange().getValues();
  var teams = {};

  for (var i = 1; i < draftData.length; i++) {
    if (!draftData[i][4]) continue;
    var owner = draftData[i][4];
    if (!teams[owner]) teams[owner] = [];
    teams[owner].push({
      dg_id: draftData[i][3],
      name: draftData[i][2],
      pick_number: draftData[i][0]
    });
  }

  return jsonResponse({ teams: teams });
}

function getWeekendState() {
  var sheet = getSheet("WeekendPicks");
  var data = sheet.getDataRange().getValues();
  var weekendTeams = {};

  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    var owner = data[i][0];
    var ids = [];
    for (var j = 1; j <= 4; j++) {
      if (data[i][j]) ids.push(data[i][j]);
    }
    weekendTeams[owner] = ids;
  }

  return jsonResponse({ weekend_teams: weekendTeams });
}

// ── POST Handler ─────────────────────────────────────────

function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  var action = body.action;

  switch (action) {
    case "make_pick":
      return makePick(body);
    case "weekend_pick":
      return makeWeekendPick(body);
    case "set_config":
      return setConfig(body);
    default:
      return jsonResponse({ error: "Unknown action: " + action });
  }
}

function makePick(body) {
  var owner = body.owner;
  var playerName = body.player_name;
  var dgId = body.dg_id;

  if (!owner || !playerName || !dgId) {
    return jsonResponse({ error: "Missing required fields: owner, player_name, dg_id" });
  }

  // Check draft is active
  var draftStatus = getConfigValue("draft_status");
  if (draftStatus !== "active") {
    return jsonResponse({ error: "Draft is not active (status: " + draftStatus + ")" });
  }

  var draftSheet = getSheet("Draft");
  var draftData = draftSheet.getDataRange().getValues();
  var currentPick = draftData.length; // row count minus header = picks made; next pick = length

  var totalPicks = getSnakeOrder().length * 8;
  if (currentPick > totalPicks) {
    return jsonResponse({ error: "Draft is complete" });
  }

  // Validate it's this owner's turn
  var expectedOwner = getPickOwner(currentPick);
  if (owner !== expectedOwner) {
    return jsonResponse({ error: "Not your turn. On the clock: " + expectedOwner });
  }

  // Check golfer not already drafted
  for (var i = 1; i < draftData.length; i++) {
    if (String(draftData[i][3]) === String(dgId)) {
      return jsonResponse({ error: playerName + " is already drafted by " + draftData[i][4] });
    }
  }

  // Make the pick
  var round = getDraftRound(currentPick);
  draftSheet.appendRow([
    currentPick,
    round,
    playerName,
    dgId,
    owner,
    new Date().toISOString()
  ]);

  // Check if draft is complete
  if (currentPick >= totalPicks) {
    setConfigValue("draft_status", "complete");
  }

  return jsonResponse({
    success: true,
    pick_number: currentPick,
    round: round,
    player_name: playerName,
    owner: owner,
    next_pick: currentPick < totalPicks ? currentPick + 1 : null,
    next_on_clock: currentPick < totalPicks ? getPickOwner(currentPick + 1) : null
  });
}

function makeWeekendPick(body) {
  var owner = body.owner;
  var golferIds = body.golfer_ids;

  if (!owner || !golferIds || golferIds.length !== 4) {
    return jsonResponse({ error: "Must provide owner and exactly 4 golfer_ids" });
  }

  // Validate these golfers are on the owner's team
  var draftSheet = getSheet("Draft");
  var draftData = draftSheet.getDataRange().getValues();
  var ownerGolferIds = [];
  for (var i = 1; i < draftData.length; i++) {
    if (draftData[i][4] === owner) {
      ownerGolferIds.push(draftData[i][3]);
    }
  }

  for (var j = 0; j < golferIds.length; j++) {
    if (ownerGolferIds.indexOf(golferIds[j]) === -1) {
      return jsonResponse({ error: "Golfer " + golferIds[j] + " is not on " + owner + "'s team" });
    }
  }

  // Write/overwrite weekend pick
  var sheet = getSheet("WeekendPicks");
  var data = sheet.getDataRange().getValues();
  var existingRow = -1;
  for (var k = 1; k < data.length; k++) {
    if (data[k][0] === owner) {
      existingRow = k + 1;
      break;
    }
  }

  var row = [owner, golferIds[0], golferIds[1], golferIds[2], golferIds[3], new Date().toISOString()];
  if (existingRow > 0) {
    sheet.getRange(existingRow, 1, 1, 6).setValues([row]);
  } else {
    sheet.appendRow(row);
  }

  return jsonResponse({ success: true, owner: owner, golfer_ids: golferIds });
}

function setConfig(body) {
  var key = body.key;
  var value = body.value;
  if (!key) return jsonResponse({ error: "Missing key" });
  setConfigValue(key, value);
  return jsonResponse({ success: true, key: key, value: value });
}
