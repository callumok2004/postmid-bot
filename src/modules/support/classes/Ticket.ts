import * as Discord from "discord.js";

import moment from "moment";
import fs from "fs";
import rimraf from "rimraf";

import { sortTickets } from "../";
import { client } from "../../..";
import channels from "../../../channels";
import { pmdDB } from "../../../database/client";

let coll = pmdDB.collection("tickets"),
	circleFolder = "https://github.com/PreMiD/Discord-Bot/blob/main/.discord/",
	ticketCount = 0,
	ticketsChannel: any = client.channels.cache.get(channels.ticketChannel),
	ticketsCategory: any = client.channels.cache.get(channels.ticketCategory),
	supportChannel: any = client.channels.cache.get(channels.supportChannel);

export class Ticket {
	id: string;
	userId: string;
	status: number;
	ticketContent: string;
	attachments: Array<string>;

	ticketMessage: Discord.Message;
	user: Discord.GuildMember;

	channel: Discord.TextChannel;
	channelMessage: Discord.Message;

	supporters: Array<Discord.GuildMember>;

	embed: Discord.MessageEmbedOptions;

	attachmentsMessage: Discord.Message;
	constructor() {}

	async fetch(type: "ticket" | "message" | "channel" | "author", arg: any) {
		const ticket =
			type === "ticket"
				? arg
				: type === "author"
				? await coll.findOne({ userId: arg })
				: await coll.findOne(type === "message" ? { ticketMessage: arg } : { supportChannel: arg });

		if (!ticket) return false;
		if (!ticket.logs) coll.findOneAndUpdate({userId: ticket.userId}, {$set: {logs: []}});
		
		this.id = ticket.ticketId;
		this.userId = ticket.userId;
		this.status = ticket.status;
		this.attachments = ticket.attachments;

		try {
			this.ticketMessage = await ticketsChannel.messages.fetch(ticket.ticketMessage);
			this.embed = this.ticketMessage.embeds[0];
		} catch (e) {
			console.log(e);
		}

		if (this.status === 1) {
			this.channel = ticketsChannel;
			this.channelMessage = await this.channel?.messages.fetch(
				ticket.supportEmbed
			);
			this.supporters = await Promise.all(
				ticket.supporters.map((s: string) =>
				ticketsChannel.guild.members.fetch(s)
				)
			);
		}

		if (ticket.attachmentMessage)
			this.attachmentsMessage = await ticketsChannel.messages.fetch(ticket.attachmentMessage);

		try {
			this.user = await ticketsChannel.guild.members.fetch(ticket.userId);
		} catch {}
		return true;
	}

	async create(message: Discord.Message) {
		try {
			if (!ticketCount) ticketCount = await coll.countDocuments({});

			ticketCount++;

			this.id = ticketCount.toString().padStart(5, "0");

			this.ticketContent = message.cleanContent;

			this.attachments = [];

			this.embed = {
				author: {
					name: `Ticket#${this.id} [OPEN]`,
					iconURL: `${circleFolder}green_circle.png?raw=true`
				},
				description: message.cleanContent,
				footer: {
					text: message.author.tag,
					iconURL: message.author.displayAvatarURL({ size: 128 })
				},
				color: "#77ff77"
			};

			if (message.attachments.size > 0) {
				this.attachments.push(`[${message.attachments.first().name}](${message.attachments.first().proxyURL})`)
				this.embed.fields = [{
					name: "Attachments",
					value: this.attachments.join(", "),
					inline: false
				}]
			}

			this.ticketMessage = await ticketsChannel.send({
				embed: this.embed
			});

			this.ticketMessage
				.react("🚫")
				.then(() =>
					this.ticketMessage.react(client.guilds.cache.get("493130730549805057").emojis.cache.get("521018476870107156"))
				);

			message.author
				.send(`Your ticket \`\`#${this.id}\`\` has been submitted and will be answered shortly.`)
				.catch(() => {});

			coll.insertOne({
				ticketId: this.id,
				userId: message.author.id,
				ticketMessage: this.ticketMessage.id,
				timestamp: Date.now(),
				attachments: this.attachments,
				created: Date.now(),
				logs: [`[${moment(new Date()).format("DD/MM/YY LT")} (${Date().split("(")[1].replace(")", "")})] [TICKET CREATED] Awaiting supporter!`]
			});

			message.delete().catch(() => {});
			supportChannel.updateOverwrite(message.author.id, {
				SEND_MESSAGES: false
			})
		} catch (err) {
			(client.channels.cache.get(channels.dev) as Discord.TextChannel).send(
				new Discord.MessageEmbed({
					title: "Error: " + err.name,
					description: err.message
				})
			);
		}
	}

