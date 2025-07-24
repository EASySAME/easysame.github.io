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

    const SERVERLESS_API_URL = 'https://easysame-backend.vercel.app/api/get-alerts'; // IMPORTANT: CHANGE THIS!

    const POLLING_INTERVAL = 60 * 1000;
    let pollingIntervalId;
    let userLocation = null;

    systemStatus.textContent = 'Waiting for location permission...';
    requestLocation();

    function requestLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                position => {
                    userLocation = {
                        lat: position.coords.latitude,
                        lon: position.coords.longitude
                    };
                    systemStatus.textContent = `${userLocation.lat.toFixed(4)}, ${userLocation.lon.toFixed(4)}`;
                    startPollingAlerts();
                },
                error => {
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
        }
    }

    function startPollingAlerts() {
        if (!userLocation) {
            requestLocation();
            return;
        }

        fetchAlerts();
        pollingIntervalId = setInterval(fetchAlerts, POLLING_INTERVAL);
        systemStatus.textContent = `Polling for alerts... Last update: ${new Date().toLocaleTimeString()}`;
    }

    async function fetchAlerts() {
        if (!userLocation) {
            requestLocation();
            return;
        }

        try {
            systemStatus.textContent = `Fetching alerts... Last update: ${new Date().toLocaleTimeString()}`;
            const response = await fetch(`${SERVERLESS_API_URL}?lat=${userLocation.lat}&lon=${userLocation.lon}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.error}`);
            }
            const data = await response.json();

            processFetchedAlerts(data.alerts);
            systemStatus.textContent = `Polling for alerts. Last update: ${new Date().toLocaleTimeString()}`;

        } catch (error) {
            systemStatus.textContent = `Error fetching alerts. Last attempt: ${new Date().toLocaleTimeString()}`;
        }
    }

    function processFetchedAlerts(newAlerts) {
        const newAlertIds = new Set(newAlerts.map(alert => alert.id));
        const alertsToAnnounce = [];

        newAlerts.forEach(newAlert => {
            const existingAlert = currentAlerts.get(newAlert.id);

            if (!existingAlert) {
                alertsToAnnounce.push(newAlert);
                handleNewAlert(newAlert);
            } else {
                if (existingAlert.headline !== newAlert.headline ||
                    existingAlert.description !== newAlert.description ||
                    existingAlert.expires !== newAlert.expires ||
                    existingAlert.status !== newAlert.status) {
                    
                    alertsToAnnounce.push(newAlert);
                    handleUpdateAlert(newAlert);
                }
            }
        });

        currentAlerts.forEach((alertElement, alertId) => {
            if (!newAlertIds.has(alertId)) {
                handleCancelledAlert({ id: alertId, event: alertElement.querySelector('h3').textContent.replace(' (CANCELLED)', '') });
            }
        });

        if (alertsToAnnounce.length === 0 && currentAlerts.size === 0) {
            noAlertsMessage.style.display = 'block';
        } else {
            noAlertsMessage.style.display = 'none';
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
