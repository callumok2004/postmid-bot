import * as Discord from "discord.js";
import assignee from "../assignee";
import assignRolesFile from "../assignRoles";
import config from "../../../config";

let embed: Discord.MessageEmbed;

module.exports.run = async (
	message: Discord.Message,
	params: Array<String>
) => {
	let roleCheck: { movieNight: string; minecraft?: string;
    linuxTest?: string; vacation?: string; } = assignRolesFile.everyone;
	
	if (message.member.hasPermission("ADMINISTRATOR")) {
		roleCheck.minecraft = assignRolesFile.betaAndAlpha.minecraft;
		roleCheck.vacation = assignRolesFile.staff.vacation;
		roleCheck.linuxTest = assignRolesFile.linuxMaintainer.linuxTest;
	} else {
		if (message.member.roles.cache.has(assignee.alphaRole || assignee.betaRole))
		{
			roleCheck.minecraft = assignRolesFile.betaAndAlpha.minecraft;
		}
		if (message.member.roles.cache.has(assignee.staff))
		{
			roleCheck.vacation = assignRolesFile.staff.vacation;
		}
		if (message.member.roles.cache.has(assignee.LinuxMaintainer))
		{
			roleCheck.linuxTest = assignRolesFile.linuxMaintainer.linuxTest;
		}
	}

	let assignRoles: Discord.Role[] = Object.values(roleCheck)
	.map(r => message.guild.roles.cache.get(r))
	.filter(v => v != undefined);

	if (params.length == 0) {
		message.delete();
		embed = new Discord.MessageEmbed({
			title: "Assignable Roles",
			description: `*You can assign these roles by typing
		\`\`${config.prefix}assign <roleName> [optianlly tag a member to give the role to]\`\`*

		${assignRoles.map(r => `**${r.name}**`).join(", ")}`,
			color: "#7289DA"
		});

		message.channel
			.send(embed)
			.then(msg => (msg as Discord.Message).delete({ timeout: 10 * 1000 }));
		return;
	}

	let lastEl = params[(params.length - 1)];
	if (lastEl.startsWith('<@') && lastEl.endsWith('>')){
		params.pop();
	}

	let assignRole = assignRoles.filter(
		r => r.name.toLowerCase() == params.join(" ").toLowerCase()
	);

	if (assignRole.length == 0) {
		embed = new Discord.MessageEmbed({
			title: "Assign",
			description: `Role **${params.join(" ")}** does not exist.`,
			color: "#ff5050"
		});
		message.channel
			.send(embed)
			.then(msg => (msg as Discord.Message).delete({ timeout: 10 * 1000 }));
		return;
	}
	
	let asRole = assignRole[0];
	const mentioned = message.mentions.members.first();

	let userToAddRole = message.member;

	if (mentioned != undefined){
		if (message.member.hasPermission("ADMINISTRATOR") 
			|| (asRole.id == assignRolesFile.linuxMaintainer.linuxTest
			&& message.member.roles.cache.has(assignee.LinuxMaintainer))
			|| (asRole.id == assignRolesFile.staff.vacation
			&& message.member.roles.cache.has(assignee.staffHead))
		){
			userToAddRole = mentioned;
		} else {
			message.react("❌");
			let description = `You do not have permission to add the role to user **${mentioned.displayName}**.`;
			embed = new Discord.MessageEmbed({
				title: "Assign",
				description,
				color: "#ff5050"
			});
		
			message.channel.send(embed).then(msg => {
				message.delete({ timeout: 10 * 1000 });
				(msg as Discord.Message).delete({ timeout: 10 * 1000 });
			});
		}
	}

	let description: string, color: string;

	if (userToAddRole && userToAddRole.roles.cache.has(asRole.id)) {
		message.react("❌");
		description = userToAddRole == mentioned ?
		`User **${userToAddRole.displayName}** already has role **${asRole.name}**.` : `You already have the **${asRole.name}** role.`;
		color = "#ff5050"
		
	} else {
		if (userToAddRole)
		userToAddRole.roles.add(asRole.id);
		message.react("✅");
		description = userToAddRole == mentioned ?
		`Assigned **${asRole.name}** role to **${userToAddRole.displayName}**.` : `Assigned you **${asRole.name}** role.`;
		color = "#50ff50"
	}
	embed = new Discord.MessageEmbed({
		title: "Assign",
		description,
		color
	});
	message.channel.send(embed).then(msg => {
		message.delete({ timeout: 10 * 1000 });
		(msg as Discord.Message).delete({ timeout: 10 * 1000 });
	});
};

module.exports.config = {
	name: "assign",
	description: "Assign roles to yourself (or if you're a mod to someone else too)."
};
