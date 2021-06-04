import * as Discord from "discord.js";
import { Storage } from "../util/storage";
import { Service } from "../services";
import { Config } from "../util/config";
import { ChannelBase } from "./base";
import logger from "../util/logger";

interface DiscordChannelConfig {
  config: Config["channel"]["discord"];
  storage: Storage;
  service: Service;
}

export class DiscordChannel extends ChannelBase {
  private client: Discord.Client;
  private service: Service;
  private config: Config["channel"]["discord"];

  constructor(config: DiscordChannelConfig) {
    super("discord", config.storage);

    this.config = config.config;
    this.service = config.service;
    this.client = new Discord.Client();

    this.sendSuccessMessage = this.sendSuccessMessage.bind(this);
  }

  async start() {
    logger.info(`discord started`);
    await this.client.login(this.config.token);

    this.service.registMessageHander(this.channelName, this.sendSuccessMessage);
    logger.info(`discord message handler registered for ${this.channelName}`);
    this.client.on("message", (msg) => {
      this.messageHandler(msg);
    });
  }

  sendSuccessMessage(
    channelInfo: Record<string, string>,
    amount: string,
    tx: string
  ) {
    const channel = (this.client.channels.cache.get(
      channelInfo.channelId
    ) as any) as Discord.TextChannel;

    channel.send(
      this.service.getMessage("success", {
        amount,
        tx,
        account: channelInfo.accountName,
      })
    );
  }

  async messageHandler(msg: Discord.Message) {
    const channelName = (msg.channel as any).name;
    const account = msg.author.id;
    const name = msg.author.username;

    if (!msg.content) return;

    const [command, param1] = this.getCommand(msg.content);

    logger.info(command);

    if (channelName !== this.config.activeChannelName && ["!balance", "!drip", "!faucet"].includes(command)) {
      if (msg.member) {
        const guildChannels = msg.member.guild.channels.cache;
        for (const [_, channel] of guildChannels) {
          if (channel.name === this.config.activeChannelName && channel.type === "text") {
            const textChannel = channel as Discord.TextChannel;
            textChannel.send(`${msg.author.toString()} you can try using the \`${command}\` command here!`)
            
            break;
          }
        }
      }
    } else if (channelName === this.config.activeChannelName) {
      if (command === "!faucet") {
        msg.reply(this.service.usage());
      }

      if (command === "!balance") {
        const balances = await this.service.queryBalance();
        msg.channel.send(
          this.service.getMessage("balance", {
            balance: balances
              .map((item) => `${item.token}: ${item.balance}`)
              .join(", "),
          })
        );
      }

      if (command === "!drip") {
        const address = param1;

        try {
          await this.service.faucet({
            strategy: "normal",
            address: address,
            channel: {
              channelId: msg.channel.id,
              name: this.channelName,
              account: account,
              accountName: name,
            },
          });
        } catch (e) {
          msg.channel.send(
            e.message
              ? e.message
              : this.service.getErrorMessage("COMMON_ERROR", { account })
          );
        }
      }
    }
  }
}
