/**
 * API client for static JSON (scores/standings) and Apps Script (draft/picks).
 */

const API = (() => {
  // Apps Script URL -- set after deployment
  let APPS_SCRIPT_URL = '';

  // Try to load from config, or use hardcoded value
  async function init() {
    try {
      const config = await fetchJSON('data/config.json');
      if (config.apps_script_url) {
        APPS_SCRIPT_URL = config.apps_script_url;
      }
    } catch (e) {
      console.warn('Could not load config for Apps Script URL');
    }
  }

  function setAppsScriptUrl(url) {
    APPS_SCRIPT_URL = url;
  }

  // ── Static JSON (GitHub Pages) ──────────────────────

  async function fetchJSON(path) {
    const resp = await fetch(path + '?t=' + Date.now()); // cache bust
    if (!resp.ok) throw new Error(`Failed to fetch ${path}: ${resp.status}`);
    return resp.json();
  }

  async function getStandings() {
    return fetchJSON('data/standings.json');
  }

  async function getLiveScores() {
    return fetchJSON('data/live_scores.json');
  }

  async function getHistory() {
    return fetchJSON('data/history.json');
  }

  async function getConfig() {
    return fetchJSON('data/config.json');
  }

  async function getField() {
    return fetchJSON('data/field.json');
  }

  // ── Apps Script (draft/picks) ───────────────────────

  async function appsGet(action) {
    if (!APPS_SCRIPT_URL) throw new Error('Apps Script URL not configured');
    const resp = await fetch(`${APPS_SCRIPT_URL}?action=${action}`);
    if (!resp.ok) throw new Error(`Apps Script error: ${resp.status}`);
    return resp.json();
  }

  async function appsPost(body) {
    if (!APPS_SCRIPT_URL) throw new Error('Apps Script URL not configured');
    const resp = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // Apps Script requires this for CORS
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`Apps Script error: ${resp.status}`);
    return resp.json();
  }

  async function getDraftState() {
    return appsGet('draft_state');
  }

  async function getAvailableField() {
    return appsGet('field');
  }

  async function getTeams() {
    return appsGet('teams');
  }

  async function makePick(owner, playerName, dgId) {
    return appsPost({
      action: 'make_pick',
      owner: owner,
      player_name: playerName,
      dg_id: dgId,
    });
  }

  async function getWeekendState() {
    return appsGet('weekend_state');
  }

  async function makeWeekendPick(owner, golferIds) {
    return appsPost({
      action: 'weekend_pick',
      owner: owner,
      golfer_ids: golferIds,
    });
  }

  return {
    init,
    setAppsScriptUrl,
    getStandings,
    getLiveScores,
    getHistory,
    getConfig,
    getField,
    getDraftState,
    getAvailableField,
    getTeams,
    makePick,
    getWeekendState,
    makeWeekendPick,
  };
})();
