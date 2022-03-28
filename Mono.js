const axios = require('axios')
class Mono {

    token = null;

    constructor(token) {
        if (!token) throw new Error('No mono token');

        this.axios_instance = axios.create({
            baseURL: 'https://api.monobank.ua/',          
            headers: {
                'X-Token': token
            }
        });
    }

    async api(adress) {
        try {
            return await this.axios_instance(adress)
        } catch(err) {
            if (err.response && err.response.status === 429) {
                console.log('too many reqests will try again in 90s')
                return setTimeout(() => this.api(adress), 90000)
            }
            if (err.response) {
                console.log(err.response.status, err.response.data)
            }
        }
    }

    async post(adress, body) {
        try {
            return await this.axios_instance.post(adress, body)
        } catch(err) {
            if (err.response && err.response.status === 429) {
                console.log('too many reqests will try again in 90s')
                return setTimeout(() => this.post(adress, body), 90000)
            }
            if (err.response) {
                console.log(err.response.status, err.response.data)
            }
        }
    }

    /**
     * Validates monobank token
     * 
     * @returns { boolean } Result of validation
     */
    async validate() {
        let response;

        try {
            response = await this.api('/personal/client-info')
        } catch(err) {
            return false;
        }

        if (response.data.clientId) {
            return true
        } else {
            return false;
        }
    }

    /**
     * Get list of accounts
     * 
     * @returns { Array } List of account objects
     */
    async getAccounts() {
        const response = await this.api('/personal/client-info')
        if (!response.data.accounts) return null;
        return response.data.accounts;
    }

     /**
     * Get statement
     * 
     * @returns { Array } Statement
     * @param { string } account Account id
     * @param { number } from Time from
     * @param { number } to Time to
     */
    async getStatement(account, from, to) {
        const response = await this.api(`/personal/statement/${account}/${from}${to ? `/${to}` : ''}`)
        return response.data
    }

    /**
     * Set Webhook adress
     * 
     * @param { string } url
     */
    async setWebhook(url) {
        console.log('mono webhook set as ' + url)
        const response = await this.post(`/personal/webhook`, {
            "webHookUrl": url
        })
        return response.data
    }
}

module.exports = Mono