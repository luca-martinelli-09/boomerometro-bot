import { PrismaClient } from "@prisma/client";
import express, { Request, Response } from "express";
import TelegramBot, { CallbackQuery, InlineKeyboardButton, Message } from "node-telegram-bot-api";
import _ from "lodash";
import md5 from "md5";

const prisma = new PrismaClient();

const TOKEN = process.env.TELEGRAM_TOKEN || "";
const URL = process.env.BASE_URL || "http://localhost";

const bot = new TelegramBot(TOKEN);

const app = express();

bot.setWebHook(`${URL}/bot${TOKEN}`);

app.use(express.json());

app.post(`/bot${TOKEN}`, (req: Request, res: Response) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get("/", (req: Request, res: Response) => {
  res.send("Hi!");
});

app.listen(3000, () => {
  console.log("Started!");
});

// UTILS FUNCTIONS

function isGroup(msg: Message) {
  return msg.chat.type === "group" || msg.chat.type === "supergroup";
}

function sendNeedGroup(msg: Message) {
  bot.sendMessage(msg.chat.id, "Per usare questo bot devi essere in un gruppo!");
}

function boomerizeString(text: string) {
  return _.kebabCase(text.toLowerCase()).replaceAll("-", "");
}

// BOT

bot.onText(/\/start/, async (msg: Message) => {
  const numLuoghiComuni = (
    await prisma.group.aggregate({
      _sum: {
        BoomerCounter: true,
      },
    })
  )._sum.BoomerCounter;

  const numGruppi = await prisma.group.count();

  bot.sendMessage(
    msg.chat.id,
    `Aggiungi questo bot a un gruppo per contare i luoghi comuni da boomer (contati per ora ${numLuoghiComuni} luoghi comuni in ${numGruppi} gruppi). Creato da @LucaMartinelli09`
  );
});

bot.on("message", async (msg: Message) => {
  if (!isGroup(msg)) return;

  const group = { GroupID: msg.chat.id, GroupName: msg.chat.title, GroupLink: msg.chat.invite_link };
  const updatedGroup = await prisma.group.upsert({
    where: {
      GroupID: group.GroupID,
    },
    create: { ...group },
    update: { ...group },
  });

  if (!msg.text) return;

  const idTrigger = boomerizeString(msg.text);

  const boomerTriggers = await prisma.boomerTrigger.count({
    where: {
      BoomerTrigger: idTrigger,
      OR: [{ GroupID: -1 }, { GroupID: msg.chat.id }],
    },
  });

  if (boomerTriggers <= 0) return;

  try {
    const currentGroup = await prisma.group.update({
      where: {
        GroupID: msg.chat.id,
      },
      data: {
        BoomerCounter: { increment: 1 },
      },
    });

    await bot.sendMessage(msg.chat.id, `Il boomerometro ha contato ${currentGroup.BoomerCounter} luoghi comuni in questo gruppo`, {
      reply_to_message_id: msg.message_id,
    });
    if (currentGroup.BoomerCounter === 69) bot.sendMessage(msg.chat.id, "Nice 😏");
  } catch (error) {
    bot.sendMessage(msg.chat.id, "Ops, si è verificato un errore :(");
  }
});

bot.onText(/\/aggiungilg/, async (msg: Message) => {
  if (!isGroup(msg)) return sendNeedGroup(msg);

  const textToAdd = msg.reply_to_message?.text?.toLowerCase();

  if (!textToAdd) {
    bot.sendMessage(msg.chat.id, "Rispondi alla frase da aggiungere con il comando /aggiungilg");
    return;
  }

  const idToAdd = boomerizeString(textToAdd);

  try {
    const trigger = { BoomerTrigger: idToAdd, GroupID: msg.chat.id, Frase: textToAdd };
    await prisma.boomerTrigger.upsert({
      where: {
        BoomerTrigger_GroupID: {
          BoomerTrigger: trigger.BoomerTrigger,
          GroupID: trigger.GroupID,
        },
      },
      create: { ...trigger },
      update: { ...trigger },
    });

    bot.sendMessage(msg.chat.id, "Aggiunto all'elenco!", {
      reply_to_message_id: msg.reply_to_message?.message_id,
    });
  } catch (error) {
    console.log(error);
    bot.sendMessage(msg.chat.id, "Ops, si è verificato un errore :(", {
      reply_to_message_id: msg.reply_to_message?.message_id,
    });
  }
});

bot.onText(/\/contalg/, async (msg: Message) => {
  if (!isGroup(msg)) return sendNeedGroup(msg);

  const boomerCounter = (
    await prisma.group.findFirst({
      where: {
        GroupID: msg.chat.id,
      },
    })
  )?.BoomerCounter;

  if (!boomerCounter) return;

  await bot.sendMessage(msg.chat.id, `Il boomerometro ha contato ${boomerCounter} luoghi comuni in questo gruppo`, {
    reply_to_message_id: msg.message_id,
  });
  if (boomerCounter === 69) bot.sendMessage(msg.chat.id, "Nice 😏");
});

bot.onText(/\/rimuovilg/, async (msg: Message) => {
  if (!isGroup(msg)) return sendNeedGroup(msg);

  const triggers = await prisma.boomerTrigger.findMany({
    where: {
      GroupID: msg.chat.id,
    },
  });

  if (triggers.length <= 0) return bot.sendMessage(msg.chat.id, "Non ci sono frasi personalizzate per questo gruppo, puoi aggiungerle usando il comando /aggiungilg");

  bot.sendMessage(msg.chat.id, "Ecco i luoghi comuni che puoi rimuovere", {
    reply_markup: {
      inline_keyboard: [...triggers.map((trigger) => [{ text: trigger.Frase, callback_data: "/removelg " + md5(trigger.BoomerTrigger) } as InlineKeyboardButton])],
    },
  });
});

bot.on("callback_query", async (query: CallbackQuery) => {
  if (!query.message) return;
  const msg = query.message;
  if (!isGroup(msg)) return sendNeedGroup(msg);

  const data = query.data;
  if (!data) return;
  if (!data.startsWith("/removelg ")) return;

  const toRemove = data.substring(10);

  try {
    await prisma.$executeRaw`DELETE FROM BoomerTriggers WHERE MD5(BoomerTrigger) = ${toRemove} AND GroupID = ${msg.chat.id}`;
    bot.sendMessage(msg.chat.id, "Frase rimossa dall'elenco del tuo gruppo");
  } catch (error) {
    console.log(error);
    bot.sendMessage(msg.chat.id, "Ops, si è verificato un errore :(");
  }
});

bot.onText(/\/cringeometro/, async (msg: Message) => {
  if (!isGroup(msg)) return sendNeedGroup(msg);
  if (!msg.text) return;

  let incrementCount = 5;
  let message = msg.text.toLowerCase().replace("/cringeometro", "").replace("@boomerometro_bot", "").trim();
  try {
    incrementCount = message.length > 0 ? parseInt(message) : incrementCount;
  } catch (error) {}

  try {
    const currentGroup = await prisma.group.update({
      where: {
        GroupID: msg.chat.id,
      },
      data: {
        CringeCounter: { increment: incrementCount },
      },
    });

    await bot.sendMessage(msg.chat.id, `Il cringeometro segna ${currentGroup.CringeCounter} punti!`, {
      reply_to_message_id: msg.message_id,
    });
  } catch (error) {
    console.log(error);
    bot.sendMessage(msg.chat.id, "Ops, si è verificato un errore :(");
  }
});
