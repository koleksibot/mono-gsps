const { OWNER_TG_ID } = require('dotenv').config().parsed
const { Telegraf } = require('telegraf')
const Markup = require('telegraf/markup')
const CurrencyCodes = require('./CurrencyCodes')

const answerNoTransaction = ctx => ctx.reply('No transaction waiting answer')

let onTgText = answerNoTransaction;

async function parseTransactionReply(transaction, ctx, doc) {
    const {amount, balance, time, description: originalDescription } = transaction
    const mark = ctx.message.text[0];
    const description = ctx.message.text.slice(2) || originalDescription
    if (mark === '0') return ctx.reply('OK')
    await doc.loadInfo(); 

    const sheet = doc.sheetsByIndex[0]; 
    await sheet.setHeaderRow(["Mark", "Description", "Amount", "Remaning", "Date", "Original description"])
    await sheet.addRow([mark, description, amount / 100, balance / 100, new Date(time * 1000).toLocaleString('RU'), originalDescription])

    ctx.reply('Added')
}

async function processTransaction(transaction, tgbot, doc) {

    // Send onwer a message
    const text = `💸 ${transaction.description}\n` + 
        `${transaction.operationAmount / 100}${CurrencyCodes[transaction.currencyCode] || transaction.currencyCode}\n` + 
        `Remaining: ${transaction.balance / 100}${CurrencyCodes[transaction.currencyCode] || transaction.currencyCode}\n\n` +
        `Please mark a transaction: \n1 - Useful, 2 - Forced, 3 - Bad, 0 - Don't add to spreadsheet`
    await tgbot.telegram.sendMessage(OWNER_TG_ID, text)

    await new Promise(resolve => {
        onTgText = async ctx => {
            await parseTransactionReply(transaction, ctx, doc)
            resolve()
        }
    })

    onTgText = answerNoTransaction;

    return console.log('successfully processed transaction')
}

function initBot(tgbot, isWebhook) {

    tgbot.start(ctx => {
        ctx.reply('Hi my boss!')
    })

    tgbot.on('text', ctx => {
        onTgText(ctx);
    })
    
    // tgbot.use(ctx => {
    //     if (parseInt(ctx.chat.id) !== parseInt(OWNER_TG_ID)) return ctx.reply('Get off! This bot works for my boss only. You are not my boss!')
    //     return ctx;
    // })

    console.log(`✅ TG Bot started`)
    if (!isWebhook) {
        tgbot.launch()
    }
}

module.exports = {processTransaction, initBot};