	async accept(supporter: Discord.GuildMember) {
		if (ticketsCategory.children.size >= 50) {
			(await ticketsChannel.send(`${supporter.toString()}, Can't accept ticket, the category limit has been reached.`)).delete({ timeout: 15 * 1000 });
			this.ticketMessage.reactions.cache
				.get("521018476870107156")
				.users.remove(supporter);
			return;
		}

		this.embed.author = {
			name: `Ticket#${this.id} [PENDING]`,
			iconURL: "https://github.com/PreMiD/Discord-Bot/blob/main/.discord/yellow_circle.png?raw=true"
		};
		this.embed.color = "#f4dd1a";

		this.ticketMessage.reactions
			.removeAll()
			.then(() => this.ticketMessage.react("🚫"));

		const channelPerms = [
			"VIEW_CHANNEL",
			"SEND_MESSAGES",
			"EMBED_LINKS",
			"ATTACH_FILES",
			"USE_EXTERNAL_EMOJIS"
		];

		this.channel = (
			await ticketsCategory.guild.channels.create(this.id, {
			parent: channels.ticketCategory,
			type: "text",
			permissionOverwrites: [
				{
					id: supporter.guild.id,
					deny: ["VIEW_CHANNEL"]
				},
				{
					id: this.user.id,
					allow: channelPerms
				},
				{
					id: supporter.id,
					allow: channelPerms
				}
			].concat(
				(
					await pmdDB
						.collection("userSettings")
						.find({ seeAllTickets: true })
						.toArray()
				).map(uSett => {
					return {
						id: uSett.userId,
						allow: channelPerms
					};
				})
			)
		})) as Discord.TextChannel;

		this.embed.fields = [
			{
				name: "Supporter",
				value: supporter.toString(),
				inline: true
			},
			{
				name: "Channel",
				value: this.channel.toString(),
				inline: true
			}
		];

		if(this.attachments.length > 0) this.embed.fields["push"]({
			name: "Attachments", 
			value: this.attachments.join(", "),
			inline: true
		})
		
		this.ticketMessage.edit(this.embed);

		//@ts-ignore False types...
		this.embed.fields = this.embed.fields.filter(x => x.name != "Channel");
		this.embed.footer = { text: "p!close - Closes this ticket." };
		this.channelMessage = await this.channel.send({ embed: this.embed });
		this.channel.send(`${this.user}, Your ticket \`\`#${this.id}\`\` has been accepted by **${supporter.displayName}**.`);

		coll.findOneAndUpdate(
			{ ticketMessage: this.ticketMessage.id },
			{
				$set: {
					supportChannel: this.channel.id,
					status: 1,
					supporters: [supporter.id],
					supportEmbed: this.channelMessage.id,
					accepter: supporter.id
				}
			}
		);

		this.addLog(`[ACCEPTED] Ticket accepted by ${supporter.user.tag}`);
		
		sortTickets();
	}

	async close(closer?: any, reason?: string) {
		this.addLog(`[TICKET CLOSED] ${closer.tag ? closer.tag : closer.user.tag} has closed the ticket`)
		
		if (this.channel.deletable) this.channel.delete();

		let logs = (await coll.findOne({supportChannel: this.channel.id})).logs;
		fs.writeFile(`${process.cwd()}/../TicketLogs/${this.id}.txt`, logs.join("\n"), (err) => {
			if(err) console.log(err)
			fs.readFile(`${process.cwd()}/../TicketLogs/${this.id}.txt`, {encoding: "utf-8"}, (err) => {
				if(err) return console.log(err);	
				if(this.user) this.user.send(`Your ticket \`\`#${this.id}\`\` has been closed by **${closer.tag ? closer.tag : closer.user.tag}**. Reason: \`\`${reason || "Not Specified"}\`\``, {
					files: [{
						attachment: `${process.cwd()}/../TicketLogs/${this.id}.txt`,
						name: `Ticket-${this.id}.txt`
					}]
				}).catch(null);
				
				const getVars = url => {
					let regexp = /^https:\/\/discord(app)?\.com\/api\/webhooks\/(\d{18})\/([\w-]{1,})$/;
					return {
						id: regexp.exec(url)[1],
						token: regexp.exec(url)[2]
					}
				},
				vars = getVars(process.env.TICKETLOGSWEBHOOK),
				webhook = new Discord.WebhookClient(vars.id, vars.token),
				embed = new Discord.MessageEmbed()
					.setAuthor(`Ticket#${this.id} [CLOSED]`, "https://github.com/PreMiD/Discord-Bot/blob/main/.discord/red_circle.png?raw=true")
					.setColor("#b52222")
					.setDescription(this.embed.description)
					.addFields([
						{
							name: `Opened By`,
							value: this.user ? this.user.user.tag : `<@${this.userId}>`,
							inline: true
						},
						{
							name: `Closed By`,
							value: closer.tag ? closer.tag : closer.user.tag,
							inline: true
						},
						{
							name: `Reason`,
							value: reason || "Not Specified",
							inline: true
						},
						{
							name: `Supporter(s)`,
							value: this.supporters,
							inline: true
						},
						{
							name: "Attachments",
							value: this.attachments.length > 0 ? this.attachments.join(", ") : "None",
							inline: true
						}
					]);
		
				webhook.send("", {
					embeds: [embed],
					files: [{
						attachment: `${process.cwd()}/../TicketLogs/${this.id}.txt`,
						name: `Ticket-${this.id}.txt`
					}]
				}).catch(null);
				
				delete this.embed.fields;
				if (this.embed.thumbnail) delete this.embed.thumbnail;
				if (this.attachmentsMessage && this.attachmentsMessage.deletable) this.attachmentsMessage.delete();
				if (this.ticketMessage.deletable) this.ticketMessage.delete();
				if (this.user) supportChannel.permissionOverwrites.get(this.user.id).delete()
		
				rimraf(`${process.cwd()}/../TicketLogs/${this.id}.txt`, () => {});

				coll.findOneAndUpdate(
					{ supportChannel: this.channel ? this.channel.id : 0}, {
						$unset: { supportChannel: "", supportEmbed: "" },
						$set: { status: 2, closer: closer.id }
					}
				);
			});
		});
	}

