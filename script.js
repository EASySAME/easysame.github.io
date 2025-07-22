document.addEventListener('DOMContentLoaded', () => {
    const locationInput = document.getElementById('locationInput');
    const loadStationButton = document.getElementById('loadStationButton');
    const stationInfo = document.getElementById('stationInfo');
    const startListeningButton = document.getElementById('startListeningButton');
    const streamStatus = document.getElementById('streamStatus');
    const alertDisplay = document.getElementById('alertDisplay');
    const liveStreamAudio = document.getElementById('liveStreamAudio');

    const soundAdvisory = document.getElementById('soundAdvisory');
    const soundWarning = document.getElementById('soundWarning');
    const soundTest = document.getElementById('soundTest');
    const soundStatement = document.getElementById('soundStatement');

    let ws;
    let lastAlertTimestamp = 0;
    const ALERT_COOLDOWN_MS = 5000;

    function playAlertSound(sameCode) {
        if (!sameCode) return;

        [soundAdvisory, soundWarning, soundTest, soundStatement].forEach(sound => {
            sound.pause();
            sound.currentTime = 0;
        });

        switch (sameCode.toUpperCase()) {
            case 'A':
                soundAdvisory.play().catch(e => console.error("Error playing advisory sound:", e));
                break;
            case 'W':
                soundWarning.play().catch(e => console.error("Error playing warning sound:", e));
                break;
            case 'T':
                soundTest.play().catch(e => console.error("Error playing test sound:", e));
                break;
            case 'S':
                soundStatement.play().catch(e => console.error("Error playing statement sound:", e));
                break;
            default:
                console.log(`No specific sound for SAME code: ${sameCode}`);
                break;
        }
    }

    function displayAlert(alert) {
        const alertDiv = document.createElement('div');
        let typeClass = '';
        let sameCodeDisplay = '';

        if (alert.code) {
            switch (alert.code.toUpperCase()) {
                case 'A': typeClass = 'advisory'; sameCodeDisplay = 'Advisory (A)'; break;
                case 'W': typeClass = 'warning'; sameCodeDisplay = 'Warning (W)'; break;
                case 'T': typeClass = 'test'; sameCodeDisplay = 'Test (T)'; break;
                case 'S': typeClass = 'statement'; sameCodeDisplay = 'Statement (S)'; break;
                default: sameCodeDisplay = `Unknown Code (${alert.code})`;
            }
        } else {
            sameCodeDisplay = 'N/A';
        }

        alertDiv.className = `alert-item ${typeClass}`;
        alertDiv.innerHTML = `
            <h3>${alert.headline} <span style="font-size: 0.8em; color: #666;">(${alert.type || sameCodeDisplay})</span></h3>
            <p><strong>SAME Code:</strong> ${sameCodeDisplay}</p>
            <p><strong>Issued:</strong> ${new Date(alert.issued).toLocaleString()}</p>
            <p>${alert.description}</p>
        `;
        alertDisplay.prepend(alertDiv);
    }

    function connectWebSocket() {
        const KOYEB_BACKEND_URL = `wss://your-koyeb-service-url.koyeb.app`;

        if (ws && ws.readyState === WebSocket.OPEN) {
            console.log("WebSocket already connected.");
            return;
        }

        ws = new WebSocket(KOYEB_BACKEND_URL);

        ws.onopen = () => {
            console.log('Connected to Koyeb backend via WebSocket');
            streamStatus.textContent = 'Stream Status: Connected. Waiting for alerts...';
            alertDisplay.innerHTML = '<p>Connected to backend. Waiting for alerts...</p>';
            startListeningButton.textContent = 'Stop Listening';
        };

        ws.onmessage = event => {
            const data = JSON.parse(event.data);
            console.log('Received message from backend:', data);

            if (data.type === 'sameDetected') {
                if (Date.now() - lastAlertTimestamp > ALERT_COOLDOWN_MS) {
                    lastAlertTimestamp = Date.now();
                    displayAlert(data);
                    playAlertSound(data.code);
                }
            } else if (data.type === 'status') {
                streamStatus.textContent = `Stream Status: ${data.message}`;
            }
        };

        ws.onclose = () => {
            console.log('Disconnected from Koyeb backend. Attempting to reconnect in 5 seconds...');
            streamStatus.textContent = 'Stream Status: Disconnected. Reconnecting...';
            alertDisplay.innerHTML = '<p style="color: red;">Disconnected from backend. Attempting to reconnect...</p>';
            startListeningButton.textContent = 'Start Listening';
            startListeningButton.disabled = false;
            stationInfo.textContent = 'Station: Not Loaded';
        };

        ws.onerror = error => {
            console.error('WebSocket error:', error);
            streamStatus.textContent = 'Stream Status: Connection Error.';
            alertDisplay.innerHTML = '<p style="color: red;">Backend connection error. Check console.</p>';
            ws.close();
        };
    }

    loadStationButton.addEventListener('click', () => {
        const location = locationInput.value.trim();
        if (location) {
            stationInfo.textContent = `Station: ${location.toUpperCase()} (Backend stream is currently fixed.)`;
            startListeningButton.disabled = false;
        } else {
            stationInfo.textContent = 'Station: Please enter a Zip Code or Callsign.';
            startListeningButton.disabled = true;
        }
    });

    startListeningButton.addEventListener('click', () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close();
        } else {
            connectWebSocket();
        }
        startListeningButton.disabled = true;
    });

    stationInfo.textContent = 'Station: Not Loaded';
    streamStatus.textContent = 'Stream Status: Not started';
    startListeningButton.disabled = true;
    alertDisplay.innerHTML = '<p>Load a station to begin checking for alerts.</p>';
});
