// seedRoblox.js - v2 (explore-api)
const fetch = require('node-fetch');
const pool = require('../config/database');

// get-sorts возвращает игры прямо внутри каждого sort.games — отдельный get-games не нужен
const EXPLORE_SORTS_URL = 'https://apis.roblox.com/explore-api/v1/get-sorts?sessionId=seed';
const GAME_DETAILS_URL  = 'https://games.roblox.com/v1/games';
const THUMBNAILS_URL    = 'https://thumbnails.roblox.com/v1/games/multiget/thumbnails';
const ICONS_URL         = 'https://thumbnails.roblox.com/v1/games/icons';

const BATCH_SIZE = 25;

// Категории, чьи игры берём из ответа get-sorts
const WANTED_SORT_IDS = new Set([
  'Top_Trending_V4',
  'Up_And_Coming_V4',
  'CCU_Based_V1',
  'Fun_With_Friends_V4',
  'Top_Revisited_Existing_Users_V4',
]);

function log(msg, silent) { if (!silent) console.log(msg); }
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchAllUniverseIds(silent) {
  try {
    const resp = await fetch(EXPLORE_SORTS_URL);
    const data = await resp.json();
    const uniqueIds = new Set();

    for (const sort of (data.sorts || [])) {
      if (!WANTED_SORT_IDS.has(sort.id)) continue;
      const games = sort.games || [];
      for (const g of games) { if (g.universeId) uniqueIds.add(g.universeId); }
      log('  ' + sort.id + ': ' + games.length + ' games (total unique: ' + uniqueIds.size + ')', silent);
    }

    if (uniqueIds.size > 0) {
      log('Total unique universe IDs from explore-api: ' + uniqueIds.size, silent);
      return [...uniqueIds];
    }
  } catch (err) {
    log('explore-api failed: ' + err.message, silent);
  }

  // Fallback — если API недоступен
  log('Using fallback IDs', silent);
  return [
    5569032992, 9712933917, 9363735110, 3359505957, 6945584306,
    2753915549, 189707, 292439477, 1962086868, 3260590327, 65241, 2809202155,
    4922741943, 1224212277, 3527629287, 13822889, 4872321990, 2414851778,
    1600503006, 3759218498, 142823291, 2474168535, 920587237, 6284583030,
    4483381587, 3956818381, 2152417643, 189813661, 3351674900, 1895587430,
  ];
}

async function fetchGameDetails(universeIds, silent) {
  const details = [];
  for (let i = 0; i < universeIds.length; i += BATCH_SIZE) {
    const batch = universeIds.slice(i, i + BATCH_SIZE);
    try {
      const resp = await fetch(GAME_DETAILS_URL + '?universeIds=' + batch.join(','));
      const data = await resp.json();
      if (data.data) details.push(...data.data);
    } catch (err) { log('Details batch ' + i + ': ' + err.message, silent); }
    await sleep(400);
  }
  return details;
}

async function fetchThumbnails(universeIds, silent) {
  const thumbnails = {};
  for (let i = 0; i < universeIds.length; i += BATCH_SIZE) {
    const batch = universeIds.slice(i, i + BATCH_SIZE);
    const idsStr = batch.join(',');
    try {
      const tResp = await fetch(THUMBNAILS_URL + '?universeIds=' + idsStr + '&countPerUniverse=10&defaults=true&size=768x432&format=Png&isCircular=false');
      const tData = await tResp.json();
      if (tData.data) {
        for (const item of tData.data) {
          thumbnails[item.universeId] = {
            thumbnails: (item.thumbnails || []).filter(t => t.state === 'Completed' && t.imageUrl)
              .map(t => ({ url: t.imageUrl, isIcon: false, width: 768, height: 432 })),
          };
        }
      }
      const iResp = await fetch(ICONS_URL + '?universeIds=' + idsStr + '&returnPolicy=PlaceHolder&size=256x256&format=Png&isCircular=false');
      const iData = await iResp.json();
      if (iData.data) {
        for (const item of iData.data) {
          if (item.state === 'Completed' && item.imageUrl) {
            if (!thumbnails[item.targetId]) thumbnails[item.targetId] = { thumbnails: [] };
            thumbnails[item.targetId].thumbnails.push({ url: item.imageUrl, isIcon: true, width: 256, height: 256 });
          }
        }
      }
    } catch (err) { log('Thumbnails batch ' + i + ': ' + err.message, silent); }
    await sleep(400);
  }
  return thumbnails;
}

async function saveToDatabase(games, thumbnails, silent) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let savedGames = 0, savedThumbs = 0;
    for (const game of games) {
      const res = await client.query(
        'INSERT INTO games (universe_id, place_id, name, description, creator_name, playing, visits) ' +
        'VALUES ($1, $2, $3, $4, $5, $6, $7) ' +
        'ON CONFLICT (universe_id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, ' +
        'playing = EXCLUDED.playing, visits = EXCLUDED.visits, updated_at = NOW() RETURNING id',
        [game.id, game.rootPlaceId, game.name, game.description || '', (game.creator && game.creator.name) || '', game.playing || 0, game.visits || 0]
      );
      const gameId = res.rows[0].id;
      savedGames++;
      const gameThumbs = thumbnails[game.id];
      if (gameThumbs) {
        for (const t of gameThumbs.thumbnails) {
          await client.query(
            'INSERT INTO thumbnails (game_id, image_url, is_icon, width, height) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
            [gameId, t.url, t.isIcon, t.width, t.height]
          );
          savedThumbs++;
        }
      }
    }
    await client.query('COMMIT');
    log('Saved ' + savedGames + ' games and ' + savedThumbs + ' thumbnails.', silent);
    return { savedGames, savedThumbs };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Основная функция — вызывается из CLI (`node scripts/seedRoblox.js`)
 * или из cron в server.js (`runSeed({ silent: true })`)
 */
async function runSeed({ silent = false, closePool = false } = {}) {
  log('=== Roblox Data Seeder ===', silent);
  const universeIds = await fetchAllUniverseIds(silent);
  log('Total unique games: ' + universeIds.length, silent);
  const games = await fetchGameDetails(universeIds, silent);
  log('Got details for ' + games.length + ' games', silent);
  const thumbnails = await fetchThumbnails(universeIds, silent);
  const total = Object.values(thumbnails).reduce((s, t) => s + t.thumbnails.length, 0);
  log('Got ' + total + ' thumbnails total', silent);
  const result = await saveToDatabase(games, thumbnails, silent);
  log('Done!', silent);
  if (closePool) await pool.end();
  return result;
}

module.exports = { runSeed };

// Запуск напрямую: node scripts/seedRoblox.js
if (require.main === module) {
  runSeed({ closePool: true }).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
