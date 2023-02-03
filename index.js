// Require the necessary discord.js classes
const fs = require('node:fs');
const { Client, Collection, Intents, MessageEmbed } = require('discord.js');
require("dotenv").config();
const helpers = require('./misc/helpers');

// Create a new client instance
const client = new Client({ intents: [Intents.FLAGS.GUILDS] });

async function postScores(){
	const userIDs = ["76561197999207881", "76561198126686400", "76561198071688400", "76561198048499373"]
	// Get the current time
	let currentTime = new Date().getTime()
	const channel = await client.channels.fetch('1016245806078099516')
	// Loop through each user
	for (let i = 0; i < userIDs.length; i++) {
		// Check each user's recent scores and see if they are within the last 10 minutes, await all the data and store it in an array
		const oldInfo = await helpers.getPlayerInfoDB(userIDs[i]);
		let recentData = await helpers.getRecentScores(userIDs[i])
		let recentScores = recentData.playerScores
		const playerInfo = await helpers.getPlayerInfo(userIDs[i])
		// Get the pp difference from the old pp and the new pp
		const ppDiff = playerInfo.pp - oldInfo.pp
		console.log(userIDs[i] + " " + playerInfo.name)
		let scoreTime = new Date(recentData.playerScores[0].score.timeSet)
		let scoreTimeUnix = scoreTime.getTime()
		if (currentTime - scoreTimeUnix < 300000) {
			await helpers.insertUser(userIDs[i], playerInfo.name, playerInfo.pp).then(result => {
				if (result) {
					console.log('User inserted');
				} 
			})

			// Loop through each score
			for (let j = 0; j < recentScores.length; j++) {
				// Check if the score is within the last 10 minutes. If it is first check if it's ranked, then check if it is a top play
	
				let scoreTime = new Date(recentData.playerScores[j].score.timeSet)
				let scoreTimeUnix = scoreTime.getTime()
	
				if (currentTime - scoreTimeUnix < 300000) {
					// Check if the score is ranked
					if (recentScores[j].leaderboard.ranked == true) {
						// Check if the score is a top play
						const topPlay = await helpers.isTopPlay(userIDs[i], recentData.playerScores[j].score.id)
						// If it is a top play, then post it to the discord channel
						if (topPlay) { 
							// If top play was an FC then content string is different
							let percentage = helpers.calculatePercentage(recentData.playerScores[j].score.modifiedScore, recentData.playerScores[j].leaderboard.maxScore)
							if (recentData.playerScores[j].score.fullCombo == true) {
								const content = `**${playerInfo.name}** scored **${percentage}% / ${recentData.playerScores[j].score.pp.toFixed(2)}pp** \nFC: ☑️ \nhttps://scoresaber.com/u/${userIDs[i]} \nhttps://scoresaber.com/leaderboard/${recentData.playerScores[j].leaderboard.id}`
								await channel.send({ content: content })
							} else {
								const content = `**${playerInfo.name}** scored **${percentage}% / ${recentData.playerScores[j].score.pp.toFixed(2)}pp** \nFC: ❌, Badcuts: ${recentData.playerScores[j].score.badCuts}, Misses: ${recentData.playerScores[j].score.missedNotes} \nhttps://scoresaber.com/u/${userIDs[i]} \nhttps://scoresaber.com/leaderboard/${recentData.playerScores[j].leaderboard.id}`
								await channel.send({ content: content })
							}
						}
						else{
							console.log(recentScores[j].leaderboard.songName + " is not a top play")
						}
					}
					else{
						console.log('Not ranked')
					}
				}
			}
			// If the ppDiff is greater than 1 then post it to the discord channel
		if (ppDiff > 0.5) {
			const embed = new MessageEmbed()
			.setColor('#C3B1E1')
			.setTitle(`${playerInfo.name} +${ppDiff.toFixed(2)}pp`)
		
			await channel.send({ embeds: [embed] })
		}
		} else {
			console.log('No recent scores')
		}
	}
}

client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}!`);
	console.log('Score feed started');
	client.user.setActivity('you squeeze', { type: 'WATCHING', url: 'https://discordapp.com/' });
	client.user.setPresence({
		status: 'dnd',
	})
	postScores()
	setInterval(postScores, 300000);
});

client.login(process.env.DISCORD_TOKEN);

