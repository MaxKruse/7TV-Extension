import type { AnyToken, ChatMessage, ChatUser, EmoteToken, LinkToken, MentionToken } from "@/common/chat/ChatMessage";
import { Regex } from "@/site/twitch.tv";

const URL_PROTOCOL_REGEXP = /^https?:\/\//i;

export class Tokenizer {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	constructor(private msg: ChatMessage<any>) {}

	tokenize(opt: TokenizeOptions) {
		const tokens = [] as AnyToken[];

		const textParts = this.msg.body.split(" ");
		const getEmote = (name: string) => opt.localEmoteMap?.[name] ?? opt.emoteMap[name];

		let cursor = -1;
		let lastEmoteToken: EmoteToken | undefined = undefined;

		for (const part of textParts) {
			const next = cursor + (part.length + 1);

			// tokenize emote?
			const maybeEmote = getEmote(part);
			const maybeMention = !!opt.chatterMap[part.toLowerCase()];

			if (maybeEmote) {
				// handle zero width overlaying
				if ((maybeEmote.data?.flags ?? 0) & 256 && lastEmoteToken) {
					lastEmoteToken.content.overlaid[maybeEmote.name] = maybeEmote;

					// the "void" token is used to hide the text of the zero-width. any text in the void range won't be rendered
					tokens.push({
						kind: "VOID",
						range: [cursor + 1, next - 1],
						content: void 0,
					});
				} else {
					// regular emote
					tokens.push(
						(lastEmoteToken = {
							kind: "EMOTE",
							range: [cursor + 1, next - 1],
							content: {
								emote: maybeEmote,
								overlaid: {},
								...(maybeEmote.isTwitchCheer
									? {
											cheerAmount: maybeEmote.isTwitchCheer.amount,
											cheerColor: maybeEmote.isTwitchCheer.color,
									  }
									: {}),
							} as EmoteToken["content"],
						}),
					);
				}
			} else if (part.match(Regex.Link)) {
				// Check link
				const actualURL = part.replace(URL_PROTOCOL_REGEXP, "");

				tokens.push({
					kind: "LINK",
					range: [cursor + 1, next - 1],
					content: {
						displayText: part,
						url: "https://" + actualURL,
					},
				} as LinkToken);
			} else if (part.match(Regex.Mention) || maybeMention) {
				//  Check mention
				const commaAt = part.indexOf(",");
				const mentionEnd = commaAt > 0 ? commaAt : part.length;
				const username = (part.charAt(0) === "@" ? part.slice(1, mentionEnd) : part).toLowerCase();
				const user = opt.chatterMap[username];

				tokens.push({
					kind: "MENTION",
					range: [cursor + 1, cursor + mentionEnd],
					content: {
						displayText: part.slice(0, mentionEnd),
						recipient: username,
						user,
					} as MentionToken["content"],
				});

				this.msg.mentions.add(username);
			}

			cursor = next;
			if (!maybeEmote && !!part) lastEmoteToken = undefined;
		}

		tokens.sort((a, b) => a.range[0] - b.range[0]);

		return (this.msg.tokens = tokens);
	}
}

export interface TokenizeOptions {
	chatterMap: Record<string, ChatUser>;
	emoteMap: Record<string, SevenTV.ActiveEmote>;
	localEmoteMap?: Record<string, SevenTV.ActiveEmote>;
	filteredWords?: string[];
	actorUsername?: string;
}
