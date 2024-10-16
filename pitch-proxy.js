const fs = require('fs');
const path = require('path');
const axios = require('axios');
const colors = require('colors');
const readline = require('readline');
const { DateTime } = require('luxon');
const { HttpsProxyAgent } = require('https-proxy-agent');
const printLogo = require('./src/logo');

class Pitchtalk {
    constructor() {
        this.headers = {
            "Accept": "application/json, text/plain, */*",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "en-US,en;q=0.9",
            "Content-Type": "application/json",
            "Origin": "https://webapp.pitchtalk.app",
            "Referer": "https://webapp.pitchtalk.app/",
            "Sec-Ch-Ua": '"Microsoft Edge";v="129", "Not=A?Brand";v="8", "Chromium";v="129", "Microsoft Edge WebView2";v="129"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-site",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0"
        };
        this.skippedTaskIds = [
            'aec632eb-7104-4652-938b-bc8d61f83c77',
            'c51fbe56-b913-470d-9bac-6cacc9e4864f'
        ];
        this.proxies = this.loadProxies();
    }

    loadProxies() {
        const proxyFile = path.join(__dirname, 'proxy.txt');
        return fs.readFileSync(proxyFile, 'utf8')
            .replace(/\r/g, '')
            .split('\n')
            .filter(Boolean);
    }

    log(msg, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        switch(type) {
            case 'success':
                console.log(`[${timestamp}] [*] ${msg}`.green);
                break;
            case 'custom':
                console.log(`[${timestamp}] [*] ${msg}`.magenta);
                break;        
            case 'error':
                console.log(`[${timestamp}] [!] ${msg}`.red);
                break;
            case 'warning':
                console.log(`[${timestamp}] [*] ${msg}`.yellow);
                break;
            default:
                console.log(`[${timestamp}] [*] ${msg}`.blue);
        }
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

    async makeRequest(method, url, data = null, token = null, proxyIndex) {
        const config = {
            method,
            url,
            headers: { ...this.headers },
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
            const response = await this.makeRequest('post', url, payload, null, proxyIndex);
            if (response && response.status === 201) {
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

    async createFarming(token, proxyIndex) {
        const url = "https://api.pitchtalk.app/v1/api/users/create-farming";

        try {
            const response = await this.makeRequest('post', url, {}, token, proxyIndex);
            if (response && response.status === 201) {
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

    async getFarming(token, proxyIndex) {
        const url = "https://api.pitchtalk.app/v1/api/farmings";

        try {
            const response = await this.makeRequest('get', url, null, token, proxyIndex);
            if (response && response.status === 200) {
                const farming = response.data;
                const now = DateTime.now();
                const endTime = DateTime.fromISO(farming.endTime);
                
                if (now < endTime) {
                    this.log(`Farming in progress with id: ${farming.id} 🚜`, 'success');
                    this.log(`Completion time: ${endTime.toLocaleString(DateTime.DATETIME_FULL)}`, 'info');
                } else {
                    await this.claimFarming(token, proxyIndex);
                    const newFarming = await this.createFarming(token, proxyIndex);
                    if (newFarming) {
                        const newEndTime = DateTime.fromISO(newFarming.endTime);
                        this.log(`Started new farming with id: ${newFarming.id} 🚜`, 'success');
                        this.log(`New completion time: ${newEndTime.toLocaleString(DateTime.DATETIME_FULL)}`, 'info');
                    }
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

    async claimFarming(token, proxyIndex) {
        const url = "https://api.pitchtalk.app/v1/api/users/claim-farming";

        try {
            const response = await this.makeRequest('post', url, {}, token, proxyIndex);
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

    async getTasks(token, proxyIndex) {
        const url = "https://api.pitchtalk.app/v1/api/tasks";

        try {
            const response = await this.makeRequest('get', url, null, token, proxyIndex);
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

    async startTask(token, taskId, proxyIndex) {
        const url = `https://api.pitchtalk.app/v1/api/tasks/${taskId}/start`;

        try {
            const response = await this.makeRequest('post', url, {}, token, proxyIndex);
            if (response && response.status === 201) {
                return response.data;
            } else {
                throw new Error(`Failed to start task with status ${response ? response.status : 'unknown'}`);
            }
        } catch (error) {
            this.log(`Error starting task: ${error.message}`, 'error');
            return null;
        }
    }

    async verifyTasks(token, proxyIndex) {
        const url = "https://api.pitchtalk.app/v1/api/tasks/verify";

        try {
            const response = await this.makeRequest('get', url, null, token, proxyIndex);
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
                        await this.createFarming(accessToken, i);
                    } else {
                        await this.getFarming(accessToken, i);
                    }

                    const tasks = await this.getTasks(accessToken, i);
                    if (tasks) {
                        for (const task of tasks) {
                            if (task.status === 'INITIAL' && !this.skippedTaskIds.includes(task.id)) {
                                const startResult = await this.startTask(accessToken, task.id, i);
                                if (startResult) {
                                    this.log(`Started task: ${task.template.title} ✅`, 'success');
                                }
                            }
                        }

                        const verifyResult = await this.verifyTasks(accessToken, i);
                        if (verifyResult) {
                            for (const task of verifyResult) {
                                if (task.status === 'COMPLETED_CLAIMED') {
                                    const completedTask = tasks.find(t => t.id === task.id);
                                    if (completedTask) {
                                        this.log(`Successfully completed task ${completedTask.template.title} | reward: 💰 ${completedTask.template.rewardCoins}`, 'success');
                                    }
                                }
                            }
                        }
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