	async addSupporter(member: Discord.GuildMember, sendMessage = true) {
		if (this.supporters.find(s => s.id === member.id)) return;

		this.supporters.push(member);
		this.addLog(`[SUPPORTER ADDED] ${member.user.tag}`);

		//@ts-ignore False types...
		this.embed.fields[0] = {
			name: "Supporter",
			value: this.supporters.join(", ") || "None"
		};

		this.ticketMessage.edit(this.embed);

		let supportEmbed = Object.assign({}, this.embed);

		//@ts-ignore False types...
		supportEmbed.fields.pop();
		supportEmbed.footer = {
			text: "p!close - Closes this ticket."
		};
		this.channelMessage.edit(supportEmbed);

		if (sendMessage) await this.channel.send(`**>** ${member}`);

		this.channel.updateOverwrite(member, {
			VIEW_CHANNEL: true,
			SEND_MESSAGES: true,
			EMBED_LINKS: true,
			ATTACH_FILES: true,
			USE_EXTERNAL_EMOJIS: true
		});

		coll.findOneAndUpdate(
			{ supportChannel: this.channel.id },
			{ $set: { supportChannel: this.channel.id, supporters: this.supporters.map(s => s.id) } }
		);
	}

	async removeSupporter(member: Discord.GuildMember, sendMessage = true) {
		if (this.supporters.find(s => s.id === member.id)) {
			
			this.supporters = this.supporters.filter(s => s.id !== member.id);

			this.ticketMessage.edit(this.embed);
			let supportEmbed = Object.assign({}, this.embed);
			// @ts-ignore False types...
			supportEmbed.fields.pop();
			supportEmbed.footer = {
				text: "p!close - Closes this ticket."
			};
			this.channelMessage.edit(supportEmbed);

			this.channel.updateOverwrite(member, {
				VIEW_CHANNEL: true,
				SEND_MESSAGES: true,
				EMBED_LINKS: true,
				ATTACH_FILES: true,
				USE_EXTERNAL_EMOJIS: true
			});

			if (sendMessage) await this.channel.send(`**<** ${member}`);

			coll.findOneAndUpdate(
				{ supportChannel: this.channel.id },
				{ $set: { supporters: this.supporters.map(s => s.id) } }
			);
		}
	}

	async attach(imageObj, userId) {
		const { attachments } = await coll.findOne({userId: userId, status: 1});
		attachments.push(`[${imageObj.name}](${imageObj.proxyURL})`);
		this.embed.fields ?
			this.embed.fields.filter(x => x.name == "Attachments").length == 1 ?
				(this.embed.fields.filter(x => x.name == "Attachments")[0].value = attachments.join(", "))
			: this.embed.fields['push']({name: "Attachments", value: attachments.join(", "), inline: true})
		: this.embed.fields = [{name: "Attachments", value: attachments.join(", "), inline: true}];
		
		this.channelMessage.edit(this.embed);

		let emb = this.ticketMessage.embeds[0];

		emb.fields ?
			emb.fields.filter(x => x.name == "Attachments").length == 1 ?
				(emb.fields.filter(x => x.name == "Attachments")[0].value = attachments.join(", "))
			: emb.fields["push"]({name: "Attachments", value: attachments.join(", "), inline: true})
		: emb.fields = [{name: "Attachments", value: attachments.join(", "), inline: true}];

		this.ticketMessage.edit(emb);

		coll.findOneAndUpdate({userId: userId}, { 
			$set: { attachments: attachments }
		})
	}

	addLog(input) {
		coll.findOneAndUpdate({supportChannel: this.channel.id}, { 
			$push: { logs: `[${moment(new Date()).format("DD/MM/YY LT")} (${Date().split("(")[1].replace(")", "")})] ${input}` }
		})
	}

	async sendCloseWarning() {
		this.addLog(`[WARNING] This ticket will be closed in 2 days due to inactivity`);
		this.channel.send(
			`${this.user.toString()}, ${this.supporters.map(s => s.toString()).join(", ")}, This ticket will be closed automatically due to inactivity in **2 days**. To prevent this simply send a message in this channel.`
		);
		coll.findOneAndUpdate(
			{ supportChannel: this.channel.id },
			{ $set: { ticketCloseWarning: Date.now() } }
		);
	}
}
