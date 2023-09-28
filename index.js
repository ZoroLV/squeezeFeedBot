// Require the necessary discord.js classes
const fs = require('node:fs');
const { Client, Collection, Intents, MessageEmbed, MessageAttachment } = require('discord.js');
require("dotenv").config();
const helpers = require('./misc/helpers');
const WebSocket = require('ws');
const cron = require('node-cron');
const { kMaxLength } = require('node:buffer');
const sqlite3 = require('sqlite3').verbose();

// Create userIDs variable
let userIDs = [];
let db = new sqlite3.Database('./users.db', sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the users database.');
});

db.all("SELECT id FROM users", [], (err, rows) => {
    if (err) {
        throw err;
    }
    rows.forEach((row) => {
        userIDs.push(row.id);
    });
});

const testDiscordID = "1106488570803404852";
const productionDiscordID = "1016245806078099516";

// Create a new client instance
const client = new Client({ intents: [Intents.FLAGS.GUILDS] });

client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}!`);
	console.log('Score feed started');
	client.user.setActivity('you squeeze', { type: 'WATCHING', url: 'https://discordapp.com/' });
	client.user.setPresence({
		status: 'dnd',
	})
	
	connect();	
});

async function onNewScore(playerId, newTotalPP) {
    try {
        // Get the previous stats from user database
        const oldUserStats = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM users WHERE id = ?", [playerId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });

        console.log('Previous total pp: ' + oldUserStats.totalPP);
        console.log('New total pp: ' + newTotalPP);

        // Calculate the pp gain
        let ppGain = newTotalPP - oldUserStats.gainPP;

        // Update the user's gainPP in the database
        await new Promise((resolve, reject) => {
            db.run("UPDATE users SET gainPP = ? WHERE id = ?", [newTotalPP, playerId], (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        // Return the pp gain
        return ppGain;
        
    } catch (error) {
        console.error("There was an error:", error);
    }
}

async function displayDailyLeaderboard() {
    try {
        // Fetch players' information in parallel
        const values = await Promise.all(userIDs.map(helpers.getPlayerInfo));

        // Fetch old user stats from the database in parallel and calculate the differences
        const statsDifferences = await Promise.all(values.map(async (value) => {
            const row = await new Promise((resolve, reject) => {
                db.get("SELECT * FROM users WHERE id = ?", [value.id], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            const newRank = value.rank;
            const newPP = value.pp;

            const rankDifference = row.rank - newRank;
            const ppDifference = newPP - row.totalPP;

            await new Promise((resolve, reject) => {
                db.run("UPDATE users SET totalPP = ?, rank = ?, gainPP = ? WHERE id = ?", [newPP, newRank, newPP, value.id], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            return {
                playerId: value.id,
                rankDifference,
                ppGain: ppDifference,
                player: value
            };
        }));

        // Sort players by their ppGains
        statsDifferences.sort((a, b) => b.ppGain - a.ppGain);

        // Construct the leaderboard string
        const leaderboardString = [
            "# :trophy: **The Daily Squeeze Leaderboard** :trophy:",
            "-------------------------------------------------------------------------",
            ...statsDifferences.map((stat, i) => {
                const { playerId, rankDifference, ppGain, player } = stat;

                const ppSign = ppGain > 0 ? '+' : '-';
                const ppAction = ppGain > 0 ? 'gained' : 'lost';
                const rankEmoji = rankDifference > 0 
                    ? ':arrow_up:' 
                    : rankDifference < 0 
                    ? ':arrow_down:' 
                    : ':stop_button:';
                const rankMovement = rankDifference > 0 
                    ? `moved up **${rankDifference}** ranks` 
                    : rankDifference < 0 
                    ? `moved down **${Math.abs(rankDifference)}** ranks` 
                    : 'stayed at the same rank';

                return `**${i + 1}. ${player.name}** ${ppAction} **${ppSign}${Math.abs(ppGain).toFixed(2)}pp** and ${rankEmoji} ${rankMovement} to **#${player.rank}** with **${player.pp.toFixed(2)}pp**`;
            }),
            "-------------------------------------------------------------------------"
        ].join('\n');

        // Send the leaderboard to the discord channel
        client.channels.cache.get(productionDiscordID).send(leaderboardString);
    } catch (error) {
        console.error("There was an error:", error);
    }
}


