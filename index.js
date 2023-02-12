// Require the necessary discord.js classes
const fs = require('node:fs');
const { Client, Collection, Intents, MessageEmbed } = require('discord.js');
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
			console.log(

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
}

client.login(process.env.DISCORD_TOKEN);
