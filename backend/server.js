const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, '..')));

const PORT = process.env.PORT || 3000;

let multimonProcess = null;
let ffmpegProcess = null;

function startDSP() {
    console.log("Attempting to start DSP (multimon-ng and ffmpeg)...");

    if (ffmpegProcess) {
        ffmpegProcess.kill();
        ffmpegProcess = null;
    }
    if (multimonProcess) {
        multimonProcess.kill();
        multimonProcess = null;
    }

    try {
        const NOAA_STREAM_URL = 'http://your-noaa-audio-stream-url.mp3';

        if (!NOAA_STREAM_URL || NOAA_STREAM_URL === 'http://your-noaa-audio-stream-url.mp3') {
            console.error("ERROR: NOAA_STREAM_URL is not configured. DSP cannot start without an audio source.");
            console.error("Please replace 'http://your-noaa-audio-stream-url.mp3' in backend/server.js with a real audio stream URL.");
            return;
        }

        console.log(`Attempting to stream audio from: ${NOAA_STREAM_URL}`);

        ffmpegProcess = spawn('ffmpeg', [
            '-i', NOAA_STREAM_URL,
            '-f', 's16le',
            '-ac', '1',
            '-ar', '22050',
            'pipe:1'
        ], { stdio: ['pipe', 'pipe', 'pipe'] });

        ffmpegProcess.stderr.on('data', (data) => {
            console.error(`FFmpeg stderr: ${data.toString()}`);
        });

        ffmpegProcess.on('close', (code) => {
            console.log(`FFmpeg process exited with code ${code}`);
            ffmpegProcess = null;
            console.error('FFmpeg stream stopped. DSP will no longer receive audio. Check stream URL or network.');
        });

        ffmpegProcess.on('error', (err) => {
            console.error('Failed to start FFmpeg process:', err);
            console.error('DSP will not receive audio. Ensure ffmpeg is installed and stream URL is valid.');
        });

        multimonProcess = spawn('multimon-ng', ['-a', 'EAS', '-t', 'raw', '/dev/stdin'], { stdio: ['pipe', 'pipe', 'pipe'] });

        ffmpegProcess.stdout.pipe(multimonProcess.stdin);
        console.log("FFmpeg output piped to multimon-ng stdin.");

        multimonProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(`multimon-ng output: ${output}`);

            const sameRegex = /ZCZC-EAS-([A-Z0-9]+)-([A-Z]{3})-([0-9]{6})\+([0-9]{4})-([A-Z0-9]{8,15})-([A-Z0-9]{3,5})-(.*?)-/i;
            const match = output.match(sameRegex);

            if (match) {
                const [
                    fullMatch,
                    originator,
                    eventType,
                    fipsCode,
                    timeIssued,
                    duration,
                    sender,
                    callsign,
                    ...rest
                ] = match;

                const alertData = {
                    type: 'sameDetected',
                    code: eventType.toUpperCase(),
                    headline: `SAME Alert: ${eventType.toUpperCase()} from ${originator}`,
                    description: `Originator: ${originator}\nEvent: ${eventType.toUpperCase()}\nFIPS: ${fipsCode}\nIssued: ${timeIssued}\nDuration: ${duration} minutes\nSender: ${sender}`,
                    issued: new Date().toISOString()
                };

                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(alertData));
                    }
                });
            }
        });

        multimonProcess.stderr.on('data', (data) => {
            console.error(`multimon-ng stderr: ${data}`);
        });

        multimonProcess.on('close', (code) => {
            console.log(`multimon-ng process exited with code ${code}`);
            multimonProcess = null;
            console.error('multimon-ng process stopped. Real DSP is no longer active.');
        });

        multimonProcess.on('error', (err) => {
            console.error('Failed to start multimon-ng:', err);
            if (err.code === 'ENOENT') {
                console.error('multimon-ng command not found. Ensure it is installed and in your server\'s PATH.');
            } else {
                console.error('Error with multimon-ng process:', err);
            }
            console.error('Real DSP is not active due to multimon-ng error.');
        });

        console.log("DSP (multimon-ng and ffmpeg) successfully attempted to start.");

    } catch (error) {
        console.error("Error during DSP setup:", error);
        console.error('Real DSP is not active due to a critical setup error.');
    }
}

wss.on('connection', ws => {
    console.log('Client connected via WebSocket');

    ws.on('message', message => {
        console.log(`Received message from client: ${message}`);
    });

    ws.on('close', () => {
        console.log('Client disconnected from WebSocket');
    });

    ws.on('error', error => {
        console.error('WebSocket error:', error);
    });

    ws.send(JSON.stringify({ type: 'status', message: 'Connected to backend server. DSP initializing...' }));
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Access your app via the Koyeb URL.`);
    startDSP();
});
