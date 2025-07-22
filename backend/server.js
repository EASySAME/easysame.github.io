const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, '..')));

const PORT = process.env.PORT || 3000;

const NWS_API_BASE_URL = 'https://api.weather.gov/alerts/active';
const POLLING_INTERVAL_MS = 30 * 1000;

let currentPollingLocation = { lat: null, lon: null };
let pollingIntervalId = null;

let activeAlerts = new Map();

async function fetchNWSAlerts() {
    if (!currentPollingLocation.lat || !currentPollingLocation.lon) {
        console.log("Polling suspended: No valid location set yet.");
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'status', message: 'Waiting for location from client...' }));
            }
        });
        return;
    }

    console.log(`Polling NWS API for alerts at ${currentPollingLocation.lat},${currentPollingLocation.lon}...`);
    const apiUrl = `${NWS_API_BASE_URL}?point=${currentPollingLocation.lat},${currentPollingLocation.lon}`;

    try {
        const response = await axios.get(apiUrl, {
            headers: {
                'User-Agent': 'EASySAME-API-Pull/finalver (graisonparkhurst1@gmail.com)'
            }
        });

        const newAlerts = new Map();
        let alertsFoundInCurrentPoll = false;

        response.data.features.forEach(feature => {
            const alert = feature.properties;
            const alertId = alert.id;
            newAlerts.set(alertId, alert);
            alertsFoundInCurrentPoll = true;

            if (!activeAlerts.has(alertId)) {
                console.log(`NEW ALERT DETECTED: ${alert.event} - ${alert.areaDesc}`);
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'newAlert', alert: alert }));
                    }
                });
            } else {
                const oldAlert = activeAlerts.get(alertId);
                if (alert.updated !== oldAlert.updated) {
                    console.log(`ALERT UPDATED: ${alert.event} - ${alert.areaDesc}`);
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({ type: 'alertUpdate', alert: alert }));
                        }
                    });
                }
            }
        });

        activeAlerts.forEach((oldAlert, oldAlertId) => {
            if (!newAlerts.has(oldAlertId)) {
                console.log(`ALERT CANCELLED: ${oldAlert.event} - ${oldAlert.areaDesc}`);
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'alertCancelled', alert: oldAlert }));
                    }
                });
            }
        });

        activeAlerts = newAlerts;

        if (!alertsFoundInCurrentPoll) {
            console.log("No active alerts for the configured location.");
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'noAlerts' }));
                }
            });
        }

    } catch (error) {
        console.error(`Error fetching NWS alerts: ${error.message}`);
        if (error.response) {
            console.error(`NWS API Response Error: Status ${error.response.status}, Data:`, error.response.data);
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'status', message: `Error fetching alerts (${error.response.status}).` }));
                }
            });
        } else {
             wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'status', message: `Network error fetching alerts.` }));
                }
            });
        }
    }
}

wss.on('connection', ws => {
    console.log('Client connected via WebSocket');

    if (currentPollingLocation.lat && currentPollingLocation.lon && pollingIntervalId) {
        ws.send(JSON.stringify({ type: 'status', message: `Monitoring alerts for ${currentPollingLocation.lat}, ${currentPollingLocation.lon}.` }));
        activeAlerts.forEach(alert => {
            ws.send(JSON.stringify({ type: 'newAlert', alert: alert }));
        });
    } else {
        ws.send(JSON.stringify({ type: 'status', message: 'Waiting for location from client...' }));
    }

    ws.on('message', message => {
        const data = JSON.parse(message.toString());
        if (data.type === 'setLocation') {
            const { lat, lon } = data;
            console.log(`Received location from client: ${lat}, ${lon}`);

            currentPollingLocation = { lat, lon };

            if (!pollingIntervalId) {
                pollingIntervalId = setInterval(fetchNWSAlerts, POLLING_INTERVAL_MS);
                console.log(`NWS API polling started. Checking every ${POLLING_INTERVAL_MS / 1000} seconds.`);
            }

            fetchNWSAlerts();

            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'status', message: `Monitoring alerts for your location (${lat}, ${lon}).` }));
                }
            });
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected from WebSocket');
    });

    ws.on('error', error => {
        console.error('WebSocket error:', error);
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Access your app via the Koyeb URL.`);
    console.log(`Waiting for client to provide location...`);
});

process.on('SIGINT', () => {
    console.log('Stopping polling and server...');
    if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
    }
    server.close(() => {
        console.log('Server gracefully shut down.');
        process.exit(0);
    });
});
