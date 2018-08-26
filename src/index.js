const { VK } = require("vk-io");
const LRU = require("lru");

if (!process.env.TOKEN) {
  console.log("No token has been provided");
  console.log(
    "Please proceed to https://oauth.vk.com/authorize?client_id=6243723&redirect_uri=https://oauth.vk.com/blank.html&scope=friends,photos,audio,video,status,messages,offline,docs&response_type=token&v=5.80"
  );
  console.log("Then set TOKEN env variable");
  process.exit(1);
}

const vk = new VK();
const walkthrough = new LRU({
  max: 256,
  maxAge: 24 * 60 * 60 * 1000
});
const locks = {};

const ZERO_WIDTH_SPACE = "​"; // U+200B Zero-Width Space

const STEP_DEACTIVATED_TEMPORARY = -1;
const STEP_STARTED = 0;
const STEP_GREETED = 1;
const STEP_REPEATED = 2;
const STEP_REPEATED_AGAIN = 3;
const STEP_REPEATED_THE_LAST_TIME = 4;

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
  console.log("11111");
  await context.sendPhoto("https://cataas.com/cat");
});

function m(text) {
  return "🔹" + ZERO_WIDTH_SPACE + text;
}

const catsPurring = [
  "http://ronsen.org/purrfectsounds/purrs/trip.mp3",
  "http://ronsen.org/purrfectsounds/purrs/maja.mp3",
  "http://ronsen.org/purrfectsounds/purrs/chicken.mp3"
];

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
      await Promise.all([
        context.send(
          m(
            "Привет! Я не сижу в VK. Если хочешь со мной связаться, найди меня в Telegram: https://t.me/maksimkurb"
          )
        ),
        context.sendPhoto("https://cataas.com/cat", {
          message: m("Ну а пока заходишь, держи кису, чтобы не скучать 😺")
        })
      ]);
      walkthrough.set(context.peerId, STEP_GREETED);
      break;
    case STEP_GREETED:
      const link = catsPurring[Math.floor(Math.random() * catsPurring.length)];
      await context.send(m("Секундочку..."));
      await context.sendVoice(link, {
        message: m("Мур 😽")
      });
      await context.send(
        m(
          "Если не хочешь Telegram, то напиши на почту: maksimkurb1+vk@gmail.com"
        )
      );
      walkthrough.set(context.peerId, STEP_REPEATED);
      break;
    case STEP_REPEATED:
      await context.send(m("Больше ничего не скажу тебе. Я просто бот."));
      walkthrough.set(context.peerId, STEP_REPEATED_AGAIN);
      break;
    case STEP_REPEATED_AGAIN:
      await context.sendPhoto(
        "https://memepedia.ru/wp-content/uploads/2018/08/dhlxrlww0aaqd7x.jpg",
        {
          message: m("Ti govorish po russki?")
        }
      );
      walkthrough.set(context.peerId, STEP_REPEATED_THE_LAST_TIME);
      break;
    case STEP_REPEATED_THE_LAST_TIME:
      await context.sendDocument(
        "https://media.tenor.com/images/17ab9054835c731cc7dd0e1e4f368a5b/tenor.gif",
        {
          message: m("Всё, пока, я на вечеринку ботов. Вернусь завтра.")
        }
      );
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
