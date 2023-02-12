const fetch = require('node-fetch');
const helpers = require('../misc/helpers')
const { Client } = require('pg')


// Function inserts player's data, check if player id exists in database, if so update, if not insert
const insertUser = async (id, name, pp) => {
    const con = new Client({
        host: process.env.PGHOST,
        user: process.env.PGUSER,
        database: process.env.PGDATABASE,
        password: process.env.PGPASSWORD,
        port: process.env.PGPORT,
    });
    try {
        await con.connect();           // gets connection
        const res = await con.query(`SELECT * FROM player_info WHERE id = '${id}'`);
        if (res.rows.length > 0) {
            await con.query(`UPDATE player_info SET name = '${name}', pp = ${pp} WHERE id = '${id}'`);
            return true;
        } else {
            await con.query(`INSERT INTO player_info (id, name, pp) VALUES ('${id}', '${name}', ${pp})`);
            return true;
        }
    } catch (err) {
        console.log(err.stack);
        return false;
    } finally {
        await con.end();
    }
}

const getPlayerInfoDB = async (id) => {
    const con = new Client({
        host: process.env.PGHOST,
        user: process.env.PGUSER,
        database: process.env.PGDATABASE,
        password: process.env.PGPASSWORD,
        port: process.env.PGPORT,
    });
    try {
        await con.connect();           // gets connection
        const res = await con.query(`SELECT * FROM player_info WHERE id = '${id}'`);
        if (res.rows.length > 0) {
            return res.rows[0];
        } else {
            const player = await helpers.getPlayerInfo(id);
            await insertUser(id, player.name, player.pp);
            return player;
        }
    } catch (err) {
        console.log(err.stack);
        return false;
    } finally {
        await con.end();
    }
}

async function getMapHashFromLeaderboardId(leaderboardId) {
    const url = `https://scoresaber.com/api/leaderboard/by-id/${leaderboardId}/info`
    const data = await fetch(url)
    const json = await data.json()
    return json.songHash
}


async function getDiffNameFromLeaderboardId(leaderboardId) {
    const url = `https://scoresaber.com/api/leaderboard/by-id/${leaderboardId}/info`
    const data = await fetch(url)
    const json = await data.json()
    console.log(leaderboardId)
    console.log(json)
    const diffStr = json.difficulty.difficultyRaw
    const splitDiff = diffStr.split("_")[1]
    return splitDiff
}


async function getBSORUrl(playerId, leaderboardId) {
    const diffName = await getDiffNameFromLeaderboardId(leaderboardId)
    const mapHash = await getMapHashFromLeaderboardId(leaderboardId)
    return `https://cdn.beatleader.xyz/replays/${playerId}-${diffName}-Standard-${mapHash}.bsor`
}


async function getBeatLeaderReplayData(playerId, leaderboardId) {
    const url = await getBSORUrl(playerId, leaderboardId)
    const data = await fetch(url)
    const arrayBuffer = await data.arrayBuffer()
    const replayData = decode(arrayBuffer)
    return replayData
}


async function getMapData(leaderboardId) {
    const diffName = await getDiffNameFromLeaderboardId(leaderboardId)
    const mapHash = await getMapHashFromLeaderboardId(leaderboardId)
    const url = `https://r2cdn.beatsaver.com/${mapHash.toLowerCase()}.zip`
    const zip = new JSZip()
    const data = await fetch(url)
    const zipDataBuffer = await data.arrayBuffer()
    const zipData = await zip.loadAsync(zipDataBuffer)
    //const file = zipData.files.filter(file => file.name.includes(diffName))[0]
    for (file in zipData.files) {
        if (zipData.files[file].name.includes(diffName)) {
            const f = zipData.files[file]
            const data = await f.async("string")
            return JSON.parse(data)
        }
    }
    return null
}


function beatLeaderTest() {
    getBeatLeaderReplayData(zoro, "420790").then(data => {
        const deviations = data.notes.map(note => note.noteCutInfo.timeDeviation)
        const avg = deviations.reduce((a, b) => a + b, 0) / deviations.length
        console.log(avg)
    })
}


