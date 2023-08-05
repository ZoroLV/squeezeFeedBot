// Require the necessary discord.js classes
const fs = require('node:fs');
const { Client, Collection, Intents, MessageEmbed, MessageAttachment } = require('discord.js');
require("dotenv").config();
const helpers = require('./misc/helpers');
const WebSocket = require('ws');

// Constants
const userIDs = ["76561197999207881", "76561198126686400", "76561198071688400", "76561198048499373"]


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

// Connect to ScoreSaber WebSocket
function connect() {

    let SSSock = new WebSocket("wss://scoresaber.com/ws"); // Open WebSocket to ScoreSaber

	SSSock.onopen = function() {
		console.log("Connected to ScoreSaber");
	}

	// Listen for score from ScoreSaber
	SSSock.onmessage = async function(event) {

		// If the player is in the list of users
		if (event.data !== "Connected to the ScoreSaber WSS") {
			let jsonObj = JSON.parse(event.data);

			  if (jsonObj.commandName === "score" && userIDs.includes(jsonObj.commandData.score.leaderboardPlayerInfo.id) && jsonObj.commandData.leaderboard.ranked === true) {
				console.log("New message")			
				  
				let oldInfo = await helpers.getPlayerInfoDB(jsonObj.commandData.score.leaderboardPlayerInfo.id);
				let newInfo = await helpers.getPlayerInfo(jsonObj.commandData.score.leaderboardPlayerInfo.id);
				let ppDiff = newInfo.pp - oldInfo.pp;

				let scoreData = jsonObj.commandData.score;
				let playerData = scoreData.leaderboardPlayerInfo;
				let songData = jsonObj.commandData.leaderboard;

				// Update player's info in database
				helpers.insertUser(playerData.id, playerData.name, newInfo.pp);

				let topPlay = await helpers.isTopPlay(playerData.id, scoreData.pp);
				let percentage = helpers.calculatePercentage(scoreData.modifiedScore, songData.maxScore);

				if (topPlay) {
					console.log("New top play")
					// pp Gain embed
					const embed = new MessageEmbed()
						.setColor('#C3B1E1')
						.setTitle(`${playerData.name} +${ppDiff.toFixed(2)}pp`)

					// If top play was an FC then content string is different
					if (scoreData.fullCombo === true) {
						let content = `**${playerData.name}** scored **${percentage}% / ${scoreData.pp.toFixed(2)}pp** \nFC: ☑️ \nhttps://scoresaber.com/u/${playerData.id} \nhttps://scoresaber.com/leaderboard/${songData.id}`
						client.channels.cache.get('1016245806078099516').send(content);
					} else {
						let content = `**${playerData.name}** scored **${percentage}% / ${scoreData.pp.toFixed(2)}pp** \nFC: ❌, Badcuts: ${scoreData.badCuts}, Misses: ${scoreData.missedNotes}  \nhttps://scoresaber.com/u/${playerData.id} \nhttps://scoresaber.com/leaderboard/${songData.id}`
						client.channels.cache.get('1016245806078099516').send(content);
					}

					// Send embed
					client.channels.cache.get('1016245806078099516').send({ embeds: [embed] });
				}
			}
		}
	}


	SSSock.onclose = function() {
		console.log("Disconnected from ScoreSaber");
		setTimeout(connect, 5000);
	}

	// Slash command to ping
	client.on('interactionCreate', async interaction => {
		if (!interaction.isCommand()) return;

		if (interaction.commandName === 'ping') {
			await interaction.reply('Pong!');
		}
	}
	);

	// Slash command to get deatailed server info
	client.on('interactionCreate', async interaction => {
		if (!interaction.isCommand()) return;

		if (interaction.commandName === 'server') {
			await interaction.reply(`Server name: ${interaction.guild.name}\nTotal members: ${interaction.guild.memberCount}`);
		}
	}
	);

	// Slash command to get deatailed user info
	client.on('interactionCreate', async interaction => {
		if (!interaction.isCommand()) return;

		if (interaction.commandName === 'user') {
			await interaction.reply(`Your tag: ${interaction.user.tag}\nYour id: ${interaction.user.id}`);
		}
	}
	);

	// Slash command to get amount of maps FC'd by star rating
	client.on('interactionCreate', async interaction => {
		if (!interaction.isCommand()) return;

		if (interaction.commandName === 'fc') {
			let star = interaction.options.getInteger('star');
			let id = interaction.options.getString('id');

			// Error handling for options 
			if (star < 0 || star > 12) {
				await interaction.reply('Star rating must be between 0 and 14!');
				return;
			}

			//let bMakePlaylist = interaction.options.getBoolean('playlist');
			let info = await helpers.getPlayerInfo(id);

			if (info === null) {
				await interaction.reply('Invalid ID!');
				return;
			}
			
			interaction.deferReply();
			let rankedScores = await helpers.getAllRankedScores(id);
			console.log(rankedScores.length);
			let fcCount = 0;

				for (let i = 0; i < rankedScores.length; i++) {

					if (rankedScores[i].score.fullCombo === true && rankedScores[i].leaderboard.stars >= star && rankedScores[i].leaderboard.stars < star + 1) {
						fcCount++;
					}
				}

			
			// Get the total number of ranked maps at that star range so we can see how many maps the player has FC'd
			let totalMaps = await helpers.getTotalRankedMaps(star);

			let messageString = `**${info.name}** has **${fcCount}**/**${totalMaps}** maps FC'd at **${star}**⭐!`;

			/* If the user wants a playlist, make one of all the missing FCs
			if (bMakePlaylist) {
				const playlistTitle = `${info.name} - ${fcCount} FCs at ${star} star`;
				// For the filename, separate the words with underscores, and add the date at the end
				const playlistFileName = `${info.name}_MissingFCs_at_${star}_star_${new Date().toISOString().slice(0, 10)}.bplist`;
			
				let playlistData = {
					playlistTitle: playlistTitle,
					playlistAuthor: info.name,
					songs: []
				};

				// Iterate through all of the maps at the given star range then compare the ids to the ids of the maps the player has FC'd and add the missing ones to the playlist
				for (let i = 0; i < rankedScores.length; i++) {
					if (rankedScores[i].score.fullCombo === false && rankedScores[i].leaderboard.stars >= star && rankedScores[i].leaderboard.stars < star + 1) {
						let songData = await helpers.getBeatSaverMapDataByHash(rankedScores[i].leaderboard.songHash);
						let song = {
							songName: songData.metadata.songName,
							levelAuthorName: songData.metadata.levelAuthorName,
							hash: rankedScores[i].leaderboard.songHash,
							levelid: 'custom_level_' + rankedScores[i].leaderboard.songHash,
							difficulties: [
								{
									characteristic: 'Standard',
									name: rankedScores[i].leaderboard.difficulty.difficultyRaw.split('_')[1]
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
			} */
			await interaction.editReply(messageString);
		}
	}
	);
}


client.login(process.env.DISCORD_TOKEN);
