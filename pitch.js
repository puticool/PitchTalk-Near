const fs = require('fs');
const path = require('path');
const axios = require('axios');
const colors = require('colors');
const readline = require('readline');
const { DateTime } = require('luxon');
const printLogo = require('./src/logo');

class Pitchtalk {
    constructor() {
        this.headers = {
            "Accept": "application/json, text/plain, */*",
            "Accept-Encoding": "gzip, deflate, br",
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

    // Countdown function with dynamic message
    async countdown(seconds) {
        for (let i = seconds; i >= 0; i--) {
            readline.cursorTo(process.stdout, 0);
            process.stdout.write(`===== Wait ${i} seconds to continue looping =====`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log('');
    }

    // Function to authenticate the user based on a hash
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
            const response = await axios.post(url, payload, { headers: this.headers });
            if (response.status === 201) {
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

    // Function to create farming
    async createFarming(token) {
        const url = "https://api.pitchtalk.app/v1/api/users/create-farming";
        const headers = { ...this.headers, "Authorization": `Bearer ${token}` };

        try {
            const response = await axios.post(url, {}, { headers });
            if (response.status === 201) {
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

    // Get farming status and handle the process
    async getFarming(token) {
        const url = "https://api.pitchtalk.app/v1/api/farmings";
        const headers = { ...this.headers, "Authorization": `Bearer ${token}` };

        try {
            const response = await axios.get(url, { headers });
            if (response.status === 200) {
                const farming = response.data;
                const now = DateTime.now();
                const endTime = DateTime.fromISO(farming.endTime);
                
                if (now < endTime) {
                    this.log(`Currently farming with ID: ${farming.id} 🚜`, 'success');
                    this.log(`Completion time: ${endTime.toLocaleString(DateTime.DATETIME_FULL)}`, 'info');
                } else {
                    await this.claimFarming(token);
                    const newFarming = await this.createFarming(token);
                    if (newFarming) {
                        const newEndTime = DateTime.fromISO(newFarming.endTime);
                        this.log(`Started new farming with ID: ${newFarming.id} 🚜`, 'success');
                        this.log(`New completion time: ${newEndTime.toLocaleString(DateTime.DATETIME_FULL)}`, 'info');
                    }
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

    // Claim farming rewards
    async claimFarming(token) {
        const url = "https://api.pitchtalk.app/v1/api/users/claim-farming";
        const headers = { ...this.headers, "Authorization": `Bearer ${token}` };

        try {
            const response = await axios.post(url, {}, { headers });
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

    // Get available tasks
    async getTasks(token) {
        const url = "https://api.pitchtalk.app/v1/api/tasks";
        const headers = { ...this.headers, "Authorization": `Bearer ${token}` };

        try {
            const response = await axios.get(url, { headers });
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

    // Start a specific task
    async startTask(token, taskId) {
        const url = `https://api.pitchtalk.app/v1/api/tasks/${taskId}/start`;
        const headers = { ...this.headers, "Authorization": `Bearer ${token}` };

        try {
            const response = await axios.post(url, {}, { headers });
            if (response.status === 201) {
                return response.data;
            } else {
                throw new Error(`Failed to start task. Status: ${response.status}`);
            }
        } catch (error) {
            this.log(`Error starting task: ${error.message}`, 'error');
            return null;
        }
    }

    // Verify and claim rewards for completed tasks
    async verifyTasks(token) {
        const url = "https://api.pitchtalk.app/v1/api/tasks/verify";
        const headers = { ...this.headers, "Authorization": `Bearer ${token}` };

        try {
            const response = await axios.get(url, { headers });
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

    // Main function to manage the logic
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
                        await this.createFarming(accessToken);
                    } else {
                        await this.getFarming(accessToken);
                    }

                    const tasks = await this.getTasks(accessToken);
                    if (tasks) {
                        for (const task of tasks) {
                            if (task.status === 'INITIAL' && !this.skippedTaskIds.includes(task.id)) {
                                const startResult = await this.startTask(accessToken, task.id);
                                if (startResult) {
                                    this.log(`Started task: ${task.template.title} ✅`, 'success');
                                }
                            }
                        }

                        const verifyResult = await this.verifyTasks(accessToken);
                        if (verifyResult) {
                            for (const task of verifyResult) {
                                if (task.status === 'COMPLETED_CLAIMED') {
                                    const completedTask = tasks.find(t => t.id === task.id);
                                    if (completedTask) {
                                        this.log(`Successfully completed task ${completedTask.template.title} | Reward: 💰 ${completedTask.template.rewardCoins}`, 'success');
                                    }
                                }
                            }
                        }
                    }
                }
            }
            await this.countdown(21600); // Wait for 6 hours before looping again
        }
    }
}

const client = new Pitchtalk();
client.main().catch(err => {
    client.log(err.message, 'error');
    process.exit(1);
});