const getBeatSaverMapDataByHash = async (hash) => {
    let data = {}
    try {
        const map_link = `https://beatsaver.com/api/maps/hash/${hash}`
        let response = await fetch(map_link)
        data = await response.json()
    } catch (e) {
        console.error(e)
    } finally {
        return data
    }
}

const getBeatSaverDifficulty = (difficultyNum) => {
    switch (difficultyNum) {
        case 1:
            return "Easy"
        case 3:
            return "Normal"
        case 5:
            return "Hard"
        case 7:
            return "Expert"
        case 9:
        default:
            return "ExpertPlus"
    }
}


const extractVersionData = (mapData, mapHash) => {
    let foundVersion = {}
    for (const version of mapData.versions) {
        const hash = version.hash
        if (version.hash.toLowerCase() === mapHash.toLowerCase()) {
            foundVersion = version
            break
        }
    }
    return foundVersion
}


const extractDiffData = (versionData, difficulty) => {
    let foundDiff = {}
    for (const diff of versionData.diffs) {
        if (diff.difficulty.toLowerCase() === difficulty.toLowerCase()) {
            foundDiff = diff
            break;
        }
    }
    return foundDiff
}


const getMaxScore = (mapHash, mapData, difficulty) => {
    let maxScore = -1
    try {
        const foundVersion = extractVersionData(mapData, mapHash)
        const foundDiff = extractDiffData(foundVersion, difficulty)
        maxScore = foundDiff.maxScore
    } catch (e) {
        console.error(e)
    } finally {
        return maxScore
    }
}


const calculatePercentage = (score, maxScore) => {
    const percentage = +((score/maxScore) * 100).toFixed(2)
    return percentage
}

const getPlayerInfo = async (playerID) => {
    const response = await fetch(`https://scoresaber.com/api/player/${playerID}/full`);
    const playerData = await response.json();
    return playerData;
}


const getScoresaberLeaderboardData = async (leaderboardId) => {
    const response = await fetch(`https://scoresaber.com/api/leaderboard/by-id/${leaderboardId}/info`)
    const data = await response.json()
    return data
}


const extractPlayerIds = (playerList) => {
    let playerIdList = []
    for (const playerId of playerList.split(",")) {
        playerIdList.push(playerId.trim())
    }
    return playerIdList
}


const getTop10PlayerIds = async (leaderboardId) => {

    let playerIds = []
    try {
        const url = `https://scoresaber.com/api/leaderboard/by-id/${leaderboardId}/scores`
        const response = await fetch(url)
        const data = await response.json()
        playerIds = data["scores"].map(x => x.leaderboardPlayerInfo.id).slice(0, 10)
    } catch (e) {
        console.error(e)
    } finally {
        return playerIds
    }

}

const getRecentScores = async (playerId) => {
    const url = `https://scoresaber.com/api/player/${playerId}/scores?sort=recent`
    const response = await fetch(url)
    const data = await response.json()
    return data
}

// Check if the pp is higher or equal than the last score's pp on the page
const isTopPlay = async (playerId, pp) => {
    const url = `https://scoresaber.com/api/player/${playerId}/scores?sort=top&page=10`
    const response = await fetch(url)
    const data = await response.json()
    const lastScore = data["playerScores"].slice(-1)[0]
    console.log(lastScore)
    const lastScorePP = lastScore.pp
    return pp <= lastScorePP
}

exports.isTopPlay = isTopPlay
exports.getTop10PlayerIds = getTop10PlayerIds
exports.getRecentScores = getRecentScores
exports.extractPlayerIds = extractPlayerIds
exports.getBeatSaverMapDataByHash = getBeatSaverMapDataByHash
exports.getBeatSaverDifficulty = getBeatSaverDifficulty
exports.getMaxScore = getMaxScore
exports.calculatePercentage = calculatePercentage
exports.getPlayerInfo = getPlayerInfo
exports.getScoresaberLeaderboardData = getScoresaberLeaderboardData
exports.insertUser = insertUser
exports.getPlayerInfoDB = getPlayerInfoDB
