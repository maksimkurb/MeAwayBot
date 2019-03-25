const { VK } = require("vk-io");
const LRU = require("lru");
const fetch = require("node-fetch");

if (!process.env.TOKEN) {
  console.log("No token has been provided");
  console.log(
    "Please proceed to https://oauth.vk.com/authorize?client_id=2685278&redirect_uri=https://oauth.vk.com/blank.html&scope=friends,photos,audio,video,status,messages,offline,docs&response_type=token&v=5.80"
  );
  console.log("Then set TOKEN env variable");
  process.exit(1);
}

const vk = new VK();
const HOURS = 48;
const walkthrough = new LRU({
  max: 256,
  maxAge: HOURS * 60 * 60 * 1000
});
const locks = {};

const ZERO_WIDTH_SPACE = "​"; // U+200B Zero-Width Space

const STEP_DEACTIVATED_TEMPORARY = -1;
const STEP_STARTED = 0;
const STEP_GREETED = 1;
const STEP_REPEATED = 2;
const STEP_REPEATED_AGAIN = 3;

const msgDeactivated = m(`Автоответчик отключён на ${HOURS}ч.`);

vk.setOptions({
  token: process.env.TOKEN,
  apiMode: "parallel_selected",
  webhookPath: process.env.WEBHOOK_PUBLIC_PATH || process.env.WEBHOOK_PATH
});
const { updates } = vk;

updates.use(async (context, next) => {
  try {
    await next();
  } catch (error) {
    console.error("Error:", error);
  }
});

updates.hear("/cat", async context => {
  try {
    await context.sendPhoto("https://cataas.com/cat");
  } catch (e) {
    context.send(m("Не удалось кису отправить, ошибка какая-то"));
  }
});

updates.hear("/dog", async context => {
  const resp = await fetch("https://dog.ceo/api/breeds/image/random").then(r =>
    r.json()
  );
  try {
    await context.sendPhoto(resp["message"]);
  } catch (e) {
    context.send(m("Не удалось пёсика отправить, ошибка какая-то"));
  }
});

updates.hear("/off", async context => {
  walkthrough.set(context.peerId, STEP_DEACTIVATED_TEMPORARY);
  if (!context.isOutbox) {
    await context.send(msgDeactivated);
    return;
  }
  await vk.api.messages.edit({
    peer_id: context.peerId,
    message: context.text + " [" + msgDeactivated + "]",
    message_id: context.id
  });
});

function m(text) {
  return "🔹" + ZERO_WIDTH_SPACE + text;
}

updates.setHearFallbackHandler(async context => {
  if (!context.is("message")) return;
  if (context.isChat) return;

  if (context.isOutbox) {
    if (!context.hasText || context.text.indexOf(ZERO_WIDTH_SPACE) === -1) {
      walkthrough.set(context.peerId, STEP_DEACTIVATED_TEMPORARY);
    }
    return;
  }
  if (locks[context.peerId]) return;
  locks[context.peerId] = true;

  let stage = walkthrough.peek(context.peerId);
  if (!stage) {
    stage = STEP_STARTED;
  }
  switch (stage) {
    case STEP_STARTED:
      await context.send(
        m(
          "Привет! Я не сижу в VK. Если хочешь со мной связаться, найди меня в Telegram: https://t.me/maksimkurb"
        )
      );
      walkthrough.set(context.peerId, STEP_GREETED);
      break;
    case STEP_GREETED:
      await context.send(
        m("Если нет Telegram, то можно написать на почту: max@cubly.ru")
      );
      try {
        await context.sendPhoto("https://cataas.com/cat", {
          message: m(
            "Кстати, а ведь все любят кошек. Я тоже их люблю. Держи котеечку. Если захочешь ещё - введи /cat"
          )
        });
      } catch (err) {
        console.error(err);
        await context.send(
          m(
            `Хотел кису скинуть, но произошла какая-то ошибка (${
              err.name
            }). Попробуй ввести /cat попозже`
          )
        );
      }
      walkthrough.set(context.peerId, STEP_REPEATED);
      break;
    case STEP_REPEATED:
      await context.send(m("Собачку хочешь? Введи /dog"));
      walkthrough.set(context.peerId, STEP_REPEATED_AGAIN);
      break;
    case STEP_REPEATED_AGAIN:
      await context.send(m("Контактов больше не дам."));
      walkthrough.set(context.peerId, STEP_DEACTIVATED_TEMPORARY);
      break;
  }
  delete locks[context.peerId];
});

async function run() {
  if (process.env.UPDATES === "webhook") {
    await vk.updates.startWebhook({
      port: process.env.WEBHOOK_PORT || 80,
      path: process.env.WEBHOOK_PATH || "/webhook",
      host: process.env.WEBHOOK_HOST || null
    });

    console.log("Webhook server started");
  } else {
    await vk.updates.startPolling();

    console.log("Polling started");
  }
}

run().catch(console.error);
