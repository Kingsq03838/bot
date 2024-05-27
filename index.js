const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const mongoURI = process.env.MONGODB_URI;
const token = process.env.TELEGRAM_BOT_TOKEN;
const requiredChannel1 = process.env.REQUIRED_CHANNEL_ID_1;
const requiredChannel2 = process.env.REQUIRED_CHANNEL_ID_2;
const requiredChannelUrl1 = process.env.REQUIRED_CHANNEL_URL_1;
const requiredChannelUrl2 = process.env.REQUIRED_CHANNEL_URL_2;
const adminIds = process.env.ADMIN_IDS.split(',').map(id => parseInt(id));
const logGroupId = parseInt(process.env.LOG_GROUP_ID, 10);

// Connect to MongoDB
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Error connecting to MongoDB:', err));

// Define schema and model for storing media
const mediaSchema = new mongoose.Schema({
  mediaType: String,
  fileId: String,
  uniqueId: String,
  userId: Number,
  caption: String,
  messageId: Number, // Message ID in the log group
});

const Media = mongoose.model('Media', mediaSchema);

const bot = new TelegramBot(token, { polling: true });

const checkUserMembership = async (userId) => {
  try {
    const chatMember1 = await bot.getChatMember(requiredChannel1, userId);
    const chatMember2 = await bot.getChatMember(requiredChannel2, userId);
    return (chatMember1.status === 'member' || chatMember1.status === 'administrator' || chatMember1.status === 'creator') &&
           (chatMember2.status === 'member' || chatMember2.status === 'administrator' || chatMember2.status === 'creator');
  } catch (error) {
    console.error('Error checking user membership:', error);
    return false;
  }
};

const storeMedia = async (msg, fileId, mediaType, caption = '') => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (adminIds.includes(userId)) {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    // Log the media message in the log group
    let logMessage;
    switch (mediaType) {
      case 'photo':
        logMessage = await bot.sendPhoto(logGroupId, fileId, { caption });
        break;
      case 'video':
        logMessage = await bot.sendVideo(logGroupId, fileId, { caption });
        break;
      case 'document':
        logMessage = await bot.sendDocument(logGroupId, fileId, { caption });
        break;
      case 'voice':
        logMessage = await bot.sendVoice(logGroupId, fileId, { caption });
        break;
      case 'sticker':
        logMessage = await bot.sendSticker(logGroupId, fileId);
        break;
    }

    const media = new Media({
      mediaType,
      fileId,
      uniqueId,
      userId,
      caption,
      messageId: logMessage.message_id, // Store message ID
    });

    try {
      await media.save();

      const deepLink = `http://t.me/${bot.options.username}?start=${uniqueId}`;
      bot.sendMessage(chatId, `${mediaType} stored! Access it via: ${deepLink}`);
    } catch (error) {
      console.error('Error storing media:', error);
      bot.sendMessage(chatId, `An error occurred while storing the ${mediaType}. Please try again later.`);
    }
  } else {
    bot.sendMessage(chatId, 'You are not authorized to store media.');
  }
};

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (msg.sticker) {
    storeMedia(msg, msg.sticker.file_id, 'sticker');
  } else if (msg.photo) {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    const caption = msg.caption || '';
    storeMedia(msg, fileId, 'photo', caption);
  } else if (msg.video) {
    const fileId = msg.video.file_id;
    const caption = msg.caption || '';
    storeMedia(msg, fileId, 'video', caption);
  } else if (msg.document) {
    storeMedia(msg, msg.document.file_id, 'document');
  } else if (msg.voice) {
    storeMedia(msg, msg.voice.file_id, 'voice');
  }
});

bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const startParam = match[1] ? match[1].trim() : null;

  const isMember = await checkUserMembership(userId);

  if (!isMember) {
    const options = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Join Channel 1', url: requiredChannelUrl1 }],
          [{ text: 'Join Channel 2', url: requiredChannelUrl2 }],
        ],
      },
    };

    if (startParam) {
      options.reply_markup.inline_keyboard.push([{ text: 'Try Again', url: `http://t.me/ShareNoobbot?start=${startParam}` }]);
    }

    bot.sendMessage(chatId, 'You need to join our channels to use this bot. Please join both channels below, then try again:', options);
    return;
  }

  if (startParam) {
    try {
      const media = await Media.findOne({ uniqueId: startParam });

      if (media) {
        await bot.forwardMessage(chatId, logGroupId, media.messageId);
      } else {
        bot.sendMessage(chatId, 'Media not found.');
      }
    } catch (error) {
      console.error('Error retrieving media:', error);
      bot.sendMessage(chatId, 'An error occurred. Please try again.');
    }
  } else {
    bot.sendMessage(chatId, `Hello Master ${msg.from.username}\n\nI am a file store bot Powered by OWNER ⚡`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Close', callback_data: 'close' }],
        ],
      },
    });
  }
});

bot.on('callback_query', (callbackQuery) => {
  const msg = callbackQuery.message;
  if (callbackQuery.data === 'close') {
    bot.deleteMessage(msg.chat.id, msg.message_id);
  }
});

app.get('/', (req, res) => {
  res.send('Server is running');
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});
