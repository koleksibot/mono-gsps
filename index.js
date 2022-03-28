const axios = require('axios')
const express = require('express')
const dotenv = require('dotenv').config()
const Mono = require('./Mono');
const CurrencyCodes = require('./CurrencyCodes')
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { Telegraf } = require('telegraf')
const { processTransaction, initBot } = require('./processTransaction')
const fs = require('fs')

let { MONO_API_TOKEN, APP_MODE, ACCOUNT_ID, TELEGRAM_BOT_TOKEN, OWNER_TG_ID, GOOGLE_SERVICE_ACCOUNT_KEY, SHEET_ID, TG_WEBHOOK, MONO_WEBOOK, APP_DOMAIN } = dotenv.parsed || {};
const mono = new Mono(MONO_API_TOKEN)
let doc, tgbot;

// Fistly let's parse dotenv to get configuration and check it

async function init(callback) {
    if (dotenv.error) return console.log('❗️ Error while reading .env configuration');
    
    if (!APP_MODE)                      return console.error(`❗️ Missing APP_MODE in .env configuration. It must be 'statement_check' || 'webhook'`)
    if (!MONO_API_TOKEN)                return console.error(`❗️ Missing MONO_API_TOKEN in .env configuration. You can get it on https://api.monobank.ua/`)
    if (!TELEGRAM_BOT_TOKEN)            return console.error(`❗️ Missing TELEGRAM_BOT_TOKEN in .env configuration. You can get in conversation with https://t.me/BotFather`)
    if (!OWNER_TG_ID)                   return console.error(`❗️ Missing OWNER_TG_ID in .env configuration. It must contain your telegram id. You can get it from https://t.me/get_any_telegram_id_bot`)
    if (!GOOGLE_SERVICE_ACCOUNT_KEY)    return console.error(`❗️ Missing GOOGLE_SERVICE_ACCOUNT_KEY in .env configuration. It's a path to your service account JWT auth`)
    if (!SHEET_ID)                      return console.error(`❗️ Missing SHEET_ID in .env configuration. You can find it in a adress bar when open your sheet`)
    
    console.log('✅ .env configuraion is correct')
    
    // if (!await mono.validate()) return console.log('❗️ Mono token is invalid')

    console.log('✅ Monobank token is valid')

    // If we don't see a account in .env – console.log a list of accounts

    if (!ACCOUNT_ID) {
        const accounts  = await mono.getAccounts()
        const parsed_accounts = accounts.map(acc => 
            `${acc.type === 'black' ? 'Чорна картка' : ''}${acc.type === 'white' ? 'Бiла картка' : ''} (${CurrencyCodes[acc.currencyCode] || acc.currencyCode})\n` +
            `${acc.maskedPan[0]}\n` +
            `${acc.balance / 100}${CurrencyCodes[acc.currencyCode] || acc.currencyCode}\n` +
            `ACCOUNT_ID=${acc.id}`
        ).join('\n—————————————————————\n')
        return console.log(`✅ Now place one of the your monobank account ids to .env. Here is the list:\n${parsed_accounts}`);
    }

    // Cheking google auth... i'm bored...

    const token = await new Promise(resolve => {
        fs.readFile(__dirname + '/' + GOOGLE_SERVICE_ACCOUNT_KEY, 'utf8', async (err, data) => {
            if (err) resolve(console.log('❗️ Error while reading service account token.', err.message))
            try {
                resolve(JSON.parse(data))
            } catch(err) {
                resolve(console.error('❗️ Error while parsing service account token.', err.message))
            }
        })
    })
    if (!token) return token;
    console.log('✅ Service account token read successful')

    try {
        doc = new GoogleSpreadsheet(SHEET_ID);
        await doc.useServiceAccountAuth({
            client_email: token.client_email,
            private_key: token.private_key,
        });
    } catch (err) {
        return console.error('❗️ Service account auth creds are not valid', err.message);
    }

    console.log('✅ Service account auth successful')

    try { await doc.loadInfo() } catch (err) {
        return console.error(`❗️ Service account don't have access to spreadsheet`, err.message)
    }

    console.log(`✅ Service account have access to file`)

    // Check tg bot token
    tgbot = new Telegraf(TELEGRAM_BOT_TOKEN)
    try { await tgbot.telegram.sendMessage(OWNER_TG_ID, 'Bot is running...') } catch(err) {
        console.error(`❗️ Telegram bot token is not valid or you didn't /start your bot`, err.message)
    }

    console.log('✅ Telegram bot token is valid')

    console.log('🚀 Pojechali...')
    if (callback) callback();
    return true;
}

if (!init(main)) process.exit()


// Now run the main app logic

async function main() {

    // Statement check app mode runs a /personal/statement/ request and adds a new trasactions to the spreadsheet
    if (APP_MODE === 'statement_check') {
        initBot(tgbot, false)
        let prev_check;
        const performCheck = async () => {
            console.log('Started statement check')
            const statement_check = await mono.getStatement(ACCOUNT_ID, Date.now() - 1000 * 60 * 60 * 24)
            if (!prev_check || !Array.isArray(prev_check)) {
                console.log('First run, wait for next call in 60s')
                prev_check = statement_check
                return;
            }

            const newTransactions = statement_check.filter(transaction => {
                return !prev_check.find(prev_trans => prev_trans.id === transaction.id)
            })

            if (newTransactions.length <= 0) return console.log('No new transaction')

            console.log(`Processing ${newTransactions.length} new transaction(s)`)

            for (let t of newTransactions) {
                await processTransaction(t, tgbot, doc);
            }

            prev_check = statement_check

            console.log('Statement check ended successfully')
        }

        const loop = async () => {
            await performCheck()
            setTimeout(loop, 60000)
        }
        loop()
    }

    if (APP_MODE === 'webhook') {
        const app = express()
        const port = process.env.PORT || 8080
        const queue = [];
        let isCurrentlyWaiting = false;
        
        setInterval(async () => {
            if (queue.length > 0 && !isCurrentlyWaiting) {
                isCurrentlyWaiting = true
                await processTransaction(queue[0], tgbot, doc);
                queue.shift();
                isCurrentlyWaiting = false;
            }
        }, 100)
        

        app.use(express.json());
        app.use(tgbot.webhookCallback('/' + TG_WEBHOOK))

        app.post(`/${MONO_WEBOOK}`, async (req, res) => {
            res.send('Thx!')
            if (req.body.type === 'StatementItem' && req.body.data.account === ACCOUNT_ID) {
                queue.push(req.body.data.statementItem)
            }
        })

        app.get(`/`, (req, res) => res.send(`work1n'!`))

        const server = app.listen(port, async () => {
            const port = server.address().port;

            const webhook_res = await mono.setWebhook(APP_DOMAIN + '/' + MONO_WEBOOK)
            if (webhook_res.status !== 'ok') return console.error(`❗️ Monobank webhook setup problem`, webhook_res)
            console.log(`✅ Monobank webhook setup success`)

            // await tgbot.telegram.setWebhook(APP_DOMAIN + '/' + TG_WEBHOOK)
            initBot(tgbot, false)
          
            console.log(`Started server on port ${port}`);
        });
    }
}

