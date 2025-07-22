document.addEventListener('DOMContentLoaded', () => {
    const systemStatus = document.getElementById('systemStatus');
    const alertDisplay = document.getElementById('alertDisplay');
    const noAlertsMessage = document.getElementById('noAlertsMessage');

    const warningAudio = document.getElementById('warningAudio');
    const advisoryAudio = document.getElementById('advisoryAudio');
    const testAudio = document.getElementById('testAudio');
    const statementAudio = document.getElementById('statementAudio');

    const audioMap = {
        'warning': warningAudio,
        'watch': advisoryAudio,
        'advisory': advisoryAudio,
        'statement': statementAudio,
        'test': testAudio,
        'other': advisoryAudio
    };

    const currentAlerts = new Map();

    const ws = new WebSocket(`ws://${window.location.host}`);

    ws.onopen = () => {
        console.log('Connected to WebSocket server');
        systemStatus.textContent = 'Waiting for location permission...';
        requestLocation();
    };

    ws.onmessage = event => {
        const data = JSON.parse(event.data);
        console.log('Received from server:', data);

        if (data.type === 'status') {
            systemStatus.textContent = data.message;
        } else if (data.type === 'newAlert') {
            const alert = data.alert;
            handleNewAlert(alert);
        } else if (data.type === 'alertUpdate') {
            const alert = data.alert;
            handleUpdateAlert(alert);
        } else if (data.type === 'alertCancelled') {
            const alert = data.alert;
            handleCancelledAlert(alert);
        } else if (data.type === 'noAlerts') {
            if (currentAlerts.size === 0) {
                 noAlertsMessage.style.display = 'block';
            }
        }
    };

    ws.onclose = () => {
        console.log('Disconnected from WebSocket server');
        systemStatus.textContent = 'Disconnected. Attempting to reconnect...';
    };

    ws.onerror = error => {
        console.error('WebSocket error:', error);
        systemStatus.textContent = 'WebSocket error. Check server.';
    };

    function requestLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                position => {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    console.log(`Location obtained: Lat ${lat}, Lon ${lon}`);
                    systemStatus.textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
                    ws.send(JSON.stringify({ type: 'setLocation', lat: lat, lon: lon }));
                },
                error => {
                    console.error('Geolocation error:', error);
                    let errorMessage = "An unknown error occurred while trying to get your location.";
                    if (error.code === error.PERMISSION_DENIED) {
                        errorMessage = "Permission Denied! Please allow location access.";
                    } else if (error.code === error.POSITION_UNAVAILABLE) {
                        errorMessage = "Location Unavailable. Check device settings.";
                    } else if (error.code === error.TIMEOUT) {
                        errorMessage = "Location request timed out.";
                    }
                    systemStatus.textContent = errorMessage;
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 60000
                }
            );
        } else {
            systemStatus.textContent = "Geolocation not supported by your browser.";
            console.error("Geolocation not supported by this browser.");
        }
    }

    function playSoundForAlertType(eventType) {
        let soundToPlay = null;
        const normalizedEvent = eventType.toUpperCase();

        if (normalizedEvent.includes('TORNADO WARNING') || normalizedEvent.includes('SEVERE THUNDERSTORM WARNING') || normalizedEvent.includes('FLASH FLOOD WARNING') || normalizedEvent.includes('HURRICANE WARNING') || normalizedEvent.includes('TSUNAMI WARNING') || normalizedEvent.includes('EXTREME WIND WARNING')) {
            soundToPlay = audioMap['warning'];
        }
        else if (normalizedEvent.includes('TORNADO WATCH') || normalizedEvent.includes('SEVERE THUNDERSTORM WATCH') || normalizedEvent.includes('FLASH FLOOD WATCH') || normalizedEvent.includes('HURRICANE WATCH') || normalizedEvent.includes('TSUNAMI WATCH')) {
            soundToPlay = audioMap['watch'];
        }
        else if (normalizedEvent.includes('TEST') || normalizedEvent.includes('REQUIRED WEEKLY') || normalizedEvent.includes('REQUIRED MONTHLY') || normalizedEvent.includes('EXERCISE')) {
            soundToPlay = audioMap['test'];
        }
        else if (normalizedEvent.includes('ADVISORY') || normalizedEvent.includes('STATEMENT') || normalizedEvent.includes('WINTER STORM WATCH') || normalizedEvent.includes('WINTER STORM WARNING')) {
            soundToPlay = audioMap['advisory'];
        }
        else {
            soundToPlay = audioMap['other'];
        }

        if (soundToPlay) {
            soundToPlay.pause();
            soundToPlay.currentTime = 0;
            soundToPlay.play().catch(error => {
                console.warn("Audio playback prevented, likely by browser autoplay policy:", error);
            });
        }
    }

    function speakAlert(alert) {
        if ('speechSynthesis' in window) {
            const eventType = alert.event || 'weather alert';
            const areaDesc = alert.areaDesc || 'your area';
            const headline = alert.headline || alert.description.split('\n')[0] || 'no specific details provided.';

            const utteranceText = `Attention. New ${eventType} for ${areaDesc}. The National Weather Service reports: ${headline}.`;

            const utterance = new SpeechSynthesisUtterance(utteranceText);
            utterance.lang = 'en-US';

            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(utterance);
        } else {
            console.warn('Text-to-Speech not supported in this browser.');
        }
    }

    function createAlertElement(alert) {
        const alertDiv = document.createElement('div');
        alertDiv.classList.add('alert-item', getSeverityClass(alert.severity));
        alertDiv.id = `alert-${alert.id}`;

        const header = document.createElement('h3');
        header.textContent = alert.event;
        alertDiv.appendChild(header);

        const area = document.createElement('p');
        area.classList.add('alert-area');
        area.textContent = `Area: ${alert.areaDesc}`;
        alertDiv.appendChild(area);

        const headline = document.createElement('p');
        headline.classList.add('alert-headline');
        headline.textContent = alert.headline || alert.description.split('\n')[0];
        alertDiv.appendChild(headline);

        // NEW: Mini box for "Issued By"
        const issuerBox = document.createElement('div');
        issuerBox.classList.add('alert-issuer-box');
        issuerBox.innerHTML = `<strong>Issued By:</strong> ${alert.senderName || 'N/A'}`;
        alertDiv.appendChild(issuerBox);

        const descriptionToggle = document.createElement('button');
        descriptionToggle.textContent = 'Show Details';
        descriptionToggle.classList.add('alert-toggle');
        alertDiv.appendChild(descriptionToggle);

        const description = document.createElement('p');
        description.classList.add('alert-description', 'hidden');
        description.textContent = alert.description;
        alertDiv.appendChild(description);

        descriptionToggle.onclick = () => {
            description.classList.toggle('hidden');
            descriptionToggle.textContent = description.classList.contains('hidden') ? 'Show Details' : 'Hide Details';
        };

        const issued = document.createElement('p');
        issued.classList.add('alert-meta');
        issued.textContent = `Issued: ${new Date(alert.effective).toLocaleString()}`;
        alertDiv.appendChild(issued);

        const expires = document.createElement('p');
        expires.classList.add('alert-meta');
        expires.textContent = `Expires: ${new Date(alert.expires).toLocaleString()}`;
        alertDiv.appendChild(expires);

        return alertDiv;
    }

    function handleNewAlert(alert) {
        if (currentAlerts.has(alert.id)) {
            handleUpdateAlert(alert);
            return;
        }
        noAlertsMessage.style.display = 'none';
        const alertElement = createAlertElement(alert);
        alertDisplay.prepend(alertElement);
        currentAlerts.set(alert.id, alertElement);
        playSoundForAlertType(alert.event);
        speakAlert(alert);
    }

    function handleUpdateAlert(alert) {
        const existingElement = currentAlerts.get(alert.id);
        if (existingElement) {
            existingElement.remove();
            const updatedElement = createAlertElement(alert);
            alertDisplay.prepend(updatedElement);
            currentAlerts.set(alert.id, updatedElement);
            console.log(`Updated alert: ${alert.event}`);
            playSoundForAlertType(alert.event);
            speakAlert(alert);
        } else {
            handleNewAlert(alert);
        }
    }

    function handleCancelledAlert(alert) {
        const existingElement = currentAlerts.get(alert.id);
        if (existingElement) {
            existingElement.classList.add('cancelled');
            existingElement.querySelector('h3').textContent += " (CANCELLED)";
            setTimeout(() => {
                existingElement.remove();
                currentAlerts.delete(alert.id);
                if (currentAlerts.size === 0) {
                    noAlertsMessage.style.display = 'block';
                }
            }, 10000);
            console.log(`Cancelled alert: ${alert.event}`);
        }
    }

    function getSeverityClass(severity) {
        switch (severity.toLowerCase()) {
            case 'extreme': return 'severity-extreme';
            case 'severe': return 'severity-severe';
            case 'moderate': return 'severity-moderate';
            case 'minor': return 'severity-minor';
            default: return 'severity-unknown';
        }
    }

    if (currentAlerts.size === 0) {
        noAlertsMessage.style.display = 'block';
    }
});
