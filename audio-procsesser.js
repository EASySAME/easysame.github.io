class SAMECodeProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.sampleRate = 48000;
        this.lastSample = 0;
        this.zeroCrossings = 0;
        this.samplesSinceLastZeroCrossing = 0;
        this.bitBuffer = [];
        this.bitCount = 0;
        this.currentBit = 0;
        this.bitStartedAt = 0;
        this.samplesPerBit = this.sampleRate / 2080;

        this.preambleCount = 0;
        this.messageBuffer = [];
        this.inMessage = false;

        this.port.onmessage = (event) => {
            if (event.data.type === 'sampleRate') {
                this.sampleRate = event.data.value;
                this.samplesPerBit = this.sampleRate / 2080;
            }
        };
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input.length === 0) {
            return true;
        }

        const inputChannel = input[0];

        for (let i = 0; i < inputChannel.length; i++) {
            const sample = inputChannel[i];
        }
        return true;
    }
}

registerProcessor('same-code-processor', SAMECodeProcessor);