// Connect to ScoreSaber WebSocket
function connect() {

    let SSSock = new WebSocket("wss://scoresaber.com/ws"); // Open WebSocket to ScoreSaber

	SSSock.onopen = function() {
		console.log("Connected to ScoreSaber");
	}

	// Listen for score from ScoreSaber
	SSSock.onmessage = async function(event) {
		if (event.data === "Connected to the ScoreSaber WSS") return;
        
        const jsonObj = JSON.parse(event.data);
        const playerID = jsonObj.commandData.score.leaderboardPlayerInfo.id;

        if (jsonObj.commandName !== "score" || !userIDs.includes(playerID) || jsonObj.commandData.leaderboard.ranked !== true) return;
        
        console.log("New message");
        
        const newInfo = await helpers.getPlayerInfo(playerID);
        const ppGain = await onNewScore(playerID, newInfo.pp);

        const scoreData = jsonObj.commandData.score;
        const playerData = scoreData.leaderboardPlayerInfo;
        const songData = jsonObj.commandData.leaderboard;

        const topPlay = await helpers.isTopPlay(playerData.id, scoreData.pp);
        const percentage = helpers.calculatePercentage(scoreData.modifiedScore, songData.maxScore);

		if (topPlay) {
            console.log("New top play");

            // pp Gain embed
            const embed = new MessageEmbed()
                .setColor('#C3B1E1')
                .setTitle(`🔼 +${ppGain.toFixed(2)}pp`)

            // Structured message
            let content;
            if (scoreData.fullCombo === true) {
                content = `🔥 **${playerData.name}** achieved **${percentage}%** yielding **${scoreData.pp.toFixed(2)}pp**.\n🎉 Full Combo: ☑️\n\n🔗 [Player Profile](https://scoresaber.com/u/${playerData.id}) | [Song Leaderboard](https://scoresaber.com/leaderboard/${songData.id})`;
            } else {
                content = `🔥 **${playerData.name}** achieved **${percentage}%** yielding **${scoreData.pp.toFixed(2)}pp**.\n❌ Full Combo: Missed Notes - ${scoreData.missedNotes}, Badcuts - ${scoreData.badCuts}\n\n🔗 [Player Profile](https://scoresaber.com/u/${playerData.id}) | [Song Leaderboard](https://scoresaber.com/leaderboard/${songData.id})`;
            }

            client.channels.cache.get(productionDiscordID).send(content);
            client.channels.cache.get(productionDiscordID).send({ embeds: [embed] });
        }
	}

	SSSock.onclose = function() {
		console.log("Disconnected from ScoreSaber");
		setTimeout(connect, 5000);
	}


	// Slash command to get amount of maps FC'd by star rating
	client.on('interactionCreate', async interaction => {
		if (!interaction.isCommand()) return;

        if (interaction.commandName === 'insertuser') {
            let id = interaction.options.getString('id');
            let info = await helpers.getPlayerInfo(id);
        
            if (info === null) {
                await interaction.reply('Invalid ID!');
                return;
            }
        
            // Check if the user is already in the database
            if (userIDs.includes(id)) {
                await interaction.reply('User already exists in the database!');
                return;
            }
        
            try {
                // Insert the user
                const sql = `INSERT INTO users (id, totalPP, rank, gainPP) VALUES (?, ?, ?, ?)`;
                db.run(sql, [id, info.pp, info.rank, info.pp], function(err) {
                    if (err) {
                        console.error("Error inserting user:", err);
                        throw err; // throwing the error so that it can be caught in the catch block
                    } else {
                        console.log(`User with ID ${id} inserted successfully!`);
                        userIDs.push(id);
                        interaction.reply(`Successfully inserted ${info.name} into the database!`);
                    }
                });
            } catch (error) {
                console.error("Error inserting user:", error);
                await interaction.reply('An error occurred while inserting the user into the database. Please try again later.');
            }
        }        
        
        // removeUser command
        if (interaction.commandName === 'removeuser') {
            let id = interaction.options.getString('id');
        
            // Restricted IDs that cannot be removed
            const restrictedIDs = ["76561198126686400", "76561197999207881", "76561198048499373", "76561198071688400"];
            
            if (restrictedIDs.includes(id)) {
                await interaction.reply("You don't have permission to remove this user ☠️.");
                return;
            }
            
            // Check if the user is in the database
            if (!userIDs.includes(id)) {
                await interaction.reply('User does not exist in the database!');
                return;
            }
        
            // Remove the user
            db.run("DELETE FROM users WHERE id = ?", [id], async (err) => {
                if (err) {
                    console.error("Error removing user:", err);
                    await interaction.reply('An error occurred while removing the user from the database. Please try again later.');
                } else {
                    userIDs = userIDs.filter(e => e !== id);
                    await interaction.reply(`Successfully removed ${id} from the database!`);
                }
            });
        }
        
		if (interaction.commandName === 'fc') {
			let star = interaction.options.getInteger('star');
			let id = interaction.options.getString('id');

			// Error handling for options 
			if (star < 0 || star > 12) {
				await interaction.reply('Star rating must be between 0 and 14!');
				return;
			}

			let bMakePlaylist = interaction.options.getBoolean('playlist');
			let info = await helpers.getPlayerInfo(id);

			if (info === null) {
				await interaction.reply('Invalid ID!');
				return;
			}
			
			interaction.deferReply();
			let rankedScores = await helpers.getAllRankedScores(id);
			console.log(rankedScores.length);
			fcMaps = [];
			let fcCount = 0;

				for (let i = 0; i < rankedScores.length; i++) {

					if (rankedScores[i].score.fullCombo === true && rankedScores[i].leaderboard.stars >= star && rankedScores[i].leaderboard.stars < star + 1) {
						fcCount++;
						fcMaps.push(rankedScores[i]);
					}
				}

			
			// Get the total number of ranked maps at that star range so we can see how many maps the player has FC'd
			let totalMaps = await helpers.getTotalRankedMaps(star);

			let messageString = `**${info.name}** has **${fcCount}**/**${totalMaps}** maps FC'd at **${star}**⭐!`;

			// If the user wants a playlist, make one of all the missing FCs
			if (bMakePlaylist) {
				const playlistTitle = `${info.name} - ${fcCount} FCs at ${star} star`;
				// For the filename, separate the words with underscores, and add the date at the end
				const playlistFileName = `${info.name}_MissingFCs_at_${star}_star_${new Date().toISOString().slice(0, 10)}.bplist`;
			
				let playlistData = {
					playlistTitle: playlistTitle,
					playlistAuthor: info.name,
					songs: []
				};

				// Get all the maps of the star rating first
				let allRankedMaps = await helpers.getRankedMapsDatabyStar(star);
				console.log('All ranked maps at' + star + 'star: ' + allRankedMaps.length);

				// Now that we have all the ranked maps of that star rating, we can compare it to the maps the player has FC'd, and add the missing ones to the playlist, aswell as the ones that the player has not played yet
				for (let i = 0; i < allRankedMaps.length; i++) {
					let found = false;
					for (let j = 0; j < fcMaps.length; j++) {
						if (allRankedMaps[i].id === fcMaps[j].leaderboard.id) {
							console.log('Found map: ' + allRankedMaps[i].songName);
							found = true;
							break;
						}
					}
					if (found === false) {
						let song = {
							songName: allRankedMaps[i].songName,
							levelAuthorName: allRankedMaps[i].levelAuthorName,
							hash: allRankedMaps[i].songHash,
							levelid: 'custom_level_' + allRankedMaps[i].songHash,
							difficulties: [
								{
									characteristic: 'Standard',
									name: allRankedMaps[i].difficulty.difficultyRaw.split('_')[1]
								}
							]
						};
						playlistData.songs.push(song);
					}
				}



				const buffer = Buffer.from(JSON.stringify(playlistData));
				new MessageAttachment(buffer, playlistFileName);
				await interaction.editReply({ content: messageString, files: [new MessageAttachment(buffer, playlistFileName)] });
			} else {
				await interaction.editReply(messageString);
			}
		}
	}
	);
}

// Schedule the daily leaderboard to be displayed at 5:00 AM PST
cron.schedule('0 5 * * *', displayDailyLeaderboard, {timezone: "America/Los_Angeles"});


client.login(process.env.DISCORD_TOKEN);

const eventNames = client.eventNames();
for (const eventName of eventNames) {
    console.log(`${eventName}: ${client.listenerCount(eventName)}`);
}

module.exports = {
    db: db
}