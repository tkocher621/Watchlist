// Importing the discord bot API
const Discord = require("discord.js");
// Importing fs for file writing/reading
var fs = require('fs');
// Importing xmldom to make reading from the Steam XML API easier
const DOMParser = require('xmldom').DOMParser;
// Importing node-fetch to grab data from a JSON url
const fetch = require('node-fetch');
// Initialize the discord bot
const bot = new Discord.Client({ autoReconnect: true });

//var path = "/home/todd/.config/SCP Secret Laboratory/Watchlist/watchlist.json";
var path = "./data/watchlist.json";
bot.data = require(path);

// A predefined delimiter in both the bot and the plugin to split data by
var delim = ">>;?273::::93377JJS";

// Create a place to store the sockets
var sockets = [];
// Initialize the TCP server
var tcpServer = require("net").createServer();
var connectedToDiscord = false;

var prefix = "$";

var watchlist = null;

// Connecting to the bot
console.log("Connecting to Discord...");
bot.login("NjA4OTQ0ODE3NTY4ODc0NDk2.XUvihA.-------------mKgzTBE");

// The function for getting a players Steam name through their profile link by reading the Steam API
async function GetName(steamid)
{
    const url = "https://steamcommunity.com/profiles/" + steamid + "/?xml=1";
    try {
      const resp = await fetch(url);
      const text = await resp.text();
      const doc = new DOMParser().parseFromString(text);
      const ele = await doc.documentElement.getElementsByTagName("steamID");
      return ele.item(0).firstChild.nodeValue;
    }
    catch (error) {
        console.log(error);
    }
}

// The function for getting a players SteamID64 through their profile link by reading the Steam API
async function GetSteamID(url)
{
    try {
      const resp = await fetch(url);
      const text = await resp.text();
      const doc = new DOMParser().parseFromString(text);
      const ele = doc.documentElement.getElementsByTagName("steamID64");
      return ele.item(0).firstChild.nodeValue;
    }
    catch (error) {
        console.log(error);
    }
}

// When the bot is ready for use it will inform us that we're fully connected
bot.on("ready", () =>
{
    console.log("Discord connection established.");
    console.log("-------------------------------");
    connectedToDiscord = true;
    watchlist = bot.channels.get("603409123610198026");
    reports = bot.channels.get("612835592895725578");
});

// The message listener, this fuction is run everytime a message is sent in discord
bot.on("message", async function(message)
{
    // If it was a direct message, attempt to parse the profile link sent and get the SteamID64 using the above function
    if (message.channel.type == "dm")
    {
        if (message.content.includes("https://steamcommunity.com/id") || message.content.includes("https://steamcommunity.com/profiles") )
        {
            message.channel.send("SteamID64 for user is `" + await GetSteamID(message.content.concat("?xml=1")) + "`.");
        }
    }

    // To lower case to prevent being case sensitive
    var cmd = message.content.toLowerCase();
    // The add command
    if (cmd.startsWith(prefix + "add"))
    {
        // Split the data by forward slashes
        var split = cmd.replace("$add ", "").split("/");
        if (split.length >= 3)
        {
            var steamid = split[0].trim();
            // Create a new JSON entry with the key being the troublemakers SteamID64 and filling in the other information
            bot.data[steamid] = {
                discipline: split[1].trim(),
                reason: split[2].trim(),
                staff: message.author.username
            }
            // Write the change to the json file
            fs.writeFile(path, JSON.stringify(bot.data, null, 4), err => {
                if (err) throw err;
            });
            message.channel.send("Player `" + await GetName(steamid) + " (" + steamid + ")` has been added to the watchlist.");
        }
        else
        {
            message.channel.send("Error: Missing arguments.");
        }
    }
    // The lookup command
    else if (cmd.startsWith(prefix + "lookup"))
    {
        var steamid = cmd.substring(prefix.length + 7);
        // Check if the json file data contains the SteamID64 provided
        if (bot.data.hasOwnProperty(steamid))
        {
            // If so, parse the data and send it in a neat format using Discord Rich Embed
            var data = bot.data[steamid];
            message.channel.send(new Discord.RichEmbed()
	            .setColor('#0099ff')
                .setAuthor('Dr. Bright\'s Facility Watchlist', 'https://i.imgur.com/B9Aeoui.png')
                .setThumbnail('https://i.imgur.com/NLbIUZk.png')
                .addField('Player', "[" + await GetName(steamid) + " (" + steamid + ")](https://steamcommunity.com/profiles/" + steamid + ")")
                .addField('Discipline', data.discipline)
                .addField('Reason', data.reason)
                .addField('Staff Member', data.staff)
                .setTimestamp()
                .setFooter('Watchlist by Cyanox'));
        }
        else
        {
            message.channel.send("Player not found in watchlist.");
        }
    }
    // The Remove command
    else if (cmd.startsWith(prefix + "remove"))
    {
        var steamid = cmd.substring(prefix.length + 7);
        // Verify the SteamID64 is in the database
        if (bot.data.hasOwnProperty(steamid))
        {
            // Remove it from the data and write the changes to the json file
            delete bot.data[steamid];
            fs.writeFile(path, JSON.stringify(bot.data, null, 4), err => {
                if (err) throw err;
            });
            message.channel.send("Player `" + steamid + "` has been removed from the watchlist.");
        }
        else
        {
            message.channel.send("Player not found in watchlist.");
        }
    }
});

