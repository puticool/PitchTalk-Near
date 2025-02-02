const fs = require('fs');
const path = require('path');
const axios = require('axios');
const colors = require('colors');
const readline = require('readline');
const { DateTime } = require('luxon');
const { HttpsProxyAgent } = require('https-proxy-agent');
const printLogo = require('./src/logo');
const headers = require("./src/header");
const log = require('./src/logger');

class Pitchtalk {
    constructor() {
        this.baseHeaders = headers;
        this.log = log;
        this.skippedTaskIds = [
            'aec632eb-7104-4652-938b-bc8d61f83c77',
            'c51fbe56-b913-470d-9bac-6cacc9e4864f'
        ];
        this.proxies = this.loadProxies();
    }

    async countdown(seconds) {
        for (let i = seconds; i >= 0; i--) {
            readline.cursorTo(process.stdout, 0);
            process.stdout.write(`===== Wait ${i} seconds to continue looping =====`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log('');
    }

    async checkProxyIP(proxy) {
        try {
            const proxyAgent = new HttpsProxyAgent(proxy);
            const response = await axios.get('https://api.ipify.org?format=json', { httpsAgent: proxyAgent });
            if (response.status === 200) {
                return response.data.ip;
            } else {
                throw new Error(`Unable to check the proxy's IP. Status code: ${response.status}`);
            }
        } catch (error) {
            throw new Error(`Error while checking proxy IP: ${error.message}`);
        }
    }

    loadProxies() {
        const proxyFile = path.join(__dirname, 'proxy.txt');
        return fs.readFileSync(proxyFile, 'utf8')
            .replace(/\r/g, '')
            .split('\n')
            .filter(Boolean);
    }
    async makeRequest(method, url, data = null, token = null, proxyIndex, hash) {
        const config = {
            method,
            url,
            headers: {
                ...this.baseHeaders,
                "X-Telegram-Hash": hash
            },
            httpsAgent: new HttpsProxyAgent(this.proxies[proxyIndex])
        };

        if (token) {
            config.headers["Authorization"] = `Bearer ${token}`;
        }

        if (data) {
            config.data = data;
        }

        try {
            const response = await axios(config);
            return response;
        } catch (error) {
            this.log(`Request error: ${error.message}`, 'error');
            return null;
        }
    }

    async auth(hash, proxyIndex) {
        const url = "https://api.pitchtalk.app/v1/api/auth";
        const telegramId = hash.match(/id%22%3A(\d+)/)[1];
        const username = hash.match(/username%22%3A%22([^%]+)/)[1];

        const payload = {
            telegramId,
            username,
            hash,
            referralCode: "4ae55d",
            photoUrl: ""
        };

        try {
            const response = await this.makeRequest('post', url, payload, null, proxyIndex, hash);
            if (response) {
                const { coins, tickets, loginStreak, farmingId } = response.data.user;
                return { accessToken: response.data.accessToken, username, coins, tickets, loginStreak, farmingId };
            } else {
                throw new Error(`Auth failed with status ${response ? response.status : 'unknown'}`);
            }
        } catch (error) {
            this.log(`Auth error: ${error.message}`, 'error');
            return null;
        }
    }

    async createFarming(token, proxyIndex, hash) {
        const url = "https://api.pitchtalk.app/v1/api/users/create-farming";

        try {
            const response = await this.makeRequest('get', url, null, token, proxyIndex, hash);
            if (response) {
                const { farmingId, farming } = response.data;
                const endTime = DateTime.fromISO(farming.endTime);
                this.log(`Farming started with id: ${farmingId} 🚜`, 'success');
                this.log(`Completion time: ${endTime.toLocaleString(DateTime.DATETIME_FULL)}`, 'info');
                return farming;
            } else {
                throw new Error(`Failed to create farming with status ${response ? response.status : 'unknown'}`);
            }
        } catch (error) {
            this.log(`Error creating farming: ${error.message}`, 'error');
            return null;
        }
    }

    async getFarming(token, proxyIndex, hash) {
        const url = "https://api.pitchtalk.app/v1/api/farmings";

        try {
            const response = await this.makeRequest('get', url, null, token, proxyIndex, hash);
            if (response && response.status === 200) {
                const farming = response.data;
                const now = DateTime.now();
                const endTime = DateTime.fromISO(farming.endTime);

                if (now < endTime) {
                    this.log(`Farming in progress with id: ${farming.id} 🚜`, 'success');
                    this.log(`Completion time: ${endTime.toLocaleString(DateTime.DATETIME_FULL)}`, 'info');
                } else {
                    this.log(`Farming with ID ${farming.id} has completed`, 'success');
                    await this.claimFarming(token, proxyIndex, hash);
                }
                return farming;
            } else {
                throw new Error(`Failed to get farming with status ${response ? response.status : 'unknown'}`);
            }
        } catch (error) {
            this.log(`Error getting farming: ${error.message}`, 'error');
            return null;
        }
    }

    async claimFarming(token, proxyIndex, hash) {
        const url = "https://api.pitchtalk.app/v1/api/users/claim-farming";

        try {
            const response = await this.makeRequest('get', url, null, token, proxyIndex, hash);
            if (response) {
                this.log('Successfully claimed farming rewards 🎁!', 'success');
                return response.data;
            } else {
                throw new Error(`Failed to claim farming with status ${response ? response.status : 'unknown'}`);
            }
        } catch (error) {
            this.log(`Error claiming farming: ${error.message}`, 'error');
            return null;
        }
    }

    async getTasks(token, proxyIndex, hash) {
        const url = "https://api.pitchtalk.app/v1/api/tasks";

        try {
            const response = await this.makeRequest('get', url, null, token, proxyIndex, hash);
            if (response && response.status === 200) {
                return response.data;
            } else {
                throw new Error(`Failed to get tasks with status ${response ? response.status : 'unknown'}`);
            }
        } catch (error) {
            this.log(`Error getting tasks: ${error.message}`, 'error');
            return null;
        }
    }

    async startTask(token, taskId, proxyIndex, hash) {
        const url = `https://api.pitchtalk.app/v1/api/tasks/${taskId}/start`;

        try {
            const response = await this.makeRequest('post', url, {}, token, proxyIndex, hash);
            if (response) {
                return response.data;
            } else {
                throw new Error(`Failed to start task with status ${response ? response.status : 'unknown'}`);
            }
        } catch (error) {
            this.log(`Error starting task: ${error.message}`, 'error');
            return null;
        }
    }

    async verifyTasks(token, proxyIndex, hash) {
        const url = "https://api.pitchtalk.app/v1/api/tasks/verify";

        try {
            const response = await this.makeRequest('get', url, null, token, proxyIndex, hash);
            if (response && response.status === 200) {
                return response.data;
            } else {
                throw new Error(`Failed to verify tasks with status ${response ? response.status : 'unknown'}`);
            }
        } catch (error) {
            this.log(`Error verifying tasks: ${error.message}`, 'error');
            return null;
        }
    }

    async main() {
        const dataFile = path.join(__dirname, 'data.txt');
        const data = fs.readFileSync(dataFile, 'utf8')
            .replace(/\r/g, '')
            .split('\n')
            .filter(Boolean);

        while (true) {
            printLogo();
            for (let i = 0; i < data.length; i++) {
                const hash = data[i];
                const proxy = this.proxies[i];
                let proxyIP = "Unknown";

                try {
                    proxyIP = await this.checkProxyIP(proxy);
                } catch (error) {
                    this.log(`Error checking proxy IP: ${error.message}`, 'warning');
                    continue;
                }

                const authResult = await this.auth(hash, i);

                if (authResult) {
                    const { accessToken, username, coins, tickets, loginStreak, farmingId } = authResult;
                    this.log(`🎮 | Account: ${i + 1} | Username: ${username} | 🌐 IP: ${proxyIP} | 🎮`, 'custom');
                    this.log(`💰: ${coins}, 🎟️: ${tickets}, 🔥: ${loginStreak}`, 'info');

                    if (farmingId === null) {
                        await this.createFarming(accessToken, i, hash);
                    } else {
                        await this.getFarming(accessToken, i, hash);

                    }
                }
            }
            await this.countdown(21600);
        }
    }
}

const client = new Pitchtalk();
client.main().catch(err => {
    client.log(err.message, 'error');
    process.exit(1);
});
