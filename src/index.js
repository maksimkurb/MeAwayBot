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

vk.setOptions({
  token: process.env.TOKEN,
  apiMode: "parallel_selected",
  webhookPath: process.env.WEBHOOK_PUBLIC_PATH || process.env.WEBHOOK_PATH
});
const { updates } = vk;

updates.use(async (context, next) => {
  if (!context.is("message")) return;
  if (context.isChat) return;

  if (context.isOutbox) {
    if (context.hasText && context.text.indexOf(ZERO_WIDTH_SPACE) === -1) {
      walkthrough.set(context.peerId, STEP_DEACTIVATED_TEMPORARY);
    }
    return;
  }
  if (locks[context.peerId]) return;
  locks[context.peerId] = true;

  try {
    await next();
  } catch (error) {
    console.error("Error:", error);
  }
});

function m(text) {
  return ZERO_WIDTH_SPACE + text;
}

const catsPurring = [
  "http://ronsen.org/purrfectsounds/purrs/trip.mp3",
  "http://ronsen.org/purrfectsounds/purrs/maja.mp3",
  "http://ronsen.org/purrfectsounds/purrs/chicken.mp3"
];

updates.use(async (context, next) => {
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
      await context.sendVoice(link, {
        message: m("Ну ладно, послушай меня😽")
      });
      await context.send(
        m(
          "Если не хочешь Telegram, то напиши на почту: maksimkurb1+vk@gmail.com"
        )
      );
      walkthrough.set(context.peerId, STEP_REPEATED);
      break;
    case STEP_REPEATED:
      await context.send(
        m(
          "Так нравится разговаривать с ботом? Тебе здесь серьёзно не ответят, нет."
        )
      );
      walkthrough.set(context.peerId, STEP_DEACTIVATED_TEMPORARY);
      break;
  }
  next();
});

updates.use(async context => {
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