// An event listener, run everytime a new connection is received 
tcpServer.on("connection", async function(socket)
{
    // Add the connection to the list
    await sockets.push(socket);

    await socket.setKeepAlive(true, 1000);

    // Set the encoding method to read the bytes
    await socket.setEncoding("utf8");

    console.log("Connected to client.");

    // Event listener, when the bot received data from a socket
    socket.on("data", async function(data)
    {
        if (bot == null)
        {
            console.log("Recieved " + data + " but Discord client was null.");
            return;
        }

        if (!connectedToDiscord)
        {
            console.log("Recieved " + data + " but was not connected to Discord yet.");
            return;
        }

        var messages = data.split("\u0000");

        // Foreach message received
        messages.forEach(async function(packet)
        {
            // Split the data based on the predefined delimiter and check which command it it
            var split = packet.split(delim);
            if (split[0] == "WATCHLIST")
            {
                // If it's the watchlist command, we're checking if the database contains that player
                if (bot.data.hasOwnProperty(split[1]))
                {
                    // If so, parse the rest of the data and send an automated alert in the proper channel
                    var port = parseInt(split[2]);
                    var serverNum = port - 7776;
                    var data = bot.data[split[1]];
                    watchlist.send("**Watchlisted player has joined server " + serverNum + ".**",
                        new Discord.RichEmbed()
                        .setColor('#0099ff')
                        .setAuthor('Dr. Bright\'s Facility Watchlist', 'https://i.imgur.com/B9Aeoui.png')
                        .setThumbnail('https://i.imgur.com/NLbIUZk.png')
                        .addField('Player', "[" + await GetName(split[1]) + " (" + split[1] + ")](https://steamcommunity.com/profiles/" + split[1] + ")")
                        .addField('Discipline', data.discipline)
                        .addField('Reason', data.reason)
                        .addField('Staff Member', data.staff)
                        .setTimestamp()
                        .setFooter('Watchlist by Cyanox'));
                }
            }
            else if (split[0] == "REPORT")
            {
                // If it's a report, parse the data and send it in its proper channel
                var port = parseInt(split[2]);
                var serverNum = port - 7776;
                reports.send(":warning: **Report from server " + serverNum + ".**", 
                    new Discord.RichEmbed()
                    .setColor('#ffff00')
                    .setAuthor('Dr. Bright\'s Facility Watchlist', 'https://i.imgur.com/B9Aeoui.png')
                    .setThumbnail('https://i.imgur.com/NLbIUZk.png')
                    .addField('Sender', "[" + await GetName(split[1]) + " (" + split[1] + ")](https://steamcommunity.com/profiles/" + split[1] + ")")
                    .addField('Report', split[3])
                    .setTimestamp()
                    .setFooter('Watchlist by Cyanox'));
            }
        });
    });

    // If there are connection issues, destroy the socket to ensure there are no lingering dead sockets
    socket.on("error", async function(data)
    {
        console.log("Socket error <" + data.message + ">");
        socket.destroy();
    });

    socket.on("close", async function()
    {
        console.log("Plugin connection lost.");
    });
});

// Start listening on port 9090
tcpServer.listen(9090, async function()
{
    console.log("Server is listening on port " + 9090);
});

tcpServer.on("error", async function(e)
{
    if (e.code === "EADDRINUSE")
    {
        console.log("Error: Could not bind to port " + 9090 + ", is it already in use?");
    }
    else
    {
        console.log(e);
    }
    process.exit(0);
});