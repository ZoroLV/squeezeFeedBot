const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
require('dotenv').config();


const commands = [
    {
        name: 'ping',
        description: 'Replies with Pong!'
    },
    {
        name: 'server',
        description: 'Replies with server info!'
    },
    {
        name: 'user',
        description: 'Replies with user info!'
    },
    {
        name: 'fc',
        description: 'Replies with user\'s FCs by star!',
        options: [
            {
                name: 'star',
                description: 'Star rating of the maps',
                type: 4,
                required: true,
            },
            {
                name: 'id',
                description: 'Scoresaber id of the user',
                type: 3,
                required: true,
            },
            /*{
                name: 'playlist',
                description: 'Whether to make a playlist or not',
                type: 5,
                required: false,
            },*/
        ],
    },
];

const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();