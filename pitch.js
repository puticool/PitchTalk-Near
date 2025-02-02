const fs = require('fs');
const path = require('path');
const axios = require('axios');
const colors = require('colors');
const readline = require('readline');
const { DateTime } = require('luxon');
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
    }

    async countdown(seconds) {
        for (let i = seconds; i >= 0; i--) {
            readline.cursorTo(process.stdout, 0);
            process.stdout.write(`===== Wait ${i} seconds to continue looping =====`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log('');
    }

    getHeaders(hash, token = null) {
        const headers = {
            ...this.baseHeaders,
            "X-Telegram-Hash": hash
        };

        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        return headers;
    }

    async auth(hash) {
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
            const response = await axios.post(url, payload, { headers: this.getHeaders(hash) });
            if (response) {
                const { coins, tickets, loginStreak, farmingId } = response.data.user;
                return { accessToken: response.data.accessToken, username, coins, tickets, loginStreak, farmingId };
            } else {
                throw new Error(`Authentication failed with status ${response.status}`);
            }
        } catch (error) {
            this.log(`Authentication error: ${error.message}`, 'error');
            return null;
        }
    }

    async createFarming(token, hash) {
        const url = "https://api.pitchtalk.app/v1/api/users/create-farming";

        try {
            const response = await axios.get(url, { headers: this.getHeaders(hash, token) });
            if (response) {
                const { farmingId, farming } = response.data;
                const endTime = DateTime.fromISO(farming.endTime);
                this.log(`Started farming with ID: ${farmingId} 🚜`, 'success');
                this.log(`Completion time: ${endTime.toLocaleString(DateTime.DATETIME_FULL)}`, 'info');
                return farming;
            } else {
                throw new Error(`Failed to start farming. Status: ${response.status}`);
            }
        } catch (error) {
            this.log(`Error starting farming: ${error.message}`, 'error');
            return null;
        }
    }

    async getFarming(token, hash) {
        const url = "https://api.pitchtalk.app/v1/api/farmings";

        try {
            const response = await axios.get(url, { headers: this.getHeaders(hash, token) });
            if (response.status === 200) {
                const farming = response.data;
                const now = DateTime.now();
                const endTime = DateTime.fromISO(farming.endTime);

                if (now < endTime) {
                    this.log(`Currently farming with ID: ${farming.id} 🚜`, 'success');
                    this.log(`Completion time: ${endTime.toLocaleString(DateTime.DATETIME_FULL)}`, 'info');
                } else {
                    this.log(`Farming with ID ${farming.id} has completed`, 'success');
                    await this.claimFarming(token, hash);
                }
                return farming;
            } else {
                throw new Error(`Failed to retrieve farming status. Status: ${response.status}`);
            }
        } catch (error) {
            this.log(`Error retrieving farming status: ${error.message}`, 'error');
            return null;
        }
    }

    async claimFarming(token, hash) {
        const url = "https://api.pitchtalk.app/v1/api/users/claim-farming";

        try {
            const response = await axios.get(url, null, { headers: this.getHeaders(hash, token) });
            if (response) {
                this.log('Successfully claimed farming rewards 🎁', 'success');
                return response.data;
            } else {
                throw new Error(`Failed to claim farming rewards. Status: ${response.status}`);
            }
        } catch (error) {
            this.log(`Error claiming farming rewards: ${error.message}`, 'error');
            return null;
        }
    }

    async getTasks(token, hash) {
        const url = "https://api.pitchtalk.app/v1/api/tasks";

        try {
            const response = await axios.get(url, { headers: this.getHeaders(hash, token) });
            if (response.status === 200) {
                return response.data;
            } else {
                throw new Error(`Failed to retrieve tasks. Status: ${response.status}`);
            }
        } catch (error) {
            this.log(`Error retrieving tasks: ${error.message}`, 'error');
            return null;
        }
    }

    async startTask(token, hash, taskId) {
        const url = `https://api.pitchtalk.app/v1/api/tasks/${taskId}/start`;

        try {
            const response = await axios.post(url, {}, { headers: this.getHeaders(hash, token) });
            if (response) {
                return response.data;
            } else {
                throw new Error(`Failed to start task. Status: ${response.status}`);
            }
        } catch (error) {
            this.log(`Error starting task: ${error.message}`, 'error');
            return null;
        }
    }

    async verifyTasks(token, hash) {
        const url = "https://api.pitchtalk.app/v1/api/tasks/verify";

        try {
            const response = await axios.get(url, { headers: this.getHeaders(hash, token) });
            if (response.status === 200) {
                return response.data;
            } else {
                throw new Error(`Failed to verify tasks. Status: ${response.status}`);
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
                const authResult = await this.auth(hash);

                if (authResult) {
                    const { accessToken, username, coins, tickets, loginStreak, farmingId } = authResult;
                    this.log(`🎮 | Account ${i + 1} | Username: ${username} | 🎮`, 'custom');
                    this.log(`💰 Coins: ${coins}, 🎟️ Tickets: ${tickets}, 🔥 Login Streak: ${loginStreak}`, 'info');

                    if (farmingId === null) {
                        await this.createFarming(accessToken, hash);
                    } else {
                        await this.getFarming(accessToken, hash);

